import { parseV10Config } from "./v10-config.ts";
/** V11 gives every qualifying affiliate an equal share of the full pool. */
export function parseV11Config(input: unknown, chainId: bigint, timestamp: bigint) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid V11 terms.");
  const raw = input as Record<string, unknown>;
  if (String(raw.minAffiliateReferrals) !== "1" || String(raw.affiliatePayoutCapBps) !== "0") throw new Error("V11 requires one paid referral and no payout cap.");
  const terms = parseV10Config({ ...raw, contractVersion: "affiliate-v10", affiliatePayoutCapBps: "3000" }, chainId, timestamp);
  return { ...terms, config: { ...terms.config, minAffiliateReferrals: 1n, affiliatePayoutCapBps: 0n } };
}
