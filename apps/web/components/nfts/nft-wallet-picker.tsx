"use client";
import { Button, TextAction } from "@manekineko/ui/button";


import { useEffect, useRef, useState } from "react";
import { requestWalletAccounts, walletError } from "../../lib/affiliates/wallet";
import { discoverWalletProviders, type WalletOption } from "../../lib/affiliates/wallet-discovery";
import { connectWalletConnect, manageWalletConnect, walletConnectConfigured } from "../../lib/affiliates/walletconnect";
import { connectNftWallet, type NftWalletConnection } from "../../lib/nfts/wallet-view";

export type { NftWalletConnection } from "../../lib/nfts/wallet-view";

export function NftWalletPicker({ onConnected, onCancel }: {
  onConnected: (connection: NftWalletConnection) => void;
  onCancel: () => void;
}) {
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [selected, setSelected] = useState<WalletOption | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const revision = useRef(0);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    const stop = discoverWalletProviders(setWallets);
    return () => { mounted.current = false; revision.current++; pending.current?.abort(); stop(); };
  }, []);

  async function loadAccounts(option: WalletOption, selectAccount = false) {
    if (inFlight.current) return;
    const request = ++revision.current;
    const isCurrent = () => mounted.current && request === revision.current;
    inFlight.current = true; setBusy(true); setError(""); setSelected(option); setAccounts([]);
    try {
      const next = await requestWalletAccounts(option.provider, { selectAccount });
      if (isCurrent()) setAccounts(next);
    } catch (cause) {
      if (isCurrent()) setError(walletError(cause));
    } finally {
      inFlight.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  async function mobileWallet() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    const controller = new AbortController(); pending.current = controller;
    try {
      const provider = await connectWalletConnect(undefined, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setSelected({ id: "walletconnect", name: "WalletConnect", provider });
      const next = await requestWalletAccounts(provider);
      if (mounted.current && !controller.signal.aborted) setAccounts(next);
    } catch (cause) { if (mounted.current) setError(walletError(cause)); }
    finally { pending.current = null; inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  async function chooseAccount(address: string) {
    if (!selected || inFlight.current) return;
    const request = ++revision.current;
    const isCurrent = () => mounted.current && request === revision.current;
    const controller = new AbortController();
    pending.current = controller;
    inFlight.current = true; setBusy(true); setError("");
    let connection: NftWalletConnection | undefined;
    try {
      connection = await connectNftWallet(selected.provider, address, controller.signal);
      if (isCurrent() && connection.isCurrent()) {
        pending.current = null;
        onConnected(connection);
      }
      else connection.dispose();
    } catch (cause) {
      connection?.dispose();
      if (isCurrent()) setError(walletError(cause));
    } finally {
      // Once adopted by the gallery, its hook owns the connection's listeners.
      if (pending.current === controller) pending.current = null;
      inFlight.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  return <section className="nft-wallet-picker" aria-label="Choose wallet account" aria-busy={busy}>
    <h2>{selected ? `Choose an account · ${selected.name}` : "Choose your wallet"}</h2>
    {!selected ? <>
      <p>Connect the wallet you used to mint your NFTs. Viewing your collection never requests a signature or a payment.</p>
      <div className="nft-wallet-options">{wallets.map((option) => <Button busy={busy} variant="secondary" type="button"  key={option.id} disabled={busy} onClick={() => void loadAccounts(option)}>{option.name}</Button>)}</div>
      {walletConnectConfigured() && <Button busy={busy} variant="secondary" type="button"  disabled={busy} onClick={()=>void mobileWallet()}>WalletConnect · mobile wallet</Button>}
      {wallets.length === 0 && <p>No Ethereum wallet was found. Open this page in the browser where your wallet is installed, or look up your public wallet address below.</p>}
    </> : <>
      <p>Choose the address whose NFTs you want to see. These are the accounts your wallet has shared with this site.</p>
      <div className="nft-wallet-options">{accounts.map((address) => <Button busy={busy} variant="secondary" type="button" className="ui-card-action nft-account-option" key={address} disabled={busy} onClick={() => void chooseAccount(address)}><span>View this account</span><strong>{address}</strong></Button>)}</div>
      {!busy && accounts.length === 0 && !error && <p>No account is authorized yet.</p>}
      <div className="nft-wallet-picker-actions">
        <TextAction busy={busy} type="button"  disabled={busy} onClick={() => void loadAccounts(selected)}>Refresh accounts</TextAction>
        <TextAction busy={busy} type="button"  disabled={busy} onClick={() => void loadAccounts(selected, true)}>Authorize another account</TextAction>
        {selected.id === "walletconnect" && <TextAction busy={busy} type="button"  disabled={busy} onClick={()=>void manageWalletConnect().catch(cause=>setError(walletError(cause)))}>Manage mobile wallet connection</TextAction>}
        <TextAction busy={busy} type="button"  disabled={busy} onClick={() => { setSelected(null); setAccounts([]); setError(""); }}>Change wallet</TextAction>
      </div>
      <p>If an address is missing, choose Authorize another account and approve its access in your wallet. No network change is needed to view your NFTs.</p>
    </>}
    {busy && <p role="status">Waiting for your wallet. Complete or cancel its open request before trying again.</p>}
    {error && <p className="nft-wallet-picker-error" role="alert">{error}</p>}
    <TextAction type="button"  onClick={() => { mounted.current = false; revision.current++; pending.current?.abort(); onCancel(); }}>Close account selector</TextAction>
  </section>;
}
