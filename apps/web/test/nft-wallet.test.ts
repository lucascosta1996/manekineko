import test from "node:test";
import assert from "node:assert/strict";
import { connectNftWallet } from "../lib/nfts/wallet-view.ts";
import type { WalletProvider } from "../lib/affiliates/wallet.ts";

const first = "0x1111111111111111111111111111111111111111";
const second = "0x2222222222222222222222222222222222222222";

function wallet(read: () => unknown | Promise<unknown> = () => [first, second]) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const requests: string[] = [];
  const provider: WalletProvider = {
    async request({ method }) {
      requests.push(method);
      assert.equal(method, "eth_accounts", "NFT viewing must never request a signer, transaction, or chain switch");
      return read();
    },
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    removeListener(event, listener) { listeners.get(event)?.delete(listener); },
  };
  return {
    provider, requests,
    emit(event: string) { for (const listener of [...(listeners.get(event) ?? [])]) listener(); },
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
}

test("NFT viewing preserves the explicitly selected second account without signing or switching chains", async () => {
  const injected = wallet();
  const connection = await connectNftWallet(injected.provider, second);
  assert.equal(connection.address, second);
  assert.equal(connection.injected, injected.provider);
  assert.equal(connection.isCurrent(), true);
  assert.deepEqual(injected.requests, ["eth_accounts"]);
  assert.equal(injected.listenerCount(), 3);
  connection.dispose();
  assert.equal(connection.isCurrent(), false);
  assert.equal(injected.listenerCount(), 0);
});

test("account, network, and disconnect events invalidate NFT viewing once and release all listeners", async () => {
  for (const event of ["accountsChanged", "chainChanged", "disconnect"] as const) {
    const injected = wallet();
    const connection = await connectNftWallet(injected.provider, second);
    const reasons: string[] = [];
    connection.subscribe((reason) => reasons.push(reason));
    injected.emit(event);
    injected.emit(event);
    assert.deepEqual(reasons, [event]);
    assert.equal(connection.isCurrent(), false);
    assert.equal(injected.listenerCount(), 0);
  }
});

test("an account change during authorization lookup cannot restore a stale gallery connection", async () => {
  let resolve!: (accounts: string[]) => void;
  const response = new Promise<string[]>((done) => { resolve = done; });
  const injected = wallet(() => response);
  const pending = connectNftWallet(injected.provider, second);
  assert.equal(injected.listenerCount(), 3);
  injected.emit("accountsChanged");
  resolve([first, second]);
  await assert.rejects(pending, /wallet changed while connecting/);
  assert.equal(injected.listenerCount(), 0);
});

test("closing an in-flight account selection cleans up immediately and ignores its late result", async () => {
  let resolve!: (accounts: string[]) => void;
  const response = new Promise<string[]>((done) => { resolve = done; });
  const injected = wallet(() => response);
  const controller = new AbortController();
  const pending = connectNftWallet(injected.provider, second, controller.signal);
  assert.equal(injected.listenerCount(), 3);
  controller.abort();
  assert.equal(injected.listenerCount(), 0);
  resolve([first, second]);
  await assert.rejects(pending, /wallet changed while connecting/);
  assert.equal(injected.listenerCount(), 0);
});

test("an already-closed selector never requests wallet access or installs listeners", async () => {
  const injected = wallet();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(connectNftWallet(injected.provider, second, controller.signal), /wallet changed/);
  assert.deepEqual(injected.requests, []);
  assert.equal(injected.listenerCount(), 0);
});

test("unauthorized and malformed account responses fail closed and free listeners", async () => {
  for (const response of [[first], null, [second, 1], ["not an address"]]) {
    const injected = wallet(() => response);
    await assert.rejects(connectNftWallet(injected.provider, second));
    assert.equal(injected.listenerCount(), 0);
  }
});

test("RPC failures release all listeners, and unsubscribed views receive no later notification", async () => {
  const failure = wallet(() => { throw new Error("Wallet is locked"); });
  await assert.rejects(connectNftWallet(failure.provider, second), /Wallet is locked/);
  assert.equal(failure.listenerCount(), 0);

  const injected = wallet();
  const connection = await connectNftWallet(injected.provider, second);
  let calls = 0;
  const stop = connection.subscribe(() => { calls++; });
  stop();
  injected.emit("disconnect");
  assert.equal(calls, 0);
  connection.subscribe((reason) => { calls++; assert.equal(reason, "disconnect"); });
  assert.equal(calls, 1);
});
