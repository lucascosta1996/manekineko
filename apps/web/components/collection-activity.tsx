"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CollectionPublic } from "../lib/collections/model";
import type { AffiliateProgram } from "../lib/affiliates/types";
import { enrollmentWindowClosed } from "../lib/affiliates/enrollment-window";
import { collectionActivity, collectionHasClosed, countdownParts } from "../lib/seasons/activity";
import { createDataPoller } from "../lib/live-data/poller";

export function useProtocolClock(initialNow?: number) {
  const [now, setNow] = useState<number | null>(initialNow ?? null);
  useEffect(() => {
    const tick = () => { if (!document.hidden) setNow(Date.now()); };
    tick();
    const interval = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, []);
  return now;
}

export function ProtocolCountdown({ target, label, now, expiredLabel = "Waiting for confirmation" }: { target: string; label: string; now: number; expiredLabel?: string }) {
  const parts = countdownParts(target, now);
  if (!parts) return null;
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(target));
  return <div className="protocol-countdown">
    <span className="activity-label">{label}</span>
    {parts.expired ? <strong>{expiredLabel}</strong> : <div className="countdown-units" role="timer" aria-live="off" aria-label={`${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds remaining`}>
      {([[parts.days, "days"], [parts.hours, "hrs"], [parts.minutes, "min"], [parts.seconds, "sec"]] as const).map(([value, unit]) => <span key={unit}><strong>{String(value).padStart(2, "0")}</strong><small>{unit}</small></span>)}
    </div>}
    <time dateTime={new Date(target).toISOString()}>{date} UTC</time>
  </div>;
}

function useEnrollmentProgram(collection: CollectionPublic, enabled: boolean) {
  const [state, setState] = useState<{ id: string; program: AffiliateProgram | null; receivedAt: number; unavailable: boolean }>({ id: collection.id, program: null, receivedAt: 0, unavailable: false });
  useEffect(() => {
    if (!enabled) return;
    const active = () => !document.hidden && navigator.onLine;
    const poller = createDataPoller({
      isActive: active,
      request: async signal => {
        const response = await fetch(`/api/collections/${collection.id}/affiliates`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
        if (!response.ok) throw new Error("Enrollment unavailable");
        const { program } = await response.json() as { program: AffiliateProgram };
        if (program?.collectionId !== collection.id || program.chainId !== collection.chainId || program.contractAddress?.toLowerCase() !== collection.contractAddress?.toLowerCase()
          || program.source !== "ethereum" || !Number.isInteger(program.maxSlots) || !Number.isInteger(program.enrolledSlots) || program.enrolledSlots < 0 || program.enrolledSlots > program.maxSlots
          || program.availableSlots !== program.maxSlots - program.enrolledSlots || typeof program.readiness?.canEnroll !== "boolean") throw new Error("Enrollment mismatch");
        return program;
      },
      onData: program => setState({ id: collection.id, program, receivedAt: Date.now(), unavailable: false }),
      onError: () => setState({ id: collection.id, program: null, receivedAt: 0, unavailable: true }),
    });
    const visibility = () => { if (active()) poller.refresh(); else { poller.pause(); setState({ id: collection.id, program: null, receivedAt: 0, unavailable: true }); } };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", visibility);
    window.addEventListener("offline", visibility);
    poller.refresh();
    return () => { poller.stop(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", visibility); window.removeEventListener("offline", visibility); };
  }, [collection.id, collection.chainId, collection.contractAddress, enabled]);
  return state.id === collection.id ? state : { program: null, receivedAt: 0, unavailable: false };
}

export function AffiliateWindow({ program, initialNow, canLink = false }: { program: AffiliateProgram; initialNow?: number; canLink?: boolean }) {
  const now = useProtocolClock(initialNow);
  if (now === null || program.mode !== "live") return null;
  const closed = program.enrollmentStatus === "closed" || program.saleActivated || program.soldOut || program.refundable || enrollmentWindowClosed(program.contractVersion, program.saleStartAt, now / 1000);
  const available = !closed && program.enrollmentStatus === "open" && program.readiness.canEnroll;
  return <div className="affiliate-window">
    <div className="activity-counter"><span>{closed ? "Affiliate enrollment closed" : program.availableSlots === 0 ? "Affiliate positions filled" : available ? "Affiliate enrollment open" : "Affiliate enrollment unavailable"}</span><strong>{closed ? `${program.enrolledSlots} / ${program.maxSlots}` : `${program.availableSlots} / ${program.maxSlots}`}</strong></div>
    <p>{closed ? "Enrolled positions" : "Positions remaining"}</p>
    {available && program.saleStartAt && <ProtocolCountdown target={program.saleStartAt} label="Enrollment closes in" now={now} expiredLabel="Enrollment closed" />}
    {canLink && <Link className="activity-link" href={`/mint/${program.collectionId}/affiliates`}>{available ? "Join the affiliate program" : "View affiliate rewards"}<span aria-hidden="true">↗</span></Link>}
  </div>;
}

export function CollectionActivity({ collection, previous, initialNow, showEnrollment = false }: { collection: CollectionPublic; previous?: CollectionPublic; initialNow?: number; showEnrollment?: boolean }) {
  const now = useProtocolClock(initialNow);
  const pending = !collectionHasClosed(collection) && (collection.phase === "pending_activation" || collection.phase === "minting" && Date.parse(collection.saleStartAt ?? "") > (now ?? initialNow ?? 0));
  const checkEnrollment = showEnrollment && pending && (!previous || collectionHasClosed(previous)) && collection.contractVersion !== "legacy" && collection.mode === "live";
  const enrollment = useEnrollmentProgram(collection, checkEnrollment);
  if (now === null || collection.mode !== "live") return null;
  const activity = collectionActivity(collection, now, previous);
  const refunded = collection.phase === "refundable";
  const awards = collection.awards ?? [];
  const showAwards = awards.length > 0 && ["awaiting_prize", "complete"].includes(collection.phase ?? "");
  const count = refunded ? (collection.refundedCount ?? 0) : showAwards ? awards.filter(a => a.claimed).length : collection.totalMinted;
  const total = refunded ? collection.totalMinted : showAwards ? awards.length : collection.maxSupply;
  const freshProgram = enrollment.program && now - enrollment.receivedAt < 45000 ? enrollment.program : null;
  return <div className="collection-activity">
    <span className="activity-label">{activity.label}</span>
    {activity.target && <ProtocolCountdown target={activity.target} label={activity.countdownLabel} now={now} />}
    <p className="activity-detail">{activity.detail}</p>
    <div className="activity-counter"><span>{refunded ? "Tickets refunded" : showAwards ? "Prizes claimed" : "Tickets minted"}</span><strong>{count.toLocaleString("en-US")} / {total.toLocaleString("en-US")}</strong></div>
    <progress value={count} max={Math.max(1, total)} aria-label={refunded ? "Refund progress" : showAwards ? "Prize claim progress" : "Mint progress"} />
    {checkEnrollment && (freshProgram ? <AffiliateWindow program={freshProgram} initialNow={now} canLink /> : <p className="activity-detail">{enrollment.unavailable || enrollment.program ? "Affiliate availability is temporarily unavailable. Checking again…" : "Checking affiliate positions…"}</p>)}
  </div>;
}
