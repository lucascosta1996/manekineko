import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { AutomationError, type AutomationPayload } from "../lib/launch-automation.ts";
import { automationArtifactHash } from "../lib/launch-automation-artifact.ts";
import { createLaunchAutomation, exportLaunchAutomation, getLaunchAutomation, listLaunchAutomations, prepareLaunchAutomation, updateLaunchAutomation, validateLaunchAutomation } from "../lib/launch-automation-store.ts";
import { launchFixture } from "./launch-config.fixture.ts";

const now = new Date("2030-01-01T00:00:00Z");
function fixture(): AutomationPayload {
  const first = launchFixture(), second = launchFixture();
  second.contract.name = "Second collection";
  second.contract.maxSupply = "2000";
  second.contract.mintPriceWei = "20000000000000000";
  second.contract.prizeBps = "7000";
  second.contract.affiliateRatesBps = ["500", "0", "100"];
  second.operations.enrollmentWindowSeconds = "7200";
  return {
    name: "Sepolia launch sequence", chainId: "11155111", startAt: "2030-01-02T00:00:00Z", intervalSeconds: "3600", failurePolicy: "pause",
    steps: [
      { id: randomUUID(), label: "First collection", payload: first, deadline: { mode: "duration", at: null } },
      { id: randomUUID(), label: "Second collection", payload: second, deadline: { mode: "fixed", at: "2030-02-01T00:00:00Z" } },
    ],
  };
}

const connectionString = process.env.DATABASE_URL;
const enabled = process.env.TEST_LAUNCH_DATABASE === "1";
test("automation plans persist independent collection terms and immutable reviewed revisions in PostgreSQL", { skip: !enabled ? "Set TEST_LAUNCH_DATABASE=1 and a local DATABASE_URL to run isolated PostgreSQL regressions." : false }, async t => {
  assert.ok(connectionString, "DATABASE_URL is required for PostgreSQL regressions.");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname), "Launch database regressions run only against local PostgreSQL.");
  const schema = `manekineko_automation_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString, application_name: "manekineko-automation-regression" });
  let pool: pg.Pool | undefined;
  let connected = false, created = false;
  try {
    await admin.connect(); connected = true;
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    pool = new pg.Pool({ connectionString, max: 8, options: `-c search_path=${schema},public`, application_name: "manekineko-automation-regression" });
    const db = pool;
    for (const name of ["009_launch_auth.sql", "012_launch_automations.sql", "027_sepolia_mock_seasons.sql"]) await db.query(await readFile(new URL(`../../../database/migrations/${name}`, import.meta.url), "utf8"));
    const actor = { userId: randomUUID() }, secondActor = { userId: randomUUID() };
    const passwordHash = `scrypt$131072$8$1$${"A".repeat(22)}$${"A".repeat(86)}`;
    await db.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,'operator',$3),($2,'reviewer',$3)", [actor.userId, secondActor.userId, passwordHash]);
    const plan = fixture(), incomplete = structuredClone(plan);
    incomplete.steps[0].payload.contract.initialOwner = "";
    const draft = await createLaunchAutomation(db, actor, { plan: incomplete });

    await t.test("drafts persist per-collection settings, dates and order without shared mutable defaults", async () => {
      const saved = await getLaunchAutomation(db, draft.id);
      assert.deepEqual(saved.plan, incomplete);
      assert.equal(saved.plan.steps[0].payload.contract.maxSupply, "1000");
      assert.equal(saved.plan.steps[1].payload.contract.maxSupply, "2000");
      assert.deepEqual(saved.plan.steps[1].payload.contract.affiliateRatesBps, ["500", "0", "100"]);
      assert.equal(saved.plan.steps[1].deadline.at, "2030-02-01T00:00:00Z");
      assert.equal(saved.status, "draft"); assert.equal(saved.revision, 1);
      const page = await listLaunchAutomations(db);
      assert.equal(page.automations.length, 1); assert.equal(page.automations[0].collectionCount, 2); assert.equal(page.nextCursor, null);
      assert.equal("plan" in page.automations[0], false, "Listing must not serialize every plan's collection payloads.");
      await assert.rejects(() => exportLaunchAutomation(db, draft.id), error => error instanceof AutomationError && error.status === 409);
      const validation = await validateLaunchAutomation(db, draft.id, 1, now);
      assert.equal(validation.valid, false); assert.ok(validation.issues.length);
      await assert.rejects(() => prepareLaunchAutomation(db, actor, draft.id, 1, now), error => error instanceof AutomationError && error.status === 422);
      assert.equal((await getLaunchAutomation(db, draft.id)).revision, 1);
    });

    await t.test("reordering all collection settings is one atomic revision with a complete audit snapshot", async () => {
      const reversed = structuredClone(plan); reversed.steps.reverse();
      const updated = await updateLaunchAutomation(db, actor, draft.id, { plan: reversed, revision: 1 });
      assert.equal(updated.revision, 2); assert.equal(updated.plan.steps[0].id, plan.steps[1].id);
      const events = (await db.query("SELECT revision,event,plan FROM manekineko_launch_automation_events WHERE automation_id=$1 ORDER BY revision", [draft.id])).rows;
      assert.deepEqual(events.map(event => event.event), ["created", "updated"]);
      assert.deepEqual(events[0].plan, incomplete); assert.deepEqual(events[1].plan, reversed);
      await assert.rejects(() => validateLaunchAutomation(db, draft.id, 1, now), error => error instanceof AutomationError && error.code === "revision_conflict");
    });

    await t.test("concurrent saves admit only one update of the same reviewed revision", async () => {
      const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => updateLaunchAutomation(db, actor, draft.id, { plan: { ...plan, name: `Concurrent plan ${index}` }, revision: 2 })));
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      for (const result of results) if (result.status === "rejected") assert.equal((result.reason as AutomationError).status, 409);
      assert.equal((await getLaunchAutomation(db, draft.id)).revision, 3);
    });

    await t.test("preparation records one normalized immutable artifact and never enables execution", async () => {
      assert.equal((await validateLaunchAutomation(db, draft.id, 3, now)).valid, true);
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => prepareLaunchAutomation(db, secondActor, draft.id, 3, now)));
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      for (const result of results) if (result.status === "rejected") assert.equal((result.reason as AutomationError).status, 409);
      const prepared = await getLaunchAutomation(db, draft.id);
      assert.equal(prepared.revision, 4); assert.equal(prepared.status, "prepared"); assert.equal(prepared.preparedBy, secondActor.userId);
      assert.equal("enabled" in prepared, false);
      assert.equal("enabled" in prepared.plan, false);
      const exported = await exportLaunchAutomation(db, draft.id);
      const { contentHash, ...artifact } = exported.artifact;
      assert.equal(contentHash, automationArtifactHash(artifact)); assert.equal(contentHash, prepared.contentHash);
      assert.equal(artifact.kind, "launch-automation"); assert.equal(artifact.steps.length, 2);
      assert.equal(artifact.steps[0].payload.contract.prizeBps, "6000"); assert.equal(artifact.steps[1].payload.contract.prizeBps, "7000");
      assert.ok(artifact.steps.every(step => !!step.payload.contract.vrfCoordinator));
      const events = (await db.query("SELECT revision,event,actor_id FROM manekineko_launch_automation_events WHERE automation_id=$1 ORDER BY revision", [draft.id])).rows;
      assert.deepEqual(events.map(event => event.event), ["created", "updated", "updated", "prepared"]);
      assert.equal(events[3].actor_id, secondActor.userId);
    });

    await t.test("service and SQL preserve prepared settings and audit history", async () => {
      await assert.rejects(() => updateLaunchAutomation(db, actor, draft.id, { plan, revision: 4 }), error => error instanceof AutomationError && error.status === 409);
      await assert.rejects(() => db.query("UPDATE manekineko_launch_automations SET plan=jsonb_set(plan,'{name}','\"Changed\"'),revision=revision+1 WHERE id=$1", [draft.id]), /immutable/);
      await assert.rejects(() => db.query("DELETE FROM manekineko_launch_automations WHERE id=$1", [draft.id]), /retained/);
      await assert.rejects(() => db.query("UPDATE manekineko_launch_automation_events SET event='updated' WHERE automation_id=$1", [draft.id]), /immutable/);
      await assert.rejects(() => db.query("DELETE FROM manekineko_launch_automation_events WHERE automation_id=$1", [draft.id]), /immutable/);
      const copy = await createLaunchAutomation(db, actor, { plan: (await getLaunchAutomation(db, draft.id)).plan });
      assert.notEqual(copy.id, draft.id); assert.equal(copy.status, "draft"); assert.equal(copy.contentHash, null); assert.equal(copy.revision, 1);
    });

    await t.test("an edit racing preparation cannot silently replace reviewed collection settings", async () => {
      const original = await createLaunchAutomation(db, actor, { plan });
      const changed = structuredClone(plan); changed.steps[1].payload.contract.maxSupply = "3000";
      const results = await Promise.allSettled([
        prepareLaunchAutomation(db, secondActor, original.id, 1, now),
        updateLaunchAutomation(db, actor, original.id, { plan: changed, revision: 1 }),
      ]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      const latest = await getLaunchAutomation(db, original.id);
      assert.equal(latest.revision, 2);
      assert.equal(latest.plan.steps[1].payload.contract.maxSupply, latest.status === "prepared" ? "2000" : "3000");
    });

    await t.test("disabled and missing accounts cannot create, update or prepare plans", async () => {
      const current = await createLaunchAutomation(db, actor, { plan });
      await db.query("UPDATE manekineko_launch_users SET disabled_at=now() WHERE id=$1", [secondActor.userId]);
      const inactive = (error: unknown) => error instanceof AutomationError && error.code === "inactive_actor" && error.status === 403;
      await assert.rejects(() => createLaunchAutomation(db, secondActor, { plan }), inactive);
      await assert.rejects(() => createLaunchAutomation(db, { userId: randomUUID() }, { plan }), inactive);
      await assert.rejects(() => updateLaunchAutomation(db, secondActor, current.id, { plan, revision: 1 }), inactive);
      await assert.rejects(() => prepareLaunchAutomation(db, secondActor, current.id, 1, now), inactive);
      assert.equal((await getLaunchAutomation(db, current.id)).revision, 1);
      assert.equal((await db.query("SELECT count(*)::integer AS count FROM manekineko_launch_automation_events WHERE automation_id=$1", [current.id])).rows[0].count, 1);
      await db.query("UPDATE manekineko_launch_users SET disabled_at=NULL WHERE id=$1", [secondActor.userId]);
    });

    await t.test("a concurrent account suspension is rechecked inside the automation write", async () => {
      const disabler = await db.connect(), writer = await db.connect();
      let attempt: Promise<unknown> | undefined;
      try {
        await disabler.query("BEGIN");
        await disabler.query("UPDATE manekineko_launch_users SET disabled_at=now() WHERE id=$1", [secondActor.userId]);
        const pid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        attempt = createLaunchAutomation(writer, secondActor, { plan: { ...plan, name: "Suspension race" } }).catch(error => error);
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
        assert.ok(result instanceof AutomationError && result.code === "inactive_actor" && result.status === 403);
        assert.equal((await db.query("SELECT count(*)::integer AS count FROM manekineko_launch_automations WHERE plan->>'name'='Suspension race'")).rows[0].count, 0);
      } finally {
        await disabler.query("ROLLBACK");
        await attempt;
        writer.release(); disabler.release();
      }
    });

    await t.test("bounded summary pages reach every plan without returning collection payloads", async () => {
      for (let index = 0; index < 101; index++) await createLaunchAutomation(db, actor, { plan: { ...plan, name: `History plan ${index}` } });
      const first = await listLaunchAutomations(db);
      assert.equal(first.automations.length, 100); assert.ok(first.nextCursor);
      const second = await listLaunchAutomations(db, first.nextCursor);
      assert.ok(second.automations.length > 0); assert.equal(second.nextCursor, null);
      const ids = [...first.automations, ...second.automations].map(item => item.id);
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(ids.length, (await db.query("SELECT count(*)::integer AS count FROM manekineko_launch_automations")).rows[0].count);
      assert.ok(first.automations.every(item => !("plan" in item)));
      await assert.rejects(() => listLaunchAutomations(db, "malformed"), error => error instanceof AutomationError && error.code === "invalid_cursor");
      const invalidDateCursor = Buffer.from(JSON.stringify({ updatedAt: "2030-02-30T00:00:00.000000Z", id: draft.id, seasonOrder: 1 })).toString("base64url");
      await assert.rejects(() => listLaunchAutomations(db, invalidDateCursor), error => error instanceof AutomationError && error.code === "invalid_cursor");
      await assert.rejects(() => getLaunchAutomation(db, randomUUID()), error => error instanceof AutomationError && error.status === 404);
    });
  } finally {
    await pool?.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    if (connected) await admin.end();
  }
});
