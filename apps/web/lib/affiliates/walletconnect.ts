"use client";

import type { WalletProvider } from "./wallet";
type AppKit = ReturnType<typeof import("@reown/appkit")["createAppKit"]>;
let appKit: Promise<AppKit> | null = null;
export const walletConnectConfigured = () => !!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

async function kit(chainId?: number): Promise<AppKit> {
  if (!walletConnectConfigured()) throw new Error("Mobile wallet connections are not configured for this site. Use an installed wallet or its in-app browser.");
  if (!appKit) appKit = (async () => {
    const [{ createAppKit }, { mainnet, sepolia }] = await Promise.all([import("@reown/appkit"), import("@reown/appkit/networks")]);
    const modal = createAppKit({ projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!.trim(), networks: [mainnet, sepolia], defaultNetwork: chainId === 11155111 ? sepolia : mainnet,
      metadata: { name: "Tincta", description: "Tincta NFT collections and rewards", url: window.location.origin, icons: [`${window.location.origin}/icon.svg`] },
      enableInjected: false, enableEIP6963: false, enableCoinbase: false, enableBaseAccount: false,
      defaultAccountTypes: { eip155: "eoa" }, features: { analytics: false, email: false, socials: [], swaps: false, onramp: false, send: false }, themeMode: "light", themeVariables: { "--w3m-border-radius-master": "1px", "--w3m-accent": "#171717", "--w3m-font-family": "Arial, sans-serif" } });
    await modal.ready(); return modal;
  })().catch(error => { appKit = null; throw error; });
  return appKit;
}

/** Loaded only after an explicit mobile-wallet choice; no global provider replacement. */
export async function connectWalletConnect(chainId?: number, signal?: AbortSignal): Promise<WalletProvider> {
  const modal = await kit(chainId);
  if (signal?.aborted) throw new Error("Wallet selection was closed.");
  const current = (): WalletProvider | null => {
    const provider = modal.getWalletProvider();
    return modal.getAccount("eip155")?.isConnected && provider && typeof (provider as WalletProvider).request === "function" ? provider as WalletProvider : null;
  };
  const previous = current();
  if (previous) return previous;
  return new Promise<WalletProvider>((resolve, reject) => {
    const stops: (() => void)[] = [];
    let opened = false, finished = false;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      if (finished) return;
      const provider = current();
      if (!error && !provider) return;
      finished = true; clearTimeout(timeout); clearTimeout(closeTimer); stops.forEach(stop => stop()); signal?.removeEventListener("abort", abort);
      void modal.close();
      if (error) reject(error); else resolve(provider!);
    };
    const abort = () => finish(new Error("Wallet selection was closed. Nothing was signed."));
    const timeout = setTimeout(() => finish(new Error("The wallet connection expired. Open the selector to reconnect.")), 180_000);
    stops.push(modal.subscribeAccount(() => finish(), "eip155"), modal.subscribeProviders(() => finish()), modal.subscribeState(state => {
      if (state.open) opened = true;
      else if (opened) { finish(); if (!finished) closeTimer = setTimeout(() => { finish(); if (!finished) finish(new Error("Wallet connection was canceled. Nothing was signed.")); }, 250); }
    }));
    signal?.addEventListener("abort", abort, { once: true });
    void modal.open({ view: "Connect", namespace: "eip155" }).catch(error => finish(error instanceof Error ? error : new Error("Wallet connection could not be opened.")));
  });
}

export async function manageWalletConnect(): Promise<void> { await (await kit()).open({ view: "Account", namespace: "eip155" }); }

/** A universal link advertised by the connected wallet; never invent a deep link. */
export function connectedWalletOpeningUrl(provider: WalletProvider | undefined): string | null {
  try {
    const redirect = (provider as WalletProvider & { session?: { peer?: { metadata?: { redirect?: { universal?: string } } } } })?.session?.peer?.metadata?.redirect?.universal;
    if (!redirect) return null;
    const url = new URL(redirect);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
