import assert from "node:assert/strict";
import test from "node:test";
import { encodeScrambledRank } from "@manekineko/contract-abi/scrambled-rank";
import { SCORE_FORMULA, UNIQUE_RANK_SCORE_FORMULA, type CollectionPublic } from "../lib/collections/model.ts";
import { validateCollection } from "../lib/collections/validation.ts";
import { calculateHistoryScore, calculateHistoryStats, type HistoryCollection } from "../lib/history/model.ts";
import { validateHistoryCollection } from "../lib/history/validation.ts";
import { buildTicketSvg, previewExample } from "../lib/mint/preview.ts";

function collection(overrides: Partial<CollectionPublic> = {}): CollectionPublic {
  return {
    contractVersion: "legacy",
    id: "8fa5f8c0-6ef4-47f6-9af3-60b8101c9321", seriesId: "551c5df8-224c-4dca-b972-2fcaf01dc689",
    slug: "v2-test", name: "V2 test", symbol: "NEKO", description: "Undeployed test fixture", roundId: "1",
    chainId: 1, networkName: "Ethereum Mainnet", nativeCurrency: { symbol: "ETH", decimals: 18 }, explorerUrl: "https://etherscan.io",
    contractStatus: "undeployed", contractAddress: null, mode: "demo", source: "postgres",
    algorithmVersion: "unique-rank-v2", randomnessProvider: "chainlink-vrf-v2.5", randomnessRequestId: null, randomnessState: "not_requested",
    maxSupply: 1000, mintPriceWei: "10000000000000000", mintDurationSeconds: 604800, mintDeadline: null,
    revealDelayBlocks: null, maxMintBatch: 20, prizeBps: 5000, scoreFormula: UNIQUE_RANK_SCORE_FORMULA,
    totalMinted: 0, totalMintRevenueWei: "0", phase: null, prizePaid: false, updatedAt: "2026-09-10T00:00:00Z", ...overrides,
  };
}

function live(overrides: Partial<CollectionPublic> = {}): CollectionPublic {
  return collection({ contractStatus: "deployed", contractAddress: "0x1111111111111111111111111111111111111111", mode: "live", mintDeadline: "2026-09-17T00:00:00Z", phase: "pending_activation", ...overrides });
}

function history(supply: number): HistoryCollection {
  const code = supply - 1;
  const combination: [number, number, number, number] = [(code >> 12) + 1, ((code >> 8) & 15) + 1, ((code >> 4) & 15) + 1, (code & 15) + 1];
  return {
    contractVersion: "legacy", prizeBps:5000,
    id: collection().id, seriesId: collection().seriesId, seriesName: "Rollback-only fixture", roundId: "1", name: "V2 fixture", symbol: "NEKO",
    algorithmVersion: "unique-rank-v2", randomnessProvider: "chainlink-vrf-v2.5", chainId: 1, networkName: "Ethereum Mainnet", nativeCurrency: { symbol: "ETH", decimals: 18 },
    maxSupply: supply, totalMinted: supply, mintPriceWei: "2", totalMintRevenueWei: String(supply * 2), totalRefundedWei: "0",
    status: "completed", isMock: true, openedAt: "2026-09-01T00:00:00Z", closedAt: "2026-09-02T00:00:00Z",
    winner: { tokenId: 1, combination, ...calculateHistoryScore(combination, "unique-rank-v2"), winningHolder: "0x1111111111111111111111111111111111111111", prizeRecipient: "0x1111111111111111111111111111111111111111", prizePaidWei: String(supply), paidAt: "2026-09-02T00:00:00Z" },
  };
}

test("V6 collections require their V3 algorithm and retain the same VRF and protected pool rules", () => {
  const v6 = collection({ contractVersion: "affiliate-v6", algorithmVersion: "unique-rank-v3", affiliatePoolBps: 1000, scoreFormula: "scoreCombination([a,b,c,d])" });
  assert.equal(validateCollection(v6).algorithmVersion, "unique-rank-v3");
  for (const change of [{ algorithmVersion: "unique-rank-v2" }, { contractVersion: "affiliate-v5" }, { scoreFormula: UNIQUE_RANK_SCORE_FORMULA }, { affiliatePoolBps: 5001 }, { randomnessProvider: "future-blockhash" }]) {
    assert.throws(() => validateCollection({ ...v6, ...change } as CollectionPublic), /Invalid collection configuration/);
  }
});

test("V6 history decodes the revealed key and rejects missing keys, altered numbers, and version confusion", () => {
  const combinationKey = `0x${"42".repeat(32)}`;
  const encoded = encodeScrambledRank(2000, combinationKey);
  const source = history(2000);
  const v6: HistoryCollection = {
    ...source, contractVersion: "affiliate-v6", algorithmVersion: "unique-rank-v3", affiliatePoolBps: 1000,
    mintPriceWei: "10000", totalMintRevenueWei: "20000000",
    winner: { ...source.winner!, combination: encoded.numbers, combinationCode: encoded.combinationCode, score: encoded.score, combinationKey, prizePaidWei: "10000000" },
  };
  assert.equal(validateHistoryCollection(v6).winner!.score, "2000");
  assert.notEqual(BigInt(encoded.combinationCode), 1999n);
  assert.deepEqual(calculateHistoryScore(encoded.numbers, "unique-rank-v3", combinationKey), { combinationCode: encoded.combinationCode, score: "2000" });
  for (const change of [{ combinationKey: undefined }, { combinationKey: "0x1234" }, { combinationKey: `0x${"43".repeat(32)}` }, { score: String(Number(encoded.combinationCode) + 1) }]) {
    assert.throws(() => validateHistoryCollection({ ...v6, winner: { ...v6.winner!, ...change } }));
  }
  assert.throws(() => validateHistoryCollection({ ...v6, contractVersion: "affiliate-v5" }), /contract \/ algorithm/);
  assert.throws(() => calculateHistoryScore([0, 1, 1, 1], "unique-rank-v3", combinationKey));
});

test("V6 illustrative previews use a fixed demonstration key and preserve in-supply ranks", () => {
  for (const supply of [1, 20, 1000, 2000, 65536]) {
    const example = previewExample("unique-rank-v3", supply);
    assert.equal(example.score, BigInt(Math.min(1000, supply)));
    assert.deepEqual(calculateHistoryScore(example.numbers as [number, number, number, number], "unique-rank-v3", `0x${"42".repeat(32)}`).score, String(example.score));
    assert.match(buildTicketSvg("1", 1, true, "unique-rank-v3", supply), new RegExp(`SCORE ${example.score}`));
  }
});

test("V2 catalog requires the paired immutable algorithm, Ethereum currency and provider", () => {
  assert.equal(validateCollection(collection()).contractAddress, null);
  assert.equal(validateCollection(collection({ chainId: 11155111 })).chainId, 11155111);
  for (const overrides of [
    { randomnessProvider: "future-blockhash" }, { scoreFormula: SCORE_FORMULA }, { revealDelayBlocks: 5 },
    { chainId: 8453 }, { nativeCurrency: { symbol: "FLOW", decimals: 18 } }, { nativeCurrency: { symbol: "ETH", decimals: 6 } },
    { randomnessRequestId: "1" }, { randomnessState: "pending", randomnessRequestId: "1" },
  ] as Partial<CollectionPublic>[]) assert.throws(() => validateCollection(collection(overrides)), /Invalid collection configuration/);
});

test("V2 randomness projection follows one request through fulfillment and finalization", () => {
  const soldOut = { totalMinted: 1000, totalMintRevenueWei: "10000000000000000000" };
  for (const phase of ["pending_activation", "minting"] as const) assert.equal(validateCollection(live({ phase })).phase, phase);
  assert.equal(validateCollection(live({ ...soldOut, phase: "awaiting_request" })).randomnessState, "not_requested");
  assert.equal(validateCollection(live({ ...soldOut, phase: "awaiting_randomness", randomnessState: "pending", randomnessRequestId: "1" })).randomnessRequestId, "1");
  for (const phase of ["awaiting_finalization", "awaiting_prize", "complete"] as const) {
    assert.equal(validateCollection(live({ ...soldOut, phase, prizePaid: phase === "complete", randomnessState: "fulfilled", randomnessRequestId: "1" })).phase, phase);
    assert.throws(() => validateCollection(live({ ...soldOut, phase, prizePaid: phase === "complete", randomnessState: "pending", randomnessRequestId: "1" })), /randomness phase/);
  }
  assert.throws(() => validateCollection(live({ ...soldOut, phase: "refundable" })), /sold-out refunds/);
  assert.throws(() => validateCollection(live({ ...soldOut, phase: "settling" })), /algorithm phase/);
  assert.equal(validateCollection(live({ ...soldOut, phase: "awaiting_randomness", randomnessState: "pending", randomnessRequestId: "0" })).randomnessRequestId, "0");
  assert.equal(validateCollection(live({ ...soldOut, phase: "awaiting_finalization", randomnessState: "fulfilled", randomnessRequestId: "0" })).randomnessRequestId, "0");
  assert.equal(validateCollection(live({ ...soldOut, phase: "awaiting_request", randomnessState: "not_requested", randomnessRequestId: null })).randomnessRequestId, null);
  for (const randomnessRequestId of [null, "-1"]) {
    assert.throws(() => validateCollection(live({ ...soldOut, phase: "awaiting_randomness", randomnessState: "pending", randomnessRequestId })), /randomnessRequestId/);
  }
  assert.throws(() => validateCollection(live({ ...soldOut, phase: "awaiting_request", randomnessState: "not_requested", randomnessRequestId: "0" })), /randomnessRequestId/);
});

test("V2 history scores cover all 65536 nibble combinations while V1 arithmetic is unchanged", () => {
  assert.deepEqual(calculateHistoryScore([2, 3, 4, 5]), { combinationCode: "16909060", score: "111686058756" });
  for (let rank = 1; rank <= 65_536; rank++) {
    const code = rank - 1;
    const numbers: [number, number, number, number] = [(code >> 12) + 1, ((code >> 8) & 15) + 1, ((code >> 4) & 15) + 1, (code & 15) + 1];
    assert.deepEqual(calculateHistoryScore(numbers, "unique-rank-v2"), { combinationCode: String(code), score: String(rank) });
  }
  assert.throws(() => calculateHistoryScore([17, 1, 1, 1], "unique-rank-v2"), /combination/);
});

test("completed V2 history requires the one highest rank equal to collection supply", () => {
  for (const supply of [1, 1000, 2000, 65_536]) assert.equal(validateHistoryCollection(history(supply)).winner!.score, String(supply));
  const record = history(1000);
  assert.throws(() => validateHistoryCollection({ ...record, winner: { ...record.winner!, combination: [1, 1, 1, 1], combinationCode: "0", score: "1" } }), /highestRank/);
  assert.throws(() => validateHistoryCollection({ ...record, algorithmVersion: "feistel-v1" }), /randomnessProvider/);
  assert.throws(() => validateHistoryCollection({ ...record, chainId: 8453 }), /Ethereum network/);
  assert.throws(() => validateHistoryCollection({ ...record, winner: null, status: "refunded", totalRefundedWei: record.totalMintRevenueWei }), /sold-out refunds/);
});

test("illustrative SVG uses the collection version and keeps V2 sample ranks inside supply", () => {
  assert.match(buildTicketSvg("1", 1, true), /111686058756/);
  for (const supply of [1, 500, 1000, 2000, 65_536]) {
    const example = previewExample("unique-rank-v2", supply);
    const score = calculateHistoryScore(example.numbers as [number, number, number, number], "unique-rank-v2").score;
    assert.equal(score, String(Math.min(supply, 1000)));
    assert.match(buildTicketSvg("1", 1, true, "unique-rank-v2", supply), new RegExp(`SCORE ${score}`));
  }
});

test("V2 history counts the winning holder separately from a selected prize destination", () => {
  const first = history(1000);
  const second = history(2000);
  second.winner!.prizeRecipient = "0x2222222222222222222222222222222222222222";
  assert.equal(calculateHistoryStats([first, second].map(validateHistoryCollection)).uniqueWinners, 1, "one holder choosing two destinations is one winner");
  second.winner!.winningHolder = "0x3333333333333333333333333333333333333333";
  second.winner!.prizeRecipient = first.winner!.prizeRecipient;
  assert.equal(calculateHistoryStats([first, second].map(validateHistoryCollection)).uniqueWinners, 2, "two holders using one destination remain two winners");
  for (const winningHolder of [undefined, "0x0000000000000000000000000000000000000000", "invalid"]) {
    assert.throws(() => validateHistoryCollection({ ...first, winner: { ...first.winner!, winningHolder: winningHolder as string } }), /winningHolder/);
  }
});
test("V4 collection and history use their immutable prize percentage while legacy financial rules remain fixed",()=>{
  for(const prizeBps of [0,6500,10000]) {
    assert.equal(validateCollection(collection({contractVersion:"affiliate-v4",prizeBps})).prizeBps,prizeBps);
    const legacy=history(1000),price=10000n,revenue=price*1000n;
    const record:HistoryCollection={...legacy,contractVersion:"affiliate-v4",prizeBps,mintPriceWei:String(price),totalMintRevenueWei:String(revenue),winner:{...legacy.winner!,prizePaidWei:String(revenue*BigInt(prizeBps)/10000n)}};
    assert.equal(validateHistoryCollection(record).winner!.prizePaidWei,String(revenue*BigInt(prizeBps)/10000n));
    assert.throws(()=>validateHistoryCollection({...record,winner:{...record.winner!,prizePaidWei:String(revenue*BigInt(prizeBps)/10000n+1n)}}),/prizePaidWei/);
    if(prizeBps!==5000) assert.throws(()=>validateCollection(collection({contractVersion:"legacy",prizeBps})),/contract constants/);
  }
  assert.throws(()=>validateCollection(collection({contractVersion:"affiliate-v4",mintPriceWei:"2"})),/contract constants/);
  assert.throws(()=>validateHistoryCollection({...history(1000),contractVersion:"affiliate-v3"}),/V3 financial/);
  assert.throws(()=>validateCollection(collection({contractVersion:"affiliate-v3",prizeBps:6500})),/contract constants/);
  assert.throws(()=>validateCollection(collection({contractVersion:"affiliate-v4",prizeBps:10001})),/contract constants/);
});
