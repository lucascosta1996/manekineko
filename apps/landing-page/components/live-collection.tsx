"use client";
import { TextAction } from "@manekineko/ui/button";
import { Icon } from "@manekineko/ui/icons";
import { useEffect, useRef, useState } from "react";
import { observedClock, type FeaturedCollectionSummary } from "@manekineko/contract-abi/lifecycle";
import { parseLiveCollection } from "../lib/live-collection";

type Observation = { collection: FeaturedCollectionSummary | null; phase: "pending" | "ready" | "empty" | "error" | "stale"; busy: boolean };
function readResponse(data: unknown): FeaturedCollectionSummary | null {
  if (!data || typeof data !== "object" || !("collection" in data)) throw new Error("Invalid collection response");
  const value = data.collection;
  if (value === null) return null;
  if (!value || typeof value !== "object" || !("href" in value) || typeof value.href !== "string") throw new Error("Invalid collection response");
  const url = new URL(value.href, window.location.origin);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid collection link");
  return parseLiveCollection({ ...value, href: url.pathname }, url);
}
export function LiveCollection() {
  const [observation, setObservation] = useState<Observation>({ collection: null, phase: "pending", busy: true });
  const [now, setNow] = useState<number | null>(null);
  const anchor = useRef<{ server: number; clock: number; received: number } | null>(null);
  const request = useRef<() => void>(() => {});
  const region = useRef<HTMLDivElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const collectionLink = useRef<HTMLAnchorElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (restoreFocus.current && (observation.phase === "ready" || observation.phase === "empty")) {
      restoreFocus.current = false;
      (collectionLink.current ?? region.current)?.focus({ preventScroll: true });
    }
  }, [observation.phase]);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let activeRequest: AbortController | null = null;
    async function refresh() {
      if (document.hidden || pending || controller.signal.aborted) return;
      if (!navigator.onLine) {
        setObservation(previous => ({ ...previous, phase: previous.collection ? "stale" : "error", busy: false }));
        return;
      }
      pending = true;
      setObservation(previous => ({ ...previous, busy: true }));
      const requestController = new AbortController();
      activeRequest = requestController;
      const signal = AbortSignal.any([controller.signal, requestController.signal]);
      let rejectAbort: () => void = () => {};
      const interrupted = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(new Error("Observation interrupted"));
        signal.addEventListener("abort", rejectAbort, { once: true });
      });
      const timeout = window.setTimeout(() => requestController.abort(), 12000);
      try {
        // Bound the whole observation, including body parsing. Some browsers do
        // not settle an intercepted/stalled fetch immediately when aborted.
        const collection = await Promise.race([
          fetch("/api/live-collection", { cache: "no-store", signal }).then(async response => {
            if (!response.ok) throw new Error("Collection unavailable");
            return readResponse(await response.json());
          }),
          interrupted,
        ]);
        if (!navigator.onLine || requestController.signal.aborted) throw new Error("Observation interrupted");
        if (!controller.signal.aborted) {
          anchor.current = collection ? { server: Date.parse(collection.serverNow), clock: Date.parse(collection.chainTimestamp ?? collection.serverNow), received: performance.now() } : null;
          setNow(anchor.current?.clock ?? null);
          restoreFocus.current = document.activeElement === retry.current && retry.current !== null;
          setObservation({ collection, phase: collection ? "ready" : "empty", busy: false });
        }
      } catch {
        if (!controller.signal.aborted) setObservation(previous => ({ ...previous, phase: previous.collection ? "stale" : "error", busy: false }));
      } finally { clearTimeout(timeout); signal.removeEventListener("abort", rejectAbort); activeRequest = null; pending = false; }
    }
    request.current = () => { void refresh(); };
    const resume = () => { if (!document.hidden) void refresh(); };
    const offline = () => {
      activeRequest?.abort();
      setObservation(previous => ({ ...previous, phase: previous.collection ? "stale" : "error", busy: false }));
    };
    void refresh();
    const poll = setInterval(() => void refresh(), 20000);
    const clock = setInterval(() => { if (!document.hidden && anchor.current) setNow(observedClock(anchor.current.clock, anchor.current.received, performance.now())); }, 1000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    return () => { controller.abort(); clearInterval(poll); clearInterval(clock); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); window.removeEventListener("offline", offline); };
  }, []);
  const { collection, phase, busy } = observation;
  const failed = phase === "error" || phase === "stale";
  const seconds = now === null || !collection?.target ? null : Math.max(0, Math.ceil((Date.parse(collection.target) - now) / 1000));
  const serverNow = anchor.current ? observedClock(anchor.current.server, anchor.current.received, performance.now()) : null;
  const fresh = !!collection && !failed && !collection.stale && serverNow !== null && serverNow - Date.parse(collection.updatedAt) <= 180000;
  const live = collection?.status === "live" && fresh && seconds !== 0;
  const unavailable = !fresh && (failed || collection?.status !== "scheduled");
  const awaitingConfirmation = seconds === 0 && (collection?.status === "live" || collection?.status === "scheduled");
  const colors = collection?.seasonColors ?? [];
  const stops = colors.length === 1 ? [colors[0], colors[0]] : colors;
  const backgroundImage = stops.length ? `linear-gradient(90deg, ${stops.map(color => `color-mix(in srgb, ${color} 40%, var(--ui-canvas))`).join(", ")})` : undefined;
  return <div ref={region} className="collection-announcement" data-phase={phase} data-palette={Boolean(backgroundImage)} style={{ backgroundImage }} role="region" tabIndex={-1} aria-label="Collection status">
    <div className="collection-announcement-content wrap">
      <span className="collection-announcement-message" role="status" aria-atomic="true">{phase === "pending" ? "Checking collection status…" : phase === "empty" ? "No published collection is available yet." : failed ? collection ? "Details may be out of date." : "Collection status is temporarily unavailable." : ""}</span>
      {collection && <>
        <div className="collection-announcement-summary">
          <span className="lifecycle-badge" data-live={live}>{unavailable ? "Status unavailable" : awaitingConfirmation ? "Checking availability" : collection.label}</span>
          <a ref={collectionLink} className="ui-text-action" href={collection.href} aria-describedby="collection-observation"><strong>{collection.name}</strong><Icon name="diagonal" /></a>
        </div>
        {unavailable && !failed && <span>Details may be out of date.</span>}
        {live && collection.remainingSupply !== null && <span className="collection-announcement-detail">{collection.remainingSupply.toLocaleString("en-US")} tickets remaining</span>}
        {seconds !== null && !failed && (fresh || collection.status === "scheduled") && <span className="collection-announcement-detail" role="timer" aria-live="off">{seconds === 0 ? "Scheduled time reached · checking availability" : `${collection.status === "live" ? "Mint closes" : "Mint scheduled"} in ${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`}</span>}
        {fresh && collection.unpaidPrizes !== null && collection.unpaidPrizes > 0 && <span className="collection-announcement-detail">{collection.unpaidPrizes} prizes available to claim</span>}
        <span id="collection-observation" className="visually-hidden">{unavailable ? "We couldn’t confirm the latest status. Details may be out of date. " : ""}{collection.status === "scheduled" ? "Published schedule; deployment and activation still require confirmation. " : ""}Last observed: {new Date(collection.updatedAt).toUTCString()}</span>
      </>}
      {failed && <TextAction ref={retry} busy={busy} onClick={() => request.current()} icon={<Icon name="refresh" />}>Refresh</TextAction>}
    </div>
  </div>;
}
