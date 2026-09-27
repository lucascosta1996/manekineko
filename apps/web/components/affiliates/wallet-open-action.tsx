"use client";
import type { WalletProvider } from "../../lib/affiliates/wallet";
import { connectedWalletOpeningUrl } from "../../lib/affiliates/walletconnect";

export function WalletOpenAction({ provider }: { provider?: WalletProvider }) {
  const url = connectedWalletOpeningUrl(provider);
  return url ? <a className="text-link" href={url} target="_blank" rel="noreferrer">Open connected wallet</a> : null;
}
