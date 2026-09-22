import type { CollectionAward } from "./awards.ts";
/** Public collection data. Wei and uint256 identifiers always cross JSON as strings. */
export interface CollectionPublic {
  contractVersion: "legacy" | "affiliate-v3" | "affiliate-v4" | "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
  winnerCount?: number | null; secondPrizeBps?: number | null; minAffiliateReferrals?: number | null; affiliatePayoutCapBps?: number | null;
  saleStartAt?: string | null; soldOutAt?: string | null; revealedAt?: string | null;
  awards?: CollectionAward[]; allPrizesPaid?: boolean;
  refundedCount?: number; totalRefundedWei?: string; refundedAt?: string | null;
  algorithmVersion: AlgorithmVersion;
  randomnessProvider: RandomnessProvider;
  randomnessRequestId: string | null;
  randomnessState: "not_requested" | "pending" | "fulfilled" | null;
  id: string;
  slug: string;
  name: string;
  /** Frozen season artwork on new V6 collections; absent on legacy collections. */
  seasonId?: string | null;
  seasonName?: string | null;
  collectionColor?: string | null;
  textColor?: string | null;
  symbol: string;
  description: string;
  seriesId: string;
  roundId: string;
  chainId: number;
  networkName: string;
  nativeCurrency: { symbol: string; decimals: number };
  explorerUrl: string;
  contractStatus: "undeployed" | "deploying" | "deployed" | "failed";
  contractAddress: string | null;
  mode: "demo" | "live";
  source: "seed" | "postgres";
  maxSupply: number;
  mintPriceWei: string;
  mintDurationSeconds: number;
  /** Assigned when deployed; a draft does not have an artificial running deadline. */
  mintDeadline: string | null;
  revealDelayBlocks: number | null;
  maxMintBatch: number;
  prizeBps: number;
  affiliatePoolBps?: number | null;
  scoreFormula: string;
  totalMinted: number;
  totalMintRevenueWei: string;
  /** Confirmed on-chain affiliate withdrawals, not projected earnings. */
  totalAffiliatePaidWei?: string;
  phase:
    | "pending_activation"
    | "minting"
    | "awaiting_reveal"
    | "awaiting_randomness"
    | "awaiting_request"
    | "awaiting_finalization"
    | "settling"
    | "awaiting_prize"
    | "complete"
    | "refundable"
    | null;
  prizePaid: boolean;
  updatedAt: string;
}

export const DEFAULT_COLLECTION_ID = "8fa5f8c0-6ef4-47f6-9af3-60b8101c9321";
export const SCORE_FORMULA = "(a*b+c*d)*4294967296+combinationCode";
export const UNIQUE_RANK_SCORE_FORMULA = "1+(a-1)*4096+(b-1)*256+(c-1)*16+(d-1)";
export type AlgorithmVersion = "feistel-v1" | "unique-rank-v2" | "unique-rank-v3" | "unique-rank-v4" | "unique-rank-v5" | "unique-rank-v6";
export type RandomnessProvider = "future-blockhash" | "chainlink-vrf-v2.5";

export function scoreFormulaFor(algorithmVersion: AlgorithmVersion): string {
  if (algorithmVersion === "feistel-v1") return SCORE_FORMULA;
  if (algorithmVersion === "unique-rank-v2") return UNIQUE_RANK_SCORE_FORMULA;
  if (algorithmVersion === "unique-rank-v3" || algorithmVersion === "unique-rank-v4" || algorithmVersion === "unique-rank-v5" || algorithmVersion === "unique-rank-v6") return "scoreCombination([a,b,c,d])";
  throw new Error("Unknown collection algorithm version");
}
export const UINT256_MAX = (1n << 256n) - 1n;

export function isCollectionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}
