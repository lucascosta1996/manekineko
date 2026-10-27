/** Illustrative choreography only. No wallet, RPC, balance or draw inputs. */
export const MACHINE_STEPS = [
  { id: "mint", label: "Mint", start: 0, duration: 2600, description: "Wallets mint NFTs. Their four numbers are fixed at mint." },
  { id: "pool", label: "Pool", start: 2600, duration: 500, description: "The collection sells out. 60% of mint revenue is reserved for prizes." },
  { id: "vrf", label: "VRF", start: 3100, duration: 1400, description: "After sellout, Chainlink VRF supplies verifiable randomness for the draw." },
  { id: "winners", label: "Winners", start: 4500, duration: 2100, description: "The draw reveals winning NFTs. Their numbers and artwork stay unchanged." },
  { id: "claims", label: "Claims", start: 6600, duration: 4000, description: "Winning NFT holders submit claims. Equal prizes leave the prize pool for their wallets." },
] as const;
export type MachinePhase = typeof MACHINE_STEPS[number]["id"];
export const MACHINE_DURATION = 12000;
export const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function machineFrame(milliseconds: number) {
  const time = Math.max(0, milliseconds) % MACHINE_DURATION;
  const step = [...MACHINE_STEPS].reverse().find((item) => time >= item.start)!;
  const progress = clamp((time - step.start) / step.duration);
  // Six separate claims drain only the illustrated prize allocation.
  const claims = Array.from({ length: 6 }, (_, index) => step.id === "claims" ? clamp((progress - index * .105) / .18) : 0);
  const prizeFill = step.id === "mint" ? progress : step.id === "claims" ? 1 - claims.reduce((sum, value) => sum + value, 0) / 6 : 1;
  return { phase: step.id, progress, prizeFill, claims };
}

export function stepTime(phase: MachinePhase) {
  const step = MACHINE_STEPS.find((item) => item.id === phase)!;
  // Selected storyboard frames show each completed stage, including an empty pool.
  return step.start + step.duration - 1;
}

export function arcPoint(from: { x: number; y: number }, to: { x: number; y: number }, progress: number, lift: number) {
  const t = clamp(progress), ease = t * t * (3 - 2 * t);
  return { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease - Math.sin(t * Math.PI) * lift };
}
