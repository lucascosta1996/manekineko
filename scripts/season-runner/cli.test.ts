import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile), root = fileURLToPath(new URL("../../", import.meta.url));
const run = "10000000-0000-4000-8000-000000000001";
const cli = (name: string, args: string[], imports: string[] = [], cwd = root) => exec(process.execPath,
  ["--import", import.meta.resolve("tsx"), ...imports.flatMap(path => ["--import", path]), "--", join(root, `scripts/season-runner/${name}.ts`), ...args],
  { cwd, env: { PATH: process.env.PATH }, timeout: 30000 });

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

test("requested log opens before private configuration and captures a safe failure without changing stdout", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tincta-cli-log-")), log = join(directory, "worker.log");
  try {
    const arguments_ = ["--run-id", run, "--env-file", "/must-not-read", "--log-file", log, "--execute"];
    await writeFile(log, "existing\n", { mode: 0o644 });
    await assert.rejects(cli("sepolia", arguments_), (error: unknown) => {
      assert.equal(JSON.parse((error as { stdout: string }).stdout).reason, "log_file_requires_owned_regular_file_mode_600");
      return true;
    });
    assert.equal(await readFile(log, "utf8"), "existing\n");
    await rm(log);
    await assert.rejects(cli("sepolia", arguments_), (error: unknown) => {
      assert.equal(JSON.parse((error as { stdout: string }).stdout).reason, "private_file_unavailable");
      return true;
    });
    const records = (await readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(records.map(record => record.mode), ["worker_started", "stopped", "worker_stopped"]);
    assert.equal(records[0].execute, true); assert.equal(records[2].exitCode, 1);
    assert.ok(records.every(record => record.chainId === 11155111 && record.runId === run && record.timestamp.endsWith("Z")));
    assert.doesNotMatch(await readFile(log, "utf8"), /must-not-read|env-file/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("log file cannot overwrite private configuration or recovery files, including parent aliases and the default vault", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tincta-cli-log-private-"));
  try {
    const privateDirectory = join(directory, "private"); await mkdir(privateDirectory, { mode: 0o700 });
    await symlink(privateDirectory, join(directory, "alias"));
    await mkdir(join(directory, ".private", "season-runner"), { recursive: true, mode: 0o700 });
    const fixtures = [
      { target: "private/worker.env", args: ["--run-id", run, "--env-file", "private/worker.env"] },
      { target: "private/wallets.enc", args: ["--run-id", run, "--sepolia-rehearsal", "--wallet-vault", "private/wallets.enc"] },
      { target: ".private/season-runner/sepolia-wallets.enc", args: ["--run-id", run, "--sepolia-rehearsal"] },
      { target: "private/setup.json", args: ["--setup-registries", "--setup-config", "private/setup.json", "--journal", "private/setup.enc"] },
      { target: "private/setup.enc", args: ["--setup-registries", "--setup-config", "private/setup.json", "--journal", "private/setup.enc"] },
    ];
    for (const fixture of fixtures) {
      const file = join(directory, fixture.target), content = `PRIVATE_RECOVERY_DATA=${fixture.target}\n`;
      await writeFile(file, content, { mode: 0o600 });
      const aliases = [fixture.target, fixture.target.startsWith("private/") ? fixture.target.replace("private/", "alias/") : fixture.target];
      for (const log of new Set(aliases)) {
        await assert.rejects(cli("sepolia", [...fixture.args, "--log-file", log, "--execute"], [], directory), (error: unknown) => {
          assert.equal(JSON.parse((error as { stdout: string }).stdout).reason, "log_file_must_be_separate_from_private_files");
          return true;
        });
        assert.equal(await readFile(file, "utf8"), content);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
