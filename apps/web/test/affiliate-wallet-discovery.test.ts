import test from "node:test";
import assert from "node:assert/strict";
import { discoverWalletProviders, type WalletOption } from "../lib/affiliates/wallet-discovery.ts";
import type { WalletProvider } from "../lib/affiliates/wallet.ts";

class MockWindow extends EventTarget { ethereum?: unknown }
function provider(): WalletProvider { return { request: async () => { throw new Error("Discovery must never request accounts"); } }; }
function announce(target: MockWindow, wallet: WalletProvider, name: unknown, extra: Record<string, unknown> = {}) {
  target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { provider: wallet, info: { name, uuid: "shared-uuid", rdns: "io.metamask", icon: "https://untrusted.example/icon.svg", ...extra } } }));
}
async function inWindow(run: (target: MockWindow) => void | Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const target = new MockWindow();
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  try { await run(target); }
  finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("discovery subscribes before requesting and exposes each concrete announced provider", async () => {
  await inWindow((target) => {
    const metamask = provider(), opera = provider();
    let requests = 0;
    target.addEventListener("eip6963:requestProvider", () => {
      requests++;
      announce(target, metamask, "MetaMask"); announce(target, opera, "Opera Wallet");
    });
    let choices: WalletOption[] = [];
    const cleanup = discoverWalletProviders((next) => { choices = next; });
    assert.equal(requests, 1);
    assert.deepEqual(choices.map((item) => item.name), ["MetaMask", "Opera Wallet"]);
    assert.equal(choices[0]!.provider, metamask); assert.equal(choices[1]!.provider, opera);
    assert.notEqual(choices[0]!.id, choices[1]!.id, "untrusted identical UUIDs must not merge distinct providers");
    assert.deepEqual(Object.keys(choices[0]!).sort(), ["id", "name", "provider"]);
    cleanup();
  });
});

test("late announcements replace legacy fallback, retain provider identity, and deduplicate repeat events", async () => {
  await inWindow(async (target) => {
    const wallet = provider(), other = provider(); target.ethereum = wallet;
    let choices: WalletOption[] = [], updates = 0;
    const cleanup = discoverWalletProviders((next) => { choices = next; updates++; });
    const id = choices[0]!.id;
    assert.equal(choices[0]!.name, "Browser wallet");
    await Promise.resolve();
    announce(target, wallet, "MetaMask");
    assert.equal(choices[0]!.id, id); assert.equal(choices[0]!.name, "MetaMask");
    const beforeRepeat = updates;
    announce(target, wallet, "Changed name", { uuid: "new-uuid" });
    assert.equal(updates, beforeRepeat); assert.equal(choices.length, 1);
    announce(target, other, "Opera Wallet");
    assert.equal(choices.length, 2);
    cleanup();
  });
});

test("a legacy aggregate exposes deduplicated concrete providers without guessing brands", async () => {
  await inWindow((target) => {
    const first = Object.assign(provider(), { isMetaMask: true }), second = provider();
    target.ethereum = Object.assign(provider(), { providers: [first, null, { request: false }, second, first] });
    let choices: WalletOption[] = [];
    const cleanup = discoverWalletProviders((next) => { choices = next; });
    assert.deepEqual(choices.map((item) => item.name), ["Browser wallet 1", "Browser wallet 2"]);
    assert.deepEqual(choices.map((item) => item.provider), [first, second]);
    cleanup();
  });
});

test("an announced wallet excludes an unrelated legacy default", async () => {
  await inWindow((target) => {
    target.ethereum = provider(); const wallet = provider();
    let choices: WalletOption[] = [];
    const cleanup = discoverWalletProviders((next) => { choices = next; });
    announce(target, wallet, "MetaMask");
    assert.equal(choices.length, 1); assert.equal(choices[0]!.provider, wallet);
    cleanup();
  });
});

test("cleanup stops that subscriber, while late announcements are retained for a remount", async () => {
  await inWindow((target) => {
    const first = provider(), later = provider();
    let updates = 0, choices: WalletOption[] = [];
    const cleanup = discoverWalletProviders(() => { updates++; });
    announce(target, first, "First wallet");
    const beforeCleanup = updates;
    cleanup(); cleanup();
    announce(target, later, "Later wallet");
    assert.equal(updates, beforeCleanup);
    const nextCleanup = discoverWalletProviders((next) => { choices = next; });
    assert.deepEqual(choices.map((item) => item.provider), [first, later]);
    nextCleanup();
  });
});

test("independent subscriber cleanup cannot stop another mounted picker", async () => {
  await inWindow((target) => {
    let firstUpdates = 0, secondUpdates = 0;
    const stopFirst = discoverWalletProviders(() => { firstUpdates++; });
    const stopSecond = discoverWalletProviders(() => { secondUpdates++; });
    stopFirst(); const before = firstUpdates;
    announce(target, provider(), "New wallet");
    assert.equal(firstUpdates, before); assert.equal(secondUpdates, 2);
    stopSecond();
  });
});

test("malformed announcements are ignored and metadata is bounded plain text without external assets", async () => {
  await inWindow((target) => {
    let choices: WalletOption[] = [];
    const cleanup = discoverWalletProviders((next) => { choices = next; });
    for (const detail of [undefined, null, "wrong", {}, { provider: {} }, { provider: provider(), info: null }]) target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
    assert.equal(choices.length, 0);
    announce(target, provider(), `\u202e<MetaMask>\n${"x".repeat(200)}`);
    assert.equal(choices[0]!.name.startsWith("MetaMask "), true);
    assert.equal(choices[0]!.name.length, 64);
    assert.equal(/[<>\u202e\n]/u.test(choices[0]!.name), false);
    assert.equal("icon" in choices[0]!, false); assert.equal("rdns" in choices[0]!, false);
    cleanup();
  });
});

test("late legacy injection is picked up without calling the provider", async () => {
  await inWindow((target) => {
    let choices: WalletOption[] = [];
    const cleanup = discoverWalletProviders((next) => { choices = next; });
    assert.equal(choices.length, 0);
    const wallet = provider(); target.ethereum = wallet;
    target.dispatchEvent(new Event("ethereum#initialized"));
    assert.equal(choices[0]!.provider, wallet);
    cleanup();
  });
});

test("discovery is inert outside a browser", () => {
  let choices: WalletOption[] | undefined;
  const cleanup = discoverWalletProviders((next) => { choices = next; });
  assert.deepEqual(choices, []); cleanup();
});
