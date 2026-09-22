import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet, Transaction } from "ethers";
import type { Provider, TransactionReceipt } from "ethers";
import { createTransactionPipeline, ChainPendingError, type ChainJournal } from "./chain-transactions.ts";

function fixture(options: { budget?: string; ceiling?: string; chainId?: number } = {}) {
  const signer = Wallet.createRandom(), events: string[] = [];
  const journal: ChainJournal = { version: 1, chainId: options.chainId ?? 11155111, from: signer.address, maxFeePerGasWei: options.ceiling ?? "100", maxTotalSpendWei: options.budget ?? "10000000", transactions: [], collections: {} };
  let receipt: TransactionReceipt | null = null, pending = false, nonce = 4, canonicalHash = `0x${"ab".repeat(32)}`, saveFails = false, timestamp = 100;
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }), getTransactionCount: async () => nonce,
    getBlock: async (tag: unknown) => ({ number: tag === "latest" ? 101 : Number(tag), hash: canonicalHash, baseFeePerGas: 10n, timestamp }),
    getFeeData: async () => ({ maxPriorityFeePerGas: 2n }), estimateGas: async () => 21_000n, getBalance: async () => 10n ** 20n,
    getTransactionReceipt: async () => receipt, getTransaction: async () => pending ? {} : null,
    broadcastTransaction: async (raw: string) => { events.push("broadcast"); pending = true; return { hash: Transaction.from(raw).hash }; },
  } as unknown as Provider;
  const save = async () => { events.push(`save:${journal.transactions.at(-1)?.state}`); if (saveFails) throw new Error("private backend failure"); };
  const make = () => createTransactionPipeline({ provider, signer, execute: true, journal, save, confirmations: 2 });
  return { journal, signer, provider, events, make, saveFails: () => { saveFails = true; }, confirm: () => {
    const entry = journal.transactions.at(-1)!, signed = Transaction.from(entry.rawTransaction); nonce++;
    receipt = { status: 1, hash: entry.hash, from: signer.address, to: signed.to, blockNumber: 100, blockHash: canonicalHash, gasUsed: 21_000n, gasPrice: 12n } as TransactionReceipt;
  }, reorg: () => { canonicalHash = `0x${"cd".repeat(32)}`; }, setNonce: (value: number) => { nonce = value; }, setTime: (value: number) => { timestamp = value; }, forgetPending: () => { pending = false; } };
}
const target = `0x${"12".repeat(20)}`;
test("persists signed intent before broadcast and crash resume reconciles its exact hash once", async () => {
  const f = fixture();
  await assert.rejects(f.make().send("deploy", { to: target, value: 1n }), ChainPendingError);
  assert.deepEqual(f.events, ["save:prepared", "broadcast", "save:submitted"]);
  const original = f.journal.transactions[0].rawTransaction;
  await assert.rejects(f.make().send("deploy", { to: target, value: 1n }), ChainPendingError);
  assert.equal(f.events.filter(event => event === "broadcast").length, 1);
  f.confirm(); await f.make().send("deploy", { to: target, value: 1n });
  assert.equal(f.journal.transactions[0].state, "confirmed"); assert.equal(f.journal.transactions[0].rawTransaction, original);
  await assert.rejects(f.make().send("deploy", { to: target, value: 2n }), /intent|requested deployment/);
});
test("failed durable write prevents broadcasting even if caller retries the same in-memory instance", async () => {
  const f = fixture(), pipeline = f.make(); f.saveFails();
  await assert.rejects(pipeline.send("deploy", { to: target }), /save failed/);
  await assert.rejects(pipeline.send("deploy", { to: target }), /Reload/);
  assert.equal(f.events.includes("broadcast"), false);
});
test("fee and aggregate spend caps fail before signing or broadcasting", async () => {
  for (const settings of [{ ceiling: "21" }, { budget: "1000" }]) {
    const f = fixture(settings); await assert.rejects(f.make().send("deploy", { to: target }), /ceiling|spending cap/);
    assert.equal(f.journal.transactions.length, 0); assert.deepEqual(f.events, []);
  }
});
test("a changed canonical receipt and outside nonce consumption block new writes", async () => {
  const f = fixture(); await assert.rejects(f.make().send("first", { to: target }), ChainPendingError); f.confirm();
  await f.make().send("first", { to: target }); f.reorg();
  await assert.rejects(f.make().send("second", { to: target }), /canonical/);
  assert.equal(f.journal.transactions.length, 1);
  const g = fixture(); await assert.rejects(g.make().send("first", { to: target }), ChainPendingError); g.confirm(); await g.make().send("first", { to: target }); g.setNonce(9);
  await assert.rejects(g.make().send("second", { to: target }), /nonce changed/);
});
test("wrong chains, changed spending policy and implicit execution cannot submit", async () => {
  assert.throws(() => fixture({ chainId: 31337 }).make(), /pinned chain/);
  const f = fixture(); await assert.rejects(createTransactionPipeline({ provider: f.provider, signer: f.signer, execute: false, journal: f.journal, save: async () => {}, confirmations: 2 }).send("x", { to: target }), /explicit execute/);
  f.journal.chainId = 1; await assert.rejects(f.make().send("x", { to: target }), /Provider chain/);
});

test("activation deadline survives generic crash resume while already submitted transactions can confirm late", async () => {
  const f = fixture();
  await assert.rejects(f.make().send("round:activate-sale", { to: target }, { broadcastDeadline: 160 }), ChainPendingError);
  assert.equal(f.journal.transactions[0].broadcastDeadline, 160);
  f.setTime(200); f.forgetPending();
  await assert.rejects(f.make().send("round:activate-sale", { to: target }), /broadcast window expired/);
  assert.equal(f.events.filter(event => event === "broadcast").length, 1);
  f.confirm(); await f.make().send("round:activate-sale", { to: target });
  assert.equal(f.journal.transactions[0].state, "confirmed");
  const g = fixture(); g.setTime(200);
  await assert.rejects(g.make().send("round:activate-sale", { to: target }, { broadcastDeadline: 160 }), /window expired/);
  assert.equal(g.journal.transactions.length, 0); assert.deepEqual(g.events, []);
});
