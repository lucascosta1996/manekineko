"use client";

import { useEffect, useState } from "react";
import { formatEther } from "ethers";
import type { Snapshot } from "./chain";
import { collectionTiming } from "./timing";

export function CollectionTiming({
  state,
  stale,
  compact = false,
}: {
  state: Snapshot;
  stale: boolean;
  compact?: boolean;
}) {
  const [now, setNow] = useState(state.timestamp);
  useEffect(() => {
    const observedAt = Date.now();
    const update = () =>
      setNow(state.timestamp + Math.floor((Date.now() - observedAt) / 1000));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [state.block, state.timestamp, state.round?.address]);
  const r = state.round;
  if (!r) return null;
  const timing = collectionTiming(
    r,
    now,
    stale || Date.now() / 1000 - state.timestamp > 180
  );
  if (compact)
    return (
      <section
        className="public-timing"
        aria-label={`Collection timing: ${r.name}`}
      >
        <p className="protocol-note">{timing.label}{r.phase !== 7 && !timing.unavailable ? " · Estimated" : ""}</p>
        <p className="public-timer" role={r.phase === 7 ? undefined : "timer"} aria-live="off">
          {timing.value}
        </p>
        <p>{timing.detail}</p>
      </section>
    );
  return (
    <section
      className="operator-timing"
      aria-label={`Collection timing: ${r.name}`}
    >
      <p className="protocol-note">
        {r.name} · {timing.label}
      </p>
      <p className="operator-timing-value" role={r.phase === 7 ? undefined : "timer"} aria-live="off">
        {timing.value}
      </p>
      <p>{timing.detail}</p>
      {!timing.unavailable && r.phase !== 7 && r.randomnessDeadline > 0n && (
        <p className="protocol-note">
          Randomness cutoff:{" "}
          {new Date(Number(r.randomnessDeadline) * 1000)
            .toISOString()
            .replace("T", " ")
            .replace(".000Z", " UTC")}
          {r.phase >= 4 && r.phase <= 6 ? " · Met" : ""}
        </p>
      )}
      {!timing.unavailable && r.phase >= 2 && r.phase <= 4 && (
        <p className="protocol-note">
          Executor reward: {formatEther(r.executionReserve)} ETH, funded
          separately from mint receipts.
        </p>
      )}
      {!timing.unavailable && r.phase !== 7 && (
        <p className="protocol-note">
          Timing estimated from verified block {state.block}. Contract state
          determines availability.
        </p>
      )}
    </section>
  );
}
