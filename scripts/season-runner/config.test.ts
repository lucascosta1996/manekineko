import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, chmod, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArguments, connectionConfig, readPrivateFile, writePrivateFile } from "./config.ts";
import { donorWallets } from "./sepolia-wallets.ts";

const run = "10000000-0000-4000-8000-000000000001";
test("dedicated commands pin their chain while preserving read-only defaults", () => {
  for (const chain of [1, 11155111] as const) {
    const args = parseArguments(["--run-id", run], chain);
    assert.equal(args.chain, String(chain));
    assert.equal(args.execute, undefined);
    assert.equal(args["sepolia-rehearsal"], undefined);
    assert.equal(parseArguments(["--chain", String(chain), "--run-id", run], chain).chain, String(chain));
    assert.throws(() => parseArguments(["--chain", String(chain === 1 ? 11155111 : 1), "--help"], chain), /entrypoint_chain_mismatch/);
  }
  assert.equal(parseArguments(["--run-id", run, "--execute", "--sepolia-rehearsal"], 11155111)["sepolia-rehearsal"], true);
  assert.throws(() => parseArguments(["--run-id", run, "--wallet-vault", "vault.enc"], 11155111), /wallet_vault_requires_sepolia_rehearsal/);
});
test("network and explicit spending guards cannot be bypassed with contradictory CLI flags", () => {
  assert.equal(parseArguments(["--chain", "11155111", "--run-id", run]).execute, undefined);
  assert.throws(() => parseArguments(["--chain", "1", "--run-id", run, "--execute"]), /mainnet/);
  assert.throws(() => parseArguments(["--chain", "1", "--run-id", run, "--sepolia-rehearsal"]), /sepolia_only/);
  assert.throws(() => parseArguments(["--chain", "11155111", "--run-id", run, "--recycle-sepolia-funds"]), /recycling/);
  assert.throws(() => parseArguments(["--chain", "11155111", "--run-id", run, "--execute", "--execute"]), /duplicate/);
  assert.throws(() => parseArguments(["--chain", "11155111", "--run-id", run, "--reconcile-action", "post"]), /reconciliation/);
  assert.equal(parseArguments(["--chain", "1", "--run-id", run, "--execute", "--allow-mainnet"]).execute, true);
});
test("Mainnet never inherits staging RPC, deployer credentials or weak confirmation settings", () => {
  const env = { MANEKINEKO_CHAIN_ID: "1", SEASON_RUNNER_DATABASE_URL_1: "postgres://worker@db.tincta.art/prod", SEASON_RUNNER_RPC_URL_1: "https://rpc.tincta.art", SEASON_RUNNER_MAX_FEE_PER_GAS_WEI_1: "1", SEASON_RUNNER_MAX_TOTAL_SPEND_WEI_1: "1", DEPLOYER_PRIVATE_KEY: `0x${"12".repeat(32)}` };
  assert.throws(() => connectionConfig(1, true, env), /private_key/);
  assert.equal(connectionConfig(1, false, env).privateKey, undefined);
  assert.throws(() => connectionConfig(1, false, { ...env, STAGING_DATABASE_EXPECTED_HOST: "staging" }), /separate_production/);
  assert.throws(() => connectionConfig(1, false, { ...env, SEASON_RUNNER_CONFIRMATIONS_1: "2" }), /confirmation/);
  assert.throws(() => connectionConfig(1, false, { ...env, SEASON_RUNNER_DATABASE_URL_1: "postgres://worker@db-pooler.tincta.art/prod" }), /direct_postgres/);
  assert.throws(() => connectionConfig(1, false, { ...env, SEASON_RUNNER_DATABASE_URL_1: "postgres://worker@aws-0-us-east-1.pooler.supabase.com:6543/prod" }), /direct_postgres/);
  assert.throws(() => connectionConfig(1, false, { ...env, SEASON_RUNNER_DATABASE_URL_1: "postgres://worker@pgbouncer.tincta.art/prod" }), /direct_postgres/);
  assert.deepEqual(donorWallets({ DEPLOYER_PRIVATE_KEY: env.DEPLOYER_PRIVATE_KEY, BUYER_A_PRIVATE_KEY: env.DEPLOYER_PRIVATE_KEY }), []);
  assert.throws(() => donorWallets({ SEASON_RUNNER_SEPOLIA_DONOR_KEY_NAMES: "DEPLOYER_PRIVATE_KEY", DEPLOYER_PRIVATE_KEY: env.DEPLOYER_PRIVATE_KEY }), /donor_key_names/);
});
test("private journal files are atomic, owned mode600 and reject symlinks or permissive files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tincta-private-")), path = join(root, "journal.enc");
  try {
    await writePrivateFile(path, "encrypted-one"); await writePrivateFile(path, "encrypted-two");
    assert.equal(await readPrivateFile(path), "encrypted-two");
    await symlink(path, join(root, "link")); await assert.rejects(() => readPrivateFile(join(root, "link")));
    await chmod(path, 0o644); await assert.rejects(() => writePrivateFile(path, "bad"), /mode_600/);
    assert.equal(await readFile(path, "utf8"), "encrypted-two");
  } finally { await rm(root, { recursive: true, force: true }); }
});
