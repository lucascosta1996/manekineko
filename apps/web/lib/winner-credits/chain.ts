import { Interface, keccak256, ZeroAddress, ZeroHash } from "ethers";
import { verifyLegacyCredit, type LegacyCreditManifest } from "@manekineko/contract-abi/winner-credit-proof";
import { RpcReadReverted } from "../affiliates/rpc-read-transport.ts";
import { WINNER_CREDIT_ABI } from "./abi.ts";
import { creditAwardRank, registrySupportsCredit } from "./model.ts";
import type { WinnerCredit, WinnerCreditSource, WinnerCreditTarget, WinnerCreditRedemption } from "./model.ts";

export const CREDIT_REGISTRY = new Interface(WINNER_CREDIT_ABI);
const FACTORY = new Interface(["function rounds(uint256) view returns(address)"]);
const ROUND = new Interface([
  "function CONTRACT_VERSION() view returns(string)", "function ALGORITHM_VERSION() view returns(string)",
  "function roundId() view returns(uint256)", "function prizePaid() view returns(bool)",
  "function winningHolder() view returns(address)", "function prizePaidAt() view returns(uint256)",
  "function winningTokenId() view returns(uint256)", "function mintPrice() view returns(uint256)",
  "function saleActivated() view returns(bool)", "function cancelled() view returns(bool)",
  "function mintDeadline() view returns(uint256)", "function totalMinted() view returns(uint256)",
  "function maxSupply() view returns(uint256)", "function remainingMints(address) view returns(uint256)",
  "function awardCount() view returns(uint256)", "function prizeClaimed(uint256 rank) view returns(bool)",
  "function awardHolder(uint256 rank) view returns(address)", "function awardPaidAt(uint256 rank) view returns(uint64)",
  "function winningTokenIds(uint256 rank) view returns(uint256)", "function finalizedAt() view returns(uint256)",
  "function saleStartAt() view returns(uint256)",
]);
export type RpcRead = (method: string, params: unknown[]) => Promise<any>;
export type CreditEnv = Record<string, string | undefined>;
export interface CreditTargetRecord {
  collectionId: string; name: string; chainId: number; roundId: string; contractAddress: string;
  factoryAddress: string; contractVersion: "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10"; mintPriceWei: string;
}
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const address = (value: string | undefined) => !!value && /^0x[0-9a-f]{40}$/i.test(value) && !same(value, ZeroAddress);
const hash = (value: string | undefined) => !!value && /^0x[0-9a-f]{64}$/i.test(value) && !same(value, ZeroHash);
export function registryConfig(chainId: number, env: CreditEnv): { address: string; hash: string } | null {
  const registry = env[`WINNER_CREDITS_ADDRESS_${chainId}`], codeHash = env[`WINNER_CREDITS_CODEHASH_${chainId}`];
  if (!registry && !codeHash) return null;
  if (![1,11155111].includes(chainId) || !address(registry) || !hash(codeHash)) throw new Error("Winner credit registry configuration is invalid.");
  return { address: registry!.toLowerCase(), hash: codeHash!.toLowerCase() };
}

export async function createCreditSnapshot(chainId: number, env: CreditEnv, rpc: RpcRead, now = Date.now()) {
  const candidateConfig = registryConfig(chainId, env);
  if (!candidateConfig) throw new Error("Winner credits are not enabled on this network.");
  if (BigInt(await rpc("eth_chainId", [])) !== BigInt(chainId)) throw new Error("Winner credit network mismatch.");
  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  if (!hash(block?.hash) || !/^0x[0-9a-f]+$/i.test(block?.number ?? "") || !/^0x[0-9a-f]+$/i.test(block?.timestamp ?? "") || Math.abs(now / 1000 - Number(BigInt(block.timestamp))) > 180) throw new Error("Winner credit chain data is stale.");
  const config = candidateConfig;
  const blockTag = { blockHash: block.hash, requireCanonical: true };
  const timestamp = BigInt(block.timestamp);
  const call = async (to: string, iface: Interface, name: string, args: unknown[] = []) => iface.decodeFunctionResult(name, await rpc("eth_call", [{ to, data: iface.encodeFunctionData(name, args) }, blockTag]));
  const registry = (name: string, args: unknown[] = []) => call(config.address, CREDIT_REGISTRY, name, args);
  const round = async (to: string, name: string, args: unknown[] = []) => (await call(to, ROUND, name, args))[0];
  const code = await rpc("eth_getCode", [config.address, blockTag]);
  if (code === "0x" || keccak256(code) !== config.hash) throw new Error("Winner credit deployment could not be verified.");
  const registryVersion = String((await registry("WINNER_CREDITS_VERSION"))[0]);
  if (!["winner-credits-v2", "winner-credits-v3", "winner-credits-v4", "winner-credits-v5", "winner-credits-v6"].includes(registryVersion)) throw new Error("Winner credit deployment could not be verified.");
  const lineage = [{ address: config.address, version: registryVersion }];
  while (lineage.at(-1)!.version !== "winner-credits-v2") {
    const parent = lineage.at(-1)!;
    const previous = String((await call(parent.address, CREDIT_REGISTRY, "previousRegistry"))[0]).toLowerCase();
    if (same(previous, ZeroAddress)) break;
    const pin = lineage.length === 1 ? "PREVIOUS" : lineage.length === 2 ? "ANCESTOR" : `ANCESTOR_${lineage.length - 1}`;
    const expectedAddress = env[`WINNER_CREDITS_${pin}_ADDRESS_${chainId}`], expectedHash = env[`WINNER_CREDITS_${pin}_CODEHASH_${chainId}`];
    if (lineage.length >= 5 || lineage.some(item => same(item.address, previous)) || !address(expectedAddress) || !hash(expectedHash) || !same(previous, expectedAddress!)) throw new Error("Previous winner credit registry is not independently pinned.");
    const priorCode = await rpc("eth_getCode", [previous, blockTag]);
    const priorVersion = String((await call(previous, CREDIT_REGISTRY, "WINNER_CREDITS_VERSION"))[0]);
    const allowed = parent.version === "winner-credits-v6" ? ["winner-credits-v2", "winner-credits-v3", "winner-credits-v4", "winner-credits-v5"] : parent.version === "winner-credits-v5" ? ["winner-credits-v2", "winner-credits-v3", "winner-credits-v4"] : parent.version === "winner-credits-v4" ? ["winner-credits-v2", "winner-credits-v3"] : ["winner-credits-v2"];
    if (priorCode === "0x" || !same(keccak256(priorCode), expectedHash!) || !allowed.includes(priorVersion)) throw new Error("Previous winner credit deployment could not be verified.");
    lineage.push({ address: previous, version: priorVersion });
  }
  const storedCredit = async (source: string, rank: number, at = config.address) => lineage.find(item => same(item.address, at))?.version !== "winner-credits-v2"
    ? (await call(at, CREDIT_REGISTRY, "creditsForAward", [source, rank]))[0]
    : await call(at, CREDIT_REGISTRY, "credits", [source]);
  const legacyRoot = String((await registry("legacyMerkleRoot"))[0]);
  if (registryVersion === "winner-credits-v6") {
    for (const ancestor of lineage.slice(1)) {
      const [root, sponsor] = await Promise.all([
        call(ancestor.address, CREDIT_REGISTRY, "legacyMerkleRoot"),
        call(ancestor.address, CREDIT_REGISTRY, "totalSponsorBalance"),
      ]);
      if (!same(String(root[0]), legacyRoot) || sponsor[0] !== 0n) throw new Error("Previous winner credit registry must preserve historical proofs and have no funded destinations.");
    }
  }

  const redemptionReads = new Map<string, Promise<WinnerCreditRedemption | null>>();
  function walletRedemption(wallet: string): Promise<WinnerCreditRedemption | null> {
    const key = wallet.toLowerCase();
    let pending = redemptionReads.get(key);
    if (!pending) {
      pending = (async () => {
        let registryAddress = config.address, redeemedSource = ZeroAddress, rank = 1;
        for (const entry of lineage) {
          const source = String((await call(entry.address, CREDIT_REGISTRY, "redeemedSource", [wallet]))[0]);
          if (same(source, ZeroAddress)) continue;
          redeemedSource = source; registryAddress = entry.address;
          if (entry.version !== "winner-credits-v2") {
            rank = Number((await call(entry.address, CREDIT_REGISTRY, "redeemedAwardRank", [wallet]))[0]);
            if (!Number.isInteger(rank) || rank < 1 || rank > (["winner-credits-v4", "winner-credits-v5", "winner-credits-v6"].includes(entry.version) ? 10 : 2)) throw new Error("Lifetime winner award rank is invalid.");
          }
          break;
        }
        if (registryVersion !== "winner-credits-v2") {
          const used = Boolean((await registry("lifetimeRewardUsed", [wallet]))[0]);
          if (used !== !same(redeemedSource, ZeroAddress)) throw new Error("Lifetime winner reward migration could not be verified.");
        }
        if (same(redeemedSource, ZeroAddress)) return null;
        const spent = await storedCredit(redeemedSource, rank, registryAddress);
        if (!same(spent.beneficiary, wallet) || same(spent.redeemedIn, ZeroAddress) || spent.redeemedTokenId < 1n || spent.redeemedTokenId > 65536n) throw new Error("Lifetime winner reward could not be verified.");
        return { sourceRound: redeemedSource.toLowerCase(), targetRound: String(spent.redeemedIn).toLowerCase(), tokenId: spent.redeemedTokenId.toString(), ...(registryVersion !== "winner-credits-v2" ? { awardRank: rank, registryAddress } : {}) };
      })();
      redemptionReads.set(key, pending);
    }
    return pending;
  }

  async function verifiedRound(record: Pick<WinnerCreditSource, "factoryAddress" | "contractVersion" | "contractAddress" | "roundId">) {
    const suffix = record.contractVersion === "affiliate-v10" ? "V10" : record.contractVersion === "affiliate-v9" ? "V9" : record.contractVersion === "affiliate-v8" ? "V8" : record.contractVersion === "affiliate-v7" ? "V7" : record.contractVersion === "affiliate-v6" ? "V6" : "V5";
    const factory = env[`AFFILIATE_TRUSTED_FACTORY_${suffix}_${chainId}`];
    const expected = env[`AFFILIATE_TRUSTED_FACTORY_CODEHASH_${suffix}_${chainId}`];
    if (!address(factory) || !hash(expected) || !same(factory!, record.factoryAddress)) throw new Error("Winner credit factory is not approved.");
    const [factoryCode, roundCode, registered, version, algorithm, roundId] = await Promise.all([
      rpc("eth_getCode", [factory, blockTag]), rpc("eth_getCode", [record.contractAddress, blockTag]),
      call(factory!, FACTORY, "rounds", [record.roundId]), round(record.contractAddress, "CONTRACT_VERSION"),
      round(record.contractAddress, "ALGORITHM_VERSION"), round(record.contractAddress, "roundId"),
    ]);
    if (factoryCode === "0x" || roundCode === "0x" || !same(keccak256(factoryCode), expected!) || !same(registered[0], record.contractAddress)
      || version !== record.contractVersion || algorithm !== (suffix === "V10" ? "unique-rank-v6" : (suffix === "V8" || suffix === "V9") ? "unique-rank-v5" : suffix === "V7" ? "unique-rank-v4" : suffix === "V6" ? "unique-rank-v3" : "unique-rank-v2") || roundId !== BigInt(record.roundId)) throw new Error("Winner credit collection provenance mismatch.");
    return { codeHash: keccak256(roundCode), factoryHash: expected! };
  }
  async function registration(record: Pick<WinnerCreditSource, "factoryAddress" | "contractVersion" | "contractAddress" | "roundId">, verified: { codeHash: string; factoryHash: string }) {
    const info = await registry("collections", [record.contractAddress]);
    if (info.sequence === 0n) return null;
    const approved = (await registry("approvedFactoryCodeHash", [record.factoryAddress]))[0];
    if (!same(info.factory, record.factoryAddress) || info.roundId !== BigInt(record.roundId) || !same(info.codeHash, verified.codeHash) || !same(approved, verified.factoryHash)) throw new Error("Winner credit registration does not match its collection.");
    return info;
  }
  async function credit(source: WinnerCreditSource, wallet: string, manifest: LegacyCreditManifest): Promise<WinnerCredit> {
    if (source.chainId !== chainId || !same(source.winningHolder, wallet)) throw new Error("Winner credit holder mismatch.");
    const rank = creditAwardRank(source);
    const lifetimeRedemption = await walletRedemption(wallet);
    const verified = await verifiedRound(source);
    const supportsAward = registrySupportsCredit(source.contractVersion, registryVersion);
    const stored = supportsAward ? await storedCredit(source.contractAddress, rank) : { beneficiary: ZeroAddress, redeemedIn: ZeroAddress, redeemedTokenId: 0n, sourceSequence: 0n, earnedAt: 0n };
    const issued = !same(stored.beneficiary, ZeroAddress);
    if (issued && !same(stored.beneficiary, wallet)) throw new Error("Winner credit beneficiary does not match this wallet.");
    const used = issued && !same(stored.redeemedIn, ZeroAddress);
    const result: WinnerCredit = { ...source, available: false, used, claimed: issued, legacy: source.contractVersion === "affiliate-v5", proof: [], legacyWin: null, canRegisterSource: false, redeemedIn: used ? stored.redeemedIn.toLowerCase() : null, redeemedTokenId: used ? stored.redeemedTokenId.toString() : null, reason: null };
    const sameLifetimeAward = lifetimeRedemption && same(lifetimeRedemption.sourceRound, source.contractAddress) && (lifetimeRedemption.awardRank ?? 1) === rank && (!lifetimeRedemption.registryAddress || same(lifetimeRedemption.registryAddress, config.address));
    if (used && !sameLifetimeAward) throw new Error("Source redemption does not match the wallet lifetime reward.");
    if (lifetimeRedemption) {
      if (sameLifetimeAward && !used) throw new Error("Lifetime reward source has no recorded redemption.");
      return { ...result, reason: used ? "Used for this wallet’s one lifetime sponsored ticket." : "This wallet has already used its lifetime sponsored ticket. Additional wins do not earn another." };
    }
    if (!supportsAward) return { ...result, reason: `This win requires the ${source.contractVersion === "affiliate-v10" ? "V6" : source.contractVersion === "affiliate-v9" ? "V5" : source.contractVersion === "affiliate-v8" ? "V4" : "V3"} winner reward registry, which is not enabled yet.` };
    if (source.contractVersion === "affiliate-v5") {
      const chain = manifest.chains.find((item) => item.chainId === chainId);
      const entry = chain?.entries.find((item) => same(item.sourceRound, source.contractAddress));
      if (!entry || !chain || !same(chain.root, legacyRoot)) return { ...result, reason: "This historical win has not been included in the verified credit program." };
      if (!same(entry.holder, wallet) || entry.tokenId !== source.tokenId || BigInt(entry.paidAt) > timestamp || !verifyLegacyCredit(chainId, entry, entry.proof, legacyRoot)) throw new Error("Historical winner proof is invalid.");
      result.proof = entry.proof; result.legacyWin = entry;
      if (!(await round(source.contractAddress, "prizePaid")) || (await round(source.contractAddress, "winningTokenId")) !== BigInt(entry.tokenId)) throw new Error("Historical winner settlement is not confirmed.");
      if (issued && (stored.sourceSequence !== 0n || stored.earnedAt !== BigInt(entry.paidAt))) throw new Error("Historical credit evidence does not match its registry.");
    } else {
      const info = await registration(source, verified);
      const ranked = ["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(source.contractVersion);
      const [paid, holder, finalizedAt, tokenId] = await Promise.all(ranked
        ? [round(source.contractAddress, "prizeClaimed", [rank]), round(source.contractAddress, "awardHolder", [rank]), round(source.contractAddress, "finalizedAt"), round(source.contractAddress, "winningTokenIds", [rank])]
        : [round(source.contractAddress, "prizePaid"), round(source.contractAddress, "winningHolder"), round(source.contractAddress, "prizePaidAt"), round(source.contractAddress, "winningTokenId")]);
      if (ranked) {
        const [paidAt, awardCount] = await Promise.all([round(source.contractAddress, "awardPaidAt", [rank]), round(source.contractAddress, "awardCount")]);
        if (BigInt(rank) > awardCount || paidAt < finalizedAt || paidAt > timestamp || paidAt === 0n) throw new Error("Winning award settlement time could not be verified.");
      }
      if (!paid || !same(holder, wallet) || finalizedAt <= 0n || finalizedAt > timestamp || tokenId !== BigInt(source.tokenId)) throw new Error("Winning holder settlement could not be verified.");
      if (!info) {
        const approved = (await registry("approvedFactoryCodeHash", [source.factoryAddress]))[0];
        const canRegisterSource = same(approved, verified.factoryHash);
        return { ...result, canRegisterSource, reason: canRegisterSource ? "Register this completed win to qualify for your lifetime sponsored ticket." : "This collection factory is not enrolled in the winner credit program." };
      }
      if (issued && (stored.sourceSequence !== (info.rewardsOnly ? 0n : info.sequence) || stored.earnedAt !== finalizedAt)) throw new Error("Winner credit settlement differs from its source collection.");
    }
    return { ...result, available: !used, reason: used ? "Redeemed once. This credit cannot be used again." : null };
  }
  async function target(record: CreditTargetRecord): Promise<WinnerCreditTarget> {
    if (record.chainId !== chainId) throw new Error("Target credit network mismatch.");
    const verified = await verifiedRound(record);
    const scheduledStart = ["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(record.contractVersion) ? await round(record.contractAddress, "saleStartAt") : 0n;
    const [info, price, active, cancelled, deadline, minted, supply, balance] = await Promise.all([
      registration(record, verified), round(record.contractAddress, "mintPrice"), round(record.contractAddress, "saleActivated"),
      round(record.contractAddress, "cancelled"), round(record.contractAddress, "mintDeadline"), round(record.contractAddress, "totalMinted"),
      round(record.contractAddress, "maxSupply"), registry("sponsorBalance", [record.contractAddress]),
    ]);
    if (price !== BigInt(record.mintPriceWei) || minted > supply || supply > 65536n) throw new Error("Sponsored mint terms could not be verified.");
    const reason = !registrySupportsCredit(record.contractVersion, registryVersion) ? `This collection requires the ${record.contractVersion === "affiliate-v10" ? "V6" : record.contractVersion === "affiliate-v9" ? "V5" : record.contractVersion === "affiliate-v8" ? "V4" : "V3"} winner reward registry.` : !info || info.rewardsOnly ? "This collection does not accept winner credits." : cancelled || timestamp >= deadline ? "This collection is closed." : !active || timestamp < scheduledStart ? "Ticket sales have not opened yet." : minted >= supply ? "This collection is sold out." : balance[0] < price ? "The operator needs to fund more sponsored tickets." : null;
    return { contractVersion: record.contractVersion, collectionId: record.collectionId, contractAddress: record.contractAddress, chainId, name: record.name, mintPriceWei: price.toString(), ready: reason === null, reason, remaining: Number(supply - minted), sponsorBalanceWei: balance[0].toString() };
  }
  async function forTarget(item: WinnerCredit, destination: WinnerCreditTarget, wallet: string): Promise<WinnerCredit> {
    if (!item.available) return item;
    if (!destination.ready) return { ...item, available: false, reason: destination.reason };
    if ((destination.contractVersion === "affiliate-v9" || destination.contractVersion === "affiliate-v10") && await round(destination.contractAddress, "remainingMints", [wallet]) === 0n) return { ...item, available: false, reason: "This wallet has already used its 20 mints in this collection. Choose a future collection." };
    const ranked = ["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(item.contractVersion);
    const name = ranked ? item.claimed ? "redeemAward" : "claimAndRedeemAward" : item.claimed ? "redeem" : item.legacy ? "redeemLegacy" : "claimAndRedeem";
    const args = ranked ? [item.contractAddress, creditAwardRank(item), destination.contractAddress] : item.legacy && !item.claimed ? [item.legacyWin, item.proof, destination.contractAddress] : [item.contractAddress, destination.contractAddress];
    try { await rpc("eth_call", [{ from: wallet, to: config.address, data: CREDIT_REGISTRY.encodeFunctionData(name, args) }, blockTag]); }
    catch (error) {
      if (!(error instanceof RpcReadReverted)) throw error;
      return { ...item, available: false, reason: "This credit cannot be used for this collection. Choose a future eligible collection." };
    }
    return item;
  }
  async function assertCanonical() { if ((await rpc("eth_getBlockByNumber", [block.number, false])).hash !== block.hash) throw new Error("Ethereum changed while verifying winner credits."); }
  return { config, registryVersion: registryVersion as "winner-credits-v2" | "winner-credits-v3" | "winner-credits-v4" | "winner-credits-v5" | "winner-credits-v6", blockNumber: BigInt(block.number).toString(), credit, target, forTarget, walletRedemption, assertCanonical };
}
