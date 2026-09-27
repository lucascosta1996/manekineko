import { Interface, getAddress, keccak256 } from "ethers";
import type { LaunchChainId } from "./chain-policy.ts";
import type { EarningsRpc } from "./creator-earnings.ts";

export type CollectionObservationTarget = { id: string; address: string; version: string; roundId: string; supply: number; winnerCount: number };
export type CollectionObservation = {
  phase: string; minted: number; circulatingSupply: number; supply: number; winnerCount: number;
  prizesPaid: boolean; awards: { claimed: boolean }[]; saleStartAt: string; deadline: string; soldOutAt: string | null;
  blockNumber: number; blockHash: string; blockTime: string; observedAt: string; runtimeHash: string;
};
export const observationInterface = new Interface([
  "function CONTRACT_VERSION() view returns(string)", "function roundId() view returns(uint256)",
  ...["phase", "totalMinted", "totalSupply", "maxSupply", "winnerCount", "saleStartAt", "mintDeadline", "soldOutAt"].map(name => `function ${name}() view returns(uint256)`),
  "function prizePaid() view returns(bool)", "function revealed() view returns(bool)", "function prizeClaimed(uint256) view returns(bool)",
]);
const phases = ["pending_activation", "minting", "awaiting_request", "awaiting_randomness", "awaiting_finalization", "awaiting_prize", "complete", "refundable"];

/** Canonical RPC observations only. A projection cannot become fresh by being fetched again. */
export async function readCollectionObservations(targets: CollectionObservationTarget[], chainId: LaunchChainId, rpc: EarningsRpc | null, now = Date.now()) {
  const observations: Record<string, CollectionObservation> = {}, errors: Record<string, string> = {};
  const fail = (message: string) => { for (const target of targets) errors[target.id] = message; return { observations: {} as Record<string, CollectionObservation>, errors }; };
  if (!targets.length) return { observations, errors };
  if (!rpc) return fail("Chain observations are unavailable. Configure this network’s server-only earnings RPC endpoint.");
  try {
    if (BigInt(await rpc.send("eth_chainId", [])) !== BigInt(chainId)) return fail("The RPC network does not match the selected network.");
    const block = await rpc.send("eth_getBlockByNumber", ["latest", false]);
    if (!block || !/^0x[\da-f]{64}$/i.test(block.hash)) throw Error();
    const timestamp = Number(BigInt(block.timestamp)) * 1000, blockNumber = Number(BigInt(block.number));
    if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(blockNumber) || now - timestamp > 180_000 || timestamp > now + 60_000) throw Error();
    const tag = { blockHash: block.hash, requireCanonical: true }, deadline = Date.now() + 35_000;
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, targets.length) }, async () => {
      while (next < targets.length) {
        const target = targets[next++];
        try {
          if (Date.now() > deadline || !["affiliate-v9", "affiliate-v10"].includes(target.version)) throw Error();
          const address = getAddress(target.address);
          const call = async (name: string, args: unknown[] = []) => observationInterface.decodeFunctionResult(name, await rpc.send("eth_call", [{ to: address, data: observationInterface.encodeFunctionData(name, args) }, tag]))[0];
          const [version, roundId, phaseIndex, minted, circulating, supply, count, start, end, sold, paid, revealed, code] = await Promise.all([
            call("CONTRACT_VERSION"), call("roundId"), call("phase"), call("totalMinted"), call("totalSupply"), call("maxSupply"), call("winnerCount"), call("saleStartAt"), call("mintDeadline"), call("soldOutAt"), call("prizePaid"), call("revealed"), rpc.send("eth_getCode", [address, tag]),
          ]);
          const phase = phases[Number(phaseIndex)], winnerCount = Number(count);
          if (version !== target.version || String(roundId) !== target.roundId || Number(supply) !== target.supply || winnerCount !== target.winnerCount || !phase || minted > supply || circulating > minted || end <= start || code === "0x" || !/^0x(?:[\da-f]{2})+$/i.test(code)) throw Error();
          if (winnerCount < 1 || winnerCount > 10 || (["awaiting_prize", "complete"].includes(phase) !== revealed)) throw Error();
          const awards = revealed ? await Promise.all(Array.from({ length: winnerCount }, async (_, rank) => ({ claimed: Boolean(await call("prizeClaimed", [rank + 1])) }))) : [];
          if (revealed && (awards.every(award => award.claimed) !== paid || (phase === "complete") !== paid)) throw Error();
          const iso = (value: bigint) => new Date(Number(value) * 1000).toISOString();
          observations[target.id] = { phase, minted: Number(minted), circulatingSupply: Number(circulating), supply: Number(supply), winnerCount, prizesPaid: paid, awards, saleStartAt: iso(start), deadline: iso(end), soldOutAt: sold === 0n ? null : iso(sold), blockNumber, blockHash: block.hash, blockTime: new Date(timestamp).toISOString(), observedAt: new Date(now).toISOString(), runtimeHash: keccak256(code) };
        } catch { errors[target.id] = "Canonical collection state is unavailable or does not match the registered terms. Refresh to retry."; }
      }
    }));
    if ((await rpc.send("eth_getBlockByNumber", [block.number, false]))?.hash !== block.hash) throw Error();
    return { observations, errors };
  } catch { return fail("A recent canonical block could not be verified. Previous observations are stale; refresh to retry."); }
}
