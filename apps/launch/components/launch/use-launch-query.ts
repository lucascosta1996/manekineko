"use client";
import { useEffect, useRef, useState } from "react";
import type { LaunchChainId } from "../../lib/chain-policy";
import { observedClock } from "@manekineko/contract-abi/lifecycle";
import { currentLaunchResponse } from "../../lib/launch-navigation";

/** Bounded, chain-partitioned read-only refresh shared by dashboard/operations consumers. */
export function useLaunchQuery<T extends { chainId: LaunchChainId; checkedAt: string }>(endpoint: string, chainId: LaunchChainId) {
  const [result, setResult] = useState<{ data: T; receivedAt: number } | null>(null);
  const [monotonicNow, setMonotonicNow] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const id = ++generation.current, controller = new AbortController();
    setLoading(true); setError("");
    void fetch(`${endpoint}?chainId=${chainId}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again and refresh." : data.message ?? "State is unavailable. Refresh to retry.");
      if (controller.signal.aborted || id !== generation.current) return;
      if (!currentLaunchResponse(data.chainId, chainId, id, generation.current)) throw new Error("The response belongs to a different network. Refresh to retry.");
      setResult({ data, receivedAt: performance.now() });
    }).catch(cause => { if (!controller.signal.aborted && id === generation.current) setError(cause instanceof Error ? cause.message : "State unavailable."); })
      .finally(() => { if (!controller.signal.aborted && id === generation.current) setLoading(false); });
    return () => { generation.current++; controller.abort(); };
  }, [endpoint, chainId, refresh]);
  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") setRefresh(value => value + 1); };
    const timer = window.setInterval(update, 60_000);
    const clock = window.setInterval(() => setMonotonicNow(performance.now()), 1_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); window.clearInterval(clock); document.removeEventListener("visibilitychange", update); };
  }, []);
  const observedNow = result?.data.chainId === chainId ? observedClock(Date.parse(result.data.checkedAt), result.receivedAt, monotonicNow) : null;
  return { observedNow, data: result?.data.chainId === chainId ? result.data : null, receivedAt: result?.data.chainId === chainId ? result.receivedAt : null, error, loading, refresh: () => setRefresh(value => value + 1) };
}
