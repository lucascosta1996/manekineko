import { getAddress } from "ethers";
import type { WalletProvider } from "../affiliates/wallet";

export type NftWalletChange = "accountsChanged" | "chainChanged" | "disconnect";
export interface NftWalletConnection {
  address: string;
  injected: WalletProvider;
  isCurrent: () => boolean;
  subscribe: (onInvalidated: (reason: NftWalletChange) => void) => () => void;
  dispose: () => void;
}

/** Viewing NFTs needs address access only: no signer, chain switch, or transaction. */
export async function connectNftWallet(injected: WalletProvider, selectedAddress: string, signal?: AbortSignal): Promise<NftWalletConnection> {
  const address = getAddress(selectedAddress);
  const changed = () => new Error("The wallet changed while connecting. Choose your account again.");
  if (signal?.aborted) throw changed();
  let current = true;
  let reason: NftWalletChange = "disconnect";
  const subscribers = new Set<(reason: NftWalletChange) => void>();
  const handlers: [NftWalletChange, () => void][] = [];
  const dispose = () => {
    current = false;
    for (const [event, listener] of handlers) injected.removeListener?.(event, listener);
    handlers.length = 0;
    signal?.removeEventListener("abort", dispose);
    subscribers.clear();
  };
  const invalidate = (nextReason: NftWalletChange) => {
    if (!current) return;
    reason = nextReason;
    const listeners = [...subscribers];
    dispose();
    for (const listener of listeners) listener(reason);
  };
  try {
    // Subscribe before the RPC read so account changes during that read cannot
    // restore a connection that is already stale by the time it resolves.
    for (const event of ["accountsChanged", "chainChanged", "disconnect"] as const) {
      const listener = () => invalidate(event);
      handlers.push([event, listener]);
      injected.on?.(event, listener);
    }
    signal?.addEventListener("abort", dispose, { once: true });
    const accounts: unknown = await injected.request({ method: "eth_accounts" });
    if (!current || signal?.aborted) throw changed();
    if (!Array.isArray(accounts) || accounts.some((account) => typeof account !== "string")) throw new Error("The wallet returned an invalid account list. Open your wallet and try again.");
    if (!accounts.map((account) => getAddress(account)).includes(address)) throw new Error("This account is not connected to this site. Authorize it in your wallet, then select it again.");
    return {
      address,
      injected,
      isCurrent: () => current,
      subscribe(onInvalidated) {
        if (!current) { onInvalidated(reason); return () => {}; }
        subscribers.add(onInvalidated);
        return () => { subscribers.delete(onInvalidated); };
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
