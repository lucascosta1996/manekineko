import { parseV6Config } from "@manekineko/contract-abi/v6-config";

/** V8 freezes scheduled sale time, independent NFT awards and qualified equal affiliate payouts. */
export function parseV8Config(input: unknown, chainId: bigint, timestamp: bigint) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || (input as Record<string, unknown>).algorithmVersion !== "unique-rank-v5") {
    throw new Error("V8 requires algorithmVersion=unique-rank-v5.");
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
  const winnerCount = integer("winnerCount");
  const minAffiliateReferrals = integer("minAffiliateReferrals");
  const affiliatePayoutCapBps = integer("affiliatePayoutCapBps");
  if (raw.secondPrizeBps !== undefined) throw new Error("V8 accepts winnerCount and equal prizes, not secondPrizeBps.");
  if (winnerCount < 1n || winnerCount > 10n || terms.config.maxSupply < winnerCount || terms.config.prizeBps === 0n || terms.config.prizeBps % winnerCount !== 0n)
    throw new Error("Use 1 to 10 winning NFTs, enough supply and a positive total prize percentage divisible by winnerCount.");
  if (minAffiliateReferrals < 1n || minAffiliateReferrals > terms.config.maxSupply) throw new Error("minAffiliateReferrals must be between one and collection supply.");
  if (affiliatePayoutCapBps < 1n || affiliatePayoutCapBps > 10_000n) throw new Error("affiliatePayoutCapBps must be between 1 and 10000.");
  return { ...terms, config: { ...terms.config, winnerCount, minAffiliateReferrals, affiliatePayoutCapBps, saleStartAt } };
}
