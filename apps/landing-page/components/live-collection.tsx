"use client";
import { Icon } from "@manekineko/ui/icons";
import { useEffect, useRef, useState } from "react";
import { observedClock, type FeaturedCollectionSummary } from "@manekineko/contract-abi/lifecycle";
export function LiveCollection() {
  const [collection, setCollection] = useState<FeaturedCollectionSummary | null>(null);
  const [state, setState] = useState("Checking collection status…");
  const [now, setNow] = useState<number | null>(null);
  const anchor = useRef<{ server: number; clock: number; received: number } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const response = await fetch("/api/live-collection", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
        if (!response.ok) throw new Error();
        const data = await response.json() as { collection: FeaturedCollectionSummary | null };
        if (!controller.signal.aborted) {
          setCollection(data.collection); setState("No published collection is available yet.");
          anchor.current = data.collection ? { server: Date.parse(data.collection.serverNow), clock: Date.parse(data.collection.chainTimestamp ?? data.collection.serverNow), received: performance.now() } : null;
          setNow(anchor.current?.clock ?? null);
        }
      } catch { if (!controller.signal.aborted) { setCollection(null); anchor.current = null; setState("Collection status is temporarily unavailable."); } }
      finally { pending = false; }
    }
    const resume = () => { if (!document.hidden) void refresh(); };
    void refresh(); const poll = setInterval(() => void refresh(), 20000);
    const clock = setInterval(() => { if (!document.hidden && anchor.current) setNow(observedClock(anchor.current.clock, anchor.current.received, performance.now())); }, 1000);
    document.addEventListener("visibilitychange", resume); window.addEventListener("online", resume);
    return () => { controller.abort(); clearInterval(poll); clearInterval(clock); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); };
  }, [retry]);
  if (!collection) return <div className="hero-live" role="status"><p>{state}</p><button type="button" className="text-link" onClick={() => setRetry(n => n + 1)}>Refresh</button></div>;
  const seconds = now === null || !collection.target ? null : Math.max(0, Math.ceil((Date.parse(collection.target) - now) / 1000));
  const serverNow = anchor.current ? observedClock(anchor.current.server, anchor.current.received, performance.now()) : null;
  const fresh = !collection.stale && serverNow !== null && serverNow - Date.parse(collection.updatedAt) <= 180000;
  const live = collection.status === "live" && fresh && seconds !== 0;
  return <div className="hero-live"><span className="lifecycle-badge" data-live={live}>{!fresh && collection.status !== "scheduled" ? "Observation delayed · last known state" : collection.label}</span>
    <p><a href={collection.href}><strong>{collection.name} <Icon name="diagonal" /></strong></a></p>
    {live && collection.remainingSupply !== null && <p>{collection.remainingSupply.toLocaleString("en-US")} tickets remaining</p>}
    {seconds !== null && (fresh || collection.status === "scheduled") && <p role="timer" aria-live="off">{seconds === 0 ? "Scheduled time reached · checking availability" : `${collection.status === "live" ? "Mint closes" : "Mint scheduled"} in ${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`}</p>}
    {fresh && collection.unpaidPrizes !== null && collection.unpaidPrizes > 0 && <p>{collection.unpaidPrizes} prizes available to their current winning ticket holders.</p>}
    <small>{collection.status === "scheduled" ? "Published schedule; deployment and activation still require confirmation. " : ""}Last observed: {new Date(collection.updatedAt).toUTCString()}</small>
  </div>;
}
