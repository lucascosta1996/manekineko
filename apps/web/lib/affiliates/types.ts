export interface AffiliateNftSelection { sourceCollection: string; sourceTokenId: string }
export interface AffiliateEligibilityToken extends AffiliateNftSelection { collectionId: string; collectionName: string; eligible: boolean; reason: string | null }
export interface AffiliateEnrollmentEligibility {
  policy: "bootstrap" | "nft_holder";
  gateAddress: string; runtimeCodeHash: string;
  sequence: string; page: number; hasMore: boolean; tokens: AffiliateEligibilityToken[];
  reason: string | null;
}

/** Public affiliate DTOs. Never serialize a wei amount as a JavaScript number. */
export const DEMO_SCENARIOS = ["no_referrals", "pending_sellout", "claimable", "paid", "refunded", "no_commission"] as const;
export type DemoScenario = (typeof DEMO_SCENARIOS)[number];
export type AffiliateStatus = "unregistered" | DemoScenario;
export interface AffiliateAccount {
  qualified?: boolean; referralsRemaining?: number;
  wallet: string;
  affiliateId: number | null;
  commissionBps: number;
  status: AffiliateStatus;
  accruedWei: string;
  claimedWei: string;
  claimableWei: string;
  pendingWei: string;
  referredMints: number;
  referralUrl: string | null;
}
export interface AffiliateProgram {
  minAffiliateReferrals?: number; affiliatePayoutCapBps?: number; winnerCount?: number; secondPrizeBps?: number;
  qualifiedSlots?: number; equalShareWei?: string; unallocatedPoolWei?: string; saleStartAt?: string;
  collectionId: string;
  collectionName: string;
  chainId: number;
  contractAddress: string | null;
  contractVersion: "affiliate-v3" | "affiliate-v4" | "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
  mode: "demo" | "live";
  source: "postgres-demo" | "ethereum";
  maxSlots: number;
  enrolledSlots: number;
  availableSlots: number;
  /** Next offered position's rate, or zero when no position is offered. */
  commissionBps: number;
  prizeBps: number;
  affiliatePoolBps?: number | null;
  affiliateRatesBps: number[];
  enrollmentOffer: { affiliateId: number; commissionBps: number } | null;
  enrollmentEligibility?: AffiliateEnrollmentEligibility;
  enrollmentStatus: "open" | "closed" | "full" | "unavailable";
  readiness: { canEnroll: boolean; canMint: boolean; canClaim: boolean; reason: string | null };
  saleActivated: boolean;
  soldOut: boolean;
  refundable: boolean;
  prizePaid: boolean;
  mintPriceWei: string;
  mintDeadline: string | null;
  totalMinted: number;
  totalReferredMints?: number;
  maxSupply: number;
  totalAccruedWei: string;
  totalClaimedWei: string;
  snapshotBlock: string | null;
  snapshotBlockHash: string | null;
  enrollmentSigner: string | null;
  runtimeCodeHash: string | null;
  turnstileSiteKey: string | null;
  account: AffiliateAccount | null;
  demoScenario: DemoScenario | null;
}
export interface AffiliateReferral {
  collectionId: string;
  chainId: number;
  contractAddress: string;
  affiliateId: number;
  affiliateWallet: string;
  commissionBps: number;
  prizeBps: number;
  affiliatePoolBps?: number | null;
  contractVersion: "affiliate-v3" | "affiliate-v4" | "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
  mode: "demo" | "live";
  mintReady: boolean;
}
export interface AuthenticationTypedData {
  domain: { name: string; version: string; chainId: number; verifyingContract: string };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: "Authentication";
  message: { applicant: string; collectionId: string; origin: string; nonce: string; deadline: string; affiliateId?: number; commissionBps?: number; poolBps?: number; sourceCollection?: string; sourceTokenId?: string };
}
export interface AffiliateChallenge {
  contractVersion: "affiliate-v3" | "affiliate-v4" | "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
  affiliateId?: number;
  commissionBps?: number;
  sourceCollection?: string;
  sourceTokenId?: string;
  challengeId: string;
  typedData: AuthenticationTypedData;
  expiresAt: string;
  turnstileAction: "affiliate_enrollment";
  turnstileCData: string;
}
export interface AffiliatePermit {
  contractVersion: "affiliate-v3" | "affiliate-v4" | "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
  affiliateId?: number;
  commissionBps?: number;
  sourceCollection?: string;
  sourceTokenId?: string;
  applicant: string;
  nonce: string;
  deadline: string;
  signature: string;
  chainId: number;
  contractAddress: string;
}
export interface AffiliateApiError { error: string; code: string; retryAfter?: number }
