import test from "node:test";
import assert from "node:assert/strict";
import { collectionLifecycle, seasonLifecycle, observedClock } from "@manekineko/contract-abi/lifecycle";
import { featuredPublicCollection } from "../lib/seasons/featured.ts";
import { collectionChainNow, collectionObservationFresh } from "../lib/seasons/model.ts";
import type { CollectionPublic } from "../lib/collections/model.ts";
import type { AnnouncedSeason } from "../lib/seasons/schedule.ts";
const now = Date.parse("2030-01-01T12:00:00Z"), observedAt = new Date(now).toISOString();
const base = { now, observedAt, deployment: "deployed", winnerCount: 6, awards: [] as { claimed: boolean }[] };
const awards = (paid: number) => Array.from({ length: 6 }, (_, i) => ({ claimed: i < paid }));
test("canonical lifecycle covers sale, draw, independent claims, paid and refunds", () => {
  for (const [phase, paid, state, terminal] of [
    ["pending_activation", -1, "pending_activation", false], ["minting", -1, "minting", false],
    ["awaiting_request", -1, "processing", false], ["awaiting_randomness", -1, "processing", false], ["awaiting_finalization", -1, "processing", false],
    ["awaiting_prize", 0, "claimable", true], ["awaiting_prize", 4, "claimable", true], ["complete", 6, "paid", true], ["refundable", -1, "refundable", true],
  ] as const) {
    const result = collectionLifecycle({ ...base, phase, awards: paid < 0 ? [] : awards(paid) });
    assert.equal(result.state, state); assert.equal(result.terminal, terminal);
    if (paid >= 0) assert.equal(result.unpaidPrizes, 6 - paid);
  }
});
test("stale, missing and mismatched observations cannot invent completion or zero awards", () => {
  for (const overrides of [ { observedAt: null }, { now: now + 180_001 }, { awards: [] }, { awards: awards(4) }, { allPrizesPaid: false } ]) {
    const state = collectionLifecycle({ ...base, phase: "complete", awards: awards(6), ...overrides });
    assert.equal(state.state, "unavailable"); assert.equal(state.terminal, false); assert.equal(state.unpaidPrizes, null);
  }
});
test("two-step season completes despite unpaid prizes or paused worker; unknown third step blocks completion", () => {
  const collections = [{ ...base, id: "one", phase: "complete", awards: awards(6) }, { ...base, id: "two", phase: "awaiting_prize", awards: awards(4) }];
  assert.deepEqual(seasonLifecycle(collections, ["one", "two"]), { state: "complete", completedCollections: 2, totalCollections: 2, unpaidPrizes: 2, allPrizesPaid: false });
  assert.equal(seasonLifecycle(collections, ["one", "two", "three"]).state, "unavailable");
  assert.equal(seasonLifecycle([{ ...collections[0], now: now + 200000 }, collections[1]]).state, "unavailable");
});
function collection(overrides: Partial<CollectionPublic> = {}): CollectionPublic {
  return { id: "one", name: "First", chainId: 11155111, seasonId: `0x${"1".repeat(64)}`, mode: "live", contractStatus: "deployed", contractAddress: `0x${"2".repeat(40)}`, phase: "complete", winnerCount: 6, awards: awards(6), prizePaid: true, updatedAt: observedAt,
    totalMinted: 1000, maxSupply: 1000, saleStartAt: new Date(now - 3600000).toISOString(), mintDeadline: new Date(now + 86400000).toISOString(),
    observation: { blockNumber: "10", blockHash: `0x${"3".repeat(64)}`, chainTimestamp: observedAt, observedAt, servedAt: observedAt }, ...overrides } as CollectionPublic;
}
test("featured precedence favors verified live sale, then real schedule, then completed actual sequence", () => {
  const one = collection(), two = collection({ id: "two", name: "Second", saleStartAt: observedAt });
  const season = { chainId: 11155111, seasonId: one.seasonId, seasonName: "Two steps", status: "paused", updatedAt: observedAt,
    collections: [{ id: "one", status: "revealed" }, { id: "two", status: "revealed" }] } as AnnouncedSeason;
  assert.equal(featuredPublicCollection([one, two], [season], now)?.status, "complete");
  assert.equal(featuredPublicCollection([one, two], [season], now)?.totalCollections, 2);
  const future = { ...season, collections: [...season.collections, { id: "three", status: "scheduled", saleStartAt: new Date(now + 3600000).toISOString(), number: 3, name: "Third" } as AnnouncedSeason["collections"][number]] };
  assert.equal(featuredPublicCollection([one, two], [future], now)?.status, "scheduled");
  const live = collection({ id: "live", phase: "minting", totalMinted: 42, awards: [], prizePaid: false });
  assert.equal(featuredPublicCollection([one, live], [future], now)?.remainingSupply, 958);
  assert.equal(featuredPublicCollection([one], [], now + 180001)?.status, "unavailable");
});
test("countdown ignores device clock skew, survives fresh reload, stops on stale RPC, and never extends deadline", () => {
  const anchor = Date.parse(observedAt), deadline = anchor + 60000;
  for (const deviceClock of [anchor - 86400000, anchor + 86400000]) {
    void deviceClock;
    assert.equal(deadline - observedClock(anchor, 100, 1100)!, 59000);
  }
  assert.equal(observedClock(anchor + 1000, 0, 0), observedClock(anchor, 100, 1100));
  assert.equal(observedClock(anchor, 100, 99), null);
  const c = collection();
  assert.equal(collectionChainNow(c, now + 1000), now + 1000);
  assert.equal(collectionChainNow(c, now + 180001), null);
  assert.equal(collectionObservationFresh({ ...c, observation: { ...c.observation!, chainTimestamp: new Date(now - 600000).toISOString() } }, now), false);
});
test("featured colors follow the selected season and network, with a collection-color fallback", () => {
  const live = collection({ phase: "minting", totalMinted: 42, awards: [], prizePaid: false, collectionColor: "#330000" });
  const season = { chainId: live.chainId, seasonId: live.seasonId, colors: ["#330000", "#FF6600"], updatedAt: observedAt, collections: [] } as unknown as AnnouncedSeason;
  const otherNetwork = { ...season, chainId: 1 as const, colors: ["#0000FF"] };
  assert.deepEqual(featuredPublicCollection([live], [otherNetwork, season], now)?.seasonColors, season.colors);
  assert.deepEqual(featuredPublicCollection([live], [otherNetwork], now)?.seasonColors, ["#330000"]);
  const scheduled = { ...season, colors: ["#003366", "#3399FF"], collections: [{ id: "next", name: "Next", number: 1, status: "scheduled", saleStartAt: new Date(now + 3600000).toISOString() }] } as AnnouncedSeason;
  assert.deepEqual(featuredPublicCollection([], [scheduled], now)?.seasonColors, scheduled.colors);
  assert.deepEqual(featuredPublicCollection([collection()], [season], now)?.seasonColors, season.colors);
});
