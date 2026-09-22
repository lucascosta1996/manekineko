import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { createLaunchAutomation, exportLaunchAutomation, prepareLaunchAutomation } from "../lib/launch-automation-store.ts";
import { automationFixture, AUTOMATION_NOW } from "./launch-automation.fixture.ts";
import { seasonFixture } from "./launch-season.fixture.ts";
import { defaultSeasonTiming, defaultSeasonSocial } from "../lib/season-timeline.ts";

const connectionString = process.env.DATABASE_URL;
test("V7 timing migrations preserve prepared history and persist immutable revision-bound schedules", {
  skip: process.env.TEST_LAUNCH_DATABASE !== "1" ? "Requires verified local PostgreSQL; runs in an isolated temporary database." : false,
}, async () => {
  assert.ok(connectionString); assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname));
  const schema = `manekineko_timing_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString }); let db: pg.Pool | undefined, created = false;
  try {
    await admin.connect(); await admin.query(`CREATE DATABASE ${schema}`); created = true;
    const isolatedUrl = new URL(connectionString); isolatedUrl.pathname = `/${schema}`;
    db = new pg.Pool({ connectionString: isolatedUrl.href });
    const root = new URL("../../../database/migrations/", import.meta.url);
    const names = (await readdir(root)).filter(n => /^\d+.*\.sql$/.test(n)).sort();
    for (const name of names.filter(n => n < "019")) await db.query(await readFile(new URL(name, root), "utf8"));
    const actor = { userId: randomUUID() };
    await db.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,'timing-operator',$2)", [actor.userId, `scrypt$131072$8$1$${"A".repeat(22)}$${"A".repeat(86)}`]);
    const legacy = await createLaunchAutomation(db, actor, { plan: automationFixture() });
    await prepareLaunchAutomation(db, actor, legacy.id, 1, AUTOMATION_NOW);
    const before = await exportLaunchAutomation(db, legacy.id);
    for (const name of names.filter(n => n >= "019")) {
      try { await db.query(await readFile(new URL(name, root), "utf8")); }
      catch (error) { const issue = error as { message: string; position?: string; internalQuery?: string }; throw new Error(`${name}: ${issue.message}, position ${issue.position}, SQL ${issue.internalQuery ?? ""}`); }
    }
    assert.deepEqual(await exportLaunchAutomation(db, legacy.id), before);
    const plan = seasonFixture(); plan.timing = defaultSeasonTiming(); plan.social = defaultSeasonSocial(); plan.intervalSeconds = "0"; plan.startAt = "2030-01-01T01:00:00Z";
    for (const step of plan.steps) {
      Object.assign(step.payload.contract, { algorithmVersion: "unique-rank-v4", prizeBps: "6000", secondPrizeBps: "2000", affiliatePoolBps: "2000", minAffiliateReferrals: "100", affiliatePayoutCapBps: "3000", saleStartAt: "0" });
      Object.assign(step.payload.operations, { enrollmentWindowSeconds: "900", winnerCreditsAddress: "0x4444444444444444444444444444444444444444", winnerCreditSponsorshipWei: "20000000000000000", affiliateEligibilityAddress: "0x5555555555555555555555555555555555555555" });
    }
    const draft = await createLaunchAutomation(db, actor, { plan });
    const prepared = await prepareLaunchAutomation(db, actor, draft.id, 1, new Date("2030-01-01T00:00:00Z"));
    const saved = await exportLaunchAutomation(db, prepared.id);
    assert.equal(saved.artifact.contractVersion, "affiliate-v7");
    assert.deepEqual(saved.artifact.timing, plan.timing);
    const insert = (id: string, revision: number, hash: string, launch: string) => db!.query(`INSERT INTO manekineko_season_launch_schedule(id,automation_id,automation_revision,prepared_content_hash,step_id,launch_at) VALUES($1,$2,$3,$4,$5,$6)`, [id, prepared.id, revision, hash, plan.steps[0].id, launch]);
    await assert.rejects(() => insert(randomUUID(), 1, prepared.contentHash!, plan.startAt!), /exact prepared/);
    await assert.rejects(() => insert(randomUUID(), prepared.revision, "0".repeat(64), plan.startAt!), /exact prepared/);
    await assert.rejects(() => insert(randomUUID(), prepared.revision, prepared.contentHash!, "2030-01-01T02:00:00Z"), /fixed start/);
    const scheduleId = randomUUID(); await insert(scheduleId, prepared.revision, prepared.contentHash!, plan.startAt!);
    await assert.rejects(() => insert(randomUUID(), prepared.revision, prepared.contentHash!, plan.startAt!), /unique/);
    await assert.rejects(() => db!.query("UPDATE manekineko_season_launch_schedule SET launch_at=launch_at+interval '1 minute' WHERE id=$1", [scheduleId]), /immutable/);
    const bad = structuredClone(plan); bad.timing!.nextAnnouncementDelaySeconds = "3600";
    await assert.rejects(() => db!.query("INSERT INTO manekineko_launch_automations(id,plan,created_by,updated_by) VALUES($1,$2,$3,$3)", [randomUUID(), bad, actor.userId]), /timing_check/);
    // V7 snapshots permit either holder to claim independently without declaring both paid.
    const seriesId = randomUUID(), collectionId = randomUUID();
    await db.query("INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url) VALUES(11155111,'Sepolia','ETH',18,'https://sepolia.etherscan.io') ON CONFLICT DO NOTHING");
    await db.query("INSERT INTO manekineko_series(id,name) VALUES($1,'Timing regression')", [seriesId]);
    await db.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,max_supply,mint_price_wei,mint_duration_seconds,reveal_delay_blocks,algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps,season_id,season_name,collection_color,text_color,second_prize_bps,min_affiliate_referrals,affiliate_payout_cap_bps,sale_start_at)
      VALUES($1,$2,11155111,1,$3,'V7 regression','TEST',1000,10000000000000000,86400,NULL,'unique-rank-v4','chainlink-vrf-v2.5','affiliate-v7',6000,2000,$4,$5,'#234567','#FFFFFF',2000,100,3000,'2030-01-01T01:00:00Z')`, [collectionId,seriesId,`v7-${collectionId}`,plan.seasonId,plan.name]);
    await db.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
      VALUES($1,11155111,'deployed',$2,$3,$4,1,'2030-01-02T01:00:00Z','2030-01-01T00:00:00Z')`, [collectionId,`0x${"66".repeat(20)}`,`0x${"33".repeat(20)}`,`0x${"11".repeat(32)}`]);
    await db.query(`INSERT INTO manekineko_collection_state(collection_id,phase,total_minted,total_mint_revenue_wei,settled_count,winning_token_id,highest_score,prize_paid,prize_paid_wei,block_number,block_hash,award_count,sold_out_at,revealed_at,all_prizes_paid,randomness_state,randomness_request_id,randomness_word)
      VALUES($1,'awaiting_prize',1000,10000000000000000000,1000,17,1000,false,4000000000000000000,100,$2,2,'2030-01-01T02:00:00Z','2030-01-01T02:10:00Z',false,'fulfilled',1,123)`, [collectionId,`0x${"22".repeat(32)}`]);
    await assert.rejects(() => db!.query("UPDATE manekineko_collection_state SET phase='complete',prize_paid=true,all_prizes_paid=true WHERE collection_id=$1", [collectionId]), /immutable collection terms/);
    await db.query("UPDATE manekineko_collection_state SET phase='complete',prize_paid=true,all_prizes_paid=true,prize_paid_wei=6000000000000000000 WHERE collection_id=$1", [collectionId]);
    const awardInsert = (rank: number, amount: string) => db!.query(`INSERT INTO manekineko_collection_awards(collection_id,rank,token_id,score,amount_wei,numbers,combination_code,combination_key,current_holder,determined_at,determined_transaction,claimed,block_number,block_hash)
      VALUES($1,$2,$3,$4,$5,ARRAY[2,3,4,5],4660,$6,$7,'2030-01-01T02:10:00Z',$8,false,100,$9)`, [collectionId,rank,rank===1?17:23,1001-rank,amount,`0x${"33".repeat(32)}`,`0x${"44".repeat(20)}`,`0x${"55".repeat(32)}`,`0x${"22".repeat(32)}`]);
    await awardInsert(1,"4000000000000000000"); await awardInsert(2,"2000000000000000000");
    await assert.rejects(() => awardInsert(2,"4000000000000000000"), /versioned collection terms/);
    const intent = () => db!.query("INSERT INTO manekineko_season_action_intents(id,schedule_id,kind,prerequisite,idempotency_key,payload) VALUES($1,$2,'deploy_collection','verified_draw',$3,'{}')", [randomUUID(), scheduleId, `deploy:${scheduleId}`]);
    await intent(); await assert.rejects(intent, /unique/);
  } finally { await db?.end(); if (created) await admin.query(`DROP DATABASE ${schema}`); await admin.end(); }
});
