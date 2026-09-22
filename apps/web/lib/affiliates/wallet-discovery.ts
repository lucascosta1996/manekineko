"use client";

import type { WalletProvider } from "./wallet";

export interface WalletOption { id: string; name: string; provider: WalletProvider }

type DiscoveryWindow = Pick<Window, "addEventListener" | "dispatchEvent"> & { ethereum?: unknown };
type Subscriber = (wallets: WalletOption[]) => void;
interface DiscoveryRegistry { subscribe: (onChange: Subscriber) => () => void; request: () => void }

const registries = new WeakMap<DiscoveryWindow, DiscoveryRegistry>();
const providerIds = new WeakMap<WalletProvider, string>();
let nextProviderId = 0;

function isProvider(value: unknown): value is WalletProvider {
  try { return value !== null && (typeof value === "object" || typeof value === "function") && typeof (value as WalletProvider).request === "function"; }
  catch { return false; }
}

function providerId(provider: WalletProvider): string {
  let id = providerIds.get(provider);
  if (!id) { id = `injected-wallet-${++nextProviderId}`; providerIds.set(provider, id); }
  return id;
}

function walletName(value: unknown): string {
  if (typeof value !== "string") return "Browser wallet";
  // Names are self-reported display text, never HTML or a verified wallet identity.
  const text = value.replace(/\s+/gu, " ").replace(/[\p{Cc}\p{Cf}<>]/gu, "").trim();
  return Array.from(text).slice(0, 64).join("") || "Browser wallet";
}

function legacyOptions(target: DiscoveryWindow): WalletOption[] {
  try {
    const injected = target.ethereum;
    const candidates = injected && (typeof injected === "object" || typeof injected === "function")
      ? (injected as { providers?: unknown }).providers : undefined;
    const providers = Array.isArray(candidates) ? [...new Set(candidates.filter(isProvider))] : [];
    // A multi-wallet wrapper is ambiguous; expose its concrete providers instead.
    if (!providers.length && isProvider(injected)) providers.push(injected);
    return providers.map((provider, index) => ({ id: providerId(provider), name: providers.length === 1 ? "Browser wallet" : `Browser wallet ${index + 1}`, provider }));
  } catch { return []; }
}

function createRegistry(target: DiscoveryWindow): DiscoveryRegistry {
  const announced = new Map<WalletProvider, WalletOption>();
  const subscribers = new Set<Subscriber>();
  let snapshot: WalletOption[] = [];
  const current = () => announced.size ? [...announced.values()] : legacyOptions(target);
  const publish = () => {
    const next = current();
    if (snapshot.length === next.length && snapshot.every((option, index) => option.id === next[index]!.id && option.name === next[index]!.name)) return;
    snapshot = next;
    for (const subscriber of subscribers) subscriber(snapshot.map((option) => ({ ...option })));
  };
  const announce = (event: Event) => {
    try {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== "object") return;
      const { provider, info } = detail as { provider?: unknown; info?: { name?: unknown } };
      if (!isProvider(provider) || !info || typeof info !== "object") return;
      // UUID, rdns and product flags cannot replace another provider or select it.
      if (announced.has(provider)) return;
      announced.set(provider, { id: providerId(provider), name: walletName(info.name), provider });
      publish();
    } catch { /* A malformed announcement must not hide other available wallets. */ }
  };
  // EIP-6963 discovery remains active for the page lifetime, including between
  // component mounts. Cleanup below removes only that component's subscription.
  target.addEventListener("eip6963:announceProvider", announce);
  target.addEventListener("ethereum#initialized", publish);
  return {
    subscribe(onChange) {
      publish();
      subscribers.add(onChange);
      onChange(snapshot.map((option) => ({ ...option })));
      return () => { subscribers.delete(onChange); };
    },
    request() { target.dispatchEvent(new Event("eip6963:requestProvider")); publish(); },
  };
}

/** Discover choices only; selecting a provider and requesting accounts are explicit UI actions. */
export function discoverWalletProviders(onChange: Subscriber): () => void {
  if (typeof window === "undefined") { onChange([]); return () => {}; }
  const target: DiscoveryWindow = window;
  let registry = registries.get(target);
  if (!registry) { registry = createRegistry(target); registries.set(target, registry); }
  const unsubscribe = registry.subscribe(onChange);
  registry.request();
  return unsubscribe;
}
