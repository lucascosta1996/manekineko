import { getAddress, ZeroAddress } from "ethers";
import { parseV2Config } from "./v2-config.js";

/** V3 keeps the reviewed V2 VRF terms and leaves enrollment open after deployment. */
export function parseV3Config(input: unknown, chainId: bigint, timestamp: bigint) {
  const terms = parseV2Config(input, chainId, timestamp);
  const raw = input as Record<string, unknown>;
  if (typeof raw.maxAffiliateSlots !== "string" || !/^[1-9]\d*$/.test(raw.maxAffiliateSlots)) {
    throw new Error("maxAffiliateSlots must be a canonical decimal string from 1 to 100.");
  }
  const maxAffiliateSlots = BigInt(raw.maxAffiliateSlots);
  if (maxAffiliateSlots > 100n) throw new Error("maxAffiliateSlots exceeds 100.");
  if (typeof raw.enrollmentSigner !== "string") throw new Error("Set the enrollment service signer address.");
  const enrollmentSigner = getAddress(raw.enrollmentSigner);
  if (enrollmentSigner === ZeroAddress) throw new Error("Enrollment signer must not be zero.");
  if (enrollmentSigner === terms.config.initialOwner) throw new Error("Use a separate enrollment key, not the round owner key.");
  if (terms.config.mintPrice < 100n || terms.config.mintPrice % 100n !== 0n) {
    throw new Error("V3 mint prices must be divisible by 100 wei for an exact 1 percent commission.");
  }
  if (terms.activateSale) {
    throw new Error("V3 deployment must leave enrollment open: set activateSale=false and activate after the enrollment window.");
  }
  return { ...terms, config: { ...terms.config, maxAffiliateSlots, enrollmentSigner } };
}
