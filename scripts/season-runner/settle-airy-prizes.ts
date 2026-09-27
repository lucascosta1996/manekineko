import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Wallet, getAddress, Interface, Transaction } from "ethers";
import { loadPrivateEnvironment, connectionConfig, registryPins } from "./config.ts";
import { ensure, openRunStore, RunnerStop } from "./store.ts";
import { createV10ChainAdapter, type ChainSnapshot } from "./chain.ts";
import { createTransactionPipeline, transactionSpend, ChainPendingError } from "./chain-transactions.ts";
import { ensureSepoliaWallets, runSepoliaRehearsalStep } from "./sepolia-wallets.ts";
import { AIRY_RECOVERY as A, assertAiryArtifact, assertRecoveryPredecessor, recoveryDigest } from "./airy-recovery-plan.ts";
import type { SeasonState } from "./runner.ts";

/** Already-paid awards count as recovered only when this journal binds their payment to the deployer. */
export function assertRecoveredPrizeRecipients(snapshot: Pick<ChainSnapshot, "awards">, state: SeasonState, owner: string) {
  const claims = new Interface(["function claimPrizeForRank(uint256,address)"]);
  for (const award of snapshot.awards.filter(a => a.claimed)) {
    const journal = Object.values(state.rehearsal?.journals ?? {}).find(j => getAddress(j.from) === getAddress(award.paidHolder));
    const entry = journal?.transactions.find(t => t.action === `claim:${A.round.toLowerCase()}:${award.rank}`);
    ensure(entry, "already_paid_prize_requires_deployer_payment_evidence");
    const signed = Transaction.from(entry.rawTransaction), call = claims.parseTransaction(signed);
    ensure(signed.to === getAddress(A.round) && signed.from === getAddress(award.paidHolder) && signed.value === 0n && call?.name === "claimPrizeForRank"
      && call.args[0] === BigInt(award.rank) && getAddress(call.args[1]) === getAddress(owner), "already_paid_prize_was_not_recovered_to_deployer");
  }
}

/** Exact paused Sepolia run only. No creator withdrawal, new deployment, mint or social posting. */
export async function settleAiryPrizes(args: string[]) {
  const envFiles: string[] = []; let execute = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--execute") { ensure(!execute, "duplicate_execute"); execute = true; }
    else { ensure(args[i] === "--env-file" && args[i + 1] && !args[i + 1].startsWith("--"), "settlement_only_accepts_env_file_and_execute"); envFiles.push(args[++i]); }
  }
  ensure(envFiles.length, "private_environment_files_required");
  await loadPrivateEnvironment(envFiles);
  const config = connectionConfig(A.chainId, execute), pins = registryPins(A.chainId, process.env, "affiliate-v10");
  const pool = new pg.Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 15000, max: 1 });
  const store = await openRunStore(pool, A.runId, A.chainId, execute).catch(async error => { await pool.end(); throw error; });
  let chain: Awaited<ReturnType<typeof createV10ChainAdapter>> | undefined;
  try {
    const state = store.state as SeasonState;
    ensure(store.row.automation_id === A.automationId, "settlement_requires_exact_airy_automation");
    assertAiryArtifact(A.runId, store.artifact, state);
    const owner = getAddress(store.artifact.steps[0].payload.contract.initialOwner);
    const binding = JSON.parse(state.binding!);
    ensure(binding.owner === owner && recoveryDigest(binding.eligibility) === recoveryDigest(pins.eligibility) && recoveryDigest(binding.credits) === recoveryDigest(pins.credits)
      && binding.maxFeePerGasWei === config.maxFeePerGasWei && binding.maxTotalSpendWei === config.maxTotalSpendWei && binding.confirmations === config.confirmations, "settlement_environment_differs_from_run");
    ensure(state.rehearsal && state.journal && !state.airyRecovery, "settlement_requires_original_rehearsal");
    ensure(recoveryDigest(state.rehearsal.journals[owner]) === recoveryDigest(state.journal), "settlement_operator_journals_differ");
    state.rehearsal.journals[owner] = state.journal;
    async function guard() {
      const row = (await store.query("SELECT status,desired_state,revision,lease_expires_at FROM manekineko_season_runtime_runs WHERE id=$1", [A.runId])).rows[0];
      ensure(row.status === "paused" && row.desired_state === "paused" && row.revision === store.row.revision && (!row.lease_expires_at || new Date(row.lease_expires_at).getTime() <= Date.now()), "settlement_requires_unchanged_paused_run");
      const profile = (await store.query("SELECT enabled,revision FROM manekineko_season_runtime_profiles WHERE chain_id='11155111'")).rows[0];
      ensure(profile?.enabled && profile.revision === store.row.profile_revision, "profile_changed_pause_and_resume");
    }
    await guard();
    chain = await createV10ChainAdapter({ ...config, privateKey: undefined, ...pins, chainId: A.chainId, owner, execute: false, journal: structuredClone(state.journal), saveJournal: async () => { throw new RunnerStop("read_only_chain_adapter"); } });
    await chain.preflight(); await chain.queueExistingVerification(state.collections![A.firstId].deployment!);
    const wallets = await ensureSepoliaWallets({ chainId: A.chainId, path: ".private/season-runner/sepolia-wallets.enc", masterKey: Buffer.from(process.env.SEASON_RUNNER_MASTER_KEY ?? "", "base64").toString("hex"), create: false });
    ensure(recoveryDigest(wallets.map(w => w.address)) === recoveryDigest(state.walletAddresses), "settlement_vault_differs_from_run");
    const snapshot = await chain.snapshot(A.round); assertRecoveryPredecessor(snapshot);
    ensure(Math.abs(Date.now() / 1000 - snapshot.timestamp) < 180, "rpc_head_stale");
    ensure(snapshot.awards.every(a => wallets.some(w => w.address === getAddress(a.holder))), "settlement_requires_all_winners_in_managed_vault");
    assertRecoveredPrizeRecipients(snapshot, state, owner);
    for (const journal of Object.values(state.rehearsal.journals)) {
      ensure(journal.transactions.every(tx => tx.state === "confirmed" || tx.action.startsWith(`claim:${A.round.toLowerCase()}:`) || tx.action.startsWith(`fund:${A.round.toLowerCase()}:`) && /:claim:\d+$/.test(tx.action)), "settlement_unrelated_pending_transaction");
      try { await createTransactionPipeline({ provider: chain.provider, execute: false, journal: structuredClone(journal), confirmations: config.confirmations, save: async () => {} }).confirmAll(); }
      catch (error) { if (!(error instanceof ChainPendingError)) throw error; }
    }
    const review = { mode: execute ? "execute" : "read-only", round: A.round, recipient: owner, prizes: snapshot.awards, explorerVerified: state.journal.verifications?.[A.round.toLowerCase()]?.state === "verified" };
    console.log(JSON.stringify(review));
    if (!execute) return;
    ensure(review.explorerVerified, "verify_round_on_etherscan_before_settlement");
    const operator = new Wallet(config.privateKey!); ensure(operator.address === owner, "settlement_operator_mismatch");
    async function save() {
      await guard();
      const journals = Object.values(state.rehearsal!.journals);
      ensure(journals.reduce((sum, j) => sum + j.transactions.reduce((n, t) => n + transactionSpend(t), 0n), 0n) <= BigInt(config.maxTotalSpendWei), "aggregate_spending_cap_exceeded");
      state.journal = state.rehearsal!.journals[owner];
      await store.save(state);
      const actions = journals.flatMap(j => j.transactions.map(t => ({ id: randomUUID(), action_key: `tx:${t.hash}`, status: t.state === "prepared" ? "pending" : t.state, tx_hash: t.hash, payload: { action: t.action, from: j.from, chainId: A.chainId }, result: { blockNumber: t.blockNumber ?? null } })));
      await store.query(`INSERT INTO manekineko_season_runtime_actions(id,run_id,action_key,kind,status,tx_hash,payload,result)
        SELECT a.id::uuid,$1::uuid,a.action_key,'chain-transaction',a.status,a.tx_hash,a.payload,a.result FROM jsonb_to_recordset($2::jsonb) AS a(id text,action_key text,status text,tx_hash text,payload jsonb,result jsonb)
        ON CONFLICT(run_id,action_key) DO UPDATE SET status=excluded.status,tx_hash=excluded.tx_hash,result=excluded.result,updated_at=now()`, [A.runId, JSON.stringify(actions)]);
    }
    for (let attempt = 0; attempt < 90; attempt++) {
      await guard();
      try {
        const result = await runSepoliaRehearsalStep({ ...config, chainId: A.chainId, provider: chain.provider, operator, wallets, execute: true, state: state.rehearsal, saveState: async value => { state.rehearsal = value; await save(); }, settlePrizesToOperator: true }, A.round);
        console.log(JSON.stringify(result));
        if (result.action === "settled") {
          const final = await chain.snapshot(A.round);
          ensure(final.awards.every(a => a.claimed), "settlement_prizes_remain_unclaimed");
          assertRecoveredPrizeRecipients(final, state, owner);
          await store.event("managed_prizes_recovered", JSON.stringify({ round: A.round, recipient: owner, prizePaidWei: final.prizePaidAmount }));
          console.log(JSON.stringify({ status: "settled", recipient: owner, prizePaidWei: final.prizePaidAmount, operatorBalanceWei: String(await chain.provider.getBalance(owner)), runRemainsPaused: true })); return;
        }
      } catch (error) { if (!(error instanceof ChainPendingError)) throw error; console.log(JSON.stringify({ status: "waiting-for-confirmation" })); }
      await new Promise(resolve => setTimeout(resolve, 12000));
    }
    throw new RunnerStop("settlement_confirmation_timeout_resume_same_journal");
  } finally { chain?.destroy(); await store.close(); await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) settleAiryPrizes(process.argv.slice(2)).catch(error => {
  console.error(JSON.stringify({ error: error instanceof RunnerStop ? error.code : "settlement_failed_preserve_journal" })); process.exitCode = 1;
});
