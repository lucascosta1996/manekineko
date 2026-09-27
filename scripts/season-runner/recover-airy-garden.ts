import { pathToFileURL } from "node:url";
import pg from "pg";
import { getAddress } from "ethers";
import { loadPrivateEnvironment, connectionConfig, registryPins, readPrivateFile, writePrivateFile } from "./config.ts";
import { ensure, openRunStore, RunnerStop, type RunStore } from "./store.ts";
import { createV10ChainAdapter, type ChainSnapshot } from "./chain.ts";
import { createTransactionPipeline } from "./chain-transactions.ts";
import { decryptRuntimeSecret } from "../../apps/launch/lib/season-runtime-crypto.ts";
import { automationArtifactHash } from "../../apps/launch/lib/launch-automation-artifact.ts";
import type { SeasonState } from "./runner.ts";
import { AIRY_RECOVERY as A, assertAiryArtifact, assertAppliedRecovery, assertRecoveryPredecessor, createAiryRecoveryPlan, recoveryDigest, recoveryPayload, type AiryRecoveryPlan } from "./airy-recovery-plan.ts";

export function recoveryArguments(args: string[]) {
  const result: { envFiles: string[]; execute?: boolean; help?: boolean; startAt?: string; output?: string; plan?: string; expectedHash?: string } = { envFiles: [] };
  const names = { "--start-at": "startAt", "--output": "output", "--plan": "plan", "--expected-hash": "expectedHash" } as const;
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === "--execute" || name === "--help") { const key = name === "--execute" ? "execute" : "help"; ensure(!result[key], "duplicate_command_option"); result[key] = true; }
    else {
      ensure(name === "--env-file" || name in names, "invalid_recovery_option");
      const value = args[++i]; ensure(value && !value.startsWith("--"), "recovery_option_value_required");
      if (name === "--env-file") result.envFiles.push(value);
      else { const key = names[name as keyof typeof names]; ensure(!result[key], "duplicate_command_option"); result[key] = value; }
    }
  }
  if (result.help) return result;
  ensure(result.envFiles.length > 0, "private_environment_files_required");
  ensure(Boolean(result.startAt) === Boolean(result.output), "plan_creation_needs_start_at_and_output");
  ensure(result.execute ? result.plan && /^[a-f0-9]{64}$/.test(result.expectedHash ?? "") && !result.startAt : !result.plan && !result.expectedHash, "execution_requires_reviewed_plan_and_exact_hash");
  return result;
}

async function actionEvidence(store: RunStore) {
  return (await store.query("SELECT action_key,kind,status,payload,result,tx_hash,last_error FROM manekineko_season_runtime_actions WHERE run_id=$1 ORDER BY action_key", [A.runId])).rows;
}
async function guardUnstarted(store: RunStore, actions: Awaited<ReturnType<typeof actionEvidence>>) {
  ensure(!actions.some(a => a.action_key.includes(A.nextId) || String(a.payload?.action ?? "").includes(A.nextId)), "recovery_next_collection_has_actions");
  ensure(!actions.some(a => ["sending", "uncertain", "submitted", "pending"].includes(a.status)), "recovery_requires_reconciled_actions");
  ensure(actions.some(a => a.action_key === `${A.firstId}:winners-revealed:root` && a.status === "confirmed" && a.result?.postId), "recovery_requires_confirmed_winner_root");
  ensure(!(await store.query("SELECT 1 FROM manekineko_deployments WHERE collection_id=$1 LIMIT 1", [A.nextId])).rows.length, "recovery_next_collection_already_deployed");
  ensure(!(await store.query(`SELECT 1 FROM manekineko_season_runtime_runs r JOIN manekineko_launch_automations a ON a.id=r.automation_id
    WHERE r.chain_id='11155111' AND r.id<>$1 AND ((r.desired_state='running' AND r.status<>'completed') OR r.lease_expires_at>now()
      OR (r.created_at>$2 AND a.prepared_artifact->>'seasonId'=$3)) LIMIT 1`, [A.runId, store.row.created_at, store.artifact.seasonId])).rows.length, "recovery_other_or_newer_run_exists");
}
function paused(row: RunStore["row"], now: number) {
  ensure(row.id === A.runId && row.automation_id === A.automationId && row.chain_id === "11155111" && row.status === "paused" && row.desired_state === "paused"
    && (!row.lease_expires_at || new Date(row.lease_expires_at).getTime() <= now * 1000), "recovery_requires_exact_paused_unleased_run");
}
/** Validates the entire reviewed document by reconstructing it from immutable inputs. */
export function validateRecoveryPlan(store: Pick<RunStore, "artifact" | "row" | "state">, actionsHash: string, snapshot: ChainSnapshot, plan: AiryRecoveryPlan, now: number) {
  paused(store.row, now);
  const created = Date.parse(plan.createdAt) / 1000;
  ensure(Number.isSafeInteger(created) && created <= now && now < Date.parse(plan.expiresAt) / 1000, "recovery_plan_expired_or_future");
  ensure(Date.parse(plan.replacement.enrollmentAt) / 1000 >= now + 1800, "recovery_enrollment_lead_time_expired");
  ensure(snapshot.blockNumber >= plan.evidence.block, "recovery_chain_head_behind_plan");
  const expected = createAiryRecoveryPlan({ artifact: store.artifact, state: store.state, preparedHash: store.row.prepared_hash,
    actionsHash, profileRevision: store.row.profile_revision, runRevision: store.row.revision,
    snapshot: { ...snapshot, blockNumber: plan.evidence.block, blockHash: plan.evidence.hash }, now: created, startAt: plan.replacement.saleStartAt });
  ensure(recoveryDigest(expected) === recoveryDigest(plan), "recovery_reviewed_inputs_changed");
}

/** Caller holds the worker's chain advisory lock. Changes only the schedule record and queues the same run. */
export async function applyRecoveryPlan(store: RunStore, snapshot: ChainSnapshot, plan: AiryRecoveryPlan, expectedHash: string, now: number) {
  ensure(recoveryDigest(plan) === expectedHash, "recovery_plan_hash_mismatch");
  await store.query("BEGIN");
  try {
    const row = (await store.query("SELECT * FROM manekineko_season_runtime_runs WHERE id=$1 FOR UPDATE", [A.runId])).rows[0];
    ensure(row?.state?.encrypted, "recovery_run_state_missing");
    const state: SeasonState = JSON.parse(decryptRuntimeSecret(row.state.encrypted, `run-state:${A.runId}`));
    if (state.airyRecovery) {
      ensure(state.airyRecovery.hash === expectedHash, "recovery_already_applied_with_different_plan");
      assertAppliedRecovery(store.artifact, state, row.prepared_hash);
      await store.query("COMMIT"); return { status: "already-applied", hash: expectedHash };
    }
    const profile = (await store.query("SELECT enabled,revision FROM manekineko_season_runtime_profiles WHERE chain_id='11155111' FOR UPDATE")).rows[0];
    ensure(profile?.enabled && profile.revision === row.profile_revision, "profile_changed_pause_and_resume");
    const saved = (await store.query("SELECT revision,status,prepared_artifact,content_hash FROM manekineko_launch_automations WHERE id=$1 FOR SHARE", [A.automationId])).rows[0];
    ensure(saved?.status === "prepared" && saved.revision === row.automation_revision && saved.content_hash === row.prepared_hash && automationArtifactHash(saved.prepared_artifact) === row.prepared_hash, "prepared_artifact_changed");
    const actions = await actionEvidence(store);
    validateRecoveryPlan({ ...store, row, state }, recoveryDigest(actions), snapshot, plan, now);
    await guardUnstarted(store, actions);
    const payload = recoveryPayload(store.artifact, plan);
    state.collections![A.firstId].snapshot = snapshot;
    state.collections![A.nextId] = { payload, announcementAt: plan.replacement.announcementAt, enrollmentAt: plan.replacement.enrollmentAt };
    state.airyRecovery = { plan, hash: expectedHash, appliedAt: new Date(now * 1000).toISOString() };
    state.observedAt = new Date(now * 1000).toISOString();
    assertAppliedRecovery(store.artifact, state, row.prepared_hash);
    await store.save(state);
    await store.query("UPDATE manekineko_season_runtime_runs SET desired_state='running',status='queued',last_error=NULL,revision=revision+1 WHERE id=$1", [A.runId]);
    await store.event("recovery_schedule_approved", JSON.stringify({ collectionId: A.nextId, hash: expectedHash, original: plan.original, replacement: plan.replacement }));
    await store.query("COMMIT");
    return { status: "queued", runId: A.runId, hash: expectedHash, workerStarted: false, chainWrites: 0, xWrites: 0 };
  } catch (error) { await store.query("ROLLBACK"); throw error; }
}

export async function recoverAiryGarden(args: string[]) {
  const options = recoveryArguments(args);
  if (options.help) return { usage: "npm run season:recover:airy-garden -- --env-file PRIVATE_ENV [--env-file PRIVATE_ENV] [--start-at YYYY-MM-DDTHH:mm:ssZ --output PRIVATE_PLAN.json | --execute --plan PRIVATE_PLAN.json --expected-hash SHA256]", default: "Read-only audit; never broadcasts transactions or posts to X. Execute installs a reviewed continuation and queues the existing run." };
  const plan: AiryRecoveryPlan | undefined = options.plan ? JSON.parse((await readPrivateFile(options.plan))!) : undefined;
  ensure(!plan || recoveryDigest(plan) === options.expectedHash, "recovery_plan_hash_mismatch");
  await loadPrivateEnvironment(options.envFiles);
  const config = connectionConfig(A.chainId, false), pins = registryPins(A.chainId, process.env, "affiliate-v10");
  const pool = new pg.Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 15000, max: 1 });
  let store: RunStore | undefined, chain: Awaited<ReturnType<typeof createV10ChainAdapter>> | undefined;
  try {
    store = await openRunStore(pool, A.runId, A.chainId, options.execute === true);
    const state = store.state as SeasonState, now = Math.floor(Date.now() / 1000);
    if (state.airyRecovery) {
      ensure(store.row.id === A.runId && store.row.automation_id === A.automationId, "recovery_requires_exact_airy_sepolia_run");
      assertAppliedRecovery(store.artifact, state, store.row.prepared_hash);
      ensure(!options.execute || state.airyRecovery.hash === options.expectedHash, "recovery_already_applied_with_different_plan");
      return { status: "already-applied", hash: state.airyRecovery.hash, runId: A.runId, runStatus: store.row.status, desiredState: store.row.desired_state, changed: false };
    }
    paused(store.row, now); assertAiryArtifact(store.row.id, store.artifact, state);
    const profile = (await store.query("SELECT enabled,revision FROM manekineko_season_runtime_profiles WHERE chain_id='11155111'")).rows[0];
    ensure(profile?.enabled && profile.revision === store.row.profile_revision, "profile_changed_pause_and_resume");
    const actions = await actionEvidence(store); await guardUnstarted(store, actions);
    const owner = store.artifact.steps[0].payload.contract.initialOwner;
    const binding = JSON.parse(state.binding!);
    ensure(binding.owner === getAddress(owner) && recoveryDigest(binding.eligibility) === recoveryDigest(pins.eligibility) && recoveryDigest(binding.credits) === recoveryDigest(pins.credits)
      && binding.maxFeePerGasWei === config.maxFeePerGasWei && binding.maxTotalSpendWei === config.maxTotalSpendWei && binding.confirmations === config.confirmations, "recovery_environment_differs_from_bound_run");
    chain = await createV10ChainAdapter({ ...config, privateKey: undefined, ...pins, chainId: A.chainId, owner, execute: false, journal: structuredClone(state.journal!), saveJournal: async () => { throw new RunnerStop("read_only_recovery_chain"); } });
    const preflight = await chain.preflight();
    ensure(Math.abs(now - preflight.timestamp) < 180, "rpc_head_stale");
    await chain.queueExistingVerification(state.collections![A.firstId].deployment!);
    const journals = new Map<string, NonNullable<SeasonState["journal"]>>();
    for (const journal of [state.journal!, ...Object.values(state.rehearsal?.journals ?? {})]) {
      const previous = journals.get(getAddress(journal.from));
      ensure(!previous || recoveryDigest(previous) === recoveryDigest(journal), "recovery_duplicate_signer_journals_differ");
      ensure(journal.chainId === A.chainId && journal.transactions.every(tx => tx.state === "confirmed" && !tx.action.includes(A.nextId)), "recovery_requires_confirmed_prior_transactions");
      journals.set(getAddress(journal.from), journal);
    }
    for (const journal of journals.values()) await createTransactionPipeline({ provider: chain.provider, execute: false, journal: structuredClone(journal), confirmations: config.confirmations, save: async () => { throw new RunnerStop("read_only_recovery_journal"); } }).confirmAll();
    const snapshot = await chain.snapshot(A.round); assertRecoveryPredecessor(snapshot);
    const current = Math.floor(Date.now() / 1000);
    ensure(Math.abs(current - snapshot.timestamp) < 180, "rpc_head_stale");
    const actionsHash = recoveryDigest(actions);
    if (options.execute) {
      ensure(plan && (await chain.provider.getBlock(plan.evidence.block))?.hash === plan.evidence.hash, "recovery_evidence_reorganized");
      validateRecoveryPlan(store, actionsHash, snapshot, plan, current);
      return await applyRecoveryPlan(store, snapshot, plan, options.expectedHash!, current);
    }
    const result = { mode: "read-only", runId: A.runId, status: store.row.status, desiredState: store.row.desired_state, preparedHash: store.row.prepared_hash,
      predecessor: { round: A.round, block: snapshot.blockNumber, blockHash: snapshot.blockHash, revealed: snapshot.revealed, readyForNextRound: snapshot.readyForNextRound, minted: snapshot.totalMinted, prizePaidWei: snapshot.prizePaidAmount, awards: snapshot.awards },
      operatorBalanceWei: preflight.balanceWei, confirmedTransactions: [...journals.values()].reduce((sum, j) => sum + j.transactions.length, 0),
      confirmedPosts: actions.filter(a => a.kind === "x-post" && a.status === "confirmed").length, failedPosts: actions.filter(a => a.kind === "x-post" && a.status === "failed").map(a => ({ key: a.action_key, status: "failed" })),
      chainWrites: 0, databaseWrites: 0, xWrites: 0 };
    if (!options.startAt) return result;
    const generated = createAiryRecoveryPlan({ artifact: store.artifact, state, preparedHash: store.row.prepared_hash, actionsHash, profileRevision: store.row.profile_revision, runRevision: store.row.revision, snapshot, now: current, startAt: options.startAt });
    ensure(await readPrivateFile(options.output!, true) === null, "recovery_plan_output_already_exists");
    await writePrivateFile(options.output!, JSON.stringify(generated, null, 2) + "\n");
    return { ...result, plan: generated, planHash: recoveryDigest(generated), expiresAt: generated.expiresAt };
  } finally { chain?.destroy(); await store?.close(); await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  recoverAiryGarden(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    // Provider and database exceptions can contain authenticated URLs. Print only our closed error codes.
    console.error(JSON.stringify({ error: error instanceof RunnerStop ? error.code : "recovery_preflight_failed", changed: "Check the saved run before retrying any execution; never replace a signed transaction." })); process.exitCode = 1;
  });
}
