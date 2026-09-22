import { getAddress, ZeroAddress } from "ethers";
import { parseV2Config } from "@manekineko/contract-abi/v2-config";

/** Immutable V4 economics; an equal allocation is a convenience for constructing each referral's rate. */
export function parseV4Config(input: unknown, chainId: bigint, timestamp: bigint) {
  const terms = parseV2Config(input, chainId, timestamp);
  const raw = input as Record<string, unknown>;
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
  const hasRates = raw.affiliateRatesBps !== undefined;
  const hasAllocation = raw.affiliateAllocationBps !== undefined;
  if (hasRates === hasAllocation) throw new Error("Specify exactly one of affiliateRatesBps or affiliateAllocationBps.");
  let affiliateRatesBps: bigint[];
  if (hasRates) {
    if (!Array.isArray(raw.affiliateRatesBps) || raw.affiliateRatesBps.length !== Number(maxAffiliateSlots)) throw new Error("affiliateRatesBps must contain one rate per position.");
    affiliateRatesBps = raw.affiliateRatesBps.map((value, index) => integer(value, `affiliateRatesBps[${index}]`));
  } else {
    const allocation = integer(raw.affiliateAllocationBps, "affiliateAllocationBps");
    if (allocation > 10_000n || allocation % maxAffiliateSlots !== 0n) throw new Error("The equal allocation must be from 0 to 10000 bps and divide exactly across the positions.");
    affiliateRatesBps = Array<bigint>(Number(maxAffiliateSlots)).fill(allocation / maxAffiliateSlots);
  }
  if (affiliateRatesBps.some(rate => rate > 10_000n || prizeBps + rate > 10_000n)) throw new Error("Each referral rate plus the prize rate must not exceed 10000 bps.");
  if (terms.config.mintPrice < 10_000n || terms.config.mintPrice % 10_000n !== 0n) throw new Error("V4 mint prices must be divisible by 10000 wei for exact basis-point accounting.");
  if (terms.activateSale) throw new Error("V4 deployment must leave enrollment open: set activateSale=false.");
  return { ...terms, config: { ...terms.config, maxAffiliateSlots, enrollmentSigner, prizeBps, affiliateRatesBps } };
}
