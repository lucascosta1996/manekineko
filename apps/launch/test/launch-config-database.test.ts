import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { launchArtifactHash } from "../lib/launch-config-artifact.ts";
import { LaunchConfigurationError } from "../lib/launch-config.ts";
import { createLaunchConfiguration, exportLaunchConfiguration, finalizeLaunchConfiguration, getLaunchConfiguration, listLaunchConfigurations, updateLaunchConfiguration } from "../lib/launch-config-store.ts";
import { launchFixture } from "./launch-config.fixture.ts";

const connectionString = process.env.DATABASE_URL;
const enabled = process.env.TEST_LAUNCH_DATABASE === "1";
test("launch workflow persists exact revisions and protects finalized artifacts in PostgreSQL", { skip: !enabled ? "Set TEST_LAUNCH_DATABASE=1 and a local DATABASE_URL to run isolated PostgreSQL regressions." : false }, async t => {
  assert.ok(connectionString, "DATABASE_URL is required for PostgreSQL regressions.");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname), "Launch database regressions run only against local PostgreSQL.");
  const schema = `manekineko_launch_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString, application_name: "manekineko-launch-regression" });
  let pool: pg.Pool | undefined;
  let connected = false, created = false;
  try {
    await admin.connect(); connected = true;
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    pool = new pg.Pool({ connectionString, max: 12, options: `-c search_path=${schema},public`, application_name: "manekineko-launch-regression" });
    const db = pool;
    for (const name of ["009_launch_auth.sql", "010_launch_configurations.sql", "011_launch_active_actors.sql"]) await db.query(await readFile(new URL(`../../../database/migrations/${name}`, import.meta.url), "utf8"));
    const actor = { userId: randomUUID() }, secondActor = { userId: randomUUID() };
    const passwordHash = `scrypt$131072$8$1$${"A".repeat(22)}$${"A".repeat(86)}`;
    await db.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,'operator',$3),($2,'reviewer',$3)", [actor.userId, secondActor.userId, passwordHash]);
    const incomplete = launchFixture(); incomplete.contract.initialOwner = "";
    const draft = await createLaunchConfiguration(db, actor, { label: "Draft round", payload: incomplete });

    await t.test("drafts survive a fresh database read and remain in the private launch registry", async () => {
      assert.deepEqual((await getLaunchConfiguration(db, draft.id)).payload, incomplete);
      assert.equal((await listLaunchConfigurations(db)).length, 1);
      assert.equal(draft.status, "draft"); assert.equal(draft.revision, 1);
      await assert.rejects(() => exportLaunchConfiguration(db, draft.id), error => error instanceof LaunchConfigurationError && error.status === 409);
      await assert.rejects(() => finalizeLaunchConfiguration(db, actor, draft.id, 1), error => error instanceof LaunchConfigurationError && error.status === 422);
      assert.equal((await getLaunchConfiguration(db, draft.id)).revision, 1);
    });

    await t.test("concurrent updates advance one reviewed revision exactly once", async () => {
      const results = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => updateLaunchConfiguration(db, actor, draft.id, { label: `Saved revision ${index}`, payload: launchFixture(), revision: 1 })));
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      for (const result of results) if (result.status === "rejected") assert.equal((result.reason as LaunchConfigurationError).status, 409);
      assert.equal((await getLaunchConfiguration(db, draft.id)).revision, 2);
    });

    await t.test("concurrent finalization creates a single immutable artifact and audit event", async () => {
      const results = await Promise.allSettled(Array.from({ length: 12 }, () => finalizeLaunchConfiguration(db, secondActor, draft.id, 2)));
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      for (const result of results) if (result.status === "rejected") assert.equal((result.reason as LaunchConfigurationError).status, 409);
      const finalized = await getLaunchConfiguration(db, draft.id);
      assert.equal(finalized.revision, 3); assert.equal(finalized.status, "finalized"); assert.equal(finalized.finalizedBy, secondActor.userId);
      const exported = await exportLaunchConfiguration(db, draft.id);
      const { contentHash, ...artifact } = exported.artifact;
      assert.equal(contentHash, launchArtifactHash(artifact)); assert.equal(contentHash, finalized.contentHash);
      assert.equal(artifact.contract.prizeBps, "6000"); assert.ok(artifact.contract.vrfCoordinator);
      const events = (await db.query("SELECT revision,event,actor_id FROM manekineko_launch_configuration_events WHERE configuration_id=$1 ORDER BY revision", [draft.id])).rows;
      assert.deepEqual(events.map(event => event.event), ["created", "updated", "finalized"]);
      assert.equal(events[2].actor_id, secondActor.userId);
    });

    await t.test("service and SQL both refuse changes to finalized terms and audit history", async () => {
      await assert.rejects(() => updateLaunchConfiguration(db, actor, draft.id, { label: "Changed", payload: launchFixture(), revision: 3 }), error => error instanceof LaunchConfigurationError && error.status === 409);
      await assert.rejects(() => db.query("UPDATE manekineko_launch_configurations SET label='Changed',revision=revision+1 WHERE id=$1", [draft.id]), /immutable/);
      await assert.rejects(() => db.query("DELETE FROM manekineko_launch_configurations WHERE id=$1", [draft.id]), /retained/);
      await assert.rejects(() => db.query("UPDATE manekineko_launch_configuration_events SET event='updated' WHERE configuration_id=$1", [draft.id]), /immutable/);
      await assert.rejects(() => db.query("DELETE FROM manekineko_launch_configuration_events WHERE configuration_id=$1", [draft.id]), /immutable/);
    });

    await t.test("an edit racing finalization cannot replace the reviewed terms", async () => {
      const original = await createLaunchConfiguration(db, actor, { label: "Race", payload: launchFixture() });
      const different = launchFixture(); different.contract.prizeBps = "7000";
      const results = await Promise.allSettled([
        finalizeLaunchConfiguration(db, secondActor, original.id, 1),
        updateLaunchConfiguration(db, actor, original.id, { label: "Changed before review", payload: different, revision: 1 }),
      ]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      const latest = await getLaunchConfiguration(db, original.id);
      assert.equal(latest.revision, 2);
      assert.equal(latest.payload.contract.prizeBps, latest.status === "finalized" ? "6000" : "7000");
    });

    await t.test("unknown identities, unauthorized actors and invalid revisions do not create changes", async () => {
      await assert.rejects(() => getLaunchConfiguration(db, randomUUID()), error => error instanceof LaunchConfigurationError && error.status === 404);
      await assert.rejects(() => createLaunchConfiguration(db, { userId: randomUUID() }, { label: "Missing actor", payload: launchFixture() }), error => error instanceof LaunchConfigurationError && error.code === "inactive_actor" && error.status === 403);
      const current = await createLaunchConfiguration(db, actor, { label: "Revision guard", payload: launchFixture() });
      await assert.rejects(() => db.query("UPDATE manekineko_launch_configurations SET revision=revision+2 WHERE id=$1", [current.id]), /revisions/);
      assert.equal((await getLaunchConfiguration(db, current.id)).revision, 1);
    });

    await t.test("a disabled actor cannot create, update or finalize a configuration through the shared service", async () => {
      const current = await createLaunchConfiguration(db, actor, { label: "Active actor required", payload: launchFixture() });
      await db.query("UPDATE manekineko_launch_users SET disabled_at=now() WHERE id=$1", [secondActor.userId]);
      const inactive = (error: unknown) => error instanceof LaunchConfigurationError && error.code === "inactive_actor" && error.status === 403;
      await assert.rejects(() => createLaunchConfiguration(db, secondActor, { label: "Disabled creation", payload: launchFixture() }), inactive);
      await assert.rejects(() => updateLaunchConfiguration(db, secondActor, current.id, { label: "Disabled update", payload: launchFixture(), revision: 1 }), inactive);
      await assert.rejects(() => finalizeLaunchConfiguration(db, secondActor, current.id, 1), inactive);
      assert.equal((await getLaunchConfiguration(db, current.id)).revision, 1);
      assert.equal((await db.query("SELECT count(*)::integer AS count FROM manekineko_launch_configuration_events WHERE configuration_id=$1", [current.id])).rows[0].count, 1);
      await db.query("UPDATE manekineko_launch_users SET disabled_at=NULL WHERE id=$1", [secondActor.userId]);
    });

    await t.test("a mutation waiting for a concurrent account disable rechecks the committed disabled state", async () => {
      const disabler = await db.connect(), writer = await db.connect();
      let attempt: Promise<unknown> | undefined;
      try {
        await disabler.query("BEGIN");
        await disabler.query("UPDATE manekineko_launch_users SET disabled_at=now() WHERE id=$1", [secondActor.userId]);
        const pid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        attempt = createLaunchConfiguration(writer, secondActor, { label: "Disabled during mutation", payload: launchFixture() }).catch(error => error);
        let observedLock = false;
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline) {
          const activity = (await db.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0];
          if (activity?.wait_event_type === "Lock") { observedLock = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(observedLock, true, "The write must wait for the account row lock.");
        await disabler.query("COMMIT");
        const result = await attempt;
        assert.ok(result instanceof LaunchConfigurationError && result.code === "inactive_actor" && result.status === 403);
        assert.equal((await db.query("SELECT count(*)::integer AS count FROM manekineko_launch_configurations WHERE label='Disabled during mutation'")).rows[0].count, 0);
      } finally {
        await disabler.query("ROLLBACK");
        await attempt;
        writer.release(); disabler.release();
      }
    });
  } finally {
    await pool?.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    if (connected) await admin.end();
  }
});
