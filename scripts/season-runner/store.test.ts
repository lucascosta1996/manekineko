import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { runtimeArtifact } from "../../apps/launch/test/season-runtime.fixture.ts";
import { createLaunchAutomation, prepareLaunchAutomation } from "../../apps/launch/lib/launch-automation-store.ts";
import { requestSeasonStart, saveRuntimeProfile } from "../../apps/launch/lib/season-runtime-store.ts";
import { decryptRuntimeSecret } from "../../apps/launch/lib/season-runtime-crypto.ts";
import { grantRuntimeRoles } from "./provision.ts";
import { openRunStore, type RunStore } from "./store.ts";

const connection = process.env.SEASON_RUNTIME_TEST_DATABASE_URL;
test("persistent run store preserves locks, encrypted recovery, outbox metadata and public observation age under the worker role", { skip: !connection }, async () => {
  const url = new URL(connection!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Store integration tests require explicitly isolated local PostgreSQL");
  const suffix = randomUUID().replaceAll("-", ""), databaseName = `tincta_store_test_${suffix}`;
  const roles = { launchRole: `tincta_launch_${suffix}`, webRole: `tincta_web_${suffix}`, workerRole: `tincta_worker_${suffix}` };
  const admin = new pg.Client({ connectionString: url.href }), createdRoles: string[] = [];
  const oldChain = process.env.MANEKINEKO_CHAIN_ID, oldKey = process.env.SEASON_RUNNER_MASTER_KEY;
  let pool: pg.Pool | undefined, worker: pg.Pool | undefined, store: RunStore | undefined, created = false;
  try {
    await admin.connect(); await admin.query(`CREATE DATABASE ${databaseName}`); created = true;
    for (const role of Object.values(roles)) { await admin.query(`CREATE ROLE "${role}" NOLOGIN`); createdRoles.push(role); }
    url.pathname = `/${databaseName}`; pool = new pg.Pool({ connectionString: url.href, max: 4 });
    const migrations = new URL("../../database/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort()) await pool.query(await readFile(new URL(file, migrations), "utf8"));
    await grantRuntimeRoles(pool, roles);
    // Session role is applied at startup, before any application query. Every
    // store operation below therefore exercises the restricted worker grants.
    worker = new pg.Pool({ connectionString: url.href, options: `-c role=${roles.workerRole}`, max: 3 });
    assert.equal((await worker.query("SELECT current_user AS role")).rows[0].role, roles.workerRole);
    process.env.MANEKINEKO_CHAIN_ID = "11155111"; process.env.SEASON_RUNNER_MASTER_KEY = Buffer.alloc(32, 9).toString("base64");
    const actor = { userId: randomUUID() };
    await pool.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,'store_operator',$2)", [actor.userId, `scrypt$131072$8$1$${"A".repeat(22)}$${"A".repeat(86)}`]);
    const { schemaVersion: _schema, kind: _kind, contractVersion: _version, ...plan } = runtimeArtifact();
    await saveRuntimeProfile(pool, actor, "11155111", { revision: 0, enabled: true, handle: "tincta_test", expectedAccountId: "123", publicBaseUrl: "https://tincta.xyz", credentials: { apiKey: "fictional-key", apiKeySecret: "fictional-secret", accessToken: "fictional-token", accessTokenSecret: "fictional-token-secret" } });
    async function runFixture() {
      const draft = await createLaunchAutomation(pool!, actor, { plan });
      const prepared = await prepareLaunchAutomation(pool!, actor, draft.id, draft.revision, new Date("2030-01-01"));
      return requestSeasonStart(pool!, actor, prepared.id, { revision: prepared.revision, preparedHash: prepared.contentHash, profileRevision: 1 });
    }
    const run = await runFixture(), otherRun = await runFixture();
    await assert.rejects(() => openRunStore(worker!, run.id, 1, true), /run_not_found_on_selected_network/);
    store = await openRunStore(worker, run.id, 11155111, false);
    await assert.rejects(() => store!.guard(), /read_only_worker/);
    await assert.rejects(() => store!.save({ shouldNotPersist: true }), /read_only_worker/);
    await assert.rejects(() => store!.event("should_not_persist", "Read-only activity"), /read_only_worker/);
    await assert.rejects(() => store!.putAction("read-only", "x-post", {}), /read_only_worker/);
    await assert.rejects(() => store!.updateAction("read-only", "confirmed", {}), /read_only_worker/);
    await assert.rejects(() => store!.publish({}), /read_only_worker/);
    await store.close(); store = undefined;
    assert.deepEqual((await pool.query("SELECT state FROM manekineko_season_runtime_runs WHERE id=$1", [run.id])).rows[0].state, {});

    store = await openRunStore(worker, run.id, 11155111, true);
    await assert.rejects(() => openRunStore(worker!, otherRun.id, 11155111, true), /another_worker_owns_this_network/);
    await store.guard();
    const guarded = (await pool.query("SELECT status,lease_owner,lease_expires_at,heartbeat_at FROM manekineko_season_runtime_runs WHERE id=$1", [run.id])).rows[0];
    assert.equal(guarded.status, "running"); assert(guarded.lease_owner); assert(guarded.lease_expires_at > guarded.heartbeat_at);
    const state = { version: 1, secretJournal: "fictional-signed-transaction", transactions: [{ hash: `0x${"a".repeat(64)}`, nonce: 7 }] };
    await store.save(state);
    const persisted = (await pool.query("SELECT state FROM manekineko_season_runtime_runs WHERE id=$1", [run.id])).rows[0].state;
    assert.deepEqual(Object.keys(persisted), ["encrypted"]); assert(!JSON.stringify(persisted).includes("fictional"));
    assert.deepEqual(JSON.parse(decryptRuntimeSecret(persisted.encrypted, `run-state:${run.id}`)), state);
    assert.throws(() => decryptRuntimeSecret(persisted.encrypted, `run-state:${otherRun.id}`), /could not be authenticated/);

    const pending = await store.putAction("opening:root", "x-post", { accountId: "123", text: "Original" });
    assert.equal(pending.status, "pending");
    const duplicate = await store.putAction("opening:root", "x-post", { accountId: "999", text: "Unreviewed change" });
    assert.equal(duplicate.id, pending.id); assert.equal(duplicate.payload.text, "Original");
    assert.equal((await store.replacePendingAction("opening:root", { accountId: "123", text: "Fresh countdown" })).payload.text, "Fresh countdown");
    await assert.rejects(() => store!.replacePendingAction("opening:root", { accountId: "999", text: "Wrong account" }), /post_refresh_requires_known_unsent_action/);
    await store.updateAction("opening:root", "sending", { mediaId: "555" });
    await assert.rejects(() => store!.replacePendingAction("opening:root", { accountId: "123", text: "Ambiguous replacement" }), /post_refresh_requires_known_unsent_action/);
    await store.updateAction("opening:root", "uncertain", { mediaId: "555" }, "x_delivery_requires_reconciliation");
    assert.equal((await store.action("opening:root"))?.last_error, "x_delivery_requires_reconciliation");
    await store.updateAction("opening:root", "confirmed", { mediaId: "555", postId: "777", confirmedAt: "2030-01-01T12:00:00Z" });
    await assert.rejects(() => store!.replacePendingAction("opening:root", { accountId: "123", text: "Duplicate post" }), /post_refresh_requires_known_unsent_action/);
    await store.putAction("tx:deploy", "transaction", { nonce: 7, operation: "deploy" });
    const txHash = `0x${"ab".repeat(32)}`;
    await store.query("UPDATE manekineko_season_runtime_actions SET status='submitted',tx_hash=$3,result=$4::jsonb WHERE run_id=$1 AND action_key=$2", [run.id, "tx:deploy", txHash, JSON.stringify({ nonce: 7, blockNumber: null })]);
    await store.updateAction("tx:deploy", "confirmed", { nonce: 7, blockNumber: 90, blockHash: `0x${"cd".repeat(32)}` });
    const tx = (await pool.query("SELECT status,tx_hash,result FROM manekineko_season_runtime_actions WHERE run_id=$1 AND action_key='tx:deploy'", [run.id])).rows[0];
    assert.equal(tx.status, "confirmed"); assert.equal(tx.tx_hash, txHash); assert.equal(tx.result.nonce, 7); assert.equal(tx.result.blockNumber, 90);

    const observedAt = "2020-01-01T12:00:00.000Z";
    await assert.rejects(() => store!.publish({ version: 1, updatedAt: observedAt }), /first_announcement_not_confirmed/);
    await assert.rejects(() => store!.publish({ version: 1, announcedAt: observedAt }), /projection_needs_observation_time/);
    await store.publish({ version: 1, announcedAt: observedAt, updatedAt: observedAt, status: "running", colors: ["#330000"], collections: [] });
    await store.save({ ...state, freshCheckpoint: true });
    const projection = (await pool.query("SELECT p.updated_at,p.payload,r.heartbeat_at FROM manekineko_season_runtime_public p JOIN manekineko_season_runtime_runs r ON r.id=p.run_id WHERE p.run_id=$1", [run.id])).rows[0];
    assert.equal(projection.updated_at.toISOString(), observedAt); assert.equal(projection.payload.updatedAt, observedAt); assert(projection.heartbeat_at > projection.updated_at);
    await store.event("verified", "Isolated worker projection recorded.");
    await store.close(); store = undefined;
    const closed = (await pool.query("SELECT lease_owner,lease_expires_at FROM manekineko_season_runtime_runs WHERE id=$1", [run.id])).rows[0];
    assert.equal(closed.lease_owner, null); assert.equal(closed.lease_expires_at, null);
    store = await openRunStore(worker, run.id, 11155111, true);
    assert.deepEqual(store.state, { ...state, freshCheckpoint: true });
    assert.equal((await store.action("opening:root"))?.result.postId, "777");

    // An unexpected profile change must stop subsequent side effects and make
    // the public schedule paused without manufacturing a newer observation.
    await pool.query("UPDATE manekineko_season_runtime_profiles SET revision=revision+1 WHERE chain_id='11155111'");
    await assert.rejects(() => store!.guard(), /profile_changed_pause_and_resume/);
    await store.pause("profile_changed_pause_and_resume"); await store.pause("profile_changed_pause_and_resume");
    const stopped = (await pool.query("SELECT status,desired_state,last_error FROM manekineko_season_runtime_runs WHERE id=$1", [run.id])).rows[0];
    assert.equal(stopped.status, "paused"); assert.equal(stopped.desired_state, "paused"); assert.equal(stopped.last_error, "profile_changed_pause_and_resume");
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM manekineko_season_runtime_events WHERE run_id=$1 AND event='paused'", [run.id])).rows[0].count, 1);
    const pausedProjection = (await pool.query("SELECT payload,updated_at FROM manekineko_season_runtime_public WHERE run_id=$1", [run.id])).rows[0];
    assert.equal(pausedProjection.payload.status, "paused"); assert.equal(pausedProjection.updated_at.toISOString(), observedAt);
    await assert.rejects(() => store!.putAction("cannot-send", "x-post", {}), /run_is_paused/);
    await store.close(); store = undefined;
    // Closing released the network lock: another prepared run can now inspect.
    store = await openRunStore(worker, otherRun.id, 11155111, false); await store.close(); store = undefined;
    await pool.query("UPDATE manekineko_season_runtime_runs SET status='running',desired_state='running',profile_revision=2 WHERE id=$1", [run.id]);
    store = await openRunStore(worker, run.id, 11155111, true);
    await store.complete(); await store.complete();
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM manekineko_season_runtime_events WHERE run_id=$1 AND event='completed'", [run.id])).rows[0].count, 1);
    await store.publish({ version: 1, announcedAt: observedAt, updatedAt: observedAt, status: "completed", collections: [] });
    await store.pause("late_claim_monitor_paused");
    const completed = (await pool.query("SELECT status,desired_state,last_error FROM manekineko_season_runtime_runs WHERE id=$1", [run.id])).rows[0];
    assert.equal(completed.status, "completed"); assert.equal(completed.desired_state, "paused"); assert.equal(completed.last_error, "late_claim_monitor_paused");
    const completedProjection = (await pool.query("SELECT payload,updated_at FROM manekineko_season_runtime_public WHERE run_id=$1", [run.id])).rows[0];
    assert.equal(completedProjection.payload.status, "completed"); assert.equal(completedProjection.updated_at.toISOString(), observedAt);
  } finally {
    await store?.close(); await worker?.end(); await pool?.end();
    if (created) await admin.query(`DROP DATABASE ${databaseName}`);
    for (const role of createdRoles) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
    if (oldChain === undefined) delete process.env.MANEKINEKO_CHAIN_ID; else process.env.MANEKINEKO_CHAIN_ID = oldChain;
    if (oldKey === undefined) delete process.env.SEASON_RUNNER_MASTER_KEY; else process.env.SEASON_RUNNER_MASTER_KEY = oldKey;
  }
});
