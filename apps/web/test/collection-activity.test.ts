import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionPublic } from "../lib/collections/model.ts";
import { collectionActivity, collectionHasClosed, countdownParts, featuredSeasonCollection, upcomingActivity } from "../lib/seasons/activity.ts";
import { enrollmentWindowClosed } from "../lib/affiliates/enrollment-window.ts";

const now = Date.parse("2026-09-20T12:00:00Z");
const start = "2026-09-20T13:00:00Z";
const deadline = "2026-09-21T13:00:00Z";
function collection(overrides: Partial<CollectionPublic> = {}): CollectionPublic {
  return { id: "next", mode: "live", contractStatus: "deployed", contractVersion: "affiliate-v8", phase: "pending_activation", saleStartAt: start, mintDeadline: deadline, totalMinted: 0, maxSupply: 1000, ...overrides } as CollectionPublic;
}

test("scheduled launch countdown becomes awaiting activation rather than implying an open mint", () => {
  assert.equal(collectionActivity(collection(), now).target, start);
  const reached = collectionActivity(collection(), Date.parse(start));
  assert.equal(reached.target, null);
  assert.equal(reached.label, "Awaiting activation");
  assert.match(reached.detail, /not open/);
});

test("a successor's countdown waits for its predecessor's confirmed sellout or unsold closure", () => {
  const previous = collection({ id: "previous", phase: "minting", saleStartAt: "2026-09-20T10:00:00Z", totalMinted: 400 });
  assert.equal(collectionActivity(collection(), now, previous).target, null);
  assert.equal(collectionActivity(collection(), now, { ...previous, totalMinted: 1000 }).target, start);
  assert.equal(collectionActivity(collection(), now, { ...previous, phase: "refundable" }).target, start);
  assert.equal(collectionHasClosed(collection({ phase: "pending_activation" })), false);
});

test("mint countdown expires without inventing refund confirmation and sellout removes it", () => {
  assert.equal(collectionActivity(collection({ phase: "minting" }), Date.parse(start)).target, deadline);
  const expired = collectionActivity(collection({ phase: "minting" }), Date.parse(deadline));
  assert.equal(expired.target, null);
  assert.equal(expired.label, "Mint deadline reached");
  assert.equal(collectionActivity(collection({ phase: "awaiting_randomness", totalMinted: 1000 }), now).target, null);
  assert.equal(collectionActivity(collection({ phase: "refundable" }), now).label, "Refunds available");
  assert.equal(collectionActivity(collection({ phase: "refundable", refundedAt: deadline }), now).label, "Refunds completed");
});

test("unpublished teasers never invent dates after sellout or refunds", () => {
  for (const previous of [undefined, collection(), collection({ totalMinted: 1000 }), collection({ phase: "refundable" })]) {
    assert.equal("target" in upcomingActivity(previous), false);
  }
  assert.match(upcomingActivity(collection({ totalMinted: 1000 })).detail, /sold out/);
  assert.match(upcomingActivity(collection({ phase: "refundable" })).detail, /unsold/);
  assert.equal(collectionActivity(collection({ contractStatus: "undeployed" }), now).target, null);
});

test("countdowns handle seconds and days, reject invalid dates, and never go negative", () => {
  assert.deepEqual(countdownParts(new Date(now + 90061000).toISOString(), now), { days: 1, hours: 1, minutes: 1, seconds: 1, expired: false });
  assert.equal(countdownParts(new Date(now + 1).toISOString(), now)?.seconds, 1);
  assert.deepEqual(countdownParts(start, Date.parse(start) + 1), { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
  assert.equal(countdownParts("invalid", now), null);
});

test("enrollment closes at the V7/V8 cutoff even without activation, preserving older versions", () => {
  for (const version of ["affiliate-v7", "affiliate-v8"]) {
    assert.equal(enrollmentWindowClosed(version, start, Date.parse(start) / 1000 - 1), false);
    assert.equal(enrollmentWindowClosed(version, new Date(start), Date.parse(start) / 1000), true);
    assert.equal(enrollmentWindowClosed(version, null, now / 1000), true);
  }
  assert.equal(enrollmentWindowClosed("affiliate-v5", undefined, now / 1000), false);
});

test("the season cover follows the next collection after sellout and the last result after completion", () => {
  const previous = collection({ id: "previous", phase: "awaiting_randomness", totalMinted: 1000 });
  const next = collection();
  assert.equal(featuredSeasonCollection([previous, next], now).id, "next");
  assert.equal(featuredSeasonCollection([previous, { ...next, totalMinted: 1000, phase: "complete" }], now).id, "next");
});
