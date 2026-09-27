import { enrollmentTiming } from "@manekineko/contract-abi/lifecycle";
export function affiliateAvailability(input: {
  now: number; opensAt?: string | null; closesAt?: string | null; closed: boolean; full: boolean;
  configured: boolean; eligibilityReason?: string | null; enrolled: boolean; walletConnected: boolean;
  holderRequired: boolean; hasEligibleNft: boolean; hasMoreNfts: boolean;
}) {
  const timing = enrollmentTiming(input.opensAt, input.closesAt, input.now);
  const code = input.closed || timing.state === "closed" ? "closed" : input.full ? "full" : timing.state === "scheduled" ? "scheduled" : !input.configured ? "unavailable" : input.eligibilityReason ? "unavailable" : input.enrolled ? "enrolled" : input.walletConnected && input.holderRequired && !input.hasEligibleNft ? "wallet_ineligible" : "open";
  const reasons: Record<string, string | null> = {
    closed: null, full: "All affiliate positions are filled.", scheduled: "Enrollment has not opened yet.",
    unavailable: "Enrollment is temporarily unavailable. Please check again later.", enrolled: null,
    wallet_ineligible: input.hasMoreNfts ? "Choose an eligible NFT from another results page." : "This wallet needs an eligible NFT from an earlier collection.", open: null,
  };
  return { code, canEnroll: code === "open", reason: reasons[code] };
}
