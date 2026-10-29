import { BrowserProvider, getAddress, JsonRpcSigner } from "ethers";
import { assertWallet, invalidateWallet, pinSelectedWalletAccounts, type WalletProvider, type WalletSession } from "./wallet.ts";

export type ConnectedAccount = { address: string; chainId: number; provider: WalletProvider; name?: string };

/** Read an already authorized SDK account without requesting permission or switching chains. */
export async function readConnectedWallet(account: ConnectedAccount): Promise<WalletSession> {
  const { provider: injected, chainId, name: providerName } = account;
  if (![1, 11155111].includes(chainId)) throw new Error("Choose Ethereum or Sepolia in your wallet to continue.");
  const address = getAddress(account.address);
  const [accounts, chain] = await Promise.all([
    injected.request({ method: "eth_accounts" }), injected.request({ method: "eth_chainId" }),
  ]);
  if (Number(BigInt(String(chain))) !== chainId)
    throw new Error("Your wallet is updating. Check the selected account and network, then try again.");
  const provider = new BrowserProvider(injected, "any");
  // Constructing a signer here cannot prompt for accounts, unlike getSigner().
  const session = { address, chainId, providerName, provider, injected, signer: new JsonRpcSigner(provider, address) };
  // AppKit can explicitly select any authorized account, not just eth_accounts[0].
  // Pin the full ordered permission snapshot so later changes still revoke signing.
  try { pinSelectedWalletAccounts(session, accounts); await assertWallet(session); return session; }
  catch (error) { provider.destroy(); throw error; }
}

/** An account event invalidates old signers immediately, even during an asynchronous restore. */
export function createConnectedWalletBridge(
  read: () => ConnectedAccount | null,
  publish: (session: WalletSession | null, error: string) => void,
) {
  let revision = 0, disposed = false;
  let current: WalletSession | null = null;
  let watched: WalletProvider | null = null;
  let pending: ConnectedAccount | null = null;
  let revoked: WalletProvider | null = null;
  const release = () => {
    revision++;
    pending = null;
    if (current) { invalidateWallet(current); current.provider.destroy(); current = null; }
  };
  const changed = () => {
    release(); publish(null, "");
    // Let the SDK process the same provider event before reading its new selection.
    queueMicrotask(() => { if (!disposed) void sync(); });
  };
  const disconnected = () => { revoked = watched; release(); publish(null, "Wallet disconnected. Connect again to continue."); };
  const watch = (provider: WalletProvider | null) => {
    if (watched === provider) return;
    for (const event of ["accountsChanged", "chainChanged"]) watched?.removeListener?.(event, changed);
    watched?.removeListener?.("disconnect", disconnected);
    watched = provider;
    for (const event of ["accountsChanged", "chainChanged"]) watched?.on?.(event, changed);
    watched?.on?.("disconnect", disconnected);
  };
  async function sync() {
    if (disposed) return;
    const account = read();
    if (!account) revoked = null;
    if (account?.provider === revoked) return;
    watch(account?.provider ?? null);
    if (account && current?.injected === account.provider && current.chainId === account.chainId && current.address.toLowerCase() === account.address.toLowerCase()) return;
    if (account && pending?.provider === account.provider && pending.chainId === account.chainId && pending.address === account.address) return;
    release(); publish(null, "");
    if (!account) return;
    pending = account;
    const attempt = revision;
    try {
      const session = await readConnectedWallet(account);
      if (disposed || revision !== attempt) { invalidateWallet(session); session.provider.destroy(); return; }
      current = session; pending = null; publish(session, "");
    } catch (error) {
      if (!disposed && revision === attempt) { pending = null; publish(null, error instanceof Error ? error.message : "Reconnect your wallet to continue."); }
    }
  }
  return { sync, clear: () => { release(); publish(null, ""); }, dispose: () => { disposed = true; release(); watch(null); } };
}
