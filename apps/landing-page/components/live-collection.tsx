"use client";
import { useEffect, useState } from "react";
type Summary = { name: string; href: string; status: "live" | "scheduled"; target: string; updatedAt: string; stale: boolean };
export function LiveCollection() {
  const [collection, setCollection] = useState<Summary | null>(null);
  const [state, setState] = useState("Checking live collection…");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const response = await fetch("/api/live-collection", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) { setCollection(data.collection); setState("The next collection will appear after its announcement."); }
      } catch { if (!controller.signal.aborted) { setCollection(null); setState("Live collection status is temporarily unavailable."); } }
      finally { pending = false; }
    }
    void refresh(); const poll = setInterval(() => void refresh(), 20000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); clearInterval(poll); clearInterval(clock); };
  }, []);
  if (!collection) return <p className="hero-live" role="status">{state}</p>;
  const seconds = now === null ? null : Math.max(0, Math.ceil((Date.parse(collection.target) - now) / 1000));
  const fresh = now !== null && now - Date.parse(collection.updatedAt) <= 180000 && Date.parse(collection.updatedAt) <= now + 60000;
  const live = collection.status === "live" && fresh && seconds !== 0;
  return <div className="hero-live"><span className="lifecycle-badge" data-live={live}>{live ? "Mint open" : collection.status === "scheduled" ? "Upcoming collection" : "Checking availability"}</span>
    <p><a href={collection.href}><strong>{collection.name} ↗</strong></a></p>
    {seconds !== null && <p role="timer" aria-live="off">{seconds === 0 ? "Scheduled time reached · checking activation" : `${collection.status === "live" ? "Mint closes" : "Mint scheduled"} in ${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`}</p>}
    <small>{collection.stale || !fresh ? "Readiness update delayed. " : ""}{collection.status === "scheduled" ? "Minting requires contract activation. " : ""}Last checked: {new Date(collection.updatedAt).toUTCString()}</small>
  </div>;
}
