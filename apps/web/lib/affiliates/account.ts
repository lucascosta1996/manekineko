import { AffiliateError, affiliateStatus, configuredOrigin } from "./policy.ts";
import type { ChainSnapshot } from "./chain.ts";
import type { ProgramRecord } from "./repository.ts";
import type { AffiliateAccount } from "./types.ts";

/** Sharing links is optional for reads and withdrawals; enrollment still requires its exact configured origin. */
export function affiliateReferralUrl(record: Pick<ProgramRecord, "collectionId" | "contractAddress" | "mode">, affiliateId: number, env: Record<string, string | undefined> = process.env): string | null {
  const query = new URLSearchParams({ affiliate: String(affiliateId), collection: record.contractAddress ?? "demo" });
  const path = `/mint/${record.collectionId}?${query}`;
  if (record.mode === "demo") return path;
  try { return new URL(path, configuredOrigin(env)).toString(); }
  catch (error) {
    if (error instanceof AffiliateError && error.code === "enrollment_unavailable") return null;
    throw error;
  }
}

/** Reads only public chain state. Never requires an enrollment key, bot secret, or website origin. */
export async function readAffiliateAccount(snapshot: ChainSnapshot, wallet?: string, env: Record<string, string | undefined> = process.env): Promise<AffiliateAccount | null> {
  if (!wallet) return null;
  const id = Number(await snapshot.call("affiliateIdOf", [wallet]));
  if (!id) return { wallet, affiliateId: null, commissionBps: 0, status: "unregistered", accruedWei: "0", claimedWei: "0", claimableWei: "0", pendingWei: "0", referredMints: 0, referralUrl: null };
  const [registered, accruedValue, claimedValue, claimableValue] = await Promise.all([snapshot.call("affiliateWallet", [id]), snapshot.call("affiliateAccrued", [id]), snapshot.call("affiliateClaimed", [id]), snapshot.call("affiliateClaimable", [id])]);
  const accrued = BigInt(accruedValue as bigint), claimed = BigInt(claimedValue as bigint), claimable = BigInt(claimableValue as bigint);
  const pool = snapshot.record.contractVersion === "affiliate-v5" || (snapshot.record.contractVersion === "affiliate-v6" || snapshot.record.contractVersion === "affiliate-v7" || (snapshot.record.contractVersion === "affiliate-v8" || snapshot.record.contractVersion === "affiliate-v9" || snapshot.record.contractVersion === "affiliate-v10"));
  const rate = pool ? snapshot.record.affiliatePoolBps! : snapshot.record.affiliateRatesBps[id - 1];
  const estimate = pool && !snapshot.soldOut && !snapshot.refundable ? BigInt(await snapshot.call("affiliateEstimatedShare", [id]) as bigint) : accrued;
  const referredMints = snapshot.record.contractVersion !== "affiliate-v3" ? Number(await snapshot.call("affiliateReferredMints", [id])) : Number(accrued / (BigInt(snapshot.record.mintPriceWei) / 100n));
  if (String(registered).toLowerCase() !== wallet || id > snapshot.record.maxSlots || claimed > accrued || claimable !== (snapshot.soldOut ? accrued - claimed : 0n)
    || referredMints > snapshot.totalMinted || (pool ? referredMints > snapshot.totalReferredMints || (!snapshot.soldOut && accrued !== 0n) || accrued > snapshot.totalAccrued : accrued !== BigInt(referredMints) * BigInt(snapshot.record.mintPriceWei) * BigInt(rate) / 10000n)) throw new AffiliateError("invalid_account", "The affiliate balance could not be verified.", 503);
  return { ...((["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(snapshot.record.contractVersion ?? "")) ? { qualified: referredMints >= snapshot.record.minAffiliateReferrals!, referralsRemaining: Math.max(0,snapshot.record.minAffiliateReferrals!-referredMints) } : {}), wallet, affiliateId: id, commissionBps: rate, status: affiliateStatus(estimate, claimed, snapshot.soldOut, snapshot.refundable, referredMints), accruedWei: String(accrued), claimedWei: String(claimed), claimableWei: String(claimable), pendingWei: !snapshot.soldOut && !snapshot.refundable ? String(estimate) : "0", referredMints, referralUrl: affiliateReferralUrl(snapshot.record, id, env) };
}
