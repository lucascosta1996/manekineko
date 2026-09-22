import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { createLaunchAutomation, exportLaunchAutomation, getLaunchAutomation, listLaunchAutomations, prepareLaunchAutomation, updateLaunchAutomation } from "../lib/launch-automation-store.ts";
import seasons from "../../../seasons.json" with { type: "json" };
import { normalizeSeasonAppearance } from "@manekineko/contract-abi/season-appearance";
import { automationFixture, AUTOMATION_NOW } from "./launch-automation.fixture.ts";
import { seasonFixture, TEST_SEASON_ID } from "./launch-season.fixture.ts";

const connectionString = process.env.DATABASE_URL;
test("seasons migration preserves history and enforces named ten-collection groups in isolated PostgreSQL", {
  skip: process.env.TEST_LAUNCH_DATABASE !== "1" ? "Set TEST_LAUNCH_DATABASE=1 and a verified local DATABASE_URL for isolated PostgreSQL regressions." : false,
}, async t => {
  assert.ok(connectionString);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname));
  const schema = `manekineko_seasons_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString, application_name: "manekineko-season-regression" });
  let db: pg.Pool | undefined, connected = false, created = false;
  try {
    await admin.connect(); connected = true;
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    db = new pg.Pool({ connectionString, max: 12, options: `-c search_path=${schema},public`, application_name: "manekineko-season-regression" });
    const pool = db;
    const root = new URL("../../../database/migrations/", import.meta.url);
    for (const name of (await readdir(root)).filter(name => /^\d+.*\.sql$/.test(name) && name < "018").sort()) await pool.query(await readFile(new URL(name, root), "utf8"));
    const actor = { userId: randomUUID() };
    await pool.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,'season-operator',$2)", [actor.userId, `scrypt$131072$8$1$${"A".repeat(22)}$${"A".repeat(86)}`]);
    const legacy = await createLaunchAutomation(pool, actor, { plan: automationFixture() });
    await prepareLaunchAutomation(pool, actor, legacy.id, 1, AUTOMATION_NOW);
    const oldExport = await exportLaunchAutomation(pool, legacy.id);
    await pool.query(await readFile(new URL("018_collection_seasons.sql", root), "utf8"));
    await pool.query(await readFile(new URL("027_sepolia_mock_seasons.sql", root), "utf8"));

    await t.test("migration keeps previously prepared plans and hashes unchanged", async () => {
      assert.deepEqual(await exportLaunchAutomation(pool, legacy.id), oldExport);
    });

    await t.test("named seasons persist their appearance and immutable reviewed exports", async () => {
      const plan = seasonFixture();
      for (const step of plan.steps) {
        step.payload.operations.winnerCreditsAddress = "0x4444444444444444444444444444444444444444";
        step.payload.operations.winnerCreditSponsorshipWei = step.payload.contract.mintPriceWei;
        step.payload.operations.affiliateEligibilityAddress = "0x5555555555555555555555555555555555555555";
      }
      const draft = await createLaunchAutomation(pool, actor, { plan });
      const prepared = await prepareLaunchAutomation(pool, actor, draft.id, 1, AUTOMATION_NOW);
      const exported = await exportLaunchAutomation(pool, draft.id);
      assert.equal(prepared.plan.seasonId, TEST_SEASON_ID);
      assert.equal(exported.artifact.steps[0].payload.contract.collectionColor, "#234567");
      assert.equal(exported.artifact.steps[0].payload.contract.textColor, "#FFFFFF");
      await assert.rejects(() => pool.query("UPDATE manekineko_launch_automations SET plan=jsonb_set(plan,'{name}','\"Changed\"') WHERE id=$1", [draft.id]), /immutable/);
    });

    await t.test("database rejects oversized or mismatched season documents even outside the API", async () => {
      const insert = (plan: unknown) => pool.query("INSERT INTO manekineko_launch_automations(id,plan,created_by,updated_by) VALUES($1,$2::jsonb,$3,$3)", [randomUUID(), JSON.stringify(plan), actor.userId]);
      const badName = seasonFixture(); badName.steps[0].payload.contract.seasonName = "Another season";
      await assert.rejects(() => insert(badName), /manekineko_launch_season_check/);
      const over = seasonFixture(); over.steps = Array.from({ length: 11 }, () => ({ ...structuredClone(over.steps[0]), id: randomUUID() }));
      await assert.rejects(() => insert(over), /manekineko_launch_season_check/);
    });

    await t.test("catalog order survives edits and pagination while collection names and colors keep file order", async () => {
      const imported = [];
      for (const season of seasons) {
        const plan = seasonFixture();
        plan.name = season.theme;
        plan.seasonId = `0x${createHash("sha256").update(`manekineko:seasons.json:chain:${plan.chainId}:season:${season.season}`).digest("hex")}`;
        const template = plan.steps[0];
        plan.steps = season.collections.map(color => {
          const step = structuredClone(template);
          step.id = randomUUID(); step.label = color; step.payload.contract.name = color;
          Object.assign(step.payload.contract, normalizeSeasonAppearance({ seasonId: plan.seasonId, seasonName: plan.name, collectionColor: color }));
          return step;
        });
        imported.push(await createLaunchAutomation(pool, actor, { plan }));
      }
      // Newly edited plans used to jump ahead of the first season.
      const renamed = structuredClone(imported[1].plan);
      renamed.name = "Renamed second season";
      for (const step of renamed.steps) step.payload.contract.seasonName = renamed.name;
      const saved = await updateLaunchAutomation(pool, actor, imported[1].id, { plan: renamed, revision: 1 });
      assert.equal(saved.seasonOrder, 2);
      for (let index = 0; index < 101; index++) {
        const plan = seasonFixture(); plan.name = `Custom season ${index}`;
        for (const step of plan.steps) step.payload.contract.seasonName = plan.name;
        await createLaunchAutomation(pool, actor, { plan });
      }
      const first = await listLaunchAutomations(pool);
      assert.equal(first.automations.length, 100); assert.ok(first.nextCursor);
      assert.deepEqual(first.automations.slice(0, seasons.length).map(item => item.id), imported.map(item => item.id));
      assert.deepEqual(first.automations.slice(0, seasons.length).map(item => item.seasonOrder), seasons.map((_, index) => index + 1));
      const second = await listLaunchAutomations(pool, first.nextCursor);
      assert.equal(second.nextCursor, null);
      const ids = [...first.automations, ...second.automations].map(item => item.id);
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(ids.length, (await pool.query("SELECT count(*)::integer AS count FROM manekineko_launch_automations")).rows[0].count);
      // Verify a page boundary inside the catalog, including the transition to custom drafts.
      const time = (await pool.query(`SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS time FROM manekineko_launch_automations WHERE id=$1`, [imported[0].id])).rows[0].time;
      const cursor = Buffer.from(JSON.stringify({ updatedAt: time, id: imported[0].id, seasonOrder: 1 })).toString("base64url");
      const afterFirst = await listLaunchAutomations(pool, cursor);
      assert.deepEqual(afterFirst.automations.map(item => item.id), ids.slice(1, 101));
      for (const [index, record] of imported.entries()) {
        const stored = await getLaunchAutomation(pool, record.id);
        assert.equal(stored.seasonOrder, index + 1);
        assert.deepEqual(stored.plan.steps.map(step => step.payload.contract.collectionColor), seasons[index].collections);
        assert.deepEqual(stored.plan.steps.map(step => step.payload.contract.name), seasons[index].collections);
      }
    });

    const seriesId = randomUUID();
    await pool.query("INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url) VALUES(11155111,'Sepolia','ETH',18,'https://sepolia.etherscan.io'),(1,'Ethereum','ETH',18,'https://etherscan.io') ON CONFLICT DO NOTHING");
    await pool.query("INSERT INTO manekineko_series(id,name) VALUES($1,'Season database regression')", [seriesId]);
    let round = 0;
    function insertCollection(options: { chainId?: number; seasonId?: string; seasonName?: string; color?: string | null; text?: string | null } = {}) {
      const id = randomUUID(); round++;
      return pool.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,max_supply,mint_price_wei,mint_duration_seconds,
        reveal_delay_blocks,algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps,season_id,season_name,collection_color,text_color)
        VALUES($1,$2,$3,$4,$5,'Test collection','TEST',20,10000,3600,NULL,'unique-rank-v3','chainlink-vrf-v2.5','affiliate-v6',5000,1000,$6,$7,$8,$9) RETURNING id`,
      [id, seriesId, options.chainId ?? 11155111, round, `season-test-${id}`, options.seasonId ?? TEST_SEASON_ID, options.seasonName ?? "Moonlight season", options.color === undefined ? "#234567" : options.color, options.text === undefined ? "#FFFFFF" : options.text]);
    }

    await t.test("concurrent registration admits exactly ten collections in one season", async () => {
      const results = await Promise.allSettled(Array.from({ length: 14 }, () => insertCollection()));
      assert.equal(results.filter(result => result.status === "fulfilled").length, 10);
      for (const result of results) if (result.status === "rejected") assert.match(String(result.reason), /at most ten/);
      assert.equal((await pool.query("SELECT count(*) FROM manekineko_collections WHERE chain_id=11155111 AND season_id=$1", [TEST_SEASON_ID])).rows[0].count, "10");
      assert.equal((await insertCollection({ chainId: 1 })).rowCount, 1, "The season cap is independent across networks.");
    });

    await t.test("registered appearance and season names cannot drift", async () => {
      const id = (await pool.query("SELECT id FROM manekineko_collections WHERE chain_id=11155111 LIMIT 1")).rows[0].id;
      for (const [column, value] of [["season_name", "Changed"], ["collection_color", "#FFFFFF"], ["text_color", "#000000"], ["season_id", `0x${"34".repeat(32)}`]] as const) {
        await assert.rejects(() => pool.query(`UPDATE manekineko_collections SET ${column}=$2 WHERE id=$1`, [id, value]), /immutable/);
      }
      await assert.rejects(() => insertCollection({ seasonName: "Changed" }), /same season name/);
      await assert.rejects(() => insertCollection({ seasonId: `0x${"34".repeat(32)}`, color: null }), /season_appearance_check/);
      await assert.rejects(() => insertCollection({ seasonId: `0x${"34".repeat(32)}`, color: "#abcdef" }), /season_appearance_check/);
      await assert.rejects(() => insertCollection({ seasonId: `0x${"34".repeat(32)}`, text: "red" }), /season_appearance_check/);
    });
  } finally {
    await db?.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    if (connected) await admin.end();
  }
});
