"use client";

import { useEffect, useRef, useState } from "react";
import { connectWallet, invalidateWallet, requestWalletAccounts, walletError, type WalletSession } from "../../lib/affiliates/wallet";
import { discoverWalletProviders, type WalletOption } from "../../lib/affiliates/wallet-discovery";
import { connectWalletConnect, manageWalletConnect, walletConnectConfigured } from "../../lib/affiliates/walletconnect";

export function WalletAccountPicker({ chainId, onConnected, onCancel, purpose = "affiliate position" }: {
  chainId?: number;
  purpose?: string;
  onConnected: (session: WalletSession) => void;
  onCancel: () => void;
}) {
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [selected, setSelected] = useState<WalletOption | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    const stop = discoverWalletProviders(setWallets);
    return () => { mounted.current = false; pending.current?.abort(); stop(); };
  }, []);

  async function loadAccounts(option: WalletOption, selectAccount = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setSelected(option); setAccounts([]);
    try {
      const next = await requestWalletAccounts(option.provider, { selectAccount });
      if (mounted.current) setAccounts(next);
    } catch (cause) {
      if (mounted.current) setError(walletError(cause));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function mobileWallet() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    const controller = new AbortController(); pending.current = controller;
    try {
      const provider = await connectWalletConnect(chainId, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setSelected({ id: "walletconnect", name: "WalletConnect", provider });
      const next = await requestWalletAccounts(provider);
      if (mounted.current && !controller.signal.aborted) setAccounts(next);
    } catch (cause) { if (mounted.current) setError(walletError(cause)); }
    finally { pending.current = null; inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  async function chooseAccount(address: string) {
    if (!selected || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const network = chainId ?? Number(BigInt(String(await selected.provider.request({ method: "eth_chainId" }))));
      const session = await connectWallet(network, { injected: selected.provider, address, providerName: selected.name });
      if (mounted.current) onConnected(session);
      else { invalidateWallet(session); session.provider.destroy(); }
    } catch (cause) {
      if (mounted.current) setError(walletError(cause));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <section className="affiliate-wallet-picker" aria-label="Choose wallet account" aria-busy={busy}>
    <h3>{selected ? `Choose an account · ${selected.name}` : "Choose your wallet"}</h3>
    {!selected ? <>
      <p>Select your wallet, then choose its authorized account. Connecting does not submit a transaction.</p>
      <div className="affiliate-wallet-options">{wallets.map((option) => <button type="button" className="secondary-button" key={option.id} disabled={busy} onClick={() => void loadAccounts(option)}>{option.name}</button>)}</div>
      {walletConnectConfigured() ? <button type="button" className="secondary-button" disabled={busy} onClick={()=>void mobileWallet()}>WalletConnect · mobile wallet</button> : <p>WalletConnect is not configured on this site. Mobile users can use their wallet’s in-app browser.</p>}
      {wallets.length === 0 && <p>No Ethereum wallet was found. Open this page in the browser where your wallet is installed and unlocked.</p>}
    </> : <>
      <p>Choose the address for your {purpose}. These are the accounts this wallet has shared with this site.</p>
      <div className="affiliate-wallet-options">{accounts.map((address) => <button type="button" className="affiliate-account-option" key={address} disabled={busy} onClick={() => void chooseAccount(address)}><span>Use account</span><strong>{address}</strong></button>)}</div>
      {!busy && accounts.length === 0 && !error && <p>No account is authorized yet.</p>}
      <div className="affiliate-wallet-picker-actions">
        <button type="button" className="text-button" disabled={busy} onClick={() => void loadAccounts(selected)}>Refresh accounts</button>
        <button type="button" className="text-button" disabled={busy} onClick={() => void loadAccounts(selected, true)}>Authorize another account</button>
        {selected.id === "walletconnect" && <button type="button" className="text-button" disabled={busy} onClick={()=>void manageWalletConnect().catch(cause=>setError(walletError(cause)))}>Manage mobile wallet connection</button>}
        <button type="button" className="text-button" disabled={busy} onClick={() => { setSelected(null); setAccounts([]); setError(""); }}>Change wallet</button>
      </div>
      <p>If your address is missing, use Authorize another account and complete the request in your wallet. Selecting an account here does not sign or submit a transaction.</p>
    </>}
    {busy && <p role="status">Waiting for your wallet. Complete or cancel its open request before trying again.</p>}
    {error && <p className="affiliate-wallet-picker-error" role="alert">{error}</p>}
    <button type="button" className="text-button" onClick={() => { mounted.current = false; pending.current?.abort(); onCancel(); }}>Close account selector</button>
  </section>;
}
