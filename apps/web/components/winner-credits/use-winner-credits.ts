"use client";

import { useCallback, useEffect, useState } from "react";
import type { WinnerCreditResponse } from "../../lib/winner-credits/model";

export function useWinnerCredits(wallet: string | null, collectionId: string | null, page: number) {
  const [result, setResult] = useState<{ key: string; data: WinnerCreditResponse } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = wallet ? `/api/winner-credits?${new URLSearchParams({ wallet, page: String(page), ...(collectionId ? { collectionId } : {}) })}` : null;
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (!key || !wallet) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      if (document.visibilityState !== "visible" || !navigator.onLine) { timer = setTimeout(load, 20_000); return; }
      try {
        const response = await fetch(key!, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Winner credits are temporarily unavailable.");
        if (data.wallet !== wallet!.toLowerCase() || data.page !== page || !Array.isArray(data.credits)) throw new Error("Winner credits could not be verified.");
        if (!controller.signal.aborted) { setResult({ key: key!, data }); setError(null); }
      } catch (cause) {
        if (!controller.signal.aborted) setError({ key: key!, message: cause instanceof Error ? cause.message : "Winner credits are temporarily unavailable." });
      } finally { if (!controller.signal.aborted) timer = setTimeout(load, 30_000); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [key, wallet, page, attempt]);
  return { data: result?.key === key ? result.data : null, error: error?.key === key ? error.message : null, refresh };
}
