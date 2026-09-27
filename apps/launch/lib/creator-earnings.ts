import { Interface, getAddress, keccak256 } from "ethers";
import type { LaunchChainId } from "./chain-policy.ts";

export type EarningsCollection = {
  id: string; name: string; seasonName: string | null; chainId: LaunchChainId;
  address: string; version: string; roundId: string; deploymentBlock?: string;
};
export type EarningsBalance = {
  owner: string; ownerIsContract: boolean; runtimeHash: string; withdrawableWei: string;
  withdrawals: { ordinaryWithdrawnWei: string | null; historyError: string | null };
  growthReserveWei: string; growthAvailableWei: string; mintRevenueWei: string;
  accounting?: { balanceWei: string; unpaidPrizesWei: string; unpaidAffiliatesWei: string; refundLiabilityWei: string; lockedWei: string; growthWithdrawnWei: string; operatorAvailableWei: string };
};
export type EarningsRow = EarningsCollection & { balance: EarningsBalance | null; error: string | null };
export type EarningsReport = {
  chainId: LaunchChainId; blockNumber: number | null; blockHash: string | null; blockTime: string | null;
  status: "empty" | "available" | "partial" | "unavailable";
  checkedAt: string; rows: EarningsRow[]; error: string | null;
  totals: { withdrawableWei: string; growthAvailableWei: string; availableCollections: number; verifiedCollections: number };
};
export type EarningsRpc = { send(method: string, params: unknown[]): Promise<any> };
export const earningsInterface = new Interface([
  "function CONTRACT_VERSION() view returns (string)", "function roundId() view returns (uint256)",
  "function owner() view returns (address)", "function withdrawableBalance() view returns (uint256)",
  "function revealed() view returns (bool)", "function totalMintRevenue() view returns (uint256)",
  "function growthReserveBalance() view returns (uint256)",
  "function prizeAmount() view returns(uint256)", "function prizePaidAmount() view returns(uint256)",
  "function totalAffiliateAccrued() view returns(uint256)", "function totalAffiliateClaimed() view returns(uint256)",
  "function totalRefunded() view returns(uint256)", "function refundsAvailable() view returns(bool)",
  "function growthReserveWithdrawn() view returns(uint256)",
  "event Withdrawn(address indexed recipient,uint256 amount)",
]);
const supported = new Set(["affiliate-v3", "affiliate-v4", "affiliate-v5", "affiliate-v6", "affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"]);
const hasGrowth = new Set(["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"]);
const unavailable = "Live balance unavailable. Refresh to retry; this collection is excluded from totals.";

export function summarizeEarnings(rows: EarningsRow[]): EarningsReport["totals"] {
  let withdrawable = 0n, growth = 0n, availableCollections = 0, verifiedCollections = 0;
  for (const row of rows) {
    if (!row.balance) continue;
    verifiedCollections++;
    const amount = BigInt(row.balance.withdrawableWei);
    withdrawable += amount;
    growth += BigInt(row.balance.growthAvailableWei);
    if (amount > 0n) availableCollections++;
  }
  return { withdrawableWei: String(withdrawable), growthAvailableWei: String(growth), availableCollections, verifiedCollections };
}

/** All reads use a canonical block hash. No signer, transaction method or stored wallet material. */
export async function readCreatorEarnings(collections: EarningsCollection[], chainId: LaunchChainId, rpc: EarningsRpc | null, now = Date.now()): Promise<EarningsReport> {
  const report: EarningsReport = { chainId, blockNumber: null, blockHash: null, blockTime: null, status: "empty", checkedAt: new Date(now).toISOString(), rows: [], error: null, totals: summarizeEarnings([]) };
  if (collections.some(c => c.chainId !== chainId)) throw new Error("Collection network mismatch");
  if (!collections.length) return report;
  const failed = (message: string) => {
    report.error = message;
    report.status = "unavailable";
    report.rows = collections.map(c => ({ ...c, balance: null, error: message }));
    report.totals = summarizeEarnings(report.rows);
    return report;
  };
  if (!rpc) return failed("Live reads are not configured for this network. Configure the server-only earnings RPC endpoint.");
  const deadline = Date.now() + 35_000;
  try {
    if (BigInt(await rpc.send("eth_chainId", [])) !== BigInt(chainId)) return failed("The earnings RPC is connected to a different network. Balances are unavailable.");
    const block = await rpc.send("eth_getBlockByNumber", ["latest", false]);
    if (!block || !/^0x[\da-f]{64}$/i.test(block.hash) || !/^0x[\da-f]+$/i.test(block.number) || !/^0x[\da-f]+$/i.test(block.timestamp)) throw new Error("Invalid block");
    const timestamp = Number(BigInt(block.timestamp)) * 1000;
    if (!Number.isSafeInteger(timestamp) || now - timestamp > 300_000 || timestamp > now + 60_000) throw new Error("Stale block");
    const blockNumber = Number(BigInt(block.number));
    if (!Number.isSafeInteger(blockNumber)) throw new Error("Invalid height");
    const tag = { blockHash: block.hash, requireCanonical: true };
    const rows: EarningsRow[] = new Array(collections.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, collections.length) }, async () => {
      while (next < collections.length) {
        const index = next++, collection = collections[index];
        if (Date.now() > deadline) {
          rows[index] = { ...collection, balance: null, error: unavailable };
          continue;
        }
        if (!supported.has(collection.version)) {
          rows[index] = { ...collection, balance: null, error: "This historical contract version is not supported by the earnings reader. Inspect it on the explorer." };
          continue;
        }
        try {
          const address = getAddress(collection.address);
          const call = async (method: string) => earningsInterface.decodeFunctionResult(method, await rpc.send("eth_call", [{ to: address, data: earningsInterface.encodeFunctionData(method) }, tag]))[0];
          const [version, roundId, owner, amount, revealed, revenue, growth] = await Promise.all([
            call("CONTRACT_VERSION"), call("roundId"), call("owner"), call("withdrawableBalance"), call("revealed"), call("totalMintRevenue"),
            hasGrowth.has(collection.version) ? call("growthReserveBalance") : Promise.resolve(0n),
          ]);
          if (version !== collection.version || String(roundId) !== collection.roundId) throw new Error("Identity mismatch");
          const [code, runtime] = await Promise.all([rpc.send("eth_getCode", [owner, tag]), rpc.send("eth_getCode", [address, tag])]);
          if (typeof runtime !== "string" || !/^0x(?:[\da-f]{2})+$/i.test(runtime)) throw new Error("Missing contract runtime");
          if (typeof code !== "string" || !/^0x(?:[\da-f]{2})*$/i.test(code)) throw new Error("Invalid owner code");
          let accounting: EarningsBalance["accounting"];
          if (hasGrowth.has(collection.version)) {
            const [balanceHex, prize, paid, accrued, claimed, refunded, refundable, withdrawn] = await Promise.all([
              rpc.send("eth_getBalance", [address, tag]), call("prizeAmount"), call("prizePaidAmount"), call("totalAffiliateAccrued"), call("totalAffiliateClaimed"), call("totalRefunded"), call("refundsAvailable"), call("growthReserveWithdrawn"),
            ]);
            const balance = BigInt(balanceHex), unpaidPrizes = revealed ? BigInt(prize) - BigInt(paid) : 0n;
            const unpaidAffiliates = BigInt(accrued) - BigInt(claimed), refundLiability = refundable ? BigInt(revenue) - BigInt(refunded) : 0n;
            const locked = balance - BigInt(amount) - BigInt(growth) - unpaidPrizes - unpaidAffiliates - refundLiability;
            if ([locked, unpaidPrizes, unpaidAffiliates, refundLiability].some(v => v < 0n)) throw new Error("Unreconciled liabilities");
            accounting = {balanceWei:String(balance),unpaidPrizesWei:String(unpaidPrizes),unpaidAffiliatesWei:String(unpaidAffiliates),refundLiabilityWei:String(refundLiability),lockedWei:String(locked),growthWithdrawnWei:String(withdrawn),operatorAvailableWei:String(BigInt(amount)+(revealed?BigInt(growth):0n))};
          }
          let ordinaryWithdrawnWei: string | null = null;
          let historyError: string | null = "Withdrawal history is unavailable. Current available funds are verified independently.";
          if (collection.deploymentBlock && /^\d+$/.test(collection.deploymentBlock)) {
            try {
              const first = Number(collection.deploymentBlock), span = 10_000;
              if (!Number.isSafeInteger(first) || first < 0 || first > blockNumber || blockNumber - first >= span * 20 || Date.now() > deadline) throw Error();
              let withdrawn = 0n;
              for (let from = first; from <= blockNumber; from += span) {
                const logs = await rpc.send("eth_getLogs", [{ address, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${Math.min(from + span - 1, blockNumber).toString(16)}`, topics: [earningsInterface.getEvent("Withdrawn")!.topicHash] }]);
                if (!Array.isArray(logs) || logs.length > 10_000 || Date.now() > deadline) throw Error();
                for (const log of logs) {
                  if (log.removed || getAddress(log.address) !== address) throw Error();
                  withdrawn += BigInt(earningsInterface.parseLog(log)!.args.amount);
                }
              }
              ordinaryWithdrawnWei = String(withdrawn); historyError = null;
            } catch { /* History failure must not hide independently verified current balances. */ }
          }
          rows[index] = { ...collection, error: null, balance: { accounting, runtimeHash: keccak256(runtime), withdrawals: { ordinaryWithdrawnWei, historyError }, owner: getAddress(owner), ownerIsContract: code !== "0x", withdrawableWei: String(amount), growthReserveWei: String(growth), growthAvailableWei: revealed ? String(growth) : "0", mintRevenueWei: String(revenue) } };
        } catch { rows[index] = { ...collection, balance: null, error: unavailable }; }
      }
    }));
    // Detect a fork switch even if a provider accepted earlier calls before the reorg.
    const canonical = await rpc.send("eth_getBlockByNumber", [block.number, false]);
    if (canonical?.hash !== block.hash) throw new Error("Reorganized block");
    report.rows = rows;
    report.blockNumber = blockNumber;
    report.blockHash = block.hash;
    report.blockTime = new Date(timestamp).toISOString();
    report.totals = summarizeEarnings(rows);
    report.status = report.totals.verifiedCollections === rows.length ? "available" : report.totals.verifiedCollections ? "partial" : "unavailable";
    return report;
  } catch { return failed("Could not verify a recent canonical block on this network. Refresh to retry."); }
}
