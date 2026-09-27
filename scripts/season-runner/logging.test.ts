import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, chmod, symlink, link, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertLogPathSeparate, openWorkerLog, publicLogReport } from "./logging.ts";

const runId = "10000000-0000-4000-8000-000000000001";
test("diagnostic logs append flushed UTC records across sessions with fixed run and chain identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "tincta-log-")), path = join(root, "private", "run.log");
  try {
    const first = openWorkerLog(path, { chainId: 11155111, runId });
    first.write({ mode: "pending", action: "deploy", chainId: 1, runId: "wrong" });
    const records = (await readFile(path, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    first.close();
    assert.equal(records[0].chainId, 11155111); assert.equal(records[0].runId, runId);
    assert.equal(records[0].logVersion, 1); assert.equal(records[0].action, "deploy");
    assert.equal(new Date(records[0].timestamp).toISOString(), records[0].timestamp);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await stat(join(root, "private"))).mode & 0o777, 0o700);
    const second = openWorkerLog(path, { chainId: 11155111, runId });
    second.write({ mode: "running", deployed: 2 }); second.close();
    const appended = (await readFile(path, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.equal(appended.length, 2); assert.notEqual(appended[0].sessionId, appended[1].sessionId);
    assert.throws(() => second.write({ mode: "ignored" }), /log_file_write_failed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("diagnostic logs reject symlinks and permissive existing files without modifying them", async () => {
  const root = await mkdtemp(join(tmpdir(), "tincta-log-")), path = join(root, "run.log");
  try {
    const log = openWorkerLog(path, { chainId: 11155111 }); log.write({ mode: "preflight" }); log.close();
    const before = await readFile(path, "utf8");
    await symlink(path, join(root, "link.log"));
    assert.throws(() => openWorkerLog(join(root, "link.log"), { chainId: 11155111 }), /log_file_requires_owned_regular_file_mode_600/);
    await link(path, join(root, "hard-link.log"));
    assert.throws(() => openWorkerLog(join(root, "hard-link.log"), { chainId: 11155111 }), /log_file_requires_owned_regular_file_mode_600/);
    await rm(join(root, "hard-link.log"));
    await chmod(path, 0o644);
    assert.throws(() => openWorkerLog(path, { chainId: 11155111 }), /log_file_requires_owned_regular_file_mode_600/);
    assert.equal(await readFile(path, "utf8"), before);
    assert.throws(() => openWorkerLog(root, { chainId: 11155111 }), /log_file_requires_owned_regular_file_mode_600/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("log path guard resolves aliases through parent symlinks even before a vault exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "tincta-log-alias-"));
  try {
    await symlink(root, join(root, "alias"));
    const path = join(root, "future", "wallets.enc"), alias = join(root, "alias", "future", "wallets.enc");
    assert.throws(() => assertLogPathSeparate(alias, [path]), /log_file_must_be_separate_from_private_files/);
    assertLogPathSeparate(join(root, "alias", "future", "run.log"), [path]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("existing private or truncated content and logs from another run remain untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "tincta-log-content-")), path = join(root, "run.log");
  try {
    for (const content of ["PRIVATE_KEY=do-not-change\n", '{"encrypted":"do-not-change"}\n', "encrypted-vault-with-no-newline"]) {
      await writeFile(path, content, { mode: 0o600 });
      assert.throws(() => openWorkerLog(path, { chainId: 11155111, runId }), /log_file_contains_unrecognized_content_or_different_run/);
      assert.equal(await readFile(path, "utf8"), content);
    }
    await rm(path);
    const log = openWorkerLog(path, { chainId: 11155111, runId }); log.write({ mode: "worker_started" }); log.close();
    const content = await readFile(path, "utf8");
    assert.throws(() => openWorkerLog(path, { chainId: 11155111, runId: "10000000-0000-4000-8000-000000000002" }), /different_run/);
    assert.equal(await readFile(path, "utf8"), content);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("diagnostic serialization excludes private paths, raw errors, keys, signed bytes and unreviewed nested fields", () => {
  const address = `0x${"12".repeat(20)}`, codeHash = `0x${"34".repeat(32)}`;
  const safe = publicLogReport({ mode: "ready", vault: "/private/wallet-vault", privateKey: "secret", rawTransaction: "signed",
    credentials: { token: "secret" }, error: new Error("https://secret:password@rpc.example"), state: { journal: "signed" },
    eligibility: { address, codeHash, privateKey: "secret" }, credits: { address: "private", codeHash }, unknown: "secret" });
  assert.deepEqual(safe, { mode: "ready", eligibility: { address, codeHash } });
  assert.deepEqual(publicLogReport(new Error("raw dependency error")), {});
});
