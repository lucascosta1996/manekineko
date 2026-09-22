import { parseV6Config } from "@manekineko/contract-abi/v6-config";

/** V7 freezes scheduled sale time, independent NFT awards and qualified equal affiliate payouts. */
export function parseV7Config(input: unknown, chainId: bigint, timestamp: bigint) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || (input as Record<string, unknown>).algorithmVersion !== "unique-rank-v4") {
    throw new Error("V7 requires algorithmVersion=unique-rank-v4.");
  }
  const raw = input as Record<string, unknown>;
  const integer = (field: string) => {
    if (typeof raw[field] !== "string" || !/^(0|[1-9]\d*)$/.test(raw[field])) throw new Error(`${field} must be a canonical decimal string.`);
    return BigInt(raw[field]);
  };
  const saleStartAt = integer("saleStartAt");
  if (saleStartAt <= timestamp) throw new Error("saleStartAt must be a resolved future UTC timestamp before deployment.");
  // The sales window starts at the scheduled opening, not the earlier preparation/deployment timestamp.
  const terms = parseV6Config({ ...raw, algorithmVersion: "unique-rank-v3" }, chainId, saleStartAt);
  const secondPrizeBps = integer("secondPrizeBps");
  const minAffiliateReferrals = integer("minAffiliateReferrals");
  const affiliatePayoutCapBps = integer("affiliatePayoutCapBps");
  if (terms.config.prizeBps === 0n || secondPrizeBps === 0n || secondPrizeBps >= terms.config.prizeBps || secondPrizeBps * 2n > terms.config.prizeBps
    || terms.config.maxSupply < 2n) throw new Error("Use two positive prizes with the first at least as large as the second.");
  if (minAffiliateReferrals < 1n || minAffiliateReferrals > terms.config.maxSupply) throw new Error("minAffiliateReferrals must be between one and collection supply.");
  if (affiliatePayoutCapBps < 1n || affiliatePayoutCapBps > 10_000n) throw new Error("affiliatePayoutCapBps must be between 1 and 10000.");
  return { ...terms, config: { ...terms.config, secondPrizeBps, minAffiliateReferrals, affiliatePayoutCapBps, saleStartAt } };
}
