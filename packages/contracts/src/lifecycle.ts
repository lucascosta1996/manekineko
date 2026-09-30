/** A published schedule is durable intent; only a recent observation describes readiness. */
export function observationFresh(observedAt: string | null | undefined, now: number, maxAgeMs = 180_000): boolean {
  const at = Date.parse(observedAt ?? "");
  return Number.isFinite(now) && Number.isFinite(at) && at <= now + 60_000 && now - at <= maxAgeMs;
}

export function lifecycleStage(phase: string | null | undefined, deployment = "deployed") {
  if (deployment === "deploying") return { label: "Contract deployment in progress", busy: true, live: false };
  if (deployment !== "deployed") return { label: "Awaiting deployment", busy: false, live: false };
  const labels: Record<string, string> = {
    pending_activation: "Awaiting activation", minting: "Mint open", awaiting_request: "Sold out · randomness request pending",
    awaiting_randomness: "Waiting for Chainlink VRF", awaiting_finalization: "Randomness received · finalizing draw",
    awaiting_reveal: "Draw pending", settling: "Finalizing draw", awaiting_prize: "Prizes ready to claim",
    complete: "Prizes paid", refundable: "Refunds available",
  };
  return { label: labels[phase ?? ""] ?? "State unavailable", live: phase === "minting", busy: ["awaiting_request", "awaiting_randomness", "awaiting_finalization", "awaiting_reveal", "settling"].includes(phase ?? "") };
}

export function enrollmentTiming(opensAt: string | null | undefined, closesAt: string | null | undefined, now: number) {
  if (closesAt && Date.parse(closesAt) <= now) return { state: "closed" as const, target: null, label: "Enrollment closed" };
  if (opensAt && Date.parse(opensAt) > now) return { state: "scheduled" as const, target: opensAt, label: "Enrollment opens in" };
  return { state: "window" as const, target: closesAt ?? null, label: "Enrollment closes in" };
}

export type LifecycleInput = {
  phase?: string | null; deployment?: string; observedAt?: string | null; now: number;
  winnerCount?: number | null; awards?: readonly { claimed: boolean }[]; allPrizesPaid?: boolean;
};
export type CollectionLifecycleState = "unavailable" | "pending_activation" | "minting" | "processing" | "claimable" | "paid" | "refundable";

/** Chain outcomes, payment completion and worker execution are independent facts. */
export function collectionLifecycle(input: LifecycleInput) {
  const fresh = observationFresh(input.observedAt, input.now);
  const result = (state: CollectionLifecycleState, label: string, unpaidPrizes: number | null = null) => ({
    state, label, fresh, terminal: fresh && ["claimable", "paid", "refundable"].includes(state),
    unpaidPrizes, allPrizesPaid: state === "paid",
  });
  if (!fresh) return result("unavailable", input.observedAt ? "Observation delayed" : "State unavailable");
  if (input.deployment && input.deployment !== "deployed") return result("pending_activation", "Awaiting deployment");
  if (input.phase === "refundable") return result("refundable", "Refunds available");
  if (input.phase === "pending_activation") return result("pending_activation", "Awaiting activation");
  if (input.phase === "minting") return result("minting", "Mint open");
  if (["awaiting_request", "awaiting_randomness", "awaiting_finalization", "awaiting_reveal", "settling"].includes(input.phase ?? "")) {
    return result("processing", "Latest collection prizes and winners are being processed");
  }
  if (["awaiting_prize", "complete"].includes(input.phase ?? "")) {
    const count = input.winnerCount ?? input.awards?.length;
    if (count && input.awards?.length === count) {
      const unpaid = input.awards.filter(award => !award.claimed).length;
      if ((input.phase === "complete") !== (unpaid === 0) || input.allPrizesPaid !== undefined && input.allPrizesPaid !== (unpaid === 0)) {
        return result("unavailable", "Results awaiting reconciliation");
      }
      return result(unpaid ? "claimable" : "paid", unpaid ? "Prizes available to winning ticket holders" : "All prizes paid", unpaid);
    }
    // Legacy single-award projections do not have ranked award rows.
    if (!input.winnerCount && !input.awards?.length && input.allPrizesPaid !== undefined) {
      return result(input.allPrizesPaid ? "paid" : "claimable", input.allPrizesPaid ? "All prizes paid" : "Prize available to the winning ticket holder", input.allPrizesPaid ? 0 : 1);
    }
    return result("unavailable", "Results awaiting reconciliation");
  }
  return result("unavailable", "State unavailable");
}

/** expectedCollectionIds must come from the actual prepared/published sequence, never a palette. */
export function seasonLifecycle(collections: readonly (LifecycleInput & { id: string })[], expectedCollectionIds?: readonly string[]) {
  const ids = [...new Set(expectedCollectionIds ?? collections.map(c => c.id))];
  const observed = ids.map(id => collections.find(c => c.id === id)).map(c => c ? collectionLifecycle(c) : null);
  const completedCollections = observed.filter(c => c?.terminal).length;
  const unavailable = !ids.length || observed.some(c => !c || c.state === "unavailable");
  return {
    state: unavailable ? "unavailable" as const : completedCollections === ids.length ? "complete" as const : "active" as const,
    completedCollections: unavailable ? null : completedCollections, totalCollections: ids.length,
    unpaidPrizes: unavailable || observed.some(c => c && c.unpaidPrizes === null && c.state !== "refundable") ? null : observed.reduce((n, c) => n + (c?.unpaidPrizes ?? 0), 0),
    allPrizesPaid: !unavailable && observed.length > 0 && observed.every(c => c?.allPrizesPaid),
  };
}

/** Advance a server/chain observation using elapsed monotonic time, never the device wall clock. */
export function observedClock(anchorMs: number, receivedMonotonicMs: number, monotonicNowMs: number): number | null {
  const elapsed = monotonicNowMs - receivedMonotonicMs;
  return Number.isFinite(anchorMs) && Number.isFinite(elapsed) && elapsed >= 0 ? anchorMs + elapsed : null;
}

export type FeaturedCollectionSummary = {
  name: string; href: string; status: "live" | "scheduled" | "processing" | "claimable" | "paid" | "complete" | "refundable" | "unavailable";
  label: string; target: string | null; updatedAt: string; stale: boolean; serverNow: string;
  chainTimestamp: string | null; remainingSupply: number | null; unpaidPrizes: number | null;
  completedCollections: number | null; totalCollections: number | null;
  /** Public season palette in its published order; optional for older API responses. */
  seasonColors?: string[];
};
