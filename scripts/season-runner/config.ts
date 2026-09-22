import { constants } from "node:fs";
import { open, mkdir, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { getAddress } from "ethers";
import { ensure } from "./store.ts";
import { seasonVersionPolicy, type SeasonContractVersion } from "./version.ts";

export function parseArguments(args: string[], expectedChain?: 1 | 11155111) {
  const options: Record<string, string | boolean | string[]> = { envFiles: [] };
  const flags = new Set(["execute", "once", "allow-mainnet", "sepolia-rehearsal", "recycle-sepolia-funds", "setup-registries", "help"]);
  const values = new Set(["chain", "run-id", "env-file", "wallet-vault", "interval-ms", "setup-config", "journal", "reconcile-action", "post-id"]);
  for (let index = 0; index < args.length; index++) {
    ensure(args[index].startsWith("--"), "invalid_command_option"); const name = args[index].slice(2);
    ensure(name === "env-file" || options[name] === undefined, "duplicate_command_option");
    if (flags.has(name)) options[name] = true;
    else { ensure(values.has(name) && args[index + 1] && !args[index + 1].startsWith("--"), "invalid_command_option");
      const value = args[++index]; if (name === "env-file") (options.envFiles as string[]).push(value); else options[name] = value;
    }
  }
  if (expectedChain !== undefined) {
    ensure(options.chain === undefined || options.chain === String(expectedChain), "entrypoint_chain_mismatch");
    options.chain = String(expectedChain);
  }
  ensure(options.chain !== "1" || (!options["sepolia-rehearsal"] && !options["recycle-sepolia-funds"] && !options["wallet-vault"]), "test_wallets_are_sepolia_only");
  if (options.help) return options;
  ensure(options.chain === "1" || options.chain === "11155111", "explicit_chain_required");
  ensure(options.chain !== "1" || !options.execute || options["allow-mainnet"], "mainnet_requires_allow_mainnet");
  ensure(!options["wallet-vault"] || options["sepolia-rehearsal"], "wallet_vault_requires_sepolia_rehearsal");
  ensure(!options["recycle-sepolia-funds"] || options["sepolia-rehearsal"], "recycling_requires_sepolia_rehearsal");
  ensure(options["setup-registries"] ? options["setup-config"] && options.journal && !options["run-id"] && !options["reconcile-action"] : typeof options["run-id"] === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options["run-id"]), "run_id_or_setup_configuration_required");
  ensure(Boolean(options["reconcile-action"]) === Boolean(options["post-id"]), "reconciliation_needs_action_and_post_id");
  if (options["reconcile-action"]) ensure(options.execute, "reconciliation_requires_execute");
  const interval = Number(options["interval-ms"] ?? 3000);
  ensure(Number.isInteger(interval) && interval >= 1000 && interval <= 30000, "interval_must_be_1000_to_30000_ms");
  return options;
}

export async function readPrivateFile(path: string, optional = false) {
  let handle;
  try { handle = await open(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("private_file_unavailable"); }
  try {
    const stat = await handle.stat();
    ensure(stat.isFile() && !(stat.mode & 0o077) && stat.size <= 8_388_608 && (!process.getuid || stat.uid === process.getuid()), "private_file_requires_owned_regular_file_mode_600");
    return await handle.readFile("utf8");
  } finally { await handle.close(); }
}
export async function writePrivateFile(path: string, value: string) {
  const file = resolve(path), directory = dirname(file); await mkdir(directory, { recursive: true, mode: 0o700 });
  await readPrivateFile(file, true); // Refuse symlinks or an existing insecure file.
  const temporary = `${file}.${randomUUID()}.tmp`, handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temporary, file); } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  const dir = await open(directory, constants.O_RDONLY); try { await dir.sync(); } finally { await dir.close(); }
}
export async function loadPrivateEnvironment(paths: string[]) {
  for (const path of paths) Object.assign(process.env, parseEnv((await readPrivateFile(path))!));
}

export function connectionConfig(chainId: 1 | 11155111, execute: boolean, env: NodeJS.ProcessEnv = process.env) {
  ensure(env.MANEKINEKO_CHAIN_ID === String(chainId), "environment_chain_must_match_command");
  const databaseUrl = env[`SEASON_RUNNER_DATABASE_URL_${chainId}`] ?? "", rpcUrl = env[`SEASON_RUNNER_RPC_URL_${chainId}`] ?? (chainId === 11155111 ? env.SEPOLIA_RPC_URL ?? "" : "");
  let db: URL, rpc: URL; try { db = new URL(databaseUrl); rpc = new URL(rpcUrl); } catch { throw new Error("worker_database_and_rpc_urls_required"); }
  ensure(["postgres:", "postgresql:"].includes(db.protocol) && !/(^|[.-])(?:pooler|pgbouncer)([.-]|$)/i.test(db.hostname), "worker_needs_direct_postgres_session_connection");
  ensure(rpc.protocol === "https:" || ["127.0.0.1", "localhost"].includes(rpc.hostname) && rpc.protocol === "http:", "rpc_must_be_https_or_localhost");
  if (chainId === 1) ensure(!env.STAGING_DATABASE_EXPECTED_HOST && env.SEPOLIA_RPC_URL !== rpcUrl, "mainnet_must_use_separate_production_environment");
  const privateKey = env[`SEASON_RUNNER_PRIVATE_KEY_${chainId}`] ?? (chainId === 11155111 ? env.DEPLOYER_PRIVATE_KEY : undefined);
  ensure(!execute || privateKey && /^0x[0-9a-f]{64}$/i.test(privateKey), "explicit_operator_private_key_required");
  const maxFeePerGasWei = env[`SEASON_RUNNER_MAX_FEE_PER_GAS_WEI_${chainId}`] ?? "", maxTotalSpendWei = env[`SEASON_RUNNER_MAX_TOTAL_SPEND_WEI_${chainId}`] ?? "";
  ensure(/^[1-9]\d*$/.test(maxFeePerGasWei) && /^[1-9]\d*$/.test(maxTotalSpendWei), "explicit_positive_fee_and_spending_caps_required");
  const confirmations = Number(env[`SEASON_RUNNER_CONFIRMATIONS_${chainId}`] ?? (chainId === 1 ? 12 : 2));
  ensure(Number.isInteger(confirmations) && confirmations >= (chainId === 1 ? 12 : 2) && confirmations <= 256, "confirmation_depth_below_network_minimum");
  return { databaseUrl, rpcUrl, privateKey, maxFeePerGasWei, maxTotalSpendWei, confirmations };
}
export function registryPins(chainId: 1 | 11155111, env: NodeJS.ProcessEnv = process.env, version: SeasonContractVersion = "affiliate-v9") {
  const policy = seasonVersionPolicy(version);
  const pin = (prefix: string) => {
    const address = env[`${prefix}_ADDRESS_${chainId}`], codeHash = env[`${prefix}_CODEHASH_${chainId}`];
    ensure(address && codeHash && /^0x[0-9a-f]{64}$/i.test(codeHash), `${policy.componentVersion.toLowerCase()}_registry_address_and_codehash_required`);
    return { address: getAddress(address), codeHash: codeHash.toLowerCase() };
  };
  return { eligibility: pin(policy.eligibilityPin), credits: pin(policy.creditsPin) };
}
