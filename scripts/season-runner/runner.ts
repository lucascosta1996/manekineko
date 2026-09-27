import { formatEther, getAddress, Transaction, Wallet } from "ethers";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { LaunchPayload } from "../../apps/launch/lib/launch-config.ts";
import { getRuntimeWorkerProfile } from "../../apps/launch/lib/season-runtime-store.ts";
import { resolveTimedAutomationStep, seasonActivationDecision } from "../../apps/launch/lib/season-timeline.ts";
import { catalogSeasonOrder } from "../../apps/launch/lib/season-catalog-order.ts";
import { assertSocialText, buildSeasonSocialMessage, socialDateText, socialPublicUrl, type SeasonSocialEvent, type SeasonSocialInput, type SocialPayment } from "../../packages/contracts/src/season-social.ts";
import { createV9ChainAdapter, createV10ChainAdapter, type V9ChainOptions, type ChainDeployment, type ChainSnapshot } from "./chain.ts";
import { ChainPendingError, createTransactionPipeline, transactionSpend, type ChainJournal } from "./chain-transactions.ts";
import type { SepoliaScenario } from "./sepolia-scenarios.ts";
import type { runSepoliaRehearsalStep, SepoliaRehearsalState } from "./sepolia-wallets.ts";
import { verifyXAccount, XApiError } from "./social.ts";
import { deliverMessage, MediaPending } from "./outbox.ts";
import { ensure, RunnerStop, type RunStore } from "./store.ts";
import { indexSeasonFactory, registerVerifiedCollection } from "./registration.ts";

import { seasonVersionPolicy, type SeasonContractVersion } from "./version.ts";
import { AIRY_RECOVERY, assertAppliedRecovery, assertRecoveryPredecessor, type AppliedAiryRecovery } from "./airy-recovery-plan.ts";

export const iso = (seconds: number | string) => new Date(Number(seconds) * 1000).toISOString().replace(".000Z", "Z");
const X_IDENTITY_POLL_REFRESH_MS = 5 * 60 * 1000;
type PreparedCollection = { payload: LaunchPayload; enrollmentAt: string; announcementAt: string; deployment?: ChainDeployment; readinessAt?: string; snapshot?: ChainSnapshot; enrollmentChecked?: boolean };
export type SeasonState = { version?: 1; binding?: string; journal?: ChainJournal; factory?: { factory: string; factoryCodeHash: string }; collections?: Record<string, PreparedCollection>;
  announcedAt?: string; firstThreadComplete?: boolean; observedAt?: string; completed?: boolean; rehearsal?: SepoliaRehearsalState; walletAddresses?: string[]; rehearsalCursor?: number; rehearsalDone?: string[]; airyRecovery?: AppliedAiryRecovery };
export type RunnerOptions = Omit<V9ChainOptions, "journal" | "saveJournal" | "sponsorshipFundingWei"> & { databaseUrl: string; scenario?: SepoliaScenario; wallets?: Wallet[]; donors?: Wallet[]; recycleSepoliaFunds?: boolean; contractVersion?: SeasonContractVersion };
const defaultDependencies = { getRuntimeWorkerProfile, createV9ChainAdapter, createV10ChainAdapter, verifyXAccount, deliverMessage, indexSeasonFactory, registerVerifiedCollection,
  createTransactionPipeline, runSepoliaRehearsalStep: undefined as typeof runSepoliaRehearsalStep | undefined,
  resolveTimedAutomationStep, seasonActivationDecision, fetch: globalThis.fetch, now: Date.now };
export type RunnerDependencies = typeof defaultDependencies;

export function scheduleBinding(options: RunnerOptions, accountId: string, publicBaseUrl: string) {
  return JSON.stringify({ chainId: options.chainId, owner: getAddress(options.owner), eligibility: options.eligibility, credits: options.credits, accountId, publicBaseUrl,
    maxFeePerGasWei: options.maxFeePerGasWei, maxTotalSpendWei: options.maxTotalSpendWei, confirmations: options.confirmations ?? (options.chainId === 1 ? 12 : 2),
    historicalSources: options.historicalSources ?? [],
    ...(options.contractVersion === "affiliate-v10" ? { contractVersion: options.contractVersion } : {}),
    ...(options.scenario ? { scenario: options.scenario } : {}),
    wallets: options.wallets?.map(wallet => wallet.address) ?? [], donors: options.donors?.map(wallet => wallet.address) ?? [], recycleSepoliaFunds: options.recycleSepoliaFunds === true });
}
export function socialIdentity(artifact: RunStore["artifact"], mockOrder?: number | null) {
  const first = artifact.steps[0].payload.contract;
  return { id: artifact.seasonId!, number: mockOrder ?? catalogSeasonOrder(artifact.seasonId) ?? 1, name: first.seasonName!, colors: artifact.steps.map(step => step.payload.contract.collectionColor!) };
}

export async function createSeasonRunner(store: RunStore, pool: Pool, options: RunnerOptions, overrides: Partial<RunnerDependencies> = {}) {
  // Reject test configuration and resumed test state before any service access.
  ensure(options.chainId === 11155111 || (options.wallets === undefined && options.donors === undefined && options.scenario === undefined && !options.recycleSepoliaFunds), "test_minting_is_sepolia_only");
  ensure(options.chainId === 11155111 || ["rehearsal", "walletAddresses", "rehearsalCursor", "rehearsalDone"].every(key => !(key in store.state)), "rehearsal_state_is_sepolia_only");
  ensure(options.chainId === 11155111 || store.artifact.steps.every(step => step.payload.contract.sepoliaRehearsal === undefined), "test_scenario_is_sepolia_only");
  ensure(!store.state.airyRecovery || options.chainId === 11155111, "recovery_is_sepolia_only");
  if (store.state.airyRecovery) {
    ensure(store.row.id === AIRY_RECOVERY.runId && store.row.automation_id === AIRY_RECOVERY.automationId, "recovery_requires_exact_airy_sepolia_run");
    assertAppliedRecovery(store.artifact, store.state, store.row.prepared_hash);
  }
  const dependencies = { ...defaultDependencies, ...overrides };
  ensure(!options.wallets || dependencies.runSepoliaRehearsalStep, "sepolia_rehearsal_adapter_required");
  const { profile, credentials } = await dependencies.getRuntimeWorkerProfile(store.db, String(options.chainId) as "1" | "11155111");
  ensure(profile.enabled && profile.revision === store.row.profile_revision, "profile_changed_pause_and_resume");
  socialPublicUrl(profile.publicBaseUrl);
  const artifact = store.artifact, state = store.state as SeasonState, first = artifact.steps[0].payload;
  const policy = seasonVersionPolicy(artifact.contractVersion);
  ensure(!options.contractVersion || options.contractVersion === policy.contractVersion, "prepared_version_mismatch");
  options = { ...options, contractVersion: policy.contractVersion };
  const owner = getAddress(options.owner), binding = scheduleBinding(options, profile.expectedAccountId, profile.publicBaseUrl);
  ensure(!state.binding || state.binding === binding, "immutable_runtime_configuration_changed");
  ensure(artifact.chainId === String(options.chainId) && artifact.steps.length > 0 && artifact.steps.every(step => step.payload.contract.chainId === String(options.chainId)), "prepared_network_mismatch");
  if (options.scenario) {
    ensure(options.wallets && options.scenario.chainId === 11155111 && options.scenario.maxTotalSpendWei === options.maxTotalSpendWei && options.scenario.maxFeePerGasWei === options.maxFeePerGasWei, "scenario_spending_policy_mismatch");
    ensure(artifact.steps.length === 1 && artifact.steps[0].id === options.scenario.collectionId, "scenario_requires_one_bound_collection");
    ensure((options.scenario.kind === "refund-3-30m") === (first.contract.sepoliaRehearsal === "refund-3-30m"), "scenario_terms_mismatch");
    if (options.scenario.kind === "manual-affiliate-sellout") ensure(policy.permanent && first.contract.mintDurationSeconds === "86400" && !options.recycleSepoliaFunds, "manual_rehearsal_requires_unrecycled_24_hour_v10");
  }
  ensure(!artifact.steps.some(step => step.payload.contract.sepoliaRehearsal) || options.scenario?.kind === "refund-3-30m", "refund_scenario_manifest_required");
  if (options.wallets) ensure(options.wallets.length === 50 && new Set(options.wallets.map(wallet => wallet.address)).size === 50, "rehearsal_requires_50_unique_wallets");
  for (const step of artifact.steps) {
    ensure(step.payload.contract.algorithmVersion === policy.algorithmVersion && step.payload.contract.maxMintsPerWallet === "20", "prepared_version_mismatch");
    const op = step.payload.operations;
    ensure([step.payload.contract.initialOwner, op.deployerAddress, op.factoryOwnerAddress].every(address => getAddress(address) === owner), "autonomous_owner_mismatch");
    ensure(getAddress(op.affiliateEligibilityAddress!) === getAddress(options.eligibility.address) && getAddress(op.winnerCreditsAddress!) === getAddress(options.credits.address), "prepared_registry_pins_mismatch");
    ensure(op.winnerCreditSponsorshipWei === first.operations.winnerCreditSponsorshipWei, "season_sponsorship_policy_mismatch");
    if (options.wallets) ensure(options.scenario?.kind === "refund-3-30m" ? Number(step.payload.contract.maxSupply) > 3 && Number(step.payload.contract.maxSupply) <= 1000 : step.payload.contract.maxSupply === "1000", "rehearsal_requires_1000_ticket_collections");
    if (artifact.steps.length > 1) ensure(Number(artifact.timing!.nextAnnouncementDelaySeconds) + Number(op.enrollmentWindowSeconds) < Number(artifact.timing!.nextLaunchDelaySeconds), "next_announcement_must_precede_enrollment_window");
  }
  state.version = 1; state.binding = binding; state.collections ??= {};
  if (options.wallets) {
    state.rehearsal ??= { journals: {}, refunds: {}, funding: {} };
    state.walletAddresses = options.wallets.map(wallet => wallet.address);
    if (state.journal) state.rehearsal.journals[owner] = state.journal;
  }
  async function save() {
    await store.guard();
    const journals = state.rehearsal ? Object.values(state.rehearsal.journals) : state.journal ? [state.journal] : [];
    ensure(journals.reduce((sum, journal) => sum + journal.transactions.reduce((total, entry) => total + transactionSpend(entry), 0n), 0n) <= BigInt(options.maxTotalSpendWei), "aggregate_spending_cap_exceeded");
    await store.save(state);
    const actions = journals.flatMap(journal => journal.transactions.map(tx => ({ id: randomUUID(), action_key: `tx:${tx.hash}`, status: tx.state === "prepared" ? "pending" : tx.state,
      tx_hash: tx.hash, payload: { action: tx.action, from: journal.from, chainId: options.chainId }, result: { blockNumber: tx.blockNumber ?? null } })));
    if (actions.length) await store.query(`INSERT INTO manekineko_season_runtime_actions(id,run_id,action_key,kind,status,tx_hash,payload,result)
      SELECT a.id::uuid,$1::uuid,a.action_key,'chain-transaction',a.status,a.tx_hash,a.payload,a.result
      FROM jsonb_to_recordset($2::jsonb) AS a(id text,action_key text,status text,tx_hash text,payload jsonb,result jsonb)
      ON CONFLICT(run_id,action_key) DO UPDATE SET status=excluded.status,tx_hash=excluded.tx_hash,result=excluded.result,updated_at=now()
      WHERE manekineko_season_runtime_actions.status IS DISTINCT FROM excluded.status
        OR manekineko_season_runtime_actions.tx_hash IS DISTINCT FROM excluded.tx_hash
        OR manekineko_season_runtime_actions.result IS DISTINCT FROM excluded.result`, [store.row.id, JSON.stringify(actions)]);
  }
  const chain = await (policy.permanent ? dependencies.createV10ChainAdapter : dependencies.createV9ChainAdapter)({ ...options, sponsorshipFundingWei: first.operations.winnerCreditSponsorshipWei,
    journal: state.journal, saveJournal: async journal => { state.journal = journal; if (state.rehearsal) state.rehearsal.journals[owner] = journal; await save(); } });
  state.journal = chain.journal;
  if (state.rehearsal) state.rehearsal.journals[owner] = chain.journal;
  const season = socialIdentity(artifact, store.seasonOrder), base = profile.publicBaseUrl;
  let reconciledHistory = false;
  let identityVerifiedAt: number | undefined, identityClockAt: number | undefined;
  async function verifyPollingIdentity() {
    const now = dependencies.now();
    const refresh = identityVerifiedAt === undefined || now - identityVerifiedAt >= X_IDENTITY_POLL_REFRESH_MS
      || identityClockAt !== undefined && now < identityClockAt;
    identityClockAt = now;
    if (!refresh) return;
    // Bound to this instance's loaded credentials and profile revision. A failed
    // renewal never falls back to the prior success. Store guards still run each
    // tick, and social.ts independently verifies identity before public writes.
    identityVerifiedAt = undefined;
    await dependencies.verifyXAccount(credentials, { expectedAccountId: profile.expectedAccountId });
    identityVerifiedAt = identityClockAt = dependencies.now();
  }
  const rootConfirmed = async (event: SeasonSocialEvent, id = "season") => (await store.action(`${id}:${event}:root`))?.status === "confirmed";
  async function payments(id: string, snapshot: ChainSnapshot): Promise<SocialPayment[]> {
    const rows = (await store.query(`SELECT transaction_hash,log_index,block_number,block_hash,arguments FROM manekineko_chain_events
      WHERE collection_id=$1 AND event_name='AwardClaimed' AND block_number<=$2 ORDER BY block_number,log_index`, [id, snapshot.blockNumber])).rows;
    const result: SocialPayment[] = [];
    for (const row of rows) {
      ensure((await chain.provider.getBlock(Number(row.block_number)))?.hash === row.block_hash, "payment_receipt_reorganized");
      const args = row.arguments, award = snapshot.awards.find(item => item.rank === Number(args.rank));
      ensure(award?.claimed && award.tokenId === args.tokenId && award.amountWei === args.amount, "payment_receipt_mismatch");
      result.push({ rank: Number(args.rank), tokenId: args.tokenId, awardEth: formatEther(args.amount), claimantWallet: args.holder, recipientWallet: args.recipient, transactionHash: row.transaction_hash, logIndex: row.log_index });
    }
    return result;
  }
  async function message(event: SeasonSocialEvent, now: number, id?: string, snapshot?: ChainSnapshot, enqueueOnly = false) {
    let summaryEvidence: { blockNumber: number; blockHash: string } | undefined;
    const index = id ? artifact.steps.findIndex(step => step.id === id) : -1, step = index >= 0 ? artifact.steps[index] : undefined, prepared = id ? state.collections![id] : undefined;
    const terms = step?.payload.contract, path = id ? `${base}/mint/${id}` : undefined;
    const input: SeasonSocialInput = { event, contractVersion: policy.contractVersion, chainId: options.chainId, season, now: iso(now), urls: {
      season: `${base}/seasons/${options.chainId}/${season.id}`, collection: path, affiliate: path && `${path}/affiliates`, docs: `${base}/docs`,
      refund: path, commissions: path && `${path}/affiliates`, prizeClaim: path,
    }, ...(terms ? { collection: { id: id!, number: index + 1, name: terms.name, color: terms.collectionColor!, supply: Number(terms.maxSupply), mintPriceEth: formatEther(terms.mintPriceWei), winnerCount: Number(terms.winnerCount),
      prizePerWinnerEth: formatEther(BigInt(terms.maxSupply) * BigInt(terms.mintPriceWei) * BigInt(terms.prizeBps) / 10000n / BigInt(terms.winnerCount!)) } } : {}),
      enrollmentOpensAt: prepared?.enrollmentAt, saleStartsAt: prepared && iso(prepared.payload.contract.saleStartAt!), deadline: snapshot ? iso(snapshot.mintDeadline) : undefined, drawVerified: snapshot?.revealed };
    if ((event === "winners-revealed" || event === "prizes-paid") && snapshot && id) {
      input.winners = snapshot.awards.map(award => ({ rank: award.rank, tokenId: award.tokenId, awardEth: formatEther(award.amountWei), holderWallet: award.holder, holderBlock: String(snapshot.blockNumber), nftUrl: `${base}/nfts/${id}/${award.tokenId}`, claimed: award.claimed }));
      if (event === "winners-revealed" && !enqueueOnly) input.payments = await payments(id, snapshot);
    }
    if (event === "season-complete") {
      const snapshots = Object.values(state.collections!).flatMap(item => item.snapshot ? [item.snapshot] : []);
      ensure(snapshots.length > 0, "season_summary_missing_evidence");
      if (snapshots.some(item => item.blockNumber !== snapshots[0].blockNumber || item.blockHash !== snapshots[0].blockHash)) throw new MediaPending("season_summary_needs_one_canonical_block");
      summaryEvidence = { blockNumber: snapshots[0].blockNumber, blockHash: snapshots[0].blockHash };
      input.now = iso(snapshots[0].timestamp);
      input.stats = { collectionsSoldOut: snapshots.filter(item => item.soldOut).length, nftsMinted: snapshots.reduce((total, item) => total + Number(item.totalMinted), 0),
        prizesClaimedEth: formatEther(snapshots.reduce((total, item) => total + BigInt(item.prizePaidAmount), 0n)), affiliateClaimedEth: formatEther(snapshots.reduce((total, item) => total + BigInt(item.totalAffiliateClaimed), 0n)), snapshotBlock: String(snapshots[0].blockNumber) };
    }
    const socialMessage = buildSeasonSocialMessage(input);
    if (event === "affiliate-opening-soon" && id === state.airyRecovery?.plan.collectionId) {
      const { original, replacement } = state.airyRecovery.plan;
      socialMessage.post = assertSocialText(`[Sepolia test]\nSatin Echo · rescheduled\n\nOriginal mint: ${socialDateText(original.saleStartAt)}\nNew mint: ${socialDateText(replacement.saleStartAt)}\nEnrollment: ${socialDateText(replacement.enrollmentAt)}\n\nGuide in the thread.`);
    }
    return dependencies.deliverMessage(store, credentials, profile.expectedAccountId, `${id ?? "season"}:${event}`, socialMessage, {
      enqueueOnly,
      ...(snapshot && (event === "winners-revealed" || event === "prizes-paid") ? { observation: { observedAt: new Date(dependencies.now()).toISOString(), blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash, unpaidPrizes: snapshot.awards.filter(award => !award.claimed).length } } : {}),
      supplementalReplies: event === "winners-revealed" || event === "prizes-paid" || event === "season-complete",
      beforePost: async () => {
        await store.guard();
        const head = await chain.provider.getBlock("latest"); ensure(head?.hash && Math.abs(dependencies.now() / 1000 - head.timestamp) < 180, "rpc_head_stale");
        const item = id ? state.collections![id] : state.collections![artifact.steps[0].id];
        if (event === "upcoming-season" || event === "affiliate-opening-soon") ensure(item && head.timestamp < Date.parse(item.enrollmentAt) / 1000, "announcement_window_expired");
        if (event === "affiliate-enrollment-open") ensure(item && head.timestamp >= Date.parse(item.enrollmentAt) / 1000 && head.timestamp < Number(item.payload.contract.saleStartAt), "enrollment_announcement_window_expired");
        if (snapshot && item?.deployment) {
          ensure((await chain.provider.getBlock(snapshot.blockNumber))?.hash === snapshot.blockHash, "social_snapshot_reorganized");
          const current = await chain.snapshot(item.deployment.round);
          if (event === "collection-live" && !(current.saleActivated && !current.soldOut && !current.refundsAvailable && head.timestamp < Number(current.mintDeadline))) throw new MediaPending("mint_announcement_changed_refresh_required");
          if (event === "collection-sold-out") ensure(current.soldOut, "sellout_not_confirmed");
          if (event === "collection-sold-out" && current.revealed !== snapshot.revealed) throw new MediaPending("draw_state_changed_refresh_required");
          if (event === "winners-revealed" || event === "prizes-paid") ensure(current.revealed, "draw_not_confirmed");
          if ((event === "winners-revealed" || event === "prizes-paid") && current.awards.some(award => award.claimed !== snapshot.awards.find(saved => saved.rank === award.rank)?.claimed)) throw new MediaPending("prize_claims_changed_refresh_required");
          if (event === "refunds-available") ensure(current.refundsAvailable, "refunds_not_confirmed");
        }
        if (event === "season-complete") {
          ensure(summaryEvidence && (await chain.provider.getBlock(summaryEvidence.blockNumber))?.hash === summaryEvidence.blockHash, "season_summary_reorganized");
          const snapshots = await Promise.all(Object.values(state.collections!).flatMap(item => item.deployment ? [chain.snapshot(item.deployment.round)] : []));
          ensure(snapshots.some(item => item.refundsAvailable) || (snapshots.length === artifact.steps.length && snapshots.every(item => item.readyForNextRound)), "season_terminal_outcome_not_confirmed");
        }
      },
      beforeReply: async () => { if (snapshot) ensure((await chain.provider.getBlock(snapshot.blockNumber))?.hash === snapshot.blockHash, "social_snapshot_reorganized"); },
    });
  }
  // Failure of optional social maintenance cannot undo chain/public progress.
  // Successor activation still independently requires its confirmed results root.
  async function maintainMessage(event: SeasonSocialEvent, now: number, id?: string, snapshot?: ChainSnapshot) {
    try { return await message(event, now, id, snapshot); }
    catch (error) {
      if (!(error instanceof XApiError || error instanceof MediaPending || error instanceof RunnerStop && error.code === "x_delivery_requires_reconciliation")) throw error;
      return null; // The durable outbox stores exact attempts and the next action.
    }
  }
  async function project() {
    if (!state.announcedAt) return;
    const events = ["affiliate-opening-soon", "affiliate-enrollment-open", "collection-live"] as const;
    const keys = artifact.steps.flatMap(step => events.map(event => `${step.id}:${event}:root`));
    const published = new Set((await store.query("SELECT action_key FROM manekineko_season_runtime_actions WHERE run_id=$1 AND kind='x-post' AND status='confirmed' AND action_key=ANY($2::text[])", [store.row.id, keys])).rows.map(row => row.action_key));
    const announcedCollections = new Set(artifact.steps.filter(step => events.some(event => published.has(`${step.id}:${event}:root`))).map(step => step.id));
    await store.publish({ version: 1, runId: store.row.id, chainId: options.chainId, seasonId: season.id, seasonName: season.name, seasonNumber: season.number, colors: season.colors,
      status: state.completed ? "completed" : "running", announcedAt: state.announcedAt, updatedAt: state.observedAt ?? state.announcedAt, collections: artifact.steps.flatMap((step, index) => {
        const item = state.collections![step.id]; if (!item || dependencies.now() < Date.parse(item.announcementAt) || (index > 0 && !announcedCollections.has(step.id))) return [];
        const snap = item.snapshot;
        return [{ id: step.id, number: index + 1, name: announcedCollections.has(step.id) ? step.payload.contract.name : null, color: season.colors[index], status: snap?.refundsAvailable ? "refundable" : snap?.revealed ? "revealed" : snap?.soldOut ? "sold_out" : snap?.saleActivated ? "minting" : item.enrollmentChecked ? "enrollment" : item.deployment ? "preparing" : "scheduled",
          enrollmentOpensAt: item.enrollmentAt, saleStartAt: iso(item.payload.contract.saleStartAt!), mintDeadline: iso(Number(item.payload.contract.saleStartAt) + Number(item.payload.contract.mintDurationSeconds)), contractAddress: item.deployment?.round ?? null,
          ...(state.airyRecovery?.plan.collectionId === step.id ? { originalSaleStartAt: state.airyRecovery.plan.original.saleStartAt } : {}),
          verification: item.deployment ? chain.journal.verifications?.[item.deployment.round.toLowerCase()]?.state ?? "unknown" : "pending", snapshotBlock: snap?.blockNumber ?? null, snapshotHash: snap?.blockHash ?? null, observedAt: snap ? iso(snap.timestamp) : null }];
      }) });
  }
  async function enroll(index: number, item: PreparedCollection, snapshot: ChainSnapshot, now: number) {
    const step = artifact.steps[index], previous = index > 0 ? state.collections![artifact.steps[index - 1].id] : undefined;
    const saleStart = Number(item.payload.contract.saleStartAt), enrollment = Date.parse(item.enrollmentAt) / 1000;
    if (now >= enrollment && now < saleStart && !snapshot.saleActivated) {
      await store.guard();
      await store.query("UPDATE manekineko_affiliate_programs SET enrollment_enabled=true WHERE collection_id=$1 AND contract_version=$2", [step.id, policy.contractVersion]);
      const response = await dependencies.fetch(`${base}/api/collections/${step.id}/affiliates`, { redirect: "error", signal: AbortSignal.timeout(15000) });
      ensure(response.ok, "public_affiliate_api_unavailable");
      const { program } = await response.json();
      ensure(program?.chainId === options.chainId && program.contractVersion === policy.contractVersion && program.contractAddress?.toLowerCase() === item.deployment.round.toLowerCase()
        && program.source === "ethereum" && (program.readiness?.canEnroll || (program.enrollmentStatus === "full" && !program.readiness?.reason)), "public_affiliate_enrollment_not_ready");
      item.enrollmentChecked = true;
      if (program.enrollmentStatus === "open") await message("affiliate-enrollment-open", now, step.id, snapshot);
      else ensure(await rootConfirmed("affiliate-enrollment-open", step.id), "affiliate_slots_filled_before_open_announcement");
      const announcements = await rootConfirmed("affiliate-enrollment-open", step.id) && (!previous || await rootConfirmed("winners-revealed", artifact.steps[index - 1].id));
      if (announcements && !item.readinessAt) {
        const readyHead = await chain.provider.getBlock("latest");
        ensure(readyHead?.hash && Math.abs(dependencies.now() / 1000 - readyHead.timestamp) < 180, "rpc_head_stale");
        ensure(readyHead.timestamp <= saleStart, "readiness_completed_after_fixed_launch");
        item.readinessAt = iso(readyHead.timestamp); await save();
      }
    }
  }
  async function activate(index: number, item: PreparedCollection, snapshot: ChainSnapshot) {
    const step = artifact.steps[index], previous = index > 0 ? state.collections![artifact.steps[index - 1].id] : undefined;
    const saleStart = Number(item.payload.contract.saleStartAt);
    const activationHead = !snapshot.saleActivated ? await chain.provider.getBlock("latest") : null;
    if (!snapshot.saleActivated && activationHead && activationHead.timestamp >= saleStart && !snapshot.refundsAvailable) {
      ensure(Math.abs(dependencies.now() / 1000 - activationHead.timestamp) < 180, "rpc_head_stale");
      const activation = dependencies.seasonActivationDecision({ now: iso(activationHead.timestamp), launchAt: iso(saleStart), deployedAndFunded: !!item.deployment, previousDrawVerified: !previous || previous.snapshot?.revealed === true,
        prizesReserved: !previous || previous.snapshot?.readyForNextRound === true, socialEnabled: true, winnersAnnouncementConfirmed: !previous || await rootConfirmed("winners-revealed", artifact.steps[index - 1].id),
        nextLaunchAnnouncementConfirmed: await rootConfirmed("affiliate-enrollment-open", step.id), readinessConfirmedAt: item.readinessAt ?? null });
      ensure(activation.status === "ready", "fixed_activation_window_missed_or_not_ready");
      await store.guard(); await chain.advance(step.id, item.deployment.round);
    }
  }
  // A prepared opening has a fixed deadline. During its last two minutes, only
  // its prerequisites and immediate predecessor may run ahead of activation.
  async function urgentOpening(head: { number: number; timestamp: number }): Promise<boolean> {
    const index = artifact.steps.findIndex(step => {
      const item = state.collections![step.id];
      return item && !item.snapshot?.saleActivated && !item.snapshot?.refundsAvailable
        && Number(item.payload.contract.saleStartAt) - head.timestamp <= 120;
    });
    if (index < 0) return false;
    const step = artifact.steps[index], item = state.collections![step.id];
    const previous = index > 0 ? state.collections![artifact.steps[index - 1].id] : undefined;
    ensure(item.deployment && (index === 0 || previous?.deployment), "opening_deployment_missing");
    const evidenceBlock = head.number - (options.confirmations ?? (options.chainId === 1 ? 12 : 2)) + 1;
    ensure(evidenceBlock >= 0, "confirmed_block_unavailable");
    const relevant = previous ? [previous, item] : [item];
    await Promise.all(relevant.map(async current => {
      const deployment = current.deployment!;
      ensure(getAddress(deployment.factory) === getAddress(state.factory!.factory), "opening_factory_mismatch");
      const [created, snapshot] = await Promise.all([
        chain.provider.getBlock(deployment.deploymentBlock), chain.snapshot(deployment.round, evidenceBlock),
      ]);
      ensure(created?.hash === deployment.deploymentBlockHash, "deployment_receipt_reorganized");
      ensure(snapshot.blockNumber === evidenceBlock && snapshot.chainId === options.chainId && getAddress(snapshot.round) === getAddress(deployment.round), "opening_snapshot_mismatch");
      ensure(snapshot.saleStartAt === current.payload.contract.saleStartAt && snapshot.maxSupply === current.payload.contract.maxSupply
        && snapshot.mintPrice === current.payload.contract.mintPriceWei, "opening_terms_mismatch");
      current.snapshot = snapshot;
    }));
    const evidence = await chain.provider.getBlock(evidenceBlock);
    ensure(evidence?.hash && relevant.every(current => current.snapshot!.blockHash === evidence.hash), "opening_evidence_reorganized");
    state.observedAt = new Date(dependencies.now()).toISOString();
    const snapshot = item.snapshot!;
    // A prior broadcast may just have become confirmed. Resume routine lifecycle
    // work on the next tick, without trying to activate it a second time.
    if (!snapshot.saleActivated && !snapshot.refundsAvailable) {
      const enrollment = Date.parse(item.enrollmentAt) / 1000, announcement = Date.parse(item.announcementAt) / 1000;
      if (head.timestamp >= announcement && head.timestamp < enrollment) await message("affiliate-opening-soon", head.timestamp, step.id);
      const collectionAnnounced = head.timestamp >= announcement && await rootConfirmed("affiliate-opening-soon", step.id);
      if (collectionAnnounced) {
        await store.guard();
        const created = await chain.provider.getBlock(item.deployment.deploymentBlock);
        ensure(created?.hash === item.deployment.deploymentBlockHash, "deployment_receipt_reorganized");
        await dependencies.registerVerifiedCollection(pool, step.id, item.deployment, item.payload, options.chainId, created.timestamp);
      } else ensure(head.timestamp < enrollment, "collection_announcement_not_confirmed_before_enrollment");
      if (head.timestamp < Number(item.payload.contract.saleStartAt)) {
        // The quiet window must not suppress a still-required winner or enrollment
        // announcement. Existing outbox confirmation and beforePost checks apply.
        if (previous?.snapshot?.revealed && !await rootConfirmed("winners-revealed", artifact.steps[index - 1].id))
          await message("winners-revealed", head.timestamp, artifact.steps[index - 1].id, previous.snapshot);
        await enroll(index, item, snapshot, head.timestamp);
      }
      await activate(index, item, snapshot);
    }
    await save(); await project();
    return true;
  }
  async function openingCheckpoint() {
    const head = await chain.provider.getBlock("latest");
    ensure(head?.hash && Math.abs(dependencies.now() / 1000 - head.timestamp) < 180, "rpc_head_stale");
    return urgentOpening(head);
  }
  async function tick() {
    const preflight = await chain.preflight();
    await verifyPollingIdentity();
    if (!options.execute) return { mode: "preflight", chainId: options.chainId, runId: store.row.id, account: profile.handle, collections: artifact.steps.length, walletCount: options.wallets?.length ?? 0, scenario: options.scenario ?? null, owner, balanceWei: preflight.balanceWei };
    await store.guard();
    // Replay signed intents before examining state transitions that may already
    // have happened on chain while the process was down.
    const signers = [new Wallet(options.privateKey!, chain.provider), ...(options.wallets ?? []), ...(options.donors ?? [])];
    for (const journal of state.rehearsal ? Object.values(state.rehearsal.journals) : [chain.journal]) {
      const signer = signers.find(wallet => wallet.address === journal.from); ensure(signer, "pending_signer_not_available");
      const pipeline = dependencies.createTransactionPipeline({ provider: chain.provider, signer, execute: true, journal, save, confirmations: options.confirmations ?? (options.chainId === 1 ? 12 : 2) });
      // On process restart, publishing is gated by every earlier signed dependency's canonical receipt.
      if (!reconciledHistory) {
        const confirmed = journal.transactions.filter(tx => tx.state === "confirmed");
        for (let offset = 0; offset < confirmed.length; offset += 8) {
          const entries = confirmed.slice(offset, offset + 8), receipts = await Promise.all(entries.map(entry => pipeline.canonicalReceipt(entry)));
          for (let index = 0; index < entries.length; index++) if (!receipts[index]) throw new ChainPendingError(entries[index].action, entries[index].hash);
        }
      }
      const pending = journal.transactions.find(tx => tx.state !== "confirmed");
      if (!pending) continue;
      const signed = Transaction.from(pending.rawTransaction);
      if (policy.permanent) await chain.preflight();
      await pipeline.send(pending.action, { to: signed.to, data: signed.data, value: signed.value });
    }
    reconciledHistory = true;
    const head = await chain.provider.getBlock("latest"); ensure(head?.hash && Math.abs(dependencies.now() / 1000 - head.timestamp) < 180, "rpc_head_stale");
    let now = head.timestamp;
    if (!state.collections![artifact.steps[0].id]) {
      const decision = dependencies.resolveTimedAutomationStep(artifact, { stepId: artifact.steps[0].id, blockTimestamp: String(now) });
      ensure(decision.status === "ready_for_preflight", "first_opening_needs_more_preparation_time");
      state.collections![artifact.steps[0].id] = { payload: decision.payload, enrollmentAt: iso(Number(decision.payload.contract.saleStartAt) - Number(decision.payload.operations.enrollmentWindowSeconds)), announcementAt: iso(now) };
      await save();
    }
    async function recordFirstRoot() {
      const published = await store.action("season:upcoming-season:root");
      if (!state.announcedAt && published?.status === "confirmed") {
        ensure(typeof published.result.confirmedAt === "string" && Number.isFinite(Date.parse(published.result.confirmedAt)), "first_announcement_confirmation_missing");
        state.announcedAt = published.result.confirmedAt; await save(); await project();
      }
      return published?.status === "confirmed";
    }
    const announced = await recordFirstRoot();
    ensure(!state.announcedAt || announced, "first_announcement_history_missing");
    if (!state.firstThreadComplete) {
      if (!announced) ensure(now < Number(state.collections![artifact.steps[0].id].payload.contract.saleStartAt) - Number(first.operations.enrollmentWindowSeconds), "first_announcement_window_missed");
      try { await message("upcoming-season", now); state.firstThreadComplete = true; await save(); }
      finally { await recordFirstRoot(); } // The root itself starts Web counters, even when a later thread reply is uncertain.
    }
    if (!state.factory) { await store.guard(); state.factory = await chain.ensureFactory(`season:${store.row.id}`, first.operations.factoryMode === "existing" ? first.operations.factoryAddress : undefined); await save(); }
    if (await openingCheckpoint()) return { mode: "running", runId: store.row.id, priority: "fixed-opening" };
    // Keep historical collection claims current while the next collection runs.
    const indexed = await dependencies.indexSeasonFactory(pool, chain.provider, { databaseUrl: options.databaseUrl, rpcUrl: options.rpcUrl, chainId: options.chainId, contractVersion: policy.contractVersion, ...state.factory, confirmations: options.confirmations ?? (options.chainId === 1 ? 12 : 2) });
    ensure(indexed.ok, "season_indexer_failed");
    // Reconciliation/indexing may advance the chain enough to confirm an activation.
    // Pin all evidence after those operations, never to the earlier preflight report.
    const evidenceHead = await chain.provider.getBlock("latest");
    ensure(evidenceHead?.hash && Math.abs(dependencies.now() / 1000 - evidenceHead.timestamp) < 180, "rpc_head_stale");
    // An indexer batch may have crossed into the preparation window.
    if (await urgentOpening(evidenceHead)) return { mode: "running", runId: store.row.id, priority: "fixed-opening" };
    const evidenceBlock = evidenceHead.number - (options.confirmations ?? (options.chainId === 1 ? 12 : 2)) + 1;
    ensure(evidenceBlock >= 0, "confirmed_block_unavailable");
    now = evidenceHead.timestamp;
    await Promise.all(Object.values(state.collections!).map(async item => { if (item.deployment) item.snapshot = await chain.snapshot(item.deployment.round, evidenceBlock); }));
    // A normal tick can itself cross into the quiet window while reading old
    // collections. Yield at bounded work boundaries before doing more of it.
    if (await openingCheckpoint()) return { mode: "running", runId: store.row.id, priority: "fixed-opening" };
    const observations = Object.values(state.collections!).flatMap(item => item.snapshot ? [item.snapshot.timestamp] : []);
    if (observations.length) state.observedAt = new Date(dependencies.now()).toISOString();
    await save(); await project();
    // Queue every verified result before any bot claim and before supplemental
    // sellout threads. The first evidence survives fast claims and process restarts.
    const primaryResultAttempts = new Set<string>();
    for (const [id, item] of Object.entries(state.collections!)) {
      if (!item.snapshot?.revealed) continue;
      if (!await rootConfirmed("winners-revealed", id)) await message("winners-revealed", now, id, item.snapshot, true);
      if (item.snapshot.prizePaid && !await rootConfirmed("prizes-paid", id)) await message("prizes-paid", now, id, item.snapshot, true);
    }
    for (const [id, item] of Object.entries(state.collections!)) {
      if (!item.snapshot?.revealed) continue;
      if (!await rootConfirmed("winners-revealed", id)) { primaryResultAttempts.add(`${id}:winners-revealed`); await maintainMessage("winners-revealed", now, id, item.snapshot); }
      if (item.snapshot.prizePaid && !await rootConfirmed("prizes-paid", id)) { primaryResultAttempts.add(`${id}:prizes-paid`); await maintainMessage("prizes-paid", now, id, item.snapshot); }
    }
    // Reconcile one owned terminal claim before social delivery or a missed next schedule can stop this tick.
    // The urgent-opening checkpoints above still protect future activation prerequisites.
    let terminalClaimProcessed = false;
    const futurePreparation = artifact.steps.some((step, index) => {
      if (state.collections![step.id]?.deployment) return false;
      const previous = index > 0 ? state.collections![artifact.steps[index - 1].id]?.snapshot : null;
      const opening = state.collections![step.id]?.payload.contract.saleStartAt ?? (previous?.soldOutAt ? Number(previous.soldOutAt) + Number(artifact.timing!.nextLaunchDelaySeconds) : null);
      return opening === null || Number(opening) > now;
    });
    const terminal = Object.values(state.collections!).filter(item => item.deployment && item.snapshot?.revealed && !state.rehearsalDone?.includes(item.deployment.round));
    if (!futurePreparation && options.wallets && state.rehearsal && terminal.length) {
      const item = terminal[(state.rehearsalCursor ?? 0) % terminal.length];
      state.rehearsalCursor = (state.rehearsalCursor ?? 0) + 1;
      await rehearsal(item); terminalClaimProcessed = true;
    }
    const rehearsalQueue: PreparedCollection[] = [];
    for (let index = 0; index < artifact.steps.length; index++) {
      if (index > 0 && await openingCheckpoint()) return { mode: "running", runId: store.row.id, priority: "fixed-opening" };
      const step = artifact.steps[index], previous = index > 0 ? state.collections![artifact.steps[index - 1].id] : undefined;
      let item = state.collections![step.id];
      if (item && !item.deployment && step.id === state.airyRecovery?.plan.collectionId) {
        const evidence = state.airyRecovery.plan.evidence;
        ensure((await chain.provider.getBlock(evidence.block))?.hash === evidence.hash, "recovery_evidence_reorganized");
        assertRecoveryPredecessor(await chain.snapshot(AIRY_RECOVERY.round));
      }
      if (!item) {
        const snap = previous?.snapshot;
        const decision = dependencies.resolveTimedAutomationStep(artifact, { stepId: step.id, blockTimestamp: String(now), ...(snap ? { previous: {
          stepId: artifact.steps[index - 1].id, confirmed: true, chainId: artifact.chainId, contractVersion: policy.contractVersion, factoryAddress: state.factory.factory,
          deployerAddress: owner, factoryOwnerAddress: owner, soldOut: snap.soldOut, soldOutAt: snap.soldOut ? iso(snap.soldOutAt) : null,
          prizePaid: snap.prizePaid, completedAt: snap.prizePaid ? iso(Math.max(...snap.awards.map(award => Number(award.paidAt)))) : null,
          randomnessRevealed: snap.revealed, prizesReserved: snap.readyForNextRound, outcome: snap.refundsAvailable ? "unsold" : snap.readyForNextRound ? "completed" : "pending",
        } } : {}) });
        if (decision.status === "wait") break;
        ensure(decision.status === "ready_for_preflight", "next_collection_fixed_window_missed_or_predecessor_failed");
        item = { payload: decision.payload, enrollmentAt: iso(Number(decision.payload.contract.saleStartAt) - Number(decision.payload.operations.enrollmentWindowSeconds)), announcementAt: iso(Number(snap!.soldOutAt) + Number(artifact.timing!.nextAnnouncementDelaySeconds)) };
        state.collections![step.id] = item; await save();
      }
      const enrollment = Date.parse(item.enrollmentAt) / 1000;
      if (now >= Date.parse(item.announcementAt) / 1000 && now < enrollment) await message("affiliate-opening-soon", now, step.id);
      if (!item.deployment) {
        ensure(now < enrollment || Boolean(chain.journal.collections[step.id]), "collection_deployment_window_missed");
        await store.guard(); item.deployment = await chain.deployCollection(step.id, item.payload.contract, state.factory.factory); await save();
      }
      const created = await chain.provider.getBlock(item.deployment.deploymentBlock);
      ensure(created?.hash === item.deployment.deploymentBlockHash, "deployment_receipt_reorganized");
      const collectionAnnounced = now >= Date.parse(item.announcementAt) / 1000 && await rootConfirmed("affiliate-opening-soon", step.id);
      if (collectionAnnounced) { await store.guard(); await dependencies.registerVerifiedCollection(pool, step.id, item.deployment, item.payload, options.chainId, created.timestamp); }
      else ensure(now < enrollment, "collection_announcement_not_confirmed_before_enrollment");
      const snapshot = item.snapshot ?? await chain.snapshot(item.deployment.round); item.snapshot = snapshot;
      state.observedAt = new Date(dependencies.now()).toISOString();
      if (options.scenario?.kind === "manual-affiliate-sellout" && !snapshot.saleActivated && !snapshot.refundsAvailable) await rehearsal(item);
      await enroll(index, item, snapshot, now);
      await activate(index, item, snapshot);
      if (snapshot.saleActivated && await openingCheckpoint()) return { mode: "running", runId: store.row.id, priority: "fixed-opening" };
      if (snapshot.saleActivated && !snapshot.soldOut && !snapshot.refundsAvailable && now < Number(snapshot.mintDeadline)) await message("collection-live", now, step.id, snapshot);
      if (snapshot.soldOut) await message("collection-sold-out", now, step.id, snapshot);
      if (snapshot.saleActivated && await openingCheckpoint()) return { mode: "running", runId: store.row.id, priority: "fixed-opening" };
      // Primary results were attempted before automated claims. Reconcile remaining
      // supplemental/payment replies only after the fixed-opening checkpoint.
      if (snapshot.revealed && !primaryResultAttempts.has(`${step.id}:winners-revealed`)) await maintainMessage("winners-revealed", now, step.id, snapshot);
      if (snapshot.prizePaid && !primaryResultAttempts.has(`${step.id}:prizes-paid`)) await maintainMessage("prizes-paid", now, step.id, snapshot);
      if (snapshot.refundsAvailable) {
        await message("refunds-available", now, step.id, snapshot);
        // Unsold collections terminate the factory sequence, but owned refunds
        // and public status continue while the worker remains running.
        if (!snapshot.cancelled) { await store.guard(); await chain.advance(step.id, item.deployment.round); }
        state.completed = true; await save(); await store.complete(); await project(); await maintainMessage("season-complete", now);
        if (!terminalClaimProcessed && options.wallets && state.rehearsal) await rehearsal(item);
        return { mode: "completed", outcome: "unsold", claimsMonitored: true };
      }
      if (snapshot.saleActivated && (!snapshot.randomnessRequested && snapshot.soldOut || snapshot.randomnessReceived && !snapshot.revealed)) { await store.guard(); await chain.advance(step.id, item.deployment.round); }
      if (options.wallets && state.rehearsal && snapshot.saleActivated && !state.rehearsalDone?.includes(item.deployment.round)) rehearsalQueue.push(item);
      await save(); await project();
      if (!snapshot.readyForNextRound) break;
      if (index === artifact.steps.length - 1) { state.completed = true; await save(); await store.complete(); await project(); await maintainMessage("season-complete", now); }
    }
    await project();
    await chain.verifyExplorer?.();
    // Optional old prize/refund/treasury actions never run ahead of due next-collection preparation or activation.
    // Rotate fairly so a live mint and earlier owned claims both progress without an old round starving the new one.
    if (rehearsalQueue.length && !terminalClaimProcessed) {
      if (await openingCheckpoint()) return { mode: "running", runId: store.row.id, priority: "fixed-opening" };
      const item = rehearsalQueue[(state.rehearsalCursor ?? 0) % rehearsalQueue.length];
      state.rehearsalCursor = (state.rehearsalCursor ?? 0) + 1;
      await rehearsal(item);
    }
    return { mode: state.completed ? "completed" : "running", runId: store.row.id, deployed: Object.values(state.collections!).filter(item => item.deployment).length, claimsMonitored: state.completed === true };
  }
  async function rehearsal(item: PreparedCollection) {
    ensure(options.chainId === 11155111 && dependencies.runSepoliaRehearsalStep, "test_minting_is_sepolia_only");
    await store.guard();
    const result = await dependencies.runSepoliaRehearsalStep({ chainId: options.chainId, provider: chain.provider, operator: new Wallet(options.privateKey!), wallets: options.wallets!, donors: options.donors,
      execute: true, state: state.rehearsal!, saveState: async value => { state.rehearsal = value; await save(); }, maxFeePerGasWei: options.maxFeePerGasWei, maxTotalSpendWei: options.maxTotalSpendWei,
      confirmations: options.confirmations, scenario: options.scenario, recycleOperatorFunds: options.recycleSepoliaFunds }, item.deployment!.round);
    if (["settled", "refunded"].includes(result.action)) { state.rehearsalDone ??= []; if (!state.rehearsalDone.includes(item.deployment!.round)) state.rehearsalDone.push(item.deployment!.round); }
    await save();
  }
  return { tick, close: () => chain.destroy(), project };
}
