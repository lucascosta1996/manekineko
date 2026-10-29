import assert from "node:assert/strict";
import { test } from "node:test";
import { createConnectedWalletBridge, readConnectedWallet, type ConnectedAccount } from "../../../packages/protocol/src/connected-wallet.ts";
import { assertWallet, type WalletSession } from "../../../packages/protocol/src/wallet.ts";

const A = "0x1111111111111111111111111111111111111111", B = "0x2222222222222222222222222222222222222222";
function fixture() {
  const events = new Map<string, Set<(...args: unknown[]) => void>>();
  let address = A, chain = 11155111;
  const calls: string[] = [];
  const provider = {
    on: (event: string, listener: (...args: unknown[]) => void) => { if (!events.has(event)) events.set(event, new Set()); events.get(event)!.add(listener); },
    removeListener: (event: string, listener: (...args: unknown[]) => void) => { events.get(event)?.delete(listener); },
    request: async ({ method }: { method: string }) => {
      calls.push(method);
      if (method === "eth_accounts") return [address];
      if (method === "eth_chainId") return `0x${chain.toString(16)}`;
      throw new Error(`Unexpected request ${method}`);
    },
  };
  const emit = (event: string) => { for (const listener of [...events.get(event) ?? []]) listener(); };
  return { provider, calls, events, emit, account: (): ConnectedAccount => ({ address, chainId: chain, provider }), change: (next = B, network = chain) => { address = next; chain = network; } };
}
test("restoring a selected account is read-only and verifies its actual network", async () => {
  const f = fixture(), session = await readConnectedWallet(f.account());
  assert.equal(session.address, A);
  assert.ok(f.calls.every(method => ["eth_accounts", "eth_chainId"].includes(method)));
  f.change(A, 1);
  await assert.rejects(assertWallet(session), /network changed/);
  await assert.rejects(readConnectedWallet({ ...f.account(), chainId: 11155111 }), /updating/);
  session.provider.destroy();
});
test("an explicitly selected secondary account can sign while its full permission snapshot stays unchanged", async () => {
  const f = fixture();
  let accounts = [A, B];
  const request = f.provider.request;
  f.provider.request = async args => args.method === "eth_accounts" ? accounts : request(args);
  const session = await readConnectedWallet({ ...f.account(), address: B });
  assert.equal(session.address, B);
  assert.equal(await session.signer.getAddress(), B);
  await assertWallet(session);
  assert.ok(f.calls.every(method => ["eth_accounts", "eth_chainId"].includes(method)));
  accounts = [B, A];
  await assert.rejects(assertWallet(session), /selected wallet changed/);
  accounts = [A];
  await assert.rejects(readConnectedWallet({ ...f.account(), address: B }), /not connected/);
  session.provider.destroy();
});
test("switching between authorized SDK accounts revokes the previous signer without requiring provider account reordering", async () => {
  const f = fixture();
  const request = f.provider.request;
  f.provider.request = async args => args.method === "eth_accounts" ? [A, B] : request(args);
  let selected = f.account(), current: WalletSession | null = null;
  const bridge = createConnectedWalletBridge(() => selected, next => { current = next; });
  await bridge.sync();
  const previous = current!;
  selected = { ...selected, address: B };
  const changing = bridge.sync();
  assert.equal(current, null);
  await changing;
  await assert.rejects(assertWallet(previous), /selected wallet changed/);
  assert.equal((current as WalletSession | null)?.address, B);
  await assertWallet(current!);
  f.emit("disconnect");
  assert.equal(current, null);
  bridge.dispose();
});
test("one session is reused across reads; account changes revoke the old signer immediately", async () => {
  const f = fixture(); let current: WalletSession | null = null;
  const bridge = createConnectedWalletBridge(f.account, next => { current = next; });
  await bridge.sync(); const first = current!;
  await bridge.sync(); assert.equal(current, first);
  f.change(); f.emit("accountsChanged");
  assert.equal(current, null);
  await assert.rejects(assertWallet(first), /selected wallet changed/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((current as WalletSession | null)?.address, B);
  bridge.dispose();
  assert.ok([...f.events.values()].every(listeners => listeners.size === 0));
});
test("disconnect cannot restore stale provider permissions; explicit new connection can", async () => {
  const f = fixture(); let selected: ConnectedAccount | null = f.account(), current: WalletSession | null = null;
  const bridge = createConnectedWalletBridge(() => selected, next => { current = next; });
  await bridge.sync(); const old = current!;
  f.emit("disconnect"); await bridge.sync();
  assert.equal(current, null);
  await assert.rejects(assertWallet(old), /selected wallet changed/);
  selected = null; await bridge.sync(); selected = f.account(); await bridge.sync();
  assert.equal((current as WalletSession | null)?.address, A);
  bridge.dispose();
});
test("provider account, network and disconnect events clear saved app selections", async () => {
  const f = fixture(); let invalidations = 0;
  const bridge = createConnectedWalletBridge(f.account, () => {}, () => { invalidations++; });
  await bridge.sync(); await bridge.sync();
  assert.equal(invalidations, 0);
  f.emit("accountsChanged"); f.emit("chainChanged"); f.emit("disconnect");
  assert.equal(invalidations, 3);
  bridge.dispose();
});
test("a late restore result cannot replace a newer account or survive disposal", async () => {
  const f = fixture(); let current: WalletSession | null = null, selected = f.account();
  const original = f.provider.request;
  let finish!: () => void;
  const blocked = new Promise<void>(resolve => { finish = resolve; });
  f.provider.request = async args => { if (args.method === "eth_accounts") await blocked; return original(args); };
  const bridge = createConnectedWalletBridge(() => selected, next => { current = next; });
  const first = bridge.sync();
  f.change(); selected = f.account(); f.emit("accountsChanged");
  finish(); await first; await new Promise(resolve => setImmediate(resolve));
  assert.equal((current as WalletSession | null)?.address, B);
  const session = current!; bridge.dispose();
  await assert.rejects(assertWallet(session), /selected wallet changed/);
});
