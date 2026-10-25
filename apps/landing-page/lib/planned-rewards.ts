import seasons from "../../../seasons.json";

type PlannedSeason = {
  season: number;
  collections: readonly string[];
};

export type PlannedRewards = {
  seasonCount: number;
  collectionCount: number;
  winningNftCount: number;
  prizePoolEth: string;
  affiliatePoolEth: string;
  holderPoolEth: string;
  holderClaimSlots: number;
  holderRewardEth: string;
  communityPoolEth: string;
};

const WEI_PER_ETH = 10n ** 18n;
const MINT_PRICE_WEI = 10n ** 16n;
const COLLECTION_SUPPLY = 1_000n;
const PRIZE_BPS = 6_000n;
const AFFILIATE_BPS = 2_000n;
const WINNERS_PER_COLLECTION = 6;
const HOLDER_BPS = 1000n;
const HOLDER_COVERAGE_BPS = 500n;

function formatEth(wei: bigint): string {
  const fraction = (wei % WEI_PER_ETH)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");
  return `${wei / WEI_PER_ETH}${fraction ? `.${fraction}` : ""}`;
}

/** Minimum-term sellout illustration (1,000 NFTs at 0.01 ETH). Not collected funds.
 * Current seasons use 60/20/10/10 allocations. Voting chooses actual terms. */
export function summarizePlannedRewards(
  catalog: readonly PlannedSeason[],
): PlannedRewards {
  let collectionCount = 0;
  for (const { collections } of catalog) {
    collectionCount += collections.length;
  }

  const collectionRevenueWei = COLLECTION_SUPPLY * MINT_PRICE_WEI;
  const prizePoolWei =
    (BigInt(collectionCount) * collectionRevenueWei * PRIZE_BPS) / 10_000n;
  const affiliatePoolWei =
    (collectionRevenueWei *
      (BigInt(collectionCount) * AFFILIATE_BPS)) /
    10_000n;

  const holderPoolWei = BigInt(collectionCount) * collectionRevenueWei * HOLDER_BPS / 10_000n;
  // Slots are rounded separately for each season, just like the onchain pool.
  const holderClaimSlots = catalog.reduce((sum, season) => sum + BigInt(season.collections.length) * COLLECTION_SUPPLY * HOLDER_COVERAGE_BPS / 10_000n, 0n);
  const holderRewardWei = holderClaimSlots ? holderPoolWei / holderClaimSlots : 0n;
  return {
    seasonCount: catalog.length,
    collectionCount,
    winningNftCount: collectionCount * WINNERS_PER_COLLECTION,
    prizePoolEth: formatEth(prizePoolWei),
    affiliatePoolEth: formatEth(affiliatePoolWei),
    holderPoolEth: formatEth(holderPoolWei),
    holderClaimSlots: Number(holderClaimSlots),
    holderRewardEth: formatEth(holderRewardWei),
    communityPoolEth: formatEth(prizePoolWei + affiliatePoolWei + holderPoolWei),
  };
}

export const plannedRewards = summarizePlannedRewards(seasons);
