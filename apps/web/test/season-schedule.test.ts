import assert from "node:assert/strict";
import test from "node:test";
import { announcedCollectionActivity, announcedSeasonsResponse, parseAnnouncedSeason, type AnnouncedSeason } from "../lib/seasons/schedule.ts";

const now = Date.parse("2030-01-01T12:00:00Z");
function fixture(): AnnouncedSeason {
  return { version: 1, runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", chainId: 11155111, seasonId: `0x${"12".repeat(32)}`, seasonName: "Moonlight Study", seasonNumber: 1, colors: ["#330000", "#660000"], status: "running", announcedAt: "2030-01-01T11:00:00Z", updatedAt: "2030-01-01T12:00:00Z", collections: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", number: 1, name: "Cinder Study", color: "#330000", status: "preparing", enrollmentOpensAt: "2030-01-01T12:30:00Z", saleStartAt: "2030-01-01T13:00:00Z", mintDeadline: "2030-01-02T13:00:00Z", contractAddress: null }] };
}
const activity = (season: AnnouncedSeason, time = now) => announcedCollectionActivity(season, season.collections[0], time);
test("public schedule parser whitelists season and collection fields and preserves palette order", () => {
  const source = fixture();
  const result = parseAnnouncedSeason({ ...source, encryptedCredentials: "never-public", preparedArtifact: { privateKey: "never-public" }, collections: [{ ...source.collections[0], deploymentJournal: "never-public" }] });
  assert(!JSON.stringify(result).includes("never-public"));
  assert.deepEqual(result.colors, ["#330000", "#660000"]);
  assert.equal(result.collections[0].saleStartAt, "2030-01-01T13:00:00.000Z");
  assert.equal(announcedSeasonsResponse({ seasons: [source] }).length, 1);
  assert.throws(() => announcedSeasonsResponse({ seasons: Array(101).fill(source) }));
});
test("invalid or inconsistent announcement identities, palettes and times fail closed", () => {
  for (const mutate of [
    (value: AnnouncedSeason) => { value.chainId = 2 as 1; },
    (value: AnnouncedSeason) => { value.seasonId = `0x${"0".repeat(64)}`; },
    (value: AnnouncedSeason) => { value.collections[0].color = "#FFFFFF"; },
    (value: AnnouncedSeason) => { value.collections.push({ ...value.collections[0] }); },
    (value: AnnouncedSeason) => { value.updatedAt = "2030-02-30T12:00:00Z"; },
    (value: AnnouncedSeason) => { value.collections[0].mintDeadline = value.collections[0].saleStartAt; },
    (value: AnnouncedSeason) => { value.collections[0].enrollmentOpensAt = "2030-01-01T14:00:00Z"; },
    (value: AnnouncedSeason) => { value.collections[0].contractAddress = `0x${"0".repeat(40)}`; },
  ]) { const value = fixture(); mutate(value); assert.throws(() => parseAnnouncedSeason(value)); }
});
test("announced countdowns distinguish enrollment from mint schedules", () => {
  const value = fixture();
  assert.equal(activity(value).target, value.collections[0].enrollmentOpensAt);
  value.updatedAt = "2030-01-01T12:40:00Z"; value.collections[0].status = "enrollment";
  assert.equal(activity(value, Date.parse(value.updatedAt)).target, value.collections[0].saleStartAt);
  assert.match(activity(value, Date.parse(value.updatedAt)).detail, /enrollment is open/);
});
test("zero countdown never announces an unconfirmed live mint or refund", () => {
  const value = fixture(); value.updatedAt = "2030-01-01T13:00:00Z";
  let result = activity(value, Date.parse(value.updatedAt));
  assert.equal(result.target, null); assert.equal(result.label, "Waiting for on-chain activation");
  value.collections[0].status = "minting";
  result = activity(value, Date.parse(value.updatedAt));
  assert.equal(result.label, "Waiting for on-chain activation", "Missing deployed address must never be live");
  value.collections[0].contractAddress = `0x${"1".repeat(40)}`;
  assert.equal(activity(value, Date.parse(value.updatedAt)).label, "Mint deadline in");
  value.updatedAt = value.collections[0].mintDeadline!;
  result = activity(value, Date.parse(value.updatedAt));
  assert.equal(result.label, "Mint deadline reached"); assert.equal(result.target, null); assert.doesNotMatch(result.detail, /refunds available|confirmed active/i);
});
test("stale, future-dated and paused worker snapshots suppress countdowns", () => {
  const value = fixture();
  assert.equal(activity(value, now + 180001).label, "Checking season status");
  value.updatedAt = "2030-01-01T12:02:00Z";
  assert.equal(activity(value).label, "Checking season status");
  value.status = "paused";
  assert.equal(activity(value).label, "Season automation paused"); assert.equal(activity(value).target, null);
  value.status = "completed";
  assert.equal(activity(value).label, "Season complete");
});
test("unannounced next start remains unknown, while confirmed outcomes take precedence over old schedules", () => {
  const value = fixture(), c = value.collections[0]; c.enrollmentOpensAt = null; c.saleStartAt = null; c.mintDeadline = null;
  assert.equal(activity(value).label, "Schedule to be announced");
  for (const [status, label] of [["refundable", "Refunds available"], ["sold_out", "Sold out · draw pending"], ["revealed", "Draw verified"]] as const) {
    c.status = status; c.enrollmentOpensAt = "2030-01-01T12:30:00Z";
    assert.equal(activity(value).label, label); assert.equal(activity(value).target, null);
  }
});
