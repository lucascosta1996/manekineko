import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { runtimeArtifact } from "../../apps/launch/test/season-runtime.fixture.ts";
import { automationArtifactHash } from "../../apps/launch/lib/launch-automation-artifact.ts";
import { encryptRuntimeSecret } from "../../apps/launch/lib/season-runtime-crypto.ts";
import { AIRY_RECOVERY as A, assertAppliedRecovery, createAiryRecoveryPlan, recoveryDigest, recoveryPayload } from "./airy-recovery-plan.ts";
import { applyRecoveryPlan, recoveryArguments, validateRecoveryPlan } from "./recover-airy-garden.ts";
import type { RunStore } from "./store.ts";
import type { SeasonState } from "./runner.ts";
import type { ChainSnapshot, ChainDeployment } from "./chain.ts";

function fixture() {
  const artifact = runtimeArtifact(), now = Date.parse("2035-01-01T12:00:00Z") / 1000, hash = `0x${"ab".repeat(32)}`, factory = `0x${"66".repeat(20)}`;
  artifact.contractVersion = "affiliate-v10";
  artifact.steps.forEach((step, i) => { step.id = i ? A.nextId : A.firstId; step.payload.contract.algorithmVersion = "unique-rank-v6"; step.payload.contract.mintDurationSeconds = "2592000"; });
  const snapshot = { chainId: A.chainId, round: A.round, soldOut: true, revealed: true, readyForNextRound: true, refundsAvailable: false, totalMinted: "1000", maxSupply: "1000", soldOutAt: String(now - 7200), blockNumber: 100, blockHash: hash } as ChainSnapshot;
  const state: SeasonState = { binding: "original-bound-configuration", announcedAt: "2035-01-01T01:00:00Z", firstThreadComplete: true, factory: { factory, factoryCodeHash: hash },
    journal: { version: 1, chainId: A.chainId, from: artifact.steps[0].payload.contract.initialOwner, transactions: [], collections: {}, maxFeePerGasWei: "100", maxTotalSpendWei: "100000000000000000000" },
    collections: { [A.firstId]: { payload: structuredClone(artifact.steps[0].payload), enrollmentAt: "2035-01-01T01:45:00Z", announcementAt: "2035-01-01T01:00:00Z", deployment: { factory, round: A.round } as ChainDeployment, snapshot } } };
  const actions = [{ action_key: `${A.firstId}:winners-revealed:root`, kind: "x-post", status: "confirmed", result: { postId: "123" } }];
  const row = { id: A.runId, automation_id: A.automationId, automation_revision: 1, chain_id: "11155111", prepared_hash: automationArtifactHash(artifact), status: "paused", desired_state: "paused", profile_revision: 1, revision: 4, lease_expires_at: null, created_at: new Date() } as RunStore["row"];
  const input = { artifact, state, preparedHash: row.prepared_hash, actionsHash: recoveryDigest(actions), profileRevision: 1, runRevision: 4, snapshot, now, startAt: "2035-01-01T14:00:00Z" };
  const plan = createAiryRecoveryPlan(input);
  return { ...input, row, actions, plan };
}

test("recovery is explicitly Sepolia pinned and defaults to read only", () => {
  assert.deepEqual(recoveryArguments(["--env-file", "private.env"]), { envFiles: ["private.env"] });
  for (const args of [["--execute"], ["--chain", "1"], ["--run-id", "another"], ["--start-at", "2035-01-01T14:00:00Z"], ["--plan", "unreviewed.json"], ["--output", "a", "--output", "b"]]) {
    assert.throws(() => recoveryArguments(["--env-file", "private.env", ...args]));
  }
  assert.equal(recoveryArguments(["--env-file", "a", "--env-file", "b", "--execute", "--plan", "p", "--expected-hash", "a".repeat(64)]).execute, true);
});
test("reviewed continuation preserves all original terms, identity, journals and clock history", () => {
  const f = fixture(), original = structuredClone({ artifact: f.artifact, state: f.state });
  const payload = recoveryPayload(f.artifact, f.plan);
  assert.equal(payload.contract.mintDurationSeconds, "86400");
  assert.equal(payload.contract.saleStartAt, String(Date.parse(f.startAt) / 1000));
  assert.equal(f.plan.original.durationSeconds, "2592000");
  const expected = structuredClone(f.artifact.steps[1].payload);
  expected.contract.mintDurationSeconds = "86400"; expected.contract.saleStartAt = payload.contract.saleStartAt;
  expected.operations.factoryMode = "existing"; expected.operations.factoryAddress = f.state.factory!.factory;
  assert.deepEqual(payload, expected); assert.deepEqual({ artifact: f.artifact, state: f.state }, original);
  assert.equal(Date.parse(f.plan.expiresAt) - Date.parse(f.plan.createdAt), 900000);
});
test("recovery rejects failed predecessor, partial supply, changed identity and an already started second collection", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.snapshot.revealed = false; },
    (f: ReturnType<typeof fixture>) => { f.snapshot.readyForNextRound = false; },
    (f: ReturnType<typeof fixture>) => { f.snapshot.refundsAvailable = true; },
    (f: ReturnType<typeof fixture>) => { f.snapshot.totalMinted = "999"; },
    (f: ReturnType<typeof fixture>) => { f.artifact.chainId = "1"; },
    (f: ReturnType<typeof fixture>) => { f.artifact.steps[1].id = A.firstId; },
    (f: ReturnType<typeof fixture>) => { f.state.journal!.collections[A.nextId] = {} as never; },
    (f: ReturnType<typeof fixture>) => { f.state.completed = true; },
    (f: ReturnType<typeof fixture>) => { f.startAt = "2035-01-01T12:14:00Z"; },
    (f: ReturnType<typeof fixture>) => { f.startAt = "2035-01-10T12:30:00Z"; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => createAiryRecoveryPlan(f)); }
});
test("one-hour recovery keeps full enrollment plus fifteen minutes of preparation, including at execution", () => {
  const f = fixture(); f.startAt = "2035-01-01T13:00:00Z";
  const plan = createAiryRecoveryPlan(f);
  assert.equal(Date.parse(plan.replacement.saleStartAt) - Date.parse(plan.replacement.enrollmentAt), Number(f.artifact.steps[1].payload.operations.enrollmentWindowSeconds) * 1000);
  assert.doesNotThrow(() => validateRecoveryPlan(f, f.actionsHash, f.snapshot, plan, f.now));
  const tooLate = Date.parse(plan.replacement.enrollmentAt) / 1000 - 899;
  assert.throws(() => validateRecoveryPlan(f, f.actionsHash, f.snapshot, plan, tooLate));
});
test("plan validation rejects state changes, new posts, revisions, expired plans and tampered original clocks", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.state.observedAt = "changed"; },
    (f: ReturnType<typeof fixture>) => { f.actionsHash = "changed"; },
    (f: ReturnType<typeof fixture>) => { f.row.revision++; },
    (f: ReturnType<typeof fixture>) => { f.row.profile_revision++; },
    (f: ReturnType<typeof fixture>) => { f.row.desired_state = "running"; },
    (f: ReturnType<typeof fixture>) => { f.now += 901; },
    (f: ReturnType<typeof fixture>) => { f.plan.original.saleStartAt = f.startAt; },
    (f: ReturnType<typeof fixture>) => { f.plan.preparedHash = "changed"; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => validateRecoveryPlan(f, f.actionsHash, f.snapshot, f.plan, f.now)); }
  const f = fixture(); assert.doesNotThrow(() => validateRecoveryPlan(f, f.actionsHash, f.snapshot, f.plan, f.now));
});
test("applied runtime terms remain hash bound on every restart", () => {
  const f = fixture();
  f.state.collections![A.nextId] = { payload: recoveryPayload(f.artifact, f.plan), enrollmentAt: f.plan.replacement.enrollmentAt, announcementAt: f.plan.replacement.announcementAt };
  f.state.airyRecovery = { plan: f.plan, hash: recoveryDigest(f.plan), appliedAt: f.plan.createdAt };
  assert.doesNotThrow(() => assertAppliedRecovery(f.artifact, f.state, f.preparedHash));
  f.state.collections![A.nextId].payload.contract.mintPriceWei = "1";
  assert.throws(() => assertAppliedRecovery(f.artifact, f.state, f.preparedHash), /runtime_terms_changed/);
});
test("apply locks and commits once, preserves posts/journals, and duplicate execution never requeues", async () => {
  const previous = process.env.SEASON_RUNNER_MASTER_KEY;
  process.env.SEASON_RUNNER_MASTER_KEY = randomBytes(32).toString("base64");
  try {
    const f = fixture(), calls: string[] = [], original = structuredClone(f.state); let saved: SeasonState | undefined;
    f.row.state = { encrypted: encryptRuntimeSecret(JSON.stringify(f.state), `run-state:${A.runId}`) };
    const store = { ...f, query: async (sql: string) => {
      calls.push(sql);
      if (/FROM manekineko_(season_runtime_profiles|launch_automations).*FOR (UPDATE|SHARE)/.test(sql)) throw new Error("restricted worker cannot lock read-only tables");
      if (sql.startsWith("SELECT * FROM manekineko_season_runtime_runs")) return { rows: [f.row] };
      if (sql.startsWith("SELECT enabled")) return { rows: [{ enabled: true, revision: 1 }] };
      if (sql.startsWith("SELECT revision,status")) return { rows: [{ status: "prepared", revision: 1, content_hash: f.preparedHash, prepared_artifact: f.artifact }] };
      if (sql.startsWith("SELECT action_key")) return { rows: f.actions };
      return { rows: [] };
    }, save: async (state: SeasonState) => { saved = state; f.row.state = { encrypted: encryptRuntimeSecret(JSON.stringify(state), `run-state:${A.runId}`) }; }, event: async (event: string) => { calls.push(event); } } as unknown as RunStore;
    assert.equal((await applyRecoveryPlan(store, f.snapshot, f.plan, recoveryDigest(f.plan), f.now)).status, "queued");
    assert.deepEqual(saved!.journal, original.journal); assert.equal(saved!.binding, original.binding);
    assert.deepEqual(f.artifact.steps[1].payload.contract.mintDurationSeconds, "2592000");
    assert(calls[1].includes("pg_advisory_xact_lock")); assert(calls[2].includes("FOR UPDATE")); assert.equal(calls.at(-1), "COMMIT");
    assert.equal((await applyRecoveryPlan(store, f.snapshot, f.plan, recoveryDigest(f.plan), f.now + 1000)).status, "already-applied");
    assert.equal(calls.filter(sql => sql.startsWith("UPDATE")).length, 1);
    assert.equal(calls.filter(sql => sql === "recovery_schedule_approved").length, 1);
  } finally { if (previous === undefined) delete process.env.SEASON_RUNNER_MASTER_KEY; else process.env.SEASON_RUNNER_MASTER_KEY = previous; }
});
