"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { invalidateWallet, observeWalletSession, type WalletSession } from "../../lib/affiliates/wallet";

/** One explicitly selected provider/account. Connecting never submits an action. */
export function useWalletSession() {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [pickerChain, setPickerChain] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const current = useRef<WalletSession | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const release = useCallback(() => {
    stop.current?.(); stop.current = null;
    if (current.current) { invalidateWallet(current.current); current.current.provider.destroy(); }
    current.current = null;
  }, []);
  useEffect(() => release, [release]);
  const connect = useCallback((next: WalletSession) => {
    release(); current.current = next;
    const changed = () => {
      if (current.current !== next) return;
      release(); setSession(null);
      setNotice("Your wallet account, network or session changed. Choose your account again before continuing.");
    };
    stop.current = observeWalletSession(next, changed);
    setSession(next); setPickerChain(null); setNotice("Wallet connected. Review the selected action before confirming it.");
  }, [release]);
  const openPicker = useCallback((chainId: number) => {
    release(); setSession(null); setNotice(""); setPickerChain(chainId);
  }, [release]);
  const disconnect = useCallback(() => { release(); setSession(null); setPickerChain(null); setNotice("Wallet disconnected from this view."); }, [release]);
  return { session, pickerChain, notice, connect, openPicker, closePicker: () => setPickerChain(null), disconnect };
}
