import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import pg, { type Pool, type PoolClient } from "pg";
import { formatEther, getAddress, Wallet } from "ethers";
import { AutomationError, type AutomationArtifact, type AutomationPlan } from "../../apps/launch/lib/launch-automation.ts";
import { requireValidAutomationPayload } from "../../apps/launch/lib/launch-automation-validation.ts";
import { getLaunchAutomation, exportLaunchAutomation, updateLaunchAutomation, prepareLaunchAutomation } from "../../apps/launch/lib/launch-automation-store.ts";
import { assertRuntimeArtifact, runtimeId, runtimeProfileInput } from "../../apps/launch/lib/season-runtime.ts";
import { getSeasonRuntime, getRuntimeWorkerProfile, requestSeasonStartInTransaction } from "../../apps/launch/lib/season-runtime-store.ts";
import { connectionConfig, loadPrivateEnvironment, registryPins } from "./config.ts";
import { ensure, RunnerStop } from "./store.ts";
import { verifyXAccount, XApiError } from "./social.ts";

export type PreparationArguments = { automationId: string; envFiles: string[]; execute: boolean; startAt?: string; actorId?: string; help: boolean; reviewSeasonId?: string };
export function parsePreparationArguments(args: string[]): PreparationArguments {
  const parsed: PreparationArguments = { automationId: "", envFiles: [], execute: false, help: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    ensure(!seen.has(flag) || flag === "--env-file", "duplicate_command_option"); seen.add(flag);
    if (flag === "--execute") parsed.execute = true;
    else if (flag === "--help") parsed.help = true;
    else {
      ensure(["--automation-id", "--env-file", "--start-at", "--actor-id"].includes(flag), "invalid_command_option");
      const value = args[++index]; ensure(value && !value.startsWith("--"), "invalid_command_option");
      if (flag === "--env-file") parsed.envFiles.push(value);
      if (flag === "--automation-id") parsed.automationId = runtimeId(value);
      if (flag === "--actor-id") parsed.actorId = runtimeId(value);
      if (flag === "--start-at") {
        ensure(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace(".000Z", "Z") === value, "start_at_requires_whole_second_utc");
        parsed.startAt = value;
      }
    }
  }
  ensure(parsed.help || parsed.automationId, "automation_id_required");
  return parsed;
}

export function preparationEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const worker = connectionConfig(11155111, false, env), pins = registryPins(11155111, env, "affiliate-v10");
  let launch: URL, workerDatabase: URL;
  try { launch = new URL(env.LAUNCH_DATABASE_URL ?? ""); workerDatabase = new URL(worker.databaseUrl); }
  catch { throw new Error("launch_database_url_required"); }
  ensure(env.STAGING_DATABASE_EXPECTED_HOST && env.STAGING_DATABASE_EXPECTED_NAME, "explicit_staging_database_pins_required");
  for (const url of [launch, workerDatabase]) {
    ensure(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname === env.STAGING_DATABASE_EXPECTED_HOST.toLowerCase()
      && decodeURIComponent(url.pathname.slice(1)) === env.STAGING_DATABASE_EXPECTED_NAME && !url.hash
      && url.searchParams.get("sslmode") === "verify-full"
      && [...url.searchParams.keys()].every(key => ["sslmode", "channel_binding"].includes(key)), "preparation_database_destination_mismatch");
  }
  ensure(decodeURIComponent(launch.username) === "manekineko_staging_launch", "preparation_requires_restricted_staging_launch_role");
  const key = env.SEASON_RUNNER_PRIVATE_KEY_11155111 ?? env.DEPLOYER_PRIVATE_KEY;
  ensure(key && /^0x[0-9a-f]{64}$/i.test(key), "operator_identity_key_required");
  return { ...worker, ...pins, owner: new Wallet(key).address, launchDatabaseUrl: launch.href, databaseName: env.STAGING_DATABASE_EXPECTED_NAME };
}
export type PreparationEnvironment = ReturnType<typeof preparationEnvironment>;

/** A draft gets its clock only on run day. Frozen artifacts are never rescheduled. */
export function runDayArtifact(saved: AutomationPlan, config: PreparationEnvironment, now = new Date(), startAt?: string): AutomationArtifact {
  ensure(saved.plan.chainId === "11155111", "preparation_is_sepolia_only");
  ensure(saved.plan.steps.every(step => step.payload.contract.algorithmVersion === "unique-rank-v6" && step.payload.contract.maxMintsPerWallet === "20"), "prepare_requires_v10_draft");
  ensure(saved.status === "draft" || !startAt, "prepared_season_cannot_be_rescheduled");
  const plan = structuredClone(saved.plan);
  if (saved.status === "draft") {
    const enrollment = Number(plan.steps[0].payload.operations.enrollmentWindowSeconds);
    ensure(Number.isSafeInteger(enrollment) && enrollment > 0, "valid_enrollment_window_required");
    // Default: one hour for deployment/confirmations in addition to full enrollment.
    plan.startAt = startAt ?? new Date(Math.ceil(now.getTime() / 1000 + enrollment + 3600) * 1000).toISOString().replace(".000Z", "Z");
  }
  const normalized = requireValidAutomationPayload(plan, now, { requireAffiliateEligibility: true, requireWinnerCredits: true, requireSeasonAppearance: true });
  const artifact: AutomationArtifact = { schemaVersion: 1, kind: "launch-automation", contractVersion: "affiliate-v10", ...normalized };
  assertRuntimeArtifact(artifact, now);
  ensure(Date.parse(artifact.startAt!) - now.getTime() > (Number(artifact.steps[0].payload.operations.enrollmentWindowSeconds) + 600) * 1000, "prepared_season_needs_deployment_and_enrollment_lead");
  assertExecutionPolicy(artifact, config);
  return artifact;
}

export function assertExecutionPolicy(artifact: AutomationArtifact, config: PreparationEnvironment) {
  ensure(artifact.chainId === "11155111" && artifact.contractVersion === "affiliate-v10", "preparation_is_v10_sepolia_only");
  ensure(!artifact.steps.some(step => step.payload.contract.sepoliaRehearsal) || artifact.steps.length === 1, "refund_scenario_requires_one_collection");
  for (const step of artifact.steps) {
    const { contract, operations } = step.payload;
    ensure(contract.chainId === "11155111" && contract.algorithmVersion === "unique-rank-v6" && contract.maxMintsPerWallet === "20" && contract.maxSupply === "1000", "rehearsal_requires_v10_1000_ticket_collections");
    ensure([contract.initialOwner, operations.deployerAddress, operations.factoryOwnerAddress].every(value => getAddress(value) === config.owner), "autonomous_owner_mismatch");
    ensure(getAddress(contract.enrollmentSigner) !== config.owner, "separate_enrollment_signer_required");
    ensure(getAddress(operations.affiliateEligibilityAddress!) === config.eligibility.address && getAddress(operations.winnerCreditsAddress!) === config.credits.address, "prepared_registry_pins_mismatch");
    ensure(operations.winnerCreditSponsorshipWei === artifact.steps[0].payload.operations.winnerCreditSponsorshipWei, "season_sponsorship_policy_mismatch");
    if (artifact.steps.length > 1) ensure(Number(artifact.timing!.nextAnnouncementDelaySeconds) + Number(operations.enrollmentWindowSeconds) < Number(artifact.timing!.nextLaunchDelaySeconds), "next_announcement_must_precede_enrollment_window");
  }
  const budget = preparationBudget(artifact);
  ensure(BigInt(config.maxTotalSpendWei) > budget.mintWei + budget.vrfWei + budget.sponsorshipWei, "spending_cap_cannot_cover_season_values_and_gas");
}
export function preparationBudget(artifact: AutomationArtifact) {
  return artifact.steps.reduce((sum, { payload }) => ({
    mintWei: sum.mintWei + (payload.contract.sepoliaRehearsal === "refund-3-30m" ? 3n : BigInt(payload.contract.maxSupply)) * BigInt(payload.contract.mintPriceWei),
    vrfWei: sum.vrfWei + BigInt(payload.contract.randomnessFundingWei),
    sponsorshipWei: sum.sponsorshipWei + BigInt(payload.operations.winnerCreditSponsorshipWei!),
  }), { mintWei: 0n, vrfWei: 0n, sponsorshipWei: 0n });
}

const defaults = { getLaunchAutomation, exportLaunchAutomation, getSeasonRuntime, getRuntimeWorkerProfile,
  updateLaunchAutomation, prepareLaunchAutomation, requestSeasonStartInTransaction, verifyXAccount, now: () => new Date() };
export type PreparationDependencies = typeof defaults;

/** Database preparation only. Never deploys, funds, creates wallets, resumes a paused run or posts to X. */
export async function prepareSepoliaRun(pool: Pick<Pool, "connect">, args: PreparationArguments, config: PreparationEnvironment, overrides: Partial<PreparationDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }, client: PoolClient = await pool.connect();
  try {
    await client.query(args.execute ? "BEGIN" : "BEGIN READ ONLY");
    const identity = (await client.query("SELECT current_database() AS database,current_user AS role")).rows[0];
    ensure(identity?.database === config.databaseName && identity.role === "manekineko_staging_launch", "preparation_database_identity_mismatch");
    if (args.execute) await client.query("SELECT id FROM manekineko_launch_automations WHERE id=$1 FOR UPDATE", [args.automationId]);
    let saved = await dependencies.getLaunchAutomation(client, args.automationId);
    ensure(!saved.supersededBy, "review_run_superseded");
    ensure(!saved.reviewGroup || saved.reviewGroup.seasonId === args.reviewSeasonId, "review_script_required");
    const runtime = await dependencies.getSeasonRuntime(client, args.automationId);
    if (runtime.run) {
      ensure(!args.startAt, "existing_run_cannot_be_rescheduled");
      const { artifact } = await dependencies.exportLaunchAutomation(client, saved.id);
      ensure(runtime.run.chainId === "11155111" && runtime.run.automationRevision === saved.revision && runtime.run.preparedHash === saved.contentHash, "existing_run_binding_mismatch");
      assertRuntimeArtifact(artifact, dependencies.now(), false);
      assertExecutionPolicy(artifact, config);
      await client.query("COMMIT");
      return { mode: "existing_run", automationId: saved.id, runId: runtime.run.id, startAt: artifact.startAt, status: runtime.run.status, desiredState: runtime.run.desiredState,
        message: "Existing run reused without changes. Its worker still enforces the original execution binding; use Launch controls for a paused run." };
    }
    const now = dependencies.now();
    let artifact: AutomationArtifact;
    if (saved.status === "prepared") {
      ensure(!args.startAt, "prepared_season_cannot_be_rescheduled");
      artifact = (await dependencies.exportLaunchAutomation(client, saved.id)).artifact;
      assertRuntimeArtifact(artifact, now); assertExecutionPolicy(artifact, config);
      ensure(Date.parse(artifact.startAt!) - now.getTime() > (Number(artifact.steps[0].payload.operations.enrollmentWindowSeconds) + 600) * 1000, "prepared_season_needs_deployment_and_enrollment_lead");
    } else artifact = runDayArtifact(saved, config, now, args.startAt);
    ensure(runtime.encryptionConfigured && runtime.profile?.enabled, "configure_enabled_sepolia_x_profile_first");
    const { profile, credentials } = await dependencies.getRuntimeWorkerProfile(client, "11155111");
    runtimeProfileInput({ ...profile, expectedAccountId: profile.expectedAccountId, credentials });
    ensure(profile.enabled && profile.revision === runtime.profile.revision, "profile_changed_during_preparation");
    // Authenticated GET only: reject the wrong account before freezing a dated artifact.
    const account = await dependencies.verifyXAccount(credentials, { expectedAccountId: profile.expectedAccountId });
    ensure(account.username.toLowerCase() === profile.handle.toLowerCase(), "configured_x_handle_mismatch");
    const budget = preparationBudget(artifact);
    const report = { automationId: saved.id, name: artifact.name, version: artifact.contractVersion, collections: artifact.steps.length, startAt: artifact.startAt,
      mintPaymentsEth: formatEther(budget.mintWei), vrfReservesEth: formatEther(budget.vrfWei), sponsorshipEth: formatEther(budget.sponsorshipWei), maxTotalSpendEth: formatEther(config.maxTotalSpendWei),
      fundingTransfersAndGasAdditional: true, account: `@${account.username}`, publicBaseUrl: profile.publicBaseUrl };
    if (!args.execute) { await client.query("ROLLBACK"); return { mode: "read_only", readyToQueue: true, ...report }; }
    const actor = { userId: runtimeId(args.actorId ?? saved.updatedBy) };
    if (saved.status === "draft") {
      const { schemaVersion: _schema, kind: _kind, contractVersion: _version, ...plan } = artifact;
      saved = await dependencies.updateLaunchAutomation(client, actor, saved.id, { revision: saved.revision, plan });
      saved = await dependencies.prepareLaunchAutomation(client, actor, saved.id, saved.revision, now);
    }
    const run = await dependencies.requestSeasonStartInTransaction(client, actor, saved.id, { revision: saved.revision, preparedHash: saved.contentHash, profileRevision: profile.revision }, args.reviewSeasonId);
    await client.query("COMMIT");
    return { mode: "queued_only", runId: run.id, status: run.status, ...report };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

const quote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
export function workerCommandGuidance(runId: string, envFiles: string[], cwd = process.cwd()) {
  runtimeId(runId);
  const log = resolve(cwd, `.private/season-runner/${runId}.log`), vault = resolve(cwd, ".private/season-runner/sepolia-wallets.enc");
  const common = ["npm --prefix", quote(resolve(cwd)), "run season:run:sepolia --", "--run-id", runId, ...envFiles.flatMap(path => ["--env-file", quote(resolve(cwd, path))]), "--log-file", quote(log)].join(" ");
  return { logFile: log, walletVault: vault, preflightCommand: `${common} --once`, runCommand: `${common} --execute --sepolia-rehearsal --recycle-sepolia-funds --wallet-vault ${quote(vault)}` };
}
async function main() {
  const args = parsePreparationArguments(process.argv.slice(2));
  if (args.help) {
    console.log("Sepolia V10 run-day preparation (read-only by default; --execute only prepares and queues in PostgreSQL).\nUsage: npm run season:prepare:sepolia -- --automation-id UUID --env-file .env.staging.local --env-file PRIVATE_WORKER_ENV [--start-at YYYY-MM-DDTHH:MM:SSZ] [--actor-id UUID] [--execute]\nRequires the restricted LAUNCH_DATABASE_URL, staging database pins, worker settings and a saved, enabled Sepolia X profile. Default first opening: now + full enrollment + one hour. Existing runs are returned unchanged. The authenticated X account check uses GET only. No blockchain transaction, wallet generation or X post occurs.");
    return;
  }
  await loadPrivateEnvironment(args.envFiles);
  const config = preparationEnvironment(), pool = new pg.Pool({ connectionString: config.launchDatabaseUrl, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
  pool.on("error", () => {});
  try {
    const result = await prepareSepoliaRun(pool, args, config);
    console.log(JSON.stringify({ ...result, ...("runId" in result ? workerCommandGuidance(result.runId, args.envFiles) : {}) }, null, 2));
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const code = error instanceof RunnerStop ? error.code : error instanceof AutomationError ? error.code : error instanceof XApiError ? `x_account_check_failed${error.status ? `_http_${error.status}` : ""}` : error instanceof Error && /^[a-z][a-z0-9_]{1,150}$/.test(error.message) ? error.message : "preparation_failed_review_configuration";
    console.error(JSON.stringify({ status: "blocked", code, ...(error instanceof AutomationError ? { message: error.message, issues: error.issues } : {}) })); process.exitCode = 1;
  });
}
