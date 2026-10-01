import assert from "node:assert/strict";
import test from "node:test";
import { announcedCollectionActivity, announcedSeasonsResponse, parseAnnouncedSeason, type AnnouncedSeason } from "../lib/seasons/schedule.ts";

const now = Date.parse("2030-01-01T12:00:00Z");
function fixture(): AnnouncedSeason {
  return { version: 1, runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", chainId: 11155111, seasonId: `0x${"12".repeat(32)}`, seasonName: "Moonlight Study", seasonNumber: 1, colors: ["#330000", "#660000"], status: "running", announcedAt: "2030-01-01T11:00:00Z", updatedAt: "2030-01-01T12:00:00Z", collections: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", number: 1, name: "Cinder Study", color: "#330000", status: "preparing", enrollmentOpensAt: "2030-01-01T12:30:00Z", saleStartAt: "2030-01-01T13:00:00Z", mintDeadline: "2030-01-02T13:00:00Z", contractAddress: null }] };
}
const activity = (season: AnnouncedSeason, time = now) => announcedCollectionActivity(season, season.collections[0], time);
test("rescheduled announcements retain the original opening and validate both dates",()=>{
  const value=fixture();value.collections[0].originalSaleStartAt="2030-01-01T01:00:00Z";
  assert.equal(parseAnnouncedSeason(value).collections[0].originalSaleStartAt,"2030-01-01T01:00:00.000Z");
  value.collections[0].originalSaleStartAt="invalid";assert.throws(()=>parseAnnouncedSeason(value));
});
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
test("stale observations preserve scheduled intent without claiming readiness; paused workers stay paused", () => {
  const value = fixture();
  assert.equal(activity(value, now + 180001).label, "Mint scheduled in");
  assert.equal(activity(value, now + 180001).target, value.collections[0].saleStartAt);
  assert.match(activity(value, now + 180001).detail, /Readiness is unconfirmed/);
  value.updatedAt = "2030-01-01T12:02:00Z";
  assert.equal(activity(value).label, "Mint scheduled in");
  value.status = "paused";
  assert.equal(activity(value).label, "Season automation paused"); assert.equal(activity(value).target, null);
  value.status = "completed";
  assert.equal(activity(value).label, "Worker finished");
});
test("unannounced next start remains unknown, while confirmed outcomes take precedence over old schedules", () => {
  const value = fixture(), c = value.collections[0]; c.enrollmentOpensAt = null; c.saleStartAt = null; c.mintDeadline = null;
  assert.equal(activity(value).label, "Schedule to be announced");
  for (const [status, label] of [["refundable", "Refunds available"], ["sold_out", "Sold out · draw pending"], ["revealed", "Draw verified"]] as const) {
    c.status = status; c.enrollmentOpensAt = "2030-01-01T12:30:00Z";
    assert.equal(activity(value).label, label); assert.equal(activity(value).target, null);
  }
});

test("three explicit review runs share one season and preserve refund and sellout history",async()=>{
 const {mergeAnnouncedSeasons}=await import("../lib/seasons/schedule.ts");
 const ids=["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","cccccccc-cccc-4ccc-8ccc-cccccccccccc","dddddddd-dddd-4ddd-8ddd-dddddddddddd"];
 const stages=ids.map((id,index)=>{const s=fixture();s.reviewCollectionIds=ids;s.colors=["#330000","#660000","#990000"];s.collections=[{...s.collections[0],id,number:index+1,color:s.colors[index],status:index===1?"refundable":"revealed"}];s.status="completed";return parseAnnouncedSeason(s);});
 const one=mergeAnnouncedSeasons([stages[0]])[0];assert.equal(one.collections.length,3);assert.equal(one.collections[1].saleStartAt,null);assert.equal(one.status,"paused");
 const all=mergeAnnouncedSeasons([stages[2],stages[1],stages[0]]);assert.equal(all.length,1);assert.deepEqual(all[0].collections.map(c=>c.status),["revealed","refundable","revealed"]);assert.equal(all[0].status,"completed");
 const conflict=structuredClone(stages[1]);conflict.colors[0]="#FFFFFF";assert.throws(()=>mergeAnnouncedSeasons([stages[2],conflict]));
 const normal=fixture();assert.deepEqual(mergeAnnouncedSeasons([normal,{...normal,status:"completed"}]),[normal]);
});
