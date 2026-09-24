import { formatWei } from "../../lib/mint/format.ts";

/** Display immutable reward terms as exact ETH amounts, without floating-point rounding. */
export function formatRewardAllocation(revenueWei: string | bigint, basisPoints: number): string {
  const revenue = BigInt(revenueWei);
  if (revenue < 0n || !Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) throw new Error("Invalid reward terms.");
  return formatWei(revenue * BigInt(basisPoints) / 10_000n);
}
