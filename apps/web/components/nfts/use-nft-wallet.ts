"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NftWalletConnection } from "../../lib/nfts/wallet-view";

export function useNftWallet() {
  const [connection, setConnection] = useState<NftWalletConnection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const current = useRef<NftWalletConnection | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const mounted = useRef(false);

  const release = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    current.current?.dispose();
    current.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; release(); };
  }, [release]);

  const disconnect = useCallback(() => {
    release();
    setConnection(null);
    setPickerOpen(false);
    setNotice("");
  }, [release]);

  const openPicker = useCallback(() => {
    release();
    setConnection(null);
    setNotice("");
    setPickerOpen(true);
  }, [release]);

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const connect = useCallback((next: NftWalletConnection) => {
    if (!mounted.current || !next.isCurrent()) { next.dispose(); return; }
    release();
    current.current = next;
    setConnection(next);
    setNotice("");
    setPickerOpen(false);
    unsubscribe.current = next.subscribe((reason) => {
      if (current.current !== next) return;
      release();
      if (!mounted.current) return;
      setConnection(null);
      setNotice(reason === "disconnect"
        ? "Your wallet disconnected. Connect again to view your NFTs."
        : "Your wallet account or network changed. Choose an account again to view its NFTs.");
    });
  }, [release]);

  return { connection, address: connection?.address ?? null, notice, pickerOpen, openPicker, closePicker, connect, disconnect };
}
