import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet, Transaction } from "ethers";
import type { Provider, TransactionReceipt } from "ethers";
import { createTransactionPipeline, ChainPendingError, type ChainJournal } from "./chain-transactions.ts";

function fixture(options: { budget?: string; ceiling?: string; chainId?: number } = {}) {
  const signer = Wallet.createRandom(), events: string[] = [];
  const journal: ChainJournal = { version: 1, chainId: options.chainId ?? 11155111, from: signer.address, maxFeePerGasWei: options.ceiling ?? "100", maxTotalSpendWei: options.budget ?? "10000000", transactions: [], collections: {} };
  let receipt: TransactionReceipt | null = null, pending = false, nonce = 4, canonicalHash = `0x${"ab".repeat(32)}`, saveFails = false, timestamp = 100, head = 101;
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }), getTransactionCount: async () => nonce,
    getBlock: async (tag: unknown) => ({ number: tag === "latest" ? head : Number(tag), hash: canonicalHash, baseFeePerGas: 10n, timestamp }),
    getFeeData: async () => ({ maxPriorityFeePerGas: 2n }), estimateGas: async () => 21_000n, getBalance: async () => 10n ** 20n,
    getTransactionReceipt: async () => receipt, getTransaction: async () => pending ? {} : null,
    broadcastTransaction: async (raw: string) => { events.push("broadcast"); pending = true; return { hash: Transaction.from(raw).hash }; },
  } as unknown as Provider;
  const save = async () => { events.push(`save:${journal.transactions.at(-1)?.state}`); if (saveFails) throw new Error("private backend failure"); };
  const make = () => createTransactionPipeline({ provider, signer, execute: true, journal, save, confirmations: 2 });
  return { journal, signer, provider, events, make, saveFails: () => { saveFails = true; }, confirm: () => {
    const entry = journal.transactions.at(-1)!, signed = Transaction.from(entry.rawTransaction); nonce++;
    receipt = { status: 1, hash: entry.hash, from: signer.address, to: signed.to, blockNumber: 100, blockHash: canonicalHash, gasUsed: 21_000n, gasPrice: 12n } as TransactionReceipt;
  }, reorg: () => { canonicalHash = `0x${"cd".repeat(32)}`; }, setNonce: (value: number) => { nonce = value; }, setHead: (value: number) => { head = value; }, setTime: (value: number) => { timestamp = value; }, forgetPending: () => { pending = false; } };
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
  await assert.rejects(pipeline.send("deploy", { to: target }), (error: Error) => {
    assert.match(error.message, /save failed/);
    assert.equal((error.cause as Error).message, "private backend failure");
    return true;
  });
  await assert.rejects(pipeline.send("deploy", { to: target }), /Reload/);
  assert.equal(f.events.includes("broadcast"), false);
});
test("fee and aggregate spend caps fail before signing or broadcasting", async () => {
  for (const settings of [{ ceiling: "21" }, { budget: "1000" }]) {
    const f = fixture(settings); await assert.rejects(f.make().send("deploy", { to: target }), /ceiling|spending cap/);
    assert.equal(f.journal.transactions.length, 0); assert.deepEqual(f.events, []);
  }
});
test("confirmation save failures preserve the cause and forbid further sends on that instance", async () => {
  const f = fixture(), pipeline = f.make();
  await assert.rejects(pipeline.send("mint", { to: target }), ChainPendingError);
  f.confirm(); f.saveFails();
  await assert.rejects(pipeline.send("mint", { to: target }), (error: Error) => {
    assert.match(error.message, /save failed/);
    assert.equal((error.cause as Error).message, "private backend failure");
    return true;
  });
  await assert.rejects(pipeline.send("mint", { to: target }), /Reload/);
  assert.equal(f.events.filter(event => event === "broadcast").length, 1);
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

test("setup completion persists the last submitted receipt even when its storage effect makes send unnecessary", async () => {
  const f = fixture();
  await assert.rejects(f.make().send("history:0:credits:register", { to: target }), ChainPendingError);
  const original = f.journal.transactions[0].rawTransaction;
  const resumed = f.make();
  await assert.rejects(resumed.confirmAll(), ChainPendingError);
  f.confirm(); f.setHead(100);
  await assert.rejects(resumed.confirmAll(), ChainPendingError);
  assert.equal(f.journal.transactions[0].state, "submitted");
  f.setHead(101); await resumed.confirmAll();
  assert.equal(f.journal.transactions[0].state, "confirmed");
  assert.equal(f.journal.transactions[0].blockNumber, 100);
  assert.equal(f.journal.transactions[0].gasUsed, "21000");
  assert.equal(f.journal.transactions[0].gasPrice, "12");
  assert.equal(f.journal.transactions[0].rawTransaction, original);
  assert.equal(f.events.filter(event => event === "broadcast").length, 1);
  assert.equal(f.events.at(-1), "save:confirmed");
  f.reorg(); await assert.rejects(resumed.confirmAll(), /canonical/);
});

test("completion fails closed when the final receipt cannot be durably saved", async () => {
  const f = fixture(); await assert.rejects(f.make().send("final-approval", { to: target }), ChainPendingError);
  f.confirm(); f.saveFails(); const resumed = f.make();
  await assert.rejects(resumed.confirmAll(), /save failed/);
  await assert.rejects(resumed.confirmAll(), /Reload/);
  assert.equal(f.events.filter(event => event === "broadcast").length, 1);
});

async function historyFixture(count = 4) {
  const signer = Wallet.createRandom(), receipts = new Map<string, TransactionReceipt>();
  const hash = (number: number) => `0x${BigInt(number + 1).toString(16).padStart(64, "0")}`;
  const journal: ChainJournal = { version: 1, chainId: 11155111, from: signer.address, maxFeePerGasWei: "100", maxTotalSpendWei: "1000000000000", transactions: [], collections: {} };
  for (let index = 0; index < count; index++) {
    const rawTransaction = await signer.signTransaction({ type: 2, chainId: 11155111, nonce: index, to: target, value: 0, gasLimit: 21000, maxFeePerGas: 22, maxPriorityFeePerGas: 2 });
    const tx = Transaction.from(rawTransaction), blockNumber = 10 + index, blockHash = hash(blockNumber);
    journal.transactions.push({ action: `history:${index}`, state: "confirmed", rawTransaction, hash: tx.hash!, nonce: index, blockNumber, blockHash, gasUsed: "21000", gasPrice: "12" });
    receipts.set(tx.hash!, { status: 1, hash: tx.hash!, from: signer.address, to: target, blockNumber, blockHash, gasUsed: 21000n, gasPrice: 12n } as TransactionReceipt);
  }
  const state = { head: 20 + count, chainId: 11155111n, receiptReads: 0, blockReads: 0, saves: 0, saveFails: false, changed: new Map<number,string>(), beforeBlock: undefined as ((tag: unknown) => void) | undefined };
  const implementation = {
    async getNetwork() { return { chainId: state.chainId }; },
    async getBlock(tag: unknown) { state.beforeBlock?.(tag); state.blockReads++; const number = tag === "latest" ? state.head : Number(tag); return { number, hash: state.changed.get(number) ?? hash(number), timestamp: number * 12, baseFeePerGas: 10n }; },
    async getTransactionReceipt(tx: string) { state.receiptReads++; return receipts.get(tx) ?? null; },
  };
  const provider = implementation as unknown as Provider;
  const make = (input = journal, rpc = provider, confirmations = 2) => createTransactionPipeline({ provider: rpc, signer, execute: true, journal: input, confirmations, save: async () => { state.saves++; if (state.saveFails) throw new Error("private persistence failure"); } });
  return { journal, receipts, state, provider, implementation, make, hash, signer };
}

test("500-receipt journal warm verification uses bounded ancestry reads and no trusted database shortcut", async () => {
  const f = await historyFixture(500);
  await f.make().confirmAll(); assert.equal(f.state.receiptReads, 500, "Saved confirmed entries must all be verified live initially");
  f.state.receiptReads = 0; f.state.blockReads = 0; f.state.head++;
  await f.make().confirmAll();
  assert.equal(f.state.receiptReads, 0);
  assert(f.state.blockReads <= 4, "Unchanged 500-entry prefix needs only old/new canonical anchors");
  assert.equal(f.state.saves, 0);
});

test("cached ancestry cannot cross providers, changed policy or a changed signed journal prefix", async () => {
  const f = await historyFixture(); await f.make().confirmAll();
  f.state.receiptReads = 0;
  await f.make(f.journal, { ...f.implementation } as unknown as Provider).confirmAll();
  assert.equal(f.state.receiptReads, 4, "Another provider must verify receipts itself");
  f.state.receiptReads = 0;
  await f.make(f.journal, f.provider, 3).confirmAll(); assert.equal(f.state.receiptReads, 4);
  f.state.receiptReads = 0;
  f.journal.transactions[0].action = "renamed-history";
  await f.make().confirmAll(); assert.equal(f.state.receiptReads, 4, "Any prefix change requires fresh receipt evidence");
  f.journal.transactions[0].rawTransaction = f.journal.transactions[1].rawTransaction;
  assert.throws(() => f.make(), /invalid transaction/);
});

test("ancestor reorgs and a regressed confirmed head invalidate cached prefixes", async () => {
  const f = await historyFixture(); await f.make().confirmAll();
  f.state.receiptReads = 0; f.state.changed.set(f.state.head - 1, f.hash(900));
  await f.make().confirmAll(); assert.equal(f.state.receiptReads, 4, "A shallow anchor reorg must recheck every receipt");
  f.state.changed.set(10, f.hash(901)); f.state.changed.set(f.state.head - 1, f.hash(902));
  await assert.rejects(f.make().confirmAll(), /canonical block/);
  const g = await historyFixture(); await g.make().confirmAll();
  g.state.receiptReads = 0; g.state.head = 10;
  await assert.rejects(g.make().confirmAll(), ChainPendingError);
  assert(g.state.receiptReads > 0, "A cached future anchor cannot approve at an older head");
});

test("anchor changes during verification and receipt gas tampering fail without caching", async () => {
  const f = await historyFixture(); let anchorReads = 0;
  f.state.beforeBlock = tag => { if (tag === f.state.head - 1 && ++anchorReads === 2) f.state.changed.set(Number(tag), f.hash(999)); };
  await assert.rejects(f.make().confirmAll(), /anchor reorganized/);
  f.state.beforeBlock = undefined; f.state.changed.clear(); f.state.receiptReads = 0;
  await f.make().confirmAll(); assert.equal(f.state.receiptReads, 4);
  f.journal.transactions[0].gasUsed = "1";
  await assert.rejects(f.make().confirmAll(), /gas accounting/);
});

test("newly confirmed receipts after the captured anchor stay outside the cached prefix", async () => {
  const g = fixture(); await assert.rejects(g.make().send("first", { to: target }), ChainPendingError); g.confirm();
  const pipeline = g.make();
  const originalGetBlock = g.provider.getBlock.bind(g.provider);
  let reads = 0;
  g.provider.getBlock = (async (tag: Parameters<Provider["getBlock"]>[0]) => { if (tag === "latest" && ++reads === 1) return { ...await originalGetBlock(tag), number: 100 }; return originalGetBlock(tag); }) as typeof g.provider.getBlock;
  await pipeline.confirmAll();
  assert.equal(g.journal.transactions[0].state, "confirmed");
  let receiptReads = 0; const originalReceipt = g.provider.getTransactionReceipt.bind(g.provider);
  g.provider.getTransactionReceipt = async hash => { receiptReads++; return originalReceipt(hash); };
  await pipeline.confirmAll(); assert.equal(receiptReads, 1, "Receipt newer than the initial anchor must be checked again");
});

test("failed durable confirmation never primes the ancestry cache", async () => {
  const f = await historyFixture(); f.journal.transactions.at(-1)!.state = "submitted"; f.state.saveFails = true;
  const pipeline = f.make(); await assert.rejects(pipeline.confirmAll(), /save failed/);
  await assert.rejects(pipeline.confirmAll(), /Reload/);
  f.state.saveFails = false; f.state.receiptReads = 0;
  await f.make().confirmAll(); assert.equal(f.state.receiptReads, 4);
});

test("same-instance signed intent, policy and mid-read mutation cannot prime or reuse a proof", async () => {
  const f = await historyFixture(), pipeline = f.make(); await pipeline.confirmAll();
  const original = f.journal.transactions[0].rawTransaction;
  const forged = await f.signer.signTransaction({ type: 2, chainId: 11155111, nonce: 0, to: target, value: 1234, gasLimit: 21000, maxFeePerGas: 22, maxPriorityFeePerGas: 2 });
  f.journal.transactions[0].rawTransaction = forged;
  await assert.rejects(pipeline.confirmAll(), /invalid transaction/);
  await assert.rejects(pipeline.send("next", { to: target }), /invalid transaction/);
  await assert.rejects(pipeline.canonicalReceipt(f.journal.transactions[0]), /invalid transaction/);
  f.journal.transactions[0].rawTransaction = original;
  f.journal.maxTotalSpendWei = "1000000000001";
  await assert.rejects(pipeline.confirmAll(), /policy changed/);
  f.journal.maxTotalSpendWei = "1000000000000"; f.state.chainId = 1n;
  await assert.rejects(pipeline.confirmAll(), /Provider chain/);
  const g = await historyFixture(), fresh = g.make(), getReceipt = g.provider.getTransactionReceipt.bind(g.provider);
  g.provider.getTransactionReceipt = async hash => { const receipt = await getReceipt(hash); g.journal.transactions[0].broadcastDeadline = 12345; return receipt; };
  await assert.rejects(fresh.confirmAll(), /prefix changed/);
  g.provider.getTransactionReceipt = getReceipt; g.state.receiptReads = 0;
  await g.make().confirmAll(); assert.equal(g.state.receiptReads, 4);
});

test("an appended pending transaction is always verified live and never covered by its cached predecessors", async () => {
  const f = await historyFixture(), pipeline = f.make(); await pipeline.confirmAll();
  const rawTransaction = await f.signer.signTransaction({ type: 2, chainId: 11155111, nonce: 4, to: target, value: 0, gasLimit: 21000, maxFeePerGas: 22, maxPriorityFeePerGas: 2 });
  const tx = Transaction.from(rawTransaction);
  f.journal.transactions.push({ action: "new-pending", state: "submitted", rawTransaction, hash: tx.hash!, nonce: 4 });
  f.state.receiptReads = 0;
  await assert.rejects(pipeline.confirmAll(), ChainPendingError);
  assert.equal(f.state.receiptReads, 1);
  f.receipts.set(tx.hash!, { status: 1, hash: tx.hash!, from: f.signer.address, to: target, blockNumber: 14, blockHash: f.hash(14), gasUsed: 21000n, gasPrice: 12n } as TransactionReceipt);
  f.state.receiptReads = 0; await pipeline.confirmAll();
  assert.equal(f.state.receiptReads, 5, "The failed pass cleared its earlier reusable approval");
  assert.equal(f.journal.transactions[4].state, "confirmed"); assert.equal(f.state.saves, 1);
  f.state.receiptReads = 0; await pipeline.confirmAll(); assert.equal(f.state.receiptReads, 0);
});

test("warm ancestor lookup cannot transplant its original proof onto a journal changed during that await", async () => {
  const f = await historyFixture(), pipeline = f.make(); await pipeline.confirmAll();
  const oldAnchor = f.state.head - 1; f.state.head++;
  f.state.beforeBlock = tag => { if (tag === oldAnchor) f.journal.transactions[0].action = "changed-during-ancestor-read"; };
  await assert.rejects(pipeline.confirmAll(), /prefix changed/);
  f.state.beforeBlock = undefined; f.state.receiptReads = 0;
  await f.make().confirmAll(); assert.equal(f.state.receiptReads, 4);
});
