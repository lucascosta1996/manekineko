import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile), root = fileURLToPath(new URL("../../", import.meta.url));
const run = "10000000-0000-4000-8000-000000000001";
const cli = (name: string, args: string[], imports: string[] = []) => exec(process.execPath,
  ["--import", "tsx", ...imports.flatMap(path => ["--import", path]), "--", `scripts/season-runner/${name}.ts`, ...args],
  { cwd: root, env: { PATH: process.env.PATH }, timeout: 30000 });

test("network entry points are pinned and reject rehearsal misuse before loading private files", async () => {
  const cases = [
    ["mainnet", ["--sepolia-rehearsal"], "test_wallets_are_sepolia_only"],
    ["mainnet", ["--wallet-vault", "/must-not-create"], "test_wallets_are_sepolia_only"],
    ["mainnet", ["--recycle-sepolia-funds"], "test_wallets_are_sepolia_only"],
    ["mainnet", ["--chain", "11155111"], "entrypoint_chain_mismatch"],
    ["sepolia", ["--chain", "1"], "entrypoint_chain_mismatch"],
    ["cli", ["--chain", "1", "--sepolia-rehearsal"], "test_wallets_are_sepolia_only"],
    ["mainnet", ["--execute"], "mainnet_requires_allow_mainnet"],
  ] as const;
  await Promise.all(cases.map(async ([entry, args, reason]) => {
    await assert.rejects(cli(entry, ["--run-id", run, "--env-file", "/must-not-read", ...args]), (error: unknown) => {
      const result = error as { code: number; stdout: string };
      assert.equal(result.code, 1);
      assert.equal(JSON.parse(result.stdout).reason, reason);
      return true;
    });
  }));
});

test("Mainnet entry point does not load the test-wallet module; each command has network-specific help", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tincta-cli-")), hook = join(directory, "no-rehearsal.mjs");
  try {
    await writeFile(hook, `import { registerHooks } from "node:module";
registerHooks({ resolve(url, context, next) {
  if (url.includes("sepolia-wallets.ts")) throw new Error("Mainnet loaded rehearsal code");
  return next(url, context);
} });`);
    const mainnet = await cli("mainnet", ["--help"], [hook]);
    assert.match(mainnet.stdout, /Mainnet season worker/);
    assert.doesNotMatch(mainnet.stdout, /--sepolia-rehearsal|--wallet-vault|--recycle-sepolia-funds/);
    const sepolia = await cli("sepolia", ["--help"]);
    assert.match(sepolia.stdout, /Sepolia season worker/);
    assert.match(sepolia.stdout, /--sepolia-rehearsal/);
    assert.doesNotMatch(sepolia.stdout, /--allow-mainnet/);
    // The compatibility command dispatches to the same pinned entry point.
    await assert.rejects(cli("cli", ["--chain", "1", "--run-id", run, "--env-file", "/must-not-read"], [hook]),
      (error: unknown) => {
        assert.equal(JSON.parse((error as { stdout: string }).stdout).reason, "private_file_unavailable");
        return true;
      });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
