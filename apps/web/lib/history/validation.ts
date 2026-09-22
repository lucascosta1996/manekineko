import { decodePermanentCombination } from "@manekineko/contract-abi/permanent-combinations";
import { validateAwards } from "../collections/awards.ts";
import { isCollectionId, UINT256_MAX } from "../collections/model.ts";
import { calculateHistoryScore, type HistoryCollection } from "./model.ts";

function ensure(condition: unknown, field: string): asserts condition {
  if (!condition) throw new Error(`Invalid collection history: ${field}`);
}

function uint256(value: string, field: string): bigint {
  ensure(typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value), field);
  const parsed = BigInt(value);
  ensure(parsed <= UINT256_MAX, field);
  return parsed;
}

function text(value: string, maxBytes: number, field: string): void {
  ensure(typeof value === "string" && new TextEncoder().encode(value).length >= 1 && new TextEncoder().encode(value).length <= maxBytes, field);
}

/** Reject contradictory database snapshots before they reach the page or API. */
export function validateHistoryCollection(record: HistoryCollection): HistoryCollection {
  ensure(["feistel-v1", "unique-rank-v2", "unique-rank-v3", "unique-rank-v4", "unique-rank-v5", "unique-rank-v6"].includes(record.algorithmVersion), "algorithmVersion");
  if ((record.contractVersion === "affiliate-v5" || record.contractVersion === "affiliate-v6" || record.contractVersion === "affiliate-v7" || (record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10"))) ensure(Number.isInteger(record.affiliatePoolBps) && record.affiliatePoolBps! >= 0 && record.affiliatePoolBps! + record.prizeBps <= 10000, "affiliate pool");
  const v2 = record.algorithmVersion !== "feistel-v1";
  ensure((record.contractVersion === "affiliate-v10") === (record.algorithmVersion === "unique-rank-v6"), "V10 contract / algorithm version");
  ensure((record.contractVersion === "affiliate-v6") === (record.algorithmVersion === "unique-rank-v3"), "contract / algorithm version");
  ensure(((record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9")) === (record.algorithmVersion === "unique-rank-v5"), "V8 version");
  ensure((record.contractVersion === "affiliate-v7") === (record.algorithmVersion === "unique-rank-v4"), "V7 version");
  ensure(["legacy","affiliate-v3","affiliate-v4","affiliate-v5","affiliate-v6","affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(record.contractVersion), "contractVersion");
  ensure(Number.isInteger(record.prizeBps)&&record.prizeBps>=0&&record.prizeBps<=10000, "prizeBps");
  ensure(["affiliate-v4","affiliate-v5","affiliate-v6","affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(record.contractVersion)?v2:record.prizeBps===5000, "financial terms");
  ensure(record.randomnessProvider === (v2 ? "chainlink-vrf-v2.5" : "future-blockhash"), "randomnessProvider");
  if (v2) ensure([1, 11155111].includes(record.chainId) && record.nativeCurrency.symbol === "ETH" && record.nativeCurrency.decimals === 18, "Ethereum network");
  ensure(isCollectionId(record.id), "id");
  ensure(isCollectionId(record.seriesId), "seriesId");
  text(record.name, 80, "name");
  text(record.symbol, 16, "symbol");
  text(record.seriesName, 80, "seriesName");
  text(record.networkName, 120, "networkName");
  text(record.nativeCurrency.symbol, 16, "nativeCurrency.symbol");
  ensure(Number.isInteger(record.nativeCurrency.decimals) && record.nativeCurrency.decimals >= 0 && record.nativeCurrency.decimals <= 36, "nativeCurrency.decimals");
  ensure(uint256(record.roundId, "roundId") > 0n, "roundId");
  ensure(Number.isSafeInteger(record.chainId) && record.chainId > 0, "chainId");
  ensure(Number.isInteger(record.maxSupply) && record.maxSupply >= 1 && record.maxSupply <= 65_536, "maxSupply");
  ensure(Number.isInteger(record.totalMinted) && record.totalMinted >= 0 && record.totalMinted <= record.maxSupply, "totalMinted");
  if (record.totalAffiliatePaidWei !== undefined) ensure(uint256(record.totalAffiliatePaidWei, "totalAffiliatePaidWei") <= uint256(record.totalMintRevenueWei, "totalMintRevenueWei"), "affiliate payments");
  const price = uint256(record.mintPriceWei, "mintPriceWei");
  ensure(price >= 2n && price % 2n === 0n && price * BigInt(record.maxSupply) <= UINT256_MAX, "mintPriceWei");
  if(["affiliate-v4","affiliate-v5","affiliate-v6","affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(record.contractVersion)) ensure(price%10000n===0n,"V4 mintPriceWei");
  if(record.contractVersion==="affiliate-v3") ensure(v2&&price%100n===0n,"V3 financial terms");
  const revenue = uint256(record.totalMintRevenueWei, "totalMintRevenueWei");
  ensure(revenue === price * BigInt(record.totalMinted), "totalMintRevenueWei");
  const refunded = uint256(record.totalRefundedWei, "totalRefundedWei");
  ensure(record.status === "completed" || record.status === "refunded", "status");
  ensure(typeof record.isMock === "boolean", "isMock");
  const openedAt = Date.parse(record.openedAt);
  const closedAt = Date.parse(record.closedAt);
  ensure(Number.isFinite(openedAt) && Number.isFinite(closedAt) && closedAt >= openedAt, "dates");
  if (record.status === "refunded") {
    if (v2) ensure(record.totalMinted < record.maxSupply, "V2 sold-out refunds");
    ensure(record.winner === null, "refunded winner");
    ensure(refunded === revenue, "totalRefundedWei");
    return record;
  }
  ensure(record.totalMinted === record.maxSupply, "completed supply");
  ensure(refunded === 0n, "completed refunds");
  const winner = record.winner;
  ensure(winner !== null && typeof winner === "object", "completed winner");
  ensure(Number.isInteger(winner.tokenId) && winner.tokenId >= 1 && winner.tokenId <= record.totalMinted, "winner.tokenId");
  ensure(Array.isArray(winner.combination) && winner.combination.length === 4 && winner.combination.every((value) => Number.isInteger(value) && value >= 1 && value <= (v2 ? 16 : 256)), "winner.combination");
  const identity = record.algorithmVersion === "unique-rank-v6" ? decodePermanentCombination(winner.combination, winner.combinationKey!) : null;
  if (identity) ensure(identity.tokenId === String(winner.tokenId), "winner.permanentIdentity");
  const expected = identity ? { combinationCode: identity.combinationCode, score: String(record.maxSupply) }
    : calculateHistoryScore(winner.combination, record.algorithmVersion, winner.combinationKey);
  ensure(uint256(winner.combinationCode, "winner.combinationCode").toString() === expected.combinationCode, "winner.combinationCode");
  ensure(uint256(winner.score, "winner.score").toString() === expected.score, "winner.score");
  if (v2) ensure(winner.score === String(record.maxSupply), "winner.highestRank");
  ensure(typeof winner.winningHolder === "string" && /^0x[0-9a-fA-F]{40}$/.test(winner.winningHolder) && !/^0x0{40}$/i.test(winner.winningHolder), "winner.winningHolder");
  ensure(typeof winner.prizeRecipient === "string" && /^0x[0-9a-fA-F]{40}$/.test(winner.prizeRecipient) && !/^0x0{40}$/i.test(winner.prizeRecipient), "winner.prizeRecipient");
  if (!v2) ensure(winner.winningHolder.toLowerCase() === winner.prizeRecipient.toLowerCase(), "V1 holder / recipient");
  ensure(uint256(winner.prizePaidWei, "winner.prizePaidWei") === revenue*BigInt((record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10") ? record.prizeBps/record.winnerCount! : record.prizeBps-(record.secondPrizeBps ?? 0))/10000n, "winner.prizePaidWei");
  if(record.contractVersion==="affiliate-v7" || (record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10")) {
    if(record.contractVersion==="affiliate-v7") ensure(Number.isInteger(record.secondPrizeBps)&&record.secondPrizeBps!>0&&record.secondPrizeBps!<record.prizeBps,"second prize");
    validateAwards(record.awards ?? [],record.maxSupply,record.totalMintRevenueWei,record.prizeBps,record.secondPrizeBps,record.winnerCount,record.algorithmVersion);
    ensure(record.awards!.every(a=>a.claimed),"all prizes paid");
  }
  const paidAt = Date.parse(winner.paidAt);
  ensure(Number.isFinite(paidAt) && paidAt >= openedAt && paidAt <= closedAt, "winner.paidAt");
  return record;
}
