import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, stat, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Wallet, Transaction } from "ethers";
import { FUNDING_POLICY, parseFundingArguments, validateWalletManifest, validateFundingTransaction,
  validateFundingJournal, previewFunding, distributeFunding, fundingFileStore, withFundingLock, fundingErrorMessage } from "./fund-staging-wallets.mjs";

// An isolated, published fixture key: never reads the real staging wallet file.
const signer = new Wallet(`0x${"11".repeat(32)}`);
const policy = { ...FUNDING_POLICY, deployer: signer.address };
const HASH = `0x${"a".repeat(64)}`;
const FUNDING_BLOCK = `0x${"b".repeat(64)}`;
const PAYMENT_BLOCK = `0x${"c".repeat(64)}`;
const q = n => `0x${BigInt(n).toString(16)}`;
const clone = value => structuredClone(value);
function fixture() {
  const balances = new Map([[policy.deployer.toLowerCase(), 500_000_000_000_000_000n]]);
  const transactions = new Map(), receipts = new Map(), codes = new Map(), calls = [];
  let journal = null, signerLoads = 0, chain = 11155111n, nonce = 0n, priority = 1_000_000n, ambiguous = false, hidden = false, missingConfirmed = false;
  const deposit = { hash: HASH, from: policy.source, to: policy.deployer, value: q(500_000_000_000_000_000n), chainId: q(11155111), input: "0x", blockHash: FUNDING_BLOCK, blockNumber: q(900) };
  const depositReceipt = { transactionHash: HASH, from: policy.source, to: policy.deployer, status: "0x1", blockHash: FUNDING_BLOCK, blockNumber: q(900) };
  const rpc = async (method, params = []) => {
    calls.push({ method, params });
    if (method === "eth_chainId") return q(chain);
    if (method === "eth_getBlockByNumber") return { number: params[0] === "latest" ? q(1000) : params[0], hash: params[0] === q(900) ? FUNDING_BLOCK : PAYMENT_BLOCK, timestamp: q(Math.floor(Date.now() / 1000)), baseFeePerGas: q(1_000_000_000n) };
    if (method === "eth_getBalance") return q(balances.get(params[0].toLowerCase()) ?? 0n);
    if (method === "eth_getCode") return codes.get(params[0].toLowerCase()) ?? "0x";
    if (method === "eth_getTransactionCount") return q(params[0].toLowerCase() === policy.deployer.toLowerCase() ? nonce : 0n);
    if (method === "eth_getTransactionByHash") return params[0] === HASH ? deposit : hidden ? null : transactions.get(params[0]) ?? null;
    if (method === "eth_getTransactionReceipt") return params[0] === HASH ? depositReceipt : hidden || missingConfirmed ? null : receipts.get(params[0]) ?? null;
    if (method === "eth_maxPriorityFeePerGas") return q(priority);
    if (method === "eth_estimateGas") return q(21000);
    if (method === "eth_sendRawTransaction") {
      const tx = Transaction.from(params[0]);
      assert.ok(journal.entries.some(entry => entry.hash === tx.hash && entry.rawTransaction === params[0]), "signed bytes must be durable before broadcast");
      if (!transactions.has(tx.hash)) {
        assert.equal(tx.nonce, Number(nonce)); nonce++;
        balances.set(policy.deployer.toLowerCase(), balances.get(policy.deployer.toLowerCase()) - tx.value - tx.gasLimit * 1_000_000_000n);
        balances.set(tx.to.toLowerCase(), (balances.get(tx.to.toLowerCase()) ?? 0n) + tx.value);
        transactions.set(tx.hash, { hash: tx.hash, from: tx.from, to: tx.to, value: q(tx.value), nonce: q(tx.nonce), input: "0x" });
        receipts.set(tx.hash, { transactionHash: tx.hash, from: tx.from, to: tx.to, status: "0x1", blockNumber: q(999), blockHash: PAYMENT_BLOCK, gasUsed: q(21000), effectiveGasPrice: q(1_000_000_000n) });
      }
      if (ambiguous) { ambiguous = false; throw new Error("SECRET: RPC token and raw payload"); }
      return tx.hash;
    }
    assert.fail(`Unexpected RPC ${method}`);
  };
  const store = { load: async () => clone(journal), save: async value => { journal = clone(value); } };
  return { rpc, store, policy, fundingTx: HASH, wait: async () => {},
    loadSigner: async () => { signerLoads++; return signer; }, balances, codes, calls, deposit, depositReceipt, transactions, receipts,
    get journal() { return journal; }, get signerLoads() { return signerLoads; },
    set chain(value) { chain = value; }, set nonce(value) { nonce = value; }, set priority(value) { priority = value; },
    set ambiguous(value) { ambiguous = value; }, set hidden(value) { hidden = value; }, set missingConfirmed(value) { missingConfirmed = value; },
  };
}

test("CLI defaults to preview and only accepts explicit send plus a funding hash", () => {
  assert.deepEqual(parseFundingArguments([]), { send: false, fundingTx: undefined });
  assert.deepEqual(parseFundingArguments(["--send", "--funding-tx", HASH]), { send: true, fundingTx: HASH });
  for (const args of [["--send"], ["--send", "--send", "--funding-tx", HASH], ["--amount", "1"], ["--funding-tx", "secret"]]) assert.throws(() => parseFundingArguments(args));
  assert.equal(FUNDING_POLICY.source, "0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145");
  assert.equal(FUNDING_POLICY.deployer, "0x3b2571129c05bD71B6504596aB2ca52B3ffB7223");
});

test("public manifest must match all pinned role/address pairs exactly", () => {
  const manifest = { chainId: 11155111, wallets: [{ role: "DEPLOYER", address: policy.deployer }, { role: "ENROLLMENT", address: policy.enrollment }, ...policy.recipients] };
  validateWalletManifest(manifest, policy);
  for (const changed of [{ ...manifest, chainId: 1 }, { ...manifest, wallets: [...manifest.wallets, manifest.wallets[0]] }, { ...manifest, wallets: manifest.wallets.slice(1) }]) assert.throws(() => validateWalletManifest(changed, policy));
});

test("preview reads no signing key, signs nothing, and performs no writes", async () => {
  const mock = fixture();
  const result = await previewFunding(mock);
  assert.equal(result.mode, "preview"); assert.equal(result.recipients.length, 5);
  assert.equal(mock.signerLoads, 0); assert.equal(mock.journal, null);
  assert.equal(mock.calls.some(call => call.method === "eth_sendRawTransaction"), false);
});

test("wrong network stops before funding, balance, and signing operations", async () => {
  const mock = fixture(); mock.chain = 1n;
  await assert.rejects(() => distributeFunding(mock), /Wrong network/);
  assert.equal(mock.calls.length, 1); assert.equal(mock.signerLoads, 0); assert.equal(mock.journal, null);
});

for (const [label, change] of [
  ["sender", mock => { mock.deposit.from = policy.recipients[0].address; }],
  ["recipient", mock => { mock.deposit.to = policy.recipients[0].address; }],
  ["amount", mock => { mock.deposit.value = q(499_000_000_000_000_000n); }],
  ["chain", mock => { mock.deposit.chainId = "0x1"; }],
  ["calldata", mock => { mock.deposit.input = "0x1234"; }],
  ["receipt status", mock => { mock.depositReceipt.status = "0x0"; }],
  ["receipt block", mock => { mock.depositReceipt.blockHash = HASH; }],
]) test(`rejects incorrect funding ${label} before reading a signing key`, async () => {
  const mock = fixture(); change(mock);
  await assert.rejects(() => distributeFunding(mock));
  assert.equal(mock.signerLoads, 0); assert.equal(mock.journal, null);
});

test("source funding requires two confirmations", () => {
  const mock = fixture();
  assert.throws(() => validateFundingTransaction(mock.deposit, mock.depositReceipt, 900n, HASH, policy), /two confirmations/);
});

for (const address of [policy.deployer, policy.enrollment, policy.recipients[0].address]) test("rejects contract or delegated code on a pinned wallet", async () => {
  const mock = fixture(); mock.codes.set(address.toLowerCase(), "0xef0100abcdef");
  await assert.rejects(() => distributeFunding(mock), /EOA/);
  assert.equal(mock.signerLoads, 0); assert.equal(mock.transactions.size, 0);
});

test("rejects a new distribution when a recipient already has money", async () => {
  const mock = fixture(); mock.balances.set(policy.recipients[0].address.toLowerCase(), 1n);
  await assert.rejects(() => distributeFunding(mock), /already funded/);
  assert.equal(mock.signerLoads, 0);
});

test("requires an unfunded enrollment signer", async () => {
  const mock = fixture(); mock.balances.set(policy.enrollment.toLowerCase(), 1n);
  await assert.rejects(() => distributeFunding(mock), /Enrollment signer/);
  assert.equal(mock.signerLoads, 0);
});

test("preserves the reserve including all remaining gas at the 5gwei ceiling", async () => {
  const mock = fixture(); mock.balances.set(policy.deployer.toLowerCase(), 493_524_999_999_999_999n);
  await assert.rejects(() => distributeFunding(mock), /preserve 0.393 ETH/);
  assert.equal(mock.signerLoads, 0); assert.equal(mock.transactions.size, 0);
});

test("rejects fees above 5gwei before loading a signing key", async () => {
  const mock = fixture(); mock.priority = 3_000_000_001n;
  await assert.rejects(() => distributeFunding(mock), /5 gwei ceiling/);
  assert.equal(mock.signerLoads, 0);
});

test("rejects a signing key for another address", async () => {
  const mock = fixture(); mock.loadSigner = async () => new Wallet(`0x${"22".repeat(32)}`);
  await assert.rejects(() => distributeFunding(mock), /key does not match/);
  assert.equal(mock.transactions.size, 0);
});

test("five payments persist signed bytes before broadcast and completed reruns never pay again", async () => {
  const mock = fixture();
  const result = await distributeFunding(mock);
  assert.equal(result.state, "complete"); assert.equal(mock.transactions.size, 5);
  assert.equal(mock.signerLoads, 1); assert.equal(mock.journal.state, "complete");
  for (const recipient of policy.recipients) assert.equal(mock.balances.get(recipient.address.toLowerCase()), 20_000_000_000_000_000n);
  assert.equal(result.deployerBalanceEth, "0.399895");
  const sent = mock.calls.filter(call => call.method === "eth_sendRawTransaction").length;
  await distributeFunding(mock);
  assert.equal(mock.calls.filter(call => call.method === "eth_sendRawTransaction").length, sent);
  assert.equal(mock.signerLoads, 1);
  assert.equal(JSON.stringify(result).includes("rawTransaction"), false);
});

test("uncertain accepted submissions reconcile the original hash without duplicate payment", async () => {
  const mock = fixture(); mock.ambiguous = true;
  await assert.rejects(() => distributeFunding(mock), error => {
    assert.equal(fundingErrorMessage(error).includes("SECRET"), false); return true;
  });
  assert.equal(mock.journal.entries[0].state, "prepared");
  const firstRaw = mock.journal.entries[0].rawTransaction;
  await distributeFunding(mock);
  assert.equal(mock.transactions.size, 5);
  assert.equal(mock.calls.filter(call => call.method === "eth_sendRawTransaction" && call.params[0] === firstRaw).length, 1);
});

test("failed submission before acceptance reuses identical signed bytes on resume", async () => {
  const mock = fixture(); const realRpc = mock.rpc;
  mock.rpc = async (method, params) => { if (method === "eth_sendRawTransaction") throw new Error("SECRET token"); return realRpc(method, params); };
  await assert.rejects(() => distributeFunding(mock));
  const raw = mock.journal.entries[0].rawTransaction;
  mock.rpc = realRpc;
  await distributeFunding(mock);
  assert.equal(mock.calls.find(call => call.method === "eth_sendRawTransaction").params[0], raw);
  assert.equal(mock.transactions.size, 5);
});

test("nonce consumption without the original hash stops instead of signing a duplicate", async () => {
  const mock = fixture(); mock.ambiguous = true;
  await assert.rejects(() => distributeFunding(mock));
  mock.hidden = true;
  await assert.rejects(() => distributeFunding(mock), /nonce may be in use/);
  assert.equal(mock.transactions.size, 1);
});

test("tampered signed journal or a different source deposit is rejected", async () => {
  const mock = fixture(); await distributeFunding(mock);
  const broken = clone(mock.journal); broken.entries[0].hash = HASH;
  assert.throws(() => validateFundingJournal(broken, HASH, policy), /Signed transaction/);
  assert.throws(() => validateFundingJournal(mock.journal, PAYMENT_BLOCK, policy), /Existing funding journal/);
});

test("missing previously confirmed receipt never triggers another transfer", async () => {
  const mock = fixture(); await distributeFunding(mock); mock.missingConfirmed = true;
  await assert.rejects(() => distributeFunding(mock), /previously confirmed payment is missing/);
  assert.equal(mock.transactions.size, 5);
});

test("file journal is private and atomic, locks exclude concurrent writers, and cleanup runs on failure", async () => {
  const path = await mkdtemp(join(tmpdir(), "manekineko-funding-test-"));
  const directory = pathToFileURL(path + "/");
  try {
    const store = await fundingFileStore(directory);
    assert.equal(await store.load(), null);
    await store.save({ example: 1 });
    assert.deepEqual(await store.load(), { example: 1 });
    assert.equal((await stat(join(path, "staging-wallet-funding.json"))).mode & 0o777, 0o600);
    await assert.rejects(() => withFundingLock(directory, async () => {
      await assert.rejects(() => withFundingLock(directory, async () => {}), /lock already exists/);
      throw new Error("intentional test exception");
    }), /intentional/);
    await withFundingLock(directory, async () => {});
    await chmod(join(path, "staging-wallet-funding.json"), 0o644);
    await assert.rejects(() => store.save({ example: 2 }), /private regular files/);
    assert.deepEqual(JSON.parse(await readFile(join(path, "staging-wallet-funding.json"), "utf8")), { example: 1 });
  } finally { await rm(path, { recursive: true, force: true }); }
});

test("unexpected diagnostics never reveal secrets through the CLI error formatter", () => {
  assert.equal(fundingErrorMessage(new Error("secret RPC URL, private key, signed tx")).includes("secret RPC URL"), false);
});
