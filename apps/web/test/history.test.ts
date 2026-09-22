import assert from "node:assert/strict";
import test from "node:test";
import { UINT256_MAX, UNIQUE_RANK_SCORE_FORMULA, type CollectionPublic } from "../lib/collections/model.ts";
import { collectionProgress } from "../lib/collections/presentation.ts";
import {
  calculateHistoryScore,
  calculateHistoryStats,
  buildHistoryResponse,
  type HistoryCollection,
} from "../lib/history/model.ts";
import { validateHistoryCollection } from "../lib/history/validation.ts";

function fixture(overrides: Partial<HistoryCollection> = {}): HistoryCollection {
  const combination: [number, number, number, number] = [256, 255, 254, 256];
  return {
    algorithmVersion: "feistel-v1",
    contractVersion: "legacy", prizeBps:5000,
    randomnessProvider: "future-blockhash",
    id: "ad348b5a-8ad4-4719-82c4-0e2d58002008",
    seriesId: "942bc2a0-8b13-46a0-9434-05014f9b2026",
    seriesName: "Manekineko Archive Preview",
    roundId: "8",
    name: "Manekineko Round 8",
    symbol: "NEKO",
    chainId: 11155111,
    networkName: "Sepolia",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    maxSupply: 1500,
    totalMinted: 1500,
    mintPriceWei: "12000000000000000",
    totalMintRevenueWei: "18000000000000000000",
    totalRefundedWei: "0",
    status: "completed",
    openedAt: "2026-08-22T12:00:00.000Z",
    closedAt: "2026-08-27T18:45:00.000Z",
    isMock: true,
    winner: {
      tokenId: 42,
      combination,
      ...calculateHistoryScore(combination),
      winningHolder: "0x1111111111111111111111111111111111111111",
      prizeRecipient: "0x1111111111111111111111111111111111111111",
      prizePaidWei: "9000000000000000000",
      paidAt: "2026-08-27T18:45:00.000Z",
    },
    ...overrides,
  };
}

function refunded(overrides: Partial<HistoryCollection> = {}): HistoryCollection {
  return fixture({
    id: "ad348b5a-8ad4-4719-82c4-0e2d58002007",
    roundId: "7",
    name: "Manekineko Round 7",
    maxSupply: 600,
    totalMinted: 311,
    mintPriceWei: "10000000000000000",
    totalMintRevenueWei: "3110000000000000000",
    totalRefundedWei: "3110000000000000000",
    status: "refunded",
    winner: null,
    ...overrides,
  });
}

test("archive validation distinguishes completed awards and delivered refunds", () => {
  const completed = fixture();
  const refund = refunded();
  assert.equal(validateHistoryCollection(completed), completed);
  assert.equal(validateHistoryCollection(refund), refund);
  assert.equal(validateHistoryCollection(refunded({ totalMinted: 0, totalMintRevenueWei: "0", totalRefundedWei: "0" })).totalMinted, 0);
});

test("combination encoding matches all four Solidity byte positions and score boundaries", () => {
  assert.deepEqual(calculateHistoryScore([1, 1, 1, 1]), { combinationCode: "0", score: "8589934592" });
  assert.deepEqual(calculateHistoryScore([1, 2, 3, 4]), { combinationCode: "66051", score: "60129608195" });
  assert.deepEqual(calculateHistoryScore([256, 256, 256, 256]), { combinationCode: "4294967295", score: "562954248388607" });
  assert.equal(BigInt(calculateHistoryScore([1, 2, 1, 3]).score) < BigInt(calculateHistoryScore([1, 3, 1, 2]).score), true, "unique encoding breaks arithmetic ties deterministically");
  for (const combination of [[0, 1, 1, 1], [257, 1, 1, 1], [1, 1.5, 1, 1], [1, 1, Number.NaN, 1]] as [number, number, number, number][]) {
    assert.throws(() => calculateHistoryScore(combination), /combination/);
  }
});

test("archive winner scores must exactly match their tuple and encoding", () => {
  const winner = fixture().winner!;
  assert.throws(() => validateHistoryCollection(fixture({ winner: { ...winner, score: (BigInt(winner.score) + 1n).toString() } })), /winner.score/);
  assert.throws(() => validateHistoryCollection(fixture({ winner: { ...winner, combinationCode: (BigInt(winner.combinationCode) + 1n).toString() } })), /winner.combinationCode/);
  assert.throws(() => validateHistoryCollection(fixture({ winner: { ...winner, combination: [1, 1, 1, 1] } })), /winner.combinationCode/);
});

test("a completed archive must be sold out and pay exactly half primary receipts", () => {
  const completed = fixture();
  const winner = completed.winner!;
  assert.throws(() => validateHistoryCollection(fixture({ totalMinted: 1499, totalMintRevenueWei: (1499n * BigInt(completed.mintPriceWei)).toString() })), /completed supply/);
  assert.throws(() => validateHistoryCollection(fixture({ winner: null })), /completed winner/);
  assert.throws(() => validateHistoryCollection(fixture({ winner: { ...winner, prizePaidWei: "8999999999999999999" } })), /winner.prizePaidWei/);
  assert.throws(() => validateHistoryCollection(fixture({ totalRefundedWei: "2" })), /completed refunds/);
  assert.throws(() => validateHistoryCollection(fixture({ winner: { ...winner, tokenId: 1501 } })), /winner.tokenId/);
});

test("refund records cannot award a prize or report partial refunds as completed refunds", () => {
  assert.throws(() => validateHistoryCollection(refunded({ winner: fixture().winner })), /refunded winner/);
  assert.throws(() => validateHistoryCollection(refunded({ totalRefundedWei: "0" })), /totalRefundedWei/);
  assert.throws(() => validateHistoryCollection(refunded({ totalRefundedWei: "3110000000000000001" })), /totalRefundedWei/);
  assert.throws(() => validateHistoryCollection(refunded({ totalMintRevenueWei: "3109999999999999999" })), /totalMintRevenueWei/);
});

test("archive numeric validation retains uint256 precision and contract limits", () => {
  const price = UINT256_MAX - 1n;
  const huge = fixture({
    maxSupply: 1,
    totalMinted: 1,
    roundId: UINT256_MAX.toString(),
    mintPriceWei: price.toString(),
    totalMintRevenueWei: price.toString(),
    winner: { ...fixture().winner!, tokenId: 1, prizePaidWei: (price / 2n).toString() },
  });
  assert.equal(validateHistoryCollection(huge).winner!.prizePaidWei, (price / 2n).toString());
  assert.throws(() => validateHistoryCollection({ ...huge, mintPriceWei: (price + 2n).toString() }), /mintPriceWei/);
  for (const mintPriceWei of ["0", "3", "01", "2e16", "-2", "1.2"]) assert.throws(() => validateHistoryCollection(fixture({ mintPriceWei })), /mintPriceWei/);
  for (const maxSupply of [0, 65_537, 1.5]) assert.throws(() => validateHistoryCollection(fixture({ maxSupply })), /maxSupply/);
});

test("archive validation rejects invalid routes, addresses, provenance and date order", () => {
  assert.throws(() => validateHistoryCollection(fixture({ id: "../history" })), /id/);
  assert.throws(() => validateHistoryCollection(fixture({ seriesId: "not-a-uuid" })), /seriesId/);
  assert.throws(() => validateHistoryCollection(fixture({ roundId: "0" })), /roundId/);
  assert.throws(() => validateHistoryCollection(fixture({ isMock: undefined as unknown as boolean })), /isMock/);
  assert.throws(() => validateHistoryCollection(fixture({ closedAt: "2026-01-01T00:00:00Z" })), /dates/);
  assert.throws(() => validateHistoryCollection(fixture({ openedAt: "not-a-date" })), /dates/);
  for (const prizeRecipient of ["0x0000000000000000000000000000000000000000", "javascript:alert(1)", "0x1234"]) {
    assert.throws(() => validateHistoryCollection(fixture({ winner: { ...fixture().winner!, prizeRecipient } })), /winner.prizeRecipient/);
  }
  assert.throws(() => validateHistoryCollection(fixture({ winner: { ...fixture().winner!, paidAt: "2026-08-28T00:00:00Z" } })), /winner.paidAt/);
});

test("statistics use exact amounts and deduplicate winning holders case insensitively", () => {
  const winner = fixture().winner!;
  const address = "0xaBcDefabcdefabcdefabcdefabcdefabcdefabcd";
  const first = fixture({ winner: { ...winner, winningHolder: address, prizeRecipient: address } });
  const second = fixture({ id: "ad348b5a-8ad4-4719-82c4-0e2d58002006", winner: { ...winner, winningHolder: address.toLowerCase(), prizeRecipient: address.toLowerCase() } });
  const stats = calculateHistoryStats([first, second, refunded()].map(validateHistoryCollection));
  assert.deepEqual(stats, {
    collectionCount: 3,
    completedCount: 2,
    refundedCount: 1,
    totalTicketsMinted: 3311,
    uniqueWinners: 1,
    currencies: [{
      chainId: 11155111,
      networkName: "Sepolia",
      nativeCurrency: { symbol: "ETH", decimals: 18 },
      totalMintRevenueWei: "39110000000000000000",
      totalPrizePaidWei: "18000000000000000000",
      totalAffiliatePaidWei: "0",
      totalRefundedWei: "3110000000000000000",
      largestPrizeWei: "9000000000000000000",
    }],
  });
});

test("statistics never sum different chains or assets into one currency total", () => {
  const stats = calculateHistoryStats([
    fixture(),
    fixture({ chainId: 1, networkName: "Ethereum" }),
    fixture({ chainId: 137, networkName: "Polygon", nativeCurrency: { symbol: "POL", decimals: 18 } }),
    fixture({ chainId: 11155111, nativeCurrency: { symbol: "TEST", decimals: 6 } }),
  ].map(validateHistoryCollection));
  assert.equal(stats.currencies.length, 4);
  assert.ok(stats.currencies.every((currency) => currency.totalPrizePaidWei === "9000000000000000000"));
  assert.equal(calculateHistoryStats([]).currencies.length, 0);
  assert.equal(calculateHistoryStats([]).uniqueWinners, 0);
});

test("affiliate totals use confirmed claims, keep chains separate and do not double-count archived collections", () => {
  const archive = fixture({ isMock: false, totalAffiliatePaidWei: "2000000000000000000" });
  const response = buildHistoryResponse([archive], [
    liveCollection({ id: archive.id, totalAffiliatePaidWei: archive.totalAffiliatePaidWei }),
    liveCollection({ totalAffiliatePaidWei: "100000000000000", totalMinted: 20, totalMintRevenueWei: "2000000000000000" }),
    liveCollection({ id: "d744736d-bb48-4b70-bf93-95b711031530", chainId: 1, totalAffiliatePaidWei: "700" }),
  ]);
  assert.equal(response.stats.currencies.find(c => c.chainId === 11155111)?.totalAffiliatePaidWei, "2000100000000000000");
  assert.equal(response.stats.currencies.find(c => c.chainId === 1)?.totalAffiliatePaidWei, "700");
  assert.equal(calculateHistoryStats([fixture()]).currencies[0].totalAffiliatePaidWei, "0", "An allocation without a claim is not a payout.");
  for (const amount of ["-1", "01", "1e18", "1.5", (BigInt(archive.totalMintRevenueWei)+1n).toString()]) {
    assert.throws(() => validateHistoryCollection({ ...archive, totalAffiliatePaidWei: amount }));
  }
});

function liveCollection(overrides: Partial<CollectionPublic> = {}): CollectionPublic {
  return {
    ...fixture(),
    id: "3342c115-3d41-4cb4-be45-fa103178f0ff",
    slug: "sepolia-20-ticket-rehearsal",
    name: "Manekineko Sepolia 20-ticket rehearsal",
    description: "20-ticket Sepolia qualification collection.",
    symbol: "NKO20",
    contractVersion: "affiliate-v5",
    algorithmVersion: "unique-rank-v2",
    randomnessProvider: "chainlink-vrf-v2.5",
    randomnessRequestId: null,
    randomnessState: "not_requested",
    contractStatus: "deployed",
    contractAddress: "0x1111111111111111111111111111111111111111",
    explorerUrl: "https://sepolia.etherscan.io",
    source: "postgres",
    mode: "live",
    maxSupply: 20,
    totalMinted: 0,
    totalMintRevenueWei: "0",
    mintPriceWei: "100000000000000",
    mintDurationSeconds: 86400,
    mintDeadline: "2026-09-18T00:00:00.000Z",
    revealDelayBlocks: null,
    maxMintBatch: 20,
    affiliatePoolBps: 1000,
    scoreFormula: UNIQUE_RANK_SCORE_FORMULA,
    phase: "pending_activation",
    prizePaid: false,
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

test("public history removes sample outcomes and displays a real unactivated collection without a winner", () => {
  const response = buildHistoryResponse([fixture(), refunded()], [liveCollection()]);
  assert.equal(response.isMock, false);
  assert.deepEqual(response.collections, []);
  assert.equal(response.inProgress.length, 1);
  assert.equal(response.inProgress[0].phase, "pending_activation");
  assert.equal(response.stats.collectionCount, 1);
  assert.equal(response.stats.totalTicketsMinted, 0);
  assert.equal(response.stats.completedCount, 0);
  assert.equal(response.stats.uniqueWinners, 0);
  assert.equal(response.stats.currencies[0].totalPrizePaidWei, "0");
  assert.equal(collectionProgress(response.inProgress[0]).label, "Awaiting activation");
});

test("archive transition counts one collection once and excludes undeployed catalog entries", () => {
  const archive = fixture({ isMock: false });
  const response = buildHistoryResponse([archive], [
    liveCollection({ id: archive.id, totalMinted: archive.totalMinted, phase: "complete", prizePaid: true }),
    liveCollection({ phase: "minting", totalMinted: 3, totalMintRevenueWei: "300000000000000" }),
    liveCollection({ id: "ad348b5a-8ad4-4719-82c4-0e2d58002007", contractStatus: "undeployed", mode: "demo" }),
  ]);
  assert.equal(response.collections.length, 1);
  assert.equal(response.inProgress.length, 1);
  assert.equal(response.stats.collectionCount, 2);
  assert.equal(response.stats.totalTicketsMinted, archive.totalMinted + 3);
  assert.equal(response.stats.completedCount, 1);
  assert.equal(response.stats.currencies[0].totalPrizePaidWei, archive.winner!.prizePaidWei);
  assert.equal(response.stats.currencies[0].totalMintRevenueWei,
    (BigInt(archive.totalMintRevenueWei) + 300000000000000n).toString());
});

test("unarchived on-chain prize or refund phases do not fabricate historical outcomes", () => {
  for (const phase of ["awaiting_prize", "complete", "refundable"] as const) {
    const response = buildHistoryResponse([], [liveCollection({ phase, prizePaid: phase === "complete" })]);
    assert.equal(response.inProgress[0].phase, phase);
    assert.equal(response.stats.completedCount, 0);
    assert.equal(response.stats.refundedCount, 0);
    assert.equal(response.stats.uniqueWinners, 0);
    assert.equal(response.stats.currencies[0].totalPrizePaidWei, "0");
  }
});
