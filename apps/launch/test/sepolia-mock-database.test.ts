import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { createSepoliaMockSeasons } from "../lib/sepolia-mock-seasons.ts";
import { createLaunchAutomation, getLaunchAutomation, listLaunchAutomations, updateLaunchAutomation } from "../lib/launch-automation-store.ts";
import { defaultAutomationForm, payloadFromAutomationForm } from "../components/automations/form-values.ts";
import { catalogSeasonOrders } from "../lib/season-catalog-order.ts";
import { getRuntimeProfile, getRuntimeWorkerProfile, saveRuntimeProfile } from "../lib/season-runtime-store.ts";

const connection = process.env.SEASON_RUNTIME_TEST_DATABASE_URL;
test("mock catalog persists atomically, preserves edits and sources, and isolates network profiles", { skip: !connection }, async () => {
  const url = new URL(connection!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const name = `tincta_mock_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url.href });
  const previousChain = process.env.MANEKINEKO_CHAIN_ID, previousKey = process.env.SEASON_RUNNER_MASTER_KEY;
  let pool: pg.Pool | undefined, created = false;
  try {
    await admin.connect(); await admin.query(`CREATE DATABASE ${name}`); created = true;
    url.pathname = `/${name}`; pool = new pg.Pool({ connectionString: url.href, max: 4 });
    const dir = new URL("../../../database/migrations/", import.meta.url);
    for (const file of (await readdir(dir)).filter(file => file.endsWith(".sql")).sort()) await pool.query(await readFile(new URL(file, dir), "utf8"));
    const actor = { userId: randomUUID() };
    await pool.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,'mock_operator',$2)", [actor.userId, `scrypt$131072$8$1$${"A".repeat(22)}$${"A".repeat(86)}`]);
    // Profiles can be configured before any season exists, with no copied secrets.
    process.env.MANEKINEKO_CHAIN_ID = "1";
    process.env.SEASON_RUNNER_MASTER_KEY = Buffer.alloc(32, 9).toString("base64");
    const credentials = { apiKey: "fictional-key", apiKeySecret: "fictional-secret", accessToken: "fictional-token", accessTokenSecret: "fictional-token-secret" };
    const profile = { revision: 0, enabled: false, handle: "main_account", expectedAccountId: "123", publicBaseUrl: "https://tincta.xyz", credentials };
    await saveRuntimeProfile(pool, actor, "1", profile);
    process.env.MANEKINEKO_CHAIN_ID = "11155111";
    assert.equal(await getRuntimeProfile(pool, "11155111"), null);
    await assert.rejects(() => saveRuntimeProfile(pool!, actor, "11155111", { ...profile, publicBaseUrl: "https://quiet-garden.vercel.app" }), /separate/);
    await assert.rejects(() => saveRuntimeProfile(pool!, actor, "11155111", { ...profile, expectedAccountId: "456" }), /separate/);
    await saveRuntimeProfile(pool, actor, "11155111", { ...profile, expectedAccountId: "456", handle: "other_account", publicBaseUrl: "https://quiet-garden.vercel.app", credentials: { ...credentials, accessToken: "test-only-token" } });
    assert.equal((await getRuntimeWorkerProfile(pool, "11155111")).credentials.accessToken, "test-only-token");
    assert.equal((await getRuntimeWorkerProfile(pool, "1")).credentials.accessToken, credentials.accessToken);
    assert(!JSON.stringify(await getRuntimeProfile(pool, "11155111")).includes("test-only-token"));
    process.env.MANEKINEKO_CHAIN_ID = "11155111";
    await pool.query("ALTER TABLE manekineko_launch_automations ADD CONSTRAINT mock_test_staging CHECK (plan->>'chainId'='11155111' OR status='draft')");
    await assert.rejects(() => createSepoliaMockSeasons(pool!, actor), /Save a Mainnet season/);
    const identities = Object.entries(catalogSeasonOrders).filter(([, order]) => order <= 2).filter((_, index) => index % 2 === 0);
    for (const [seasonId, order] of identities) {
      const form = defaultAutomationForm([randomUUID(), randomUUID()], "1", seasonId); form.name = `Private mainnet ${order}`;
      await createLaunchAutomation(pool, actor, { plan: payloadFromAutomationForm(form) });
    }
    const original = (await pool.query("SELECT * FROM manekineko_launch_automations ORDER BY id")).rows;
    const [one, two] = await Promise.all([createSepoliaMockSeasons(pool, actor), createSepoliaMockSeasons(pool, actor)]);
    assert.equal(one.createdSeasons + two.createdSeasons, 2); assert.equal(one.createdCollections + two.createdCollections, 4);
    const mocks = (await listLaunchAutomations(pool, null, "11155111")).automations;
    assert.deepEqual(mocks.map(mock => mock.seasonOrder), [1, 2]);
    assert.deepEqual((await pool.query("SELECT * FROM manekineko_launch_automations WHERE plan->>'chainId'='1' ORDER BY id")).rows, original);
    const mock = await getLaunchAutomation(pool, mocks[0].id);
    assert.equal(mock.seasonOrder, 1); assert.equal(mock.status, "draft"); assert.equal(mock.contentHash, null);
    assert(!JSON.stringify(mock).includes("mock_source"));
    mock.plan.steps[0].payload.contract.maxSupply = "500";
    const edited = await updateLaunchAutomation(pool, actor, mock.id, { plan: mock.plan, revision: mock.revision });
    assert.deepEqual(await createSepoliaMockSeasons(pool, actor), { createdSeasons: 0, createdCollections: 0, existingSeasons: 2 });
    assert.deepEqual(await getLaunchAutomation(pool, mock.id), edited);
    await assert.rejects(() => pool!.query("UPDATE manekineko_launch_automations SET mock_source_revision=99 WHERE id=$1", [mock.id]), /immutable/);
    await pool.query("UPDATE manekineko_launch_users SET disabled_at=now() WHERE id=$1", [actor.userId]);
    await assert.rejects(() => createSepoliaMockSeasons(pool!, actor), /active operator/);
  } finally {
    if (previousChain === undefined) delete process.env.MANEKINEKO_CHAIN_ID; else process.env.MANEKINEKO_CHAIN_ID = previousChain;
    if (previousKey === undefined) delete process.env.SEASON_RUNNER_MASTER_KEY; else process.env.SEASON_RUNNER_MASTER_KEY = previousKey;
    await pool?.end(); if (created) await admin.query(`DROP DATABASE ${name}`); await admin.end();
  }
});
