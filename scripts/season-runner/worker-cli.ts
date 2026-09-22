import pg from "pg";
import { setTimeout as delay } from "node:timers/promises";
import { getAddress } from "ethers";
import { parseArguments, loadPrivateEnvironment, connectionConfig, registryPins, readPrivateFile, writePrivateFile } from "./config.ts";
import { openRunStore, RunnerStop, ensure } from "./store.ts";
import { createSeasonRunner, type RunnerOptions, type RunnerDependencies } from "./runner.ts";
import { ChainPendingError } from "./chain-transactions.ts";
import { setupVersionedRegistries } from "./chain-setup.ts";
import { MediaPending } from "./outbox.ts";
import { AmbiguousDelivery, XApiError, verifyXPost } from "./social.ts";
import { getRuntimeWorkerProfile } from "../../apps/launch/lib/season-runtime-store.ts";
import { encryptRuntimeSecret, decryptRuntimeSecret } from "../../apps/launch/lib/season-runtime-crypto.ts";

import { seasonVersionPolicy } from "./version.ts";

function help(chainId: 1 | 11155111) {
  const command = `npm run season:run:${chainId === 1 ? "mainnet" : "sepolia"} --`;
  return `Tincta V9/V10 ${chainId === 1 ? "Mainnet" : "Sepolia"} season worker (read-only unless --execute)
  ${command} --run-id UUID --env-file PRIVATE_ENV [--once]
  ${command} --run-id UUID --env-file PRIVATE_ENV --execute${chainId === 1 ? " --allow-mainnet" : " --sepolia-rehearsal"}
  ${command} --setup-registries --setup-config PRIVATE_JSON --journal PRIVATE_FILE --env-file PRIVATE_ENV [--execute]${chainId === 1 ? " [--allow-mainnet]" : ""}
  ${command} --run-id UUID --env-file PRIVATE_ENV --execute --reconcile-action ACTION_KEY --post-id X_POST_ID${chainId === 1 ? " --allow-mainnet" : ""}
Options: --interval-ms 1000..30000.${chainId === 11155111 ? " --wallet-vault PRIVATE_FILE, --recycle-sepolia-funds (require --sepolia-rehearsal)." : ""}
${chainId === 1 ? "Uses the configured operator only; buyer-wallet creation, funding and simulated purchases are forbidden." : "Rehearsal uses a persistent encrypted 50-wallet vault. Keep the same vault and master key across runs."}
Read docs/season-automation.md before execution.`;
}
export type RehearsalSupport = {
  options: Pick<RunnerOptions, "wallets" | "donors" | "recycleSepoliaFunds">;
  step: NonNullable<RunnerDependencies["runSepoliaRehearsalStep"]>;
};
type PrepareRehearsal = (args: ReturnType<typeof parseArguments>) => Promise<RehearsalSupport>;
const report = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
export function safeError(error: unknown) {
  if (error instanceof RunnerStop) return error.code;
  if (error instanceof AmbiguousDelivery) return "x_delivery_requires_reconciliation";
  if (error instanceof XApiError) return `x_request_rejected${error.status ? `_http_${error.status}` : ""}`;
  // Raw dependency errors may contain an RPC URL or SQL parameters. Never print them.
  if (error instanceof Error && /^[a-z][a-z0-9_]{1,150}$/.test(error.message)) return error.message;
  return "dependency_or_chain_validation_failed_review_configuration_and_activity";
}

async function main(expectedChain: 1 | 11155111, prepareRehearsal?: PrepareRehearsal) {
  const args = parseArguments(process.argv.slice(2), expectedChain);
  if (args.help) { process.stdout.write(`${help(expectedChain)}\n`); return; }
  await loadPrivateEnvironment(args.envFiles as string[]);
  const chainId = Number(args.chain) as 1 | 11155111, execute = args.execute === true, config = connectionConfig(chainId, execute);
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
  pool.on("error", () => {}); // A dedicated session's error listener stops writes.
  let stopping = false;
  const controller = new AbortController();
  const stop = () => { stopping = true; controller.abort(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    if (args["setup-registries"]) {
      const input = JSON.parse((await readPrivateFile(String(args["setup-config"])))!);
      ensure(input.chainId === chainId && input.owner && Object.keys(input).every(key => ["chainId", "owner", "previousCredits", "historicalSources", "freshNetwork", "legacyMerkleRoot", "contractVersion"].includes(key)), "invalid_registry_setup_configuration");
      const setupPolicy = seasonVersionPolicy(input.contractVersion ?? "affiliate-v9");
      const owner = getAddress(input.owner), context = `registry-setup:${chainId}:${owner}${setupPolicy.permanent ? ":affiliate-v10" : ""}`;
      const client = await pool.connect(); let failed = false; client.on("error", () => { failed = true; });
      try {
        ensure((await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [`tincta-season-chain:${chainId}`])).rows[0].locked, "another_worker_owns_this_network");
        const saved = await readPrivateFile(String(args.journal), true);
        let journal = saved ? JSON.parse(decryptRuntimeSecret(saved, context)) : undefined;
        while (!stopping) {
          try {
            ensure(!failed, "database_lock_lost");
            const result = await setupVersionedRegistries({ ...config, ...input, execute, journal,
              saveJournal: async value => { ensure(!failed, "database_lock_lost"); await client.query("SELECT 1"); journal = value; await writePrivateFile(String(args.journal), encryptRuntimeSecret(JSON.stringify(value), context)); } }, setupPolicy.contractVersion);
            report(result); break;
          } catch (error) {
            if (!(error instanceof ChainPendingError)) throw error;
            report({ mode: "pending", action: error.action, transactionHash: error.hash });
            if (args.once || !execute) break;
          }
          await delay(Number(args["interval-ms"] ?? 3000), undefined, { signal: controller.signal }).catch(() => {});
        }
      } finally { client.release(true); }
      return;
    }
    const store = await openRunStore(pool, String(args["run-id"]), chainId, execute);
    let runner: Awaited<ReturnType<typeof createSeasonRunner>> | undefined;
    try {
      if (args["reconcile-action"]) {
        ensure(store.row.desired_state === "paused", "pause_run_before_reconciling_x_delivery");
        const action = await store.action(String(args["reconcile-action"]));
        ensure(action?.kind === "x-post" && ["sending", "uncertain"].includes(action.status), "action_does_not_need_reconciliation");
        const { credentials } = await getRuntimeWorkerProfile(store.db, String(chainId) as "1" | "11155111");
        await verifyXPost(credentials, String(args["post-id"]), { text: action.payload.text, mediaId: action.result.mediaId, replyToId: action.payload.replyToId ?? undefined }, { expectedAccountId: action.payload.accountId });
        await store.updateAction(action.action_key, "confirmed", { ...action.result, postId: String(args["post-id"]), confirmedAt: new Date().toISOString(), reconciled: true });
        await store.event("x_reconciled", `Verified existing X post for ${action.action_key}. Resume from Launch when ready.`);
        report({ mode: "reconciled", postId: String(args["post-id"]), runId: store.row.id }); return;
      }
      let rehearsal: RehearsalSupport | undefined;
      if (args["sepolia-rehearsal"]) {
        ensure(chainId === 11155111 && prepareRehearsal, "test_wallets_are_sepolia_only");
        rehearsal = await prepareRehearsal(args);
        report({ mode: "sepolia_wallets_ready", walletCount: rehearsal.options.wallets!.length, maxPrimaryMintsPerWallet: 20, vault: String(args["wallet-vault"] ?? ".private/season-runner/sepolia-wallets.enc") });
      }
      runner = await createSeasonRunner(store, pool, { ...config, ...registryPins(chainId, process.env, seasonVersionPolicy(store.artifact.contractVersion).contractVersion), chainId, execute,
        owner: store.artifact.steps[0].payload.contract.initialOwner, ...rehearsal?.options }, rehearsal ? { runSepoliaRehearsalStep: rehearsal.step } : {});
      let previousReport = "", xRetryNotBefore = 0;
      while (!stopping) {
        let result;
        try {
          if (execute && Date.now() < xRetryNotBefore) {
            // A documented rejection is safe to retry. Keep the run's pause /
            // credential guard live during media or posting rate-limit waits.
            await store.guard();
            result = { mode: "waiting_for_x_rate_limit", retryAt: new Date(xRetryNotBefore).toISOString() };
          } else result = await runner.tick();
        }
        catch (error) {
          if (error instanceof ChainPendingError) result = { mode: "pending", action: error.action, transactionHash: error.hash };
          else if (error instanceof MediaPending) result = { mode: "waiting_for_media" };
          else if (execute && error instanceof XApiError && error.status === 429) {
            xRetryNotBefore = Date.now() + Math.max(1, error.retryAfterSeconds ?? 60) * 1000;
            result = { mode: "waiting_for_x_rate_limit", retryAt: new Date(xRetryNotBefore).toISOString() };
          }
          else { const code = safeError(error); if (execute) await store.pause(code); report({ mode: "paused", reason: code, runId: store.row.id }); process.exitCode = 1; break; }
        }
        const serialized = JSON.stringify(result); if (serialized !== previousReport) { report(result); previousReport = serialized; }
        if (args.once || !execute) break;
        await delay(Number(args["interval-ms"] ?? 3000), undefined, { signal: controller.signal }).catch(() => {});
      }
    } catch (error) { if (execute) await store.pause(safeError(error)); throw error; }
    finally { runner?.close(); await store.close(); }
  } finally { await pool.end(); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}
export async function runWorkerCli(chainId: 1 | 11155111, prepareRehearsal?: PrepareRehearsal) {
  try { await main(chainId, prepareRehearsal); }
  catch (error) { report({ mode: "stopped", reason: safeError(error) }); process.exitCode = 1; }
}
