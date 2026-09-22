/** Serializable terms shared by the console, API and future launch workers. No signing keys belong here. */
export type LaunchPayload = {
  contract: {
    chainId: string;
    name: string;
    /** Season appearance is required for new V6 launches; absent only on historical records. */
    seasonId?: string;
    seasonName?: string;
    collectionColor?: string;
    textColor?: string;
    symbol: string;
    maxSupply: string;
    mintPriceWei: string;
    mintDurationSeconds: string;
    initialOwner: string;
    requestConfirmations: string;
    callbackGasLimit: string;
    randomnessFundingWei: string;
    maxAffiliateSlots: string;
    enrollmentSigner: string;
    prizeBps: string;
    affiliateRatesBps: string[];
    /** Present for V5/V6 pool collections. V4 rates remain unchanged in historical records. */
    affiliatePoolBps?: string;
    /** Absent on historical V4/V5 documents; explicit V3 selects the V6 contract. */
    algorithmVersion?: "unique-rank-v3" | "unique-rank-v4" | "unique-rank-v5" | "unique-rank-v6";
    /** V7: total prizeBps is split into first (remainder) and second. */
    secondPrizeBps?: string;
    /** V8: prizeBps is divided equally among this many highest-ranked NFTs. */
    winnerCount?: string;
    /** V9 fixes the cumulative primary mint allowance per receiving wallet. */
    maxMintsPerWallet?: string;
    minAffiliateReferrals?: string;
    affiliatePayoutCapBps?: string;
    /** UTC seconds. Zero is an unscheduled draft; the worker pins a future time. */
    saleStartAt?: string;
    activateSale: false;
    vrfCoordinator?: string;
    keyHash?: string;
  };
  operations: {
    factoryMode: "new" | "existing";
    factoryAddress: string;
    deployerAddress: string;
    factoryOwnerAddress: string;
    enrollmentWindowSeconds: string;
    notes: string;
    /** Optional only to preserve historical snapshots. New V6 launches configure both fields. */
    winnerCreditsAddress?: string;
    winnerCreditSponsorshipWei?: string;
    /** The canonical affiliate eligibility registry for the selected network. */
    affiliateEligibilityAddress?: string;
  };
};

export type LaunchArtifact = {
  schemaVersion: 1;
  contractVersion: "affiliate-v4" | "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
} & LaunchPayload;

export type LaunchConfiguration = {
  id: string;
  label: string;
  payload: LaunchPayload;
  status: "draft" | "finalized";
  revision: number;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  createdBy: string;
  updatedBy: string;
  finalizedBy: string | null;
};

export class LaunchConfigurationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues?: string[];
  constructor(code: string, message: string, status = 400, issues?: string[]) {
    super(message);
    this.name = "LaunchConfigurationError";
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

export function launchContractVersion(payload: LaunchPayload): LaunchArtifact["contractVersion"] {
  if (payload.contract.algorithmVersion === "unique-rank-v6") return "affiliate-v10";
  if (payload.contract.algorithmVersion === "unique-rank-v5") return payload.contract.maxMintsPerWallet === "20" ? "affiliate-v9" : "affiliate-v8";
  if (payload.contract.algorithmVersion === "unique-rank-v4") return "affiliate-v7";
  if (payload.contract.algorithmVersion === "unique-rank-v3") return "affiliate-v6";
  return payload.contract.affiliatePoolBps === undefined ? "affiliate-v4" : "affiliate-v5";
}
