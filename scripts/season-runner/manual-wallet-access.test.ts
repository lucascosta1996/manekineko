import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Wallet } from "ethers";
import { exportManualWallet, manualRoleAddress, parseManualAccessArguments } from "./manual-wallet-access.ts";
import type { ManualRehearsalReservation } from "./sepolia-wallets.ts";

test("selected role access rejects Mainnet, unselected winners and entire-vault requests", async () => {
  assert.throws(() => parseManualAccessArguments(["--chain", "1", "--env-file", "/private/unused"]), /sepolia_only/);
  assert.throws(() => manualRoleAddress(1, {} as never, "winner"), /sepolia_only/);
  assert.throws(() => manualRoleAddress(11155111, {} as never, "winner"), /not_yet_reserved/);
  assert.throws(() => parseManualAccessArguments(["--chain", "11155111", "--run-id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "--round", `0x${"1".repeat(40)}`, "--role", "all"]), /requires_run_round_and_role/);
});

test("one reserved account exports encrypted at 0600, refuses overwrite and insecure destination", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tincta-role-export-")), wallets = [new Wallet(Wallet.createRandom().privateKey), new Wallet(Wallet.createRandom().privateKey)];
  const reservation: ManualRehearsalReservation = { collectionId: "collection", affiliate: wallets[0].address, buyer: wallets[1].address, startBlock: 1, checkpoint: "awaiting-enrollment" };
  const options = { chainId: 11155111, reservation, role: "affiliate" as const, wallets, password: "test-only-long-export-password", directory, runId: "run" };
  try {
    const result = await exportManualWallet(options), body = await readFile(result.path, "utf8");
    assert.equal((await stat(result.path)).mode & 0o777, 0o600);
    assert(!body.includes(wallets[0].privateKey.slice(2))); assert(!body.includes(wallets[1].address.slice(2).toLowerCase()));
    assert.equal((await Wallet.fromEncryptedJson(body, options.password)).address, wallets[0].address);
    await assert.rejects(exportManualWallet(options), /EEXIST/);
    await chmod(directory, 0o755); await assert.rejects(exportManualWallet(options), /mode_700/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
