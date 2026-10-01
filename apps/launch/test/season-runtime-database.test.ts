import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { createLaunchAutomation, exportLaunchAutomation, prepareLaunchAutomation, getLaunchAutomation, listLaunchAutomations, updateLaunchAutomation } from "../lib/launch-automation-store.ts";
import { getRuntimeWorkerProfile, getSeasonRuntime, requestSeasonControl, requestSeasonStart, saveRuntimeProfile } from "../lib/season-runtime-store.ts";
import { runtimeArtifact } from "./season-runtime.fixture.ts";

const connection = process.env.SEASON_RUNTIME_TEST_DATABASE_URL;
test("runtime persistence, concurrency, immutable binding and network guards on an isolated database", { skip: !connection }, async () => {
  const url = new URL(connection!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Runtime integration tests require an explicitly isolated local PostgreSQL server");
  const name = `tincta_runtime_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url.href });
  const oldChain = process.env.MANEKINEKO_CHAIN_ID, oldKey = process.env.SEASON_RUNNER_MASTER_KEY;
  let pool: pg.Pool | undefined, created = false;
  try {
    await admin.connect(); await admin.query(`CREATE DATABASE ${name}`); created = true;
    url.pathname = `/${name}`; pool = new pg.Pool({ connectionString: url.href, max: 4 });
    const migrations = new URL("../../../database/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort()) await pool.query(await readFile(new URL(file, migrations), "utf8"));
    await pool.query("ALTER TABLE manekineko_launch_automations ADD CONSTRAINT runtime_test_staging_only CHECK (plan->>'chainId'='11155111' OR (plan->>'chainId'='1' AND status='draft'))");
    process.env.MANEKINEKO_CHAIN_ID = "11155111"; process.env.SEASON_RUNNER_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
    const actor = { userId: randomUUID() };
    await pool.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,'runtime_operator',$2)", [actor.userId, `scrypt$131072$8$1$${"A".repeat(22)}$${"A".repeat(86)}`]);
    const { schemaVersion: _schema, kind: _kind, contractVersion: _version, ...plan } = runtimeArtifact();
    const draft = await createLaunchAutomation(pool, actor, { plan });
    const prepared = await prepareLaunchAutomation(pool, actor, draft.id, draft.revision, new Date("2030-01-01"));
    const credentials = { apiKey: "fictional-key", apiKeySecret: "fictional-secret", accessToken: "fictional-token", accessTokenSecret: "fictional-token-secret" };
    const config = { revision: 0, enabled: true, handle: "tincta_test", expectedAccountId: "123", publicBaseUrl: "https://tincta.xyz", credentials };
    const profile = await saveRuntimeProfile(pool, actor, "11155111", config);
    assert.equal(profile.revision, 1);
    assert.deepEqual((await getRuntimeWorkerProfile(pool, "11155111")).credentials, credentials);
    assert(!JSON.stringify(profile).includes("fictional"));
    const encrypted = (await pool.query("SELECT encrypted_credentials FROM manekineko_season_runtime_profiles")).rows[0].encrypted_credentials;
    assert(!encrypted.includes("fictional"));
    await assert.rejects(() => saveRuntimeProfile(pool!, actor, "1", config), /only supports Ethereum Sepolia/);
    await assert.rejects(() => requestSeasonStart(pool!, actor, prepared.id, { revision: prepared.revision, preparedHash: "b".repeat(64), profileRevision: 1 }), /exact saved/);
    const request = { revision: prepared.revision, preparedHash: prepared.contentHash, profileRevision: 1 };
    const [first, duplicate] = await Promise.all([requestSeasonStart(pool, actor, prepared.id, request), requestSeasonStart(pool, actor, prepared.id, request)]);
    assert.equal(first.id, duplicate.id, "Concurrent start is idempotent");
    await assert.rejects(() => saveRuntimeProfile(pool!, actor, "11155111", { ...config, revision: 1 }), /Pause/);
    await assert.rejects(() => pool!.query("UPDATE manekineko_season_runtime_runs SET prepared_hash=$2 WHERE id=$1", [first.id, "b".repeat(64)]), /binding is immutable/);
    await pool.query("INSERT INTO manekineko_season_runtime_public(run_id,chain_id,season_id,payload) VALUES($1,'11155111',$2,$3)", [first.id, plan.seasonId, { version: 1, status: "running" }]);
    const paused = await requestSeasonControl(pool, actor, prepared.id, { action: "pause", revision: first.revision });
    assert.equal(paused.status, "paused");
    assert.equal((await pool.query("SELECT payload->>'status' AS status FROM manekineko_season_runtime_public")).rows[0].status, "paused");
    const rotated = await saveRuntimeProfile(pool, actor, "11155111", { ...config, revision: 1 });
    assert.equal(rotated.revision, 2);
    const resumed = await requestSeasonControl(pool, actor, prepared.id, { action: "resume", revision: paused.revision, profileRevision: 2 });
    assert.equal(resumed.profileRevision, 2); assert.equal(resumed.status, "queued");
    await assert.rejects(() => requestSeasonControl(pool!, actor, prepared.id, { action: "pause", revision: paused.revision }), /another session/);
    await pool.query("INSERT INTO manekineko_season_runtime_actions(id,run_id,action_key,kind,status,result) VALUES($1,$2,'social:upcoming','social','confirmed',$3)", [randomUUID(), first.id, { postId: "123456" }]);
    await requestSeasonControl(pool, actor, prepared.id, { action: "pause", revision: resumed.revision });
    await assert.rejects(() => saveRuntimeProfile(pool!, actor, "11155111", { ...config, revision: 2, expectedAccountId: "456" }), /keeps its announced X account/);
    const snapshot = await getSeasonRuntime(pool, prepared.id);
    assert.equal(snapshot.actions[0].postId, "123456"); assert(snapshot.events.length >= 4);
    assert(!JSON.stringify(snapshot).includes("fictional")); assert(!("state" in snapshot.run!));
    await pool.query("UPDATE manekineko_season_runtime_runs SET status='completed',desired_state='running',revision=revision+1 WHERE id=$1", [first.id]);
    await pool.query("UPDATE manekineko_season_runtime_public SET payload=jsonb_set(payload,'{status}', '\"completed\"'::jsonb) WHERE run_id=$1", [first.id]);
    const completed = (await getSeasonRuntime(pool, prepared.id)).run!;
    await assert.rejects(() => saveRuntimeProfile(pool!, actor, "11155111", { ...config, revision: 2 }), /Pause/);
    const monitoringPaused = await requestSeasonControl(pool, actor, prepared.id, { action: "pause", revision: completed.revision });
    assert.equal(monitoringPaused.status, "completed"); assert.equal(monitoringPaused.desiredState, "paused");
    assert.equal((await pool.query("SELECT payload->>'status' AS status FROM manekineko_season_runtime_public")).rows[0].status, "completed");
    await saveRuntimeProfile(pool, actor, "11155111", { ...config, revision: 2 });
    const monitoringResumed = await requestSeasonControl(pool, actor, prepared.id, { action: "resume", revision: monitoringPaused.revision, profileRevision: 3 });
    assert.equal(monitoringResumed.status, "completed"); assert.equal(monitoringResumed.desiredState, "running");
    // V10 goes through the same persisted review/start path with its explicit identity,
    // while the preexisting V9 artifact remains byte-for-byte stable.
    const historicalExport = await exportLaunchAutomation(pool, prepared.id);
    const permanentPlan = structuredClone(plan);
    for (const step of permanentPlan.steps) { step.id = randomUUID(); step.payload.contract.algorithmVersion = "unique-rank-v6"; }
    const permanentDraft = await createLaunchAutomation(pool, actor, { plan: permanentPlan });
    const permanentPrepared = await prepareLaunchAutomation(pool, actor, permanentDraft.id, 1, new Date("2030-01-01"));
    const permanentExport = await exportLaunchAutomation(pool, permanentDraft.id);
    assert.equal(permanentExport.artifact.contractVersion, "affiliate-v10");
    assert(permanentExport.artifact.steps.every(step => step.payload.contract.algorithmVersion === "unique-rank-v6"));
    const permanentRun = await requestSeasonStart(pool, actor, permanentPrepared.id, { revision: permanentPrepared.revision, preparedHash: permanentPrepared.contentHash, profileRevision: 3 });
    assert.equal(permanentRun.preparedHash, permanentPrepared.contentHash);
    await requestSeasonControl(pool, actor, permanentPrepared.id, { action: "pause", revision: permanentRun.revision });
    assert.deepEqual(await exportLaunchAutomation(pool, prepared.id), historicalExport);
    const oldPaused = await requestSeasonControl(pool, actor, prepared.id, { action: "pause", revision: monitoringResumed.revision });
    await assert.rejects(() => requestSeasonControl(pool!, actor, prepared.id, { action: "resume", revision: oldPaused.revision, profileRevision: 3 }), /superseded history/);
    await assert.rejects(() => pool!.query("UPDATE manekineko_launch_automations SET prepared_artifact=jsonb_set(prepared_artifact,'{contractVersion}','\"affiliate-v9\"') WHERE id=$1", [permanentPrepared.id]), /immutable/);
    // One saved season, three immutable execution members, with old exports preserved.
    const members: Awaited<ReturnType<typeof createLaunchAutomation>>[] = [];
    for (let index=0;index<3;index++) {
      const member = structuredClone(permanentPlan);
      member.seasonId = `0x${"56".repeat(32)}`; member.name = "Grouped review";
      member.steps = [member.steps[0]]; member.steps[0].id=randomUUID();
      Object.assign(member.steps[0].payload.contract,{seasonId:member.seasonId,seasonName:member.name,name:`Review collection ${index+1}`});
      members.push(await createLaunchAutomation(pool,actor,{plan:member}));
    }
    const group={seasonId:members[0].plan.seasonId,seasonName:members[0].plan.name,stages:members.map(m=>({automationId:m.id,collectionId:m.plan.steps[0].id,name:m.plan.steps[0].payload.contract.name,color:m.plan.steps[0].payload.contract.collectionColor}))};
    const invalidGroup=structuredClone(group);invalidGroup.stages[2]=invalidGroup.stages[0];
    await assert.rejects(()=>pool!.query("INSERT INTO manekineko_season_review_members(automation_id,review_group) VALUES($1,$2)",[members[0].id,invalidGroup]),/verified three-collection/);
    for(const member of members) await pool.query("INSERT INTO manekineko_season_review_members(automation_id,review_group) VALUES($1,$2)",[member.id,group]);
    const grouped=(await listLaunchAutomations(pool)).automations.filter(a=>members.some(m=>m.id===a.id));
    assert.equal(grouped.length,1);assert.equal(grouped[0].collectionCount,3);assert.deepEqual(grouped[0].reviewGroup,group);
    assert.deepEqual((await getLaunchAutomation(pool,members[2].id)).reviewGroup,group);
    const changed=structuredClone(members[0].plan);changed.steps[0].payload.contract.name="Changed";
    await assert.rejects(()=>updateLaunchAutomation(pool!,actor,members[0].id,{plan:changed,revision:1}),/identity is immutable/);
    await assert.rejects(()=>pool!.query("DELETE FROM manekineko_season_review_members WHERE automation_id=$1",[members[0].id]),/immutable/);
    await assert.rejects(()=>requestSeasonStart(pool!,actor,members[0].id,{revision:1,profileRevision:3,preparedHash:"a".repeat(64)}),/saved review script/);
    await pool.query("INSERT INTO manekineko_season_review_superseded(automation_id,replacement_id) VALUES($1,$2)",[prepared.id,members[0].id]);
    assert.equal((await getLaunchAutomation(pool,prepared.id)).supersededBy,members[0].id);
    assert.deepEqual(await exportLaunchAutomation(pool,prepared.id),historicalExport);
    await assert.rejects(()=>requestSeasonControl(pool!,actor,prepared.id,{action:"resume",revision:oldPaused.revision,profileRevision:3}),/replaced/);
    assert.equal((await listLaunchAutomations(pool)).automations.find(a=>a.id===prepared.id)?.currentModel,false);
    await pool.query("UPDATE manekineko_launch_users SET disabled_at=now() WHERE id=$1", [actor.userId]);
    await assert.rejects(() => saveRuntimeProfile(pool!, actor, "11155111", { ...config, revision: 2 }), /inactive/);
  } finally {
    if (oldChain === undefined) delete process.env.MANEKINEKO_CHAIN_ID; else process.env.MANEKINEKO_CHAIN_ID = oldChain;
    if (oldKey === undefined) delete process.env.SEASON_RUNNER_MASTER_KEY; else process.env.SEASON_RUNNER_MASTER_KEY = oldKey;
    await pool?.end(); if (created) await admin.query(`DROP DATABASE ${name}`); await admin.end();
  }
});
