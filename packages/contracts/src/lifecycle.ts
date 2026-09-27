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
