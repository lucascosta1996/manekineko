"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createConnectedWalletBridge, type ConnectedAccount } from "./connected-wallet";
import { SharedWalletContext } from "./use-wallet-session";
import { walletError, type WalletProvider, type WalletSession } from "./wallet";
import { webWalletKit } from "./web-wallet-kit";
import { WebWalletMenu } from "./web-wallet-menu";

export function WebWalletProvider({ children, defaultChainId = 1, projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "" }: {
  children: ReactNode; defaultChainId?: number; projectId?: string;
}) {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [account, setAccount] = useState<{ address: string; chainId: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const menuOrigin = useRef<HTMLElement | null>(null);
  const connectOrigin = useRef<{ address?: string; provider: unknown } | null>(null);
  const kit = useRef<Awaited<ReturnType<typeof webWalletKit>> | null>(null);
  const bridge = useRef<ReturnType<typeof createConnectedWalletBridge> | null>(null);
  const mounted = useRef(false);
  const opening = useRef(false);
  const initialize = useRef<(() => ReturnType<typeof webWalletKit>) | null>(null);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const stops: (() => void)[] = [];
    initialize.current = async () => {
      const modal = await webWalletKit(projectId, defaultChainId);
      if (!active || kit.current === modal) return modal;
      kit.current = modal;
      const read = (): ConnectedAccount | null => {
        const selected = modal.getAccount("eip155");
        const provider = modal.getWalletProvider() as WalletProvider | undefined;
        const chainId = Number(modal.getChainId());
        const next = selected?.isConnected && selected.address && provider?.request
          ? { address: selected.address, chainId, provider, name: modal.getWalletInfo("eip155")?.name } : null;
        if (connectOrigin.current && next && (connectOrigin.current.address !== next.address || connectOrigin.current.provider !== next.provider)) {
          connectOrigin.current = null;
          void modal.close();
        }
        setAccount(next ? { address: next.address, chainId } : null);
        return next;
      };
      const connection = createConnectedWalletBridge(read, (next, error) => { setSession(next); setNotice(error); });
      bridge.current = connection;
      stops.push(modal.subscribeAccount(() => void connection.sync(), "eip155"), modal.subscribeNetwork(() => void connection.sync()), modal.subscribeProviders(() => void connection.sync()));
      void connection.sync();
      return modal;
    };
    if (projectId.trim()) void initialize.current().catch(() => { if (active) setNotice("Wallet connections could not load. Select Connect wallet to try again."); });
    return () => { active = false; mounted.current = false; initialize.current = null; kit.current = null; stops.forEach(stop => stop()); bridge.current?.dispose(); bridge.current = null; };
  }, [projectId, defaultChainId]);

  const open = useCallback(async (view: "Connect" | "Account" | "Networks") => {
    if (opening.current) return;
    opening.current = true; setConnecting(true); setNotice("");
    try {
      const modal = kit.current ?? await initialize.current?.();
      if (!modal) throw new Error("Wallet connections are loading. Please try again.");
      connectOrigin.current = view === "Connect" ? { address: modal.getAccount("eip155")?.address, provider: modal.getWalletProvider() } : null;
      await modal.open({ view, namespace: "eip155" });
    } catch (error) { if (mounted.current) setNotice(walletError(error)); }
    finally { opening.current = false; if (mounted.current) setConnecting(false); }
  }, [projectId, defaultChainId]);
  const disconnect = useCallback(() => {
    bridge.current?.clear(); setAccount(null);
    void kit.current?.disconnect("eip155").catch(() => { if (mounted.current) setNotice("Disconnection could not finish. Open your wallet and disconnect this site."); });
  }, []);
  return <SharedWalletContext.Provider value={{
    managed: true, session, account, connecting, notice, pickerChain: null,
    openPicker: () => { void open("Connect"); }, openAccount: () => {
      if (!account || !kit.current) { void open("Connect"); return; }
      menuOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setAccountOpen(true);
    },
    switchNetwork: () => { void open("Networks"); },
    closePicker: () => { void kit.current?.close(); }, disconnect,
    // Reown owns the session; the first-party menu uses its connection APIs.
    connect: () => { void bridge.current?.sync(); },
  }}>{children}{kit.current && <WebWalletMenu modal={kit.current} open={accountOpen} onClose={() => setAccountOpen(false)} origin={menuOrigin.current}
    invalidate={() => bridge.current?.clear()} synchronize={async () => { await bridge.current?.sync(); }}
    openConnect={() => { void open("Connect"); }} openNetworks={() => { void open("Networks"); }} />}</SharedWalletContext.Provider>;
}
