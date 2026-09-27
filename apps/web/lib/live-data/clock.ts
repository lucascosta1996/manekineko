import { observedClock } from "@manekineko/contract-abi/lifecycle";

let sample: { server: number; received: number } | null = null;
let pending: Promise<void> | null = null;
export function serverClockNow(): number | null {
  return sample ? observedClock(sample.server, sample.received, performance.now()) : null;
}
export async function synchronizeClock() {
  if (pending) return pending;
  if (sample && performance.now() - sample.received < 20_000) return;
  pending = (async () => {
    const response = await fetch("/api/clock", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Clock unavailable");
    const value = await response.json();
    const server = Date.parse(value.now);
    if (!Number.isFinite(server)) throw new Error("Clock unavailable");
    sample = { server, received: performance.now() };
  })().finally(() => { pending = null; });
  return pending;
}
