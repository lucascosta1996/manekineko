import type { CollectionPublic } from "./model.ts";
import { formatCount, formatWei } from "../mint/format.ts";

export function collectionWinnerCount(collection: Pick<CollectionPublic, "contractVersion" | "winnerCount">): number {
  if ((collection.contractVersion === "affiliate-v8" || collection.contractVersion === "affiliate-v9" || collection.contractVersion === "affiliate-v10")) {
    if (!Number.isInteger(collection.winnerCount) || collection.winnerCount! < 1) throw new Error("Collection winner count is unavailable.");
    return collection.winnerCount!;
  }
  return collection.contractVersion === "affiliate-v7" ? 2 : 1;
}

/** Use deployed terms for each collection; never rewrite a historical draw into the current format. */
export function collectionPrizeCopy(collection: CollectionPublic): string {
  const count = collectionWinnerCount(collection);
  if ((collection.contractVersion === "affiliate-v8" || collection.contractVersion === "affiliate-v9" || collection.contractVersion === "affiliate-v10")) {
    const total = BigInt(collection.mintPriceWei) * BigInt(collection.maxSupply) * BigInt(collection.prizeBps) / 10_000n;
    return `${count} winning tickets · ${formatWei(total / BigInt(count), collection.nativeCurrency.decimals)} ${collection.nativeCurrency.symbol} each at sellout`;
  }
  return count === 1 ? "1 winning ticket · Original collection rules" : `${count} winning tickets · Ranked prizes`;
}

export function collectionReferralCopy(collection: CollectionPublic): string {
  if (collection.contractVersion === "affiliate-v7" || (collection.contractVersion === "affiliate-v8" || collection.contractVersion === "affiliate-v9" || collection.contractVersion === "affiliate-v10")) {
    const minimum = collection.minAffiliateReferrals;
    return minimum ? `Affiliates qualify with ${formatCount(minimum)} paid referrals, then share the affiliate pool equally at sellout, subject to the collection’s payout cap.`
      : "Affiliates must meet the collection’s paid-referral minimum to share its pool equally at sellout, subject to its payout cap.";
  }
  return "This collection retains its original affiliate terms. View its program for eligibility and referral earnings.";
}
