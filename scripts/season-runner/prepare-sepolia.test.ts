import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolClient } from "pg";
import { runtimePlan } from "../../apps/launch/test/season-runtime.fixture.ts";
import { automationArtifactHash } from "../../apps/launch/lib/launch-automation-artifact.ts";
import type { AutomationArtifact, AutomationPlan } from "../../apps/launch/lib/launch-automation.ts";
import type { RuntimeProfile, RuntimeRun } from "../../apps/launch/lib/season-runtime.ts";
import { parsePreparationArguments, preparationEnvironment, preparationBudget, prepareSepoliaRun, runDayArtifact, workerCommandGuidance, type PreparationDependencies, type PreparationEnvironment } from "./prepare-sepolia.ts";
import { reviewPreparationStartAt } from "./review-season-plan.ts";

const owner = "0x3333333333333333333333333333333333333333";
const now = new Date("2030-01-01T00:00:00Z");
function config(): PreparationEnvironment {
  return { owner, eligibility: { address: "0x4444444444444444444444444444444444444444", codeHash: `0x${"44".repeat(32)}` },
    credits: { address: "0x5555555555555555555555555555555555555555", codeHash: `0x${"55".repeat(32)}` },
    databaseUrl: "postgresql://worker:fictional@example.com/isolated?sslmode=verify-full", launchDatabaseUrl: "postgresql://launch:fictional@example.com/isolated?sslmode=verify-full",
    databaseName: "isolated", rpcUrl: "https://rpc.example.com", privateKey: undefined, maxFeePerGasWei: "5000000000", maxTotalSpendWei: "250000000000000000000", confirmations: 2 };
}
function draft(): AutomationPlan {
  const saved = runtimePlan(); saved.status = "draft"; saved.revision = 1; saved.contentHash = null; saved.preparedAt = null; saved.preparedBy = null;
  saved.updatedBy = saved.createdBy = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; saved.plan.startAt = null;
  for (const step of saved.plan.steps) { step.payload.contract.algorithmVersion = "unique-rank-v6"; step.payload.contract.initialOwner = owner; }
  return saved;
}
function prepared(): { saved: AutomationPlan; artifact: AutomationArtifact } {
  const saved = draft(), artifact = runDayArtifact(saved, config(), now);
  const { kind: _kind, schemaVersion: _schema, contractVersion: _version, ...plan } = artifact;
  saved.plan = plan; saved.status = "prepared"; saved.revision = 3; saved.contentHash = automationArtifactHash(artifact);
  return { saved, artifact };
}
const profile: RuntimeProfile = { chainId: "11155111", revision: 1, enabled: true, handle: "tincta_test", expectedAccountId: "123", publicBaseUrl: "https://tincta.xyz", credentialsConfigured: true, updatedAt: now.toISOString() };
const credentials = { apiKey: "fictional-key", apiKeySecret: "fictional-secret", accessToken: "fictional-token", accessTokenSecret: "fictional-token-secret" };
test("30-minute review opening preserves 15-minute enrollment and the original mint duration",()=>{
  const saved=draft();saved.plan.steps=saved.plan.steps.slice(0,1);saved.plan.steps[0].payload.operations.enrollmentWindowSeconds="900";
  const duration=saved.plan.steps[0].payload.contract.mintDurationSeconds;
  const artifact=runDayArtifact(saved,config(),now,reviewPreparationStartAt({mintOpeningDelaySeconds:1800},saved.status,now));
  assert.equal(artifact.startAt,"2030-01-01T00:30:00Z");
  assert.equal(artifact.steps[0].payload.operations.enrollmentWindowSeconds,"900");
  assert.equal(artifact.steps[0].payload.contract.mintDurationSeconds,duration);
  assert.equal(saved.plan.startAt,null);
});
function fixture(existing = false) {
  const preparedValue = prepared(); let saved = existing ? preparedValue.saved : draft();
  const run: RuntimeRun = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", automationId: saved.id, automationRevision: preparedValue.saved.revision, preparedHash: preparedValue.saved.contentHash!, chainId: "11155111", profileRevision: 1,
    status: "queued", desiredState: "running", revision: 1, lastError: null, heartbeatAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  const events: string[] = [];
  const client = { query: async (sql: string) => { events.push(sql.startsWith("SELECT current_database") ? "identity" : sql.includes("FOR UPDATE") ? "lock" : sql); return { rows: [{ database: "isolated", role: "manekineko_staging_launch" }] }; }, release: () => events.push("release") } as unknown as PoolClient;
  const pool = { connect: async () => client } as Pick<Pool, "connect">;
  const dependencies: Partial<PreparationDependencies> = {
    now: () => now,
    getLaunchAutomation: async () => saved,
    getSeasonRuntime: async () => ({ profile, run: existing ? run : null, events: [], actions: [], encryptionConfigured: true }),
    getRuntimeWorkerProfile: async () => ({ profile, credentials }),
    verifyXAccount: async () => { events.push("x-read"); return { id: "123", username: "tincta_test", name: "Fictional" }; },
    exportLaunchAutomation: async () => ({ artifact: { ...preparedValue.artifact, contentHash: preparedValue.saved.contentHash! }, filename: "unused.json" }),
    updateLaunchAutomation: async (_db, _actor, _id, input) => { events.push("update"); saved = { ...saved, plan: input.plan as AutomationPlan["plan"], revision: saved.revision + 1 }; return saved; },
    prepareLaunchAutomation: async () => { events.push("prepare"); saved = { ...saved, revision: saved.revision + 1, status: "prepared", contentHash: preparedValue.saved.contentHash }; return saved; },
    requestSeasonStartInTransaction: async (_db, _actor, _id, input) => { events.push("start"); assert.equal(input.revision, saved.revision); assert.equal(input.preparedHash, saved.contentHash); return run; },
  };
  return { pool, dependencies, events, run, args: { automationId: saved.id, envFiles: [], execute: false, help: false }, getSaved: () => saved };
}

test("run-day clock leaves full enrollment plus one hour and preserves every other draft field", () => {
  const saved = draft(), before = structuredClone(saved);
  const artifact = runDayArtifact(saved, config(), now);
  assert.equal(artifact.startAt, "2030-01-01T01:15:00Z");
  assert.deepEqual(saved, before);
  const { schemaVersion: _s, kind: _k, contractVersion: _v, ...plan } = artifact;
  for (const step of plan.steps) { delete step.payload.contract.vrfCoordinator; delete step.payload.contract.keyHash; }
  assert.deepEqual(plan, { ...saved.plan, startAt: artifact.startAt });
});
test("refund preparation budgets three tickets, preserves enrollment lead and cannot prepare later collections", () => {
  const saved = draft(); saved.plan.steps = saved.plan.steps.slice(0, 1);
  Object.assign(saved.plan.steps[0].payload.contract, { sepoliaRehearsal: "refund-3-30m", mintDurationSeconds: "1800" });
  const artifact = runDayArtifact(saved, config(), now), budget = preparationBudget(artifact);
  assert.equal(budget.mintWei, 3n * BigInt(artifact.steps[0].payload.contract.mintPriceWei));
  assert.equal(artifact.startAt, "2030-01-01T01:15:00Z");
  saved.plan.steps.push(draft().plan.steps[1]);
  assert.throws(() => runDayArtifact(saved, config(), now), /refund_scenario_requires_one_collection/);
});
test("preparation rejects wrong network/version/registry/owner, mismatched sponsorship, unsafe cadence and setup-sized cap", () => {
  for (const mutate of [
    (s: AutomationPlan) => { s.plan.chainId = "1"; },
    (s: AutomationPlan) => { s.plan.steps[0].payload.contract.algorithmVersion = "unique-rank-v5"; },
    (s: AutomationPlan) => { s.plan.steps[0].payload.contract.initialOwner = "0x1111111111111111111111111111111111111111"; },
    (s: AutomationPlan) => { for (const step of s.plan.steps) step.payload.operations.affiliateEligibilityAddress = "0x9999999999999999999999999999999999999999"; },
    (s: AutomationPlan) => { s.plan.steps[1].payload.operations.winnerCreditSponsorshipWei = "30000000000000000"; },
    (s: AutomationPlan) => { for (const step of s.plan.steps) step.payload.operations.enrollmentWindowSeconds = "1800"; },
  ]) { const saved = draft(); mutate(saved); assert.throws(() => runDayArtifact(saved, config(), now)); }
  assert.throws(() => runDayArtifact(draft(), { ...config(), maxTotalSpendWei: "100000000000000000" }, now), /spending_cap_cannot_cover/);
  assert.throws(() => runDayArtifact(draft(), config(), now, "2030-01-01T00:16:00Z"), /deployment_and_enrollment_lead/);
});
test("read-only preparation authenticates X using the read adapter and performs no mutations", async () => {
  const f = fixture(); const result = await prepareSepoliaRun(f.pool, f.args, config(), f.dependencies);
  assert.equal(result.mode, "read_only"); assert.deepEqual(f.events, ["BEGIN READ ONLY", "identity", "x-read", "ROLLBACK", "release"]);
  assert.equal(f.getSaved().status, "draft");
});
test("execute atomically updates, freezes and queues through canonical helpers", async () => {
  const f = fixture(); const result = await prepareSepoliaRun(f.pool, { ...f.args, execute: true }, config(), f.dependencies);
  assert.equal(result.mode, "queued_only"); assert.equal("runId" in result && result.runId, f.run.id);
  assert.deepEqual(f.events, ["BEGIN", "identity", "lock", "x-read", "update", "prepare", "start", "COMMIT", "release"]);
});
test("a queue failure rolls the entire preparation transaction back", async () => {
  const f = fixture(); f.dependencies.requestSeasonStartInTransaction = async () => { f.events.push("start"); throw new Error("queue_failed"); };
  await assert.rejects(prepareSepoliaRun(f.pool, { ...f.args, execute: true }, config(), f.dependencies), /queue_failed/);
  assert.deepEqual(f.events.slice(-3), ["start", "ROLLBACK", "release"]); assert(!f.events.includes("COMMIT"));
});
test("missing or incorrect X profile stops before changing the saved draft", async () => {
  for (const scenario of ["missing", "wrong-account", "wrong-handle"]) {
    const f = fixture();
    if (scenario === "missing") f.dependencies.getSeasonRuntime = async () => ({ profile: null, run: null, events: [], actions: [], encryptionConfigured: true });
    if (scenario === "wrong-account") f.dependencies.verifyXAccount = async () => { throw new Error("wrong_account"); };
    if (scenario === "wrong-handle") f.dependencies.verifyXAccount = async () => ({ id: "123", username: "other_account", name: "Fictional" });
    await assert.rejects(prepareSepoliaRun(f.pool, { ...f.args, execute: true }, config(), f.dependencies));
    assert(!f.events.some(event => ["update", "prepare", "start", "COMMIT"].includes(event)));
  }
});
test("repeated execution reuses the same old run and opening without X calls, edits or automatic resume", async () => {
  const f = fixture(true); f.run.status = "paused"; f.run.desiredState = "paused";
  f.dependencies.now = () => new Date("2035-01-01T00:00:00Z");
  const result = await prepareSepoliaRun(f.pool, { ...f.args, execute: true }, config(), f.dependencies);
  assert.equal(result.mode, "existing_run"); assert.equal("runId" in result && result.runId, f.run.id); assert.equal(result.status, "paused");
  assert.equal(result.startAt, "2030-01-01T01:15:00Z"); assert(!f.events.some(event => ["x-read", "update", "prepare", "start"].includes(event)));
  await assert.rejects(prepareSepoliaRun(f.pool, { ...f.args, execute: true, startAt: "2035-01-02T00:00:00Z" }, config(), f.dependencies), /existing_run_cannot_be_rescheduled/);
});
test("prepared season without a run is queued unchanged and rejects expired or replaced opening", async () => {
  const f = fixture(), p = prepared(); f.dependencies.getLaunchAutomation = async () => p.saved;
  const result = await prepareSepoliaRun(f.pool, { ...f.args, execute: true }, config(), { ...f.dependencies, requestSeasonStartInTransaction: async () => { f.events.push("start"); return f.run; } });
  assert.equal(result.mode, "queued_only"); assert(!f.events.some(event => ["update", "prepare"].includes(event)));
  await assert.rejects(prepareSepoliaRun(f.pool, { ...f.args, startAt: "2030-01-02T00:00:00Z" }, config(), f.dependencies), /prepared_season_cannot_be_rescheduled/);
  f.dependencies.now = () => new Date("2030-01-02T00:00:00Z");
  await assert.rejects(prepareSepoliaRun(f.pool, f.args, config(), f.dependencies), /already past/);
});
test("CLI excludes worker execution flags and shell guidance quotes absolute private paths", () => {
  const id = draft().id;
  assert.throws(() => parsePreparationArguments(["--automation-id", id, "--sepolia-rehearsal"]), /invalid_command_option/);
  assert.throws(() => parsePreparationArguments(["--automation-id", id, "--start-at", "2030-02-31T00:00:00Z"]), /whole_second_utc/);
  assert.deepEqual(parsePreparationArguments(["--automation-id", id, "--env-file", "first.env", "--env-file", "second.env"]).envFiles, ["first.env", "second.env"]);
  const commands = workerCommandGuidance("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", ["private's $(whoami).env"], "/tmp/review workspace");
  assert.match(commands.logFile, /^\/tmp\/review workspace\/\.private\/season-runner\//);
  assert(commands.preflightCommand.includes("'\"'\"'")); assert(!commands.preflightCommand.includes("--execute"));
  assert(commands.runCommand.includes("--execute --sepolia-rehearsal --recycle-sepolia-funds"));
});
test("environment refuses mismatched databases and requires the restricted Launch role", () => {
  const env = { MANEKINEKO_CHAIN_ID: "11155111", SEASON_RUNNER_DATABASE_URL_11155111: "postgresql://worker:fictional@example.com/isolated?sslmode=verify-full", SEASON_RUNNER_RPC_URL_11155111: "https://rpc.example.com", SEASON_RUNNER_MAX_FEE_PER_GAS_WEI_11155111: "5000000000", SEASON_RUNNER_MAX_TOTAL_SPEND_WEI_11155111: "250000000000000000000", DEPLOYER_PRIVATE_KEY: `0x${"12".repeat(32)}`, LAUNCH_DATABASE_URL: "postgresql://manekineko_staging_launch:fictional@example.com/isolated?sslmode=verify-full", STAGING_DATABASE_EXPECTED_HOST: "example.com", STAGING_DATABASE_EXPECTED_NAME: "isolated", AFFILIATE_ELIGIBILITY_V5_ADDRESS_11155111: config().eligibility.address, AFFILIATE_ELIGIBILITY_V5_CODEHASH_11155111: config().eligibility.codeHash, WINNER_CREDITS_V6_ADDRESS_11155111: config().credits.address, WINNER_CREDITS_V6_CODEHASH_11155111: config().credits.codeHash };
  assert.equal(preparationEnvironment(env).databaseName, "isolated");
  assert.throws(() => preparationEnvironment({ ...env, STAGING_DATABASE_EXPECTED_NAME: "other" }), /destination_mismatch/);
  assert.throws(() => preparationEnvironment({ ...env, LAUNCH_DATABASE_URL: env.LAUNCH_DATABASE_URL.replace("manekineko_staging_launch", "admin") }), /restricted_staging_launch_role/);
  assert.throws(() => preparationEnvironment({ ...env, MANEKINEKO_CHAIN_ID: "1" }), /chain_must_match/);
});
