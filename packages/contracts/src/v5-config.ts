import { getAddress, ZeroAddress } from "ethers";
import { parseV2Config } from "@manekineko/contract-abi/v2-config";

/** Immutable V5 pool: every referred sale has equal weight; position count never multiplies the pool. */
export function parseV5Config(input: unknown, chainId: bigint, timestamp: bigint) {
  const terms = parseV2Config(input, chainId, timestamp);
  const raw = input as Record<string, unknown>;
  if (raw.algorithmVersion !== undefined && raw.algorithmVersion !== "unique-rank-v2") throw new Error("V5 requires unique-rank-v2; use the matching versioned deployment tool.");
  function integer(value: unknown, label: string): bigint {
    if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) throw new Error(`${label} must be a canonical decimal string.`);
    return BigInt(value);
  }
  const maxAffiliateSlots = integer(raw.maxAffiliateSlots, "maxAffiliateSlots");
  if (maxAffiliateSlots < 1n || maxAffiliateSlots > 100n) throw new Error("maxAffiliateSlots must be from 1 to 100.");
  if (typeof raw.enrollmentSigner !== "string") throw new Error("Set the enrollment service signer address.");
  const enrollmentSigner = getAddress(raw.enrollmentSigner);
  if (enrollmentSigner === ZeroAddress || enrollmentSigner === terms.config.initialOwner) throw new Error("Use a separate nonzero enrollment key, not the round owner key.");
  const prizeBps = integer(raw.prizeBps, "prizeBps");
  if (prizeBps > 10_000n) throw new Error("prizeBps must be from 0 to 10000.");
  const affiliatePoolBps = integer(raw.affiliatePoolBps, "affiliatePoolBps");
  if (affiliatePoolBps > 10_000n || prizeBps + affiliatePoolBps > 10_000n) throw new Error("The winner share plus affiliate pool must not exceed 100% of mint revenue.");
  if (raw.affiliateAllocationBps !== undefined || (raw.affiliateRatesBps !== undefined && (!Array.isArray(raw.affiliateRatesBps) || raw.affiliateRatesBps.length !== 0))) throw new Error("Pool collections do not accept individual referral rates or a divided allocation. Shares are earned through referral sales.");
  if (terms.config.mintPrice < 10_000n || terms.config.mintPrice % 10_000n !== 0n) throw new Error("V5 mint prices must be divisible by 10000 wei for exact basis-point accounting.");
  if (terms.activateSale) throw new Error("V5 deployment must leave enrollment open: set activateSale=false.");
  return { ...terms, config: { ...terms.config, maxAffiliateSlots, enrollmentSigner, prizeBps, affiliatePoolBps } };
}
