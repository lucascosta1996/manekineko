import test from "node:test";
import assert from "node:assert/strict";
import { Interface } from "ethers";
import { prizeJournalRank, prizeOperationKey } from "../lib/prizes/operation.ts";
import { readConfirmedPrizes, rememberConfirmedPrize } from "../lib/prizes/confirmed.ts";
import { assertWallet, observeWalletSession, type TransactionJournal, type WalletSession } from "../lib/affiliates/wallet.ts";
const wallet = `0x${"1".repeat(40)}`, contract = `0x${"2".repeat(40)}`, hash = `0x${"a".repeat(64)}`, blockHash = `0x${"b".repeat(64)}`;
const claims = new Interface(["function claimPrizeForRank(uint256 rank,address recipient)", "function claimPrize(address recipient)"]);
const journal: TransactionJournal = { action: "prize", wallet, chainId: 11155111, contractAddress: contract, hash: null, startedAt: "2026-09-27T00:00:00Z", data: claims.encodeFunctionData("claimPrizeForRank", [6, wallet]), valueWei: "0", nonce: 8 };

test("an ambiguous claim stays attached to its original ranked prize and account", () => {
  assert.equal(prizeJournalRank(journal), 6);
  assert.notEqual(prizeOperationKey("collection", 6), prizeOperationKey("collection", 5));
  for (const changed of [{ action: "mint" as const }, { valueWei: "1" }, { data: claims.encodeFunctionData("claimPrizeForRank", [6, contract]) }, { data: claims.encodeFunctionData("claimPrizeForRank", [11, wallet]) }, { data: "0x1234" }]) assert.throws(() => prizeJournalRank({ ...journal, ...changed }));
  assert.equal(prizeJournalRank({ ...journal, data: claims.encodeFunctionData("claimPrize", [wallet]) }), 1);
});

test("confirmed receipt markers survive remount, isolate collections and defer to newer canonical state", () => {
  const values = new Map<string,string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => values.set(key,value) } });
  const receipt = { collectionId: "a", rank: 6, hash, blockHash, blockNumber: "120" };
  rememberConfirmedPrize(receipt); rememberConfirmedPrize({ ...receipt, rank: 2 });
  assert.equal(readConfirmedPrizes("a").length, 2);
  assert.equal(readConfirmedPrizes("b").length, 0);
  assert.equal(readConfirmedPrizes("a", "119").length, 2);
  assert.equal(readConfirmedPrizes("a", "120").length, 0, "a canonical unpaid observation after a reorg must not stay masked by local success");
  assert.equal(readConfirmedPrizes("a", "121").length, 0);
  rememberConfirmedPrize({ ...receipt, hash: `0x${"c".repeat(64)}` });
  assert.equal(readConfirmedPrizes("a").length, 2);
  values.set("tincta:confirmed-prizes:a", '{"rank":6}');
  assert.deepEqual(readConfirmedPrizes("a"), []);
});

test("account/network/disconnect events invalidate the exact provider session and release listeners", async () => {
  for (const event of ["accountsChanged", "chainChanged", "disconnect"]) {
    const listeners = new Map<string, (...args: unknown[])=>void>();
    const session = { address: wallet, chainId: 11155111, injected: {
      request: async ({method}:{method:string}) => method === "eth_chainId" ? "0xaa36a7" : [wallet],
      on: (name:string, listener:(...args:unknown[])=>void) => listeners.set(name, listener),
      removeListener: (name:string) => listeners.delete(name),
    }} as unknown as WalletSession;
    let changed = 0;
    const stop = observeWalletSession(session, () => changed++);
    await assertWallet(session); listeners.get(event)!();
    assert.equal(changed, 1); assert.equal(listeners.size, 0);
    await assert.rejects(assertWallet(session), /selected wallet changed/);
    stop(); assert.equal(changed, 1);
  }
});
