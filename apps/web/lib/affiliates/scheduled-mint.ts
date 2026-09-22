import type { AffiliateProgram } from "./types.ts";

/** Recheck the chain at the fixed start, then briefly retry while its block clock catches up. */
export function scheduledMintRecheckDelay(program: AffiliateProgram | null, now = Date.now()): number | null {
  if (!program || !["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(program.contractVersion ?? "") || !program.saleStartAt || !program.saleActivated
    || program.soldOut || program.refundable || program.readiness.canMint) return null;
  const start = Date.parse(program.saleStartAt), deadline = Date.parse(program.mintDeadline ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(deadline) || now >= deadline) return null;
  return Math.min(86_400_000, Math.max(15_000, start - now + 1_000));
}
