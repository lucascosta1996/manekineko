"use client";

import { useEffect, useState } from "react";
import { createDataPoller } from "../lib/live-data/poller";

/** Refresh only database projections. Wallet verification remains a separate step. */
export function useLiveData<T>(endpoint: string | null, initialData: T, decode: (value: unknown) => T) {
  const [data, setData] = useState(initialData);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!endpoint) return;
    const active = () => document.visibilityState === "visible" && navigator.onLine;
    const poller = createDataPoller({
      isActive: active,
      request: async (signal) => {
        const timeout = AbortSignal.timeout(12_000);
        const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.any([signal, timeout]) });
        if (!response.ok) throw new Error("Collection updates are unavailable.");
        return decode(await response.json());
      },
      onData: (next) => { setData(next); setRetrying(false); },
      onError: () => setRetrying(true),
    });
    const visibility = () => { if (active()) poller.refresh(); else poller.pause(); };
    const focus = () => { if (active()) poller.refresh(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", visibility);
    window.addEventListener("offline", visibility);
    window.addEventListener("focus", focus);
    poller.start();
    return () => {
      poller.stop();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", visibility);
      window.removeEventListener("offline", visibility);
      window.removeEventListener("focus", focus);
    };
  }, [endpoint, decode]);

  return { data, retrying };
}
