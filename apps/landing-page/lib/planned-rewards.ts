import seasons from "../../../seasons.json";

type PlannedSeason = {
  season: number;
  collections: readonly string[];
};

export type PlannedRewards = {
  seasonCount: number;
  collectionCount: number;
  growthCollectionCount: number;
  standardCollectionCount: number;
  winningNftCount: number;
  prizePoolEth: string;
  affiliatePoolEth: string;
  communityPoolEth: string;
};

const WEI_PER_ETH = 10n ** 18n;
const MINT_PRICE_WEI = 10n ** 16n;
const COLLECTION_SUPPLY = 1_000n;
const PRIZE_BPS = 6_000n;
const GROWTH_AFFILIATE_BPS = 2_000n;
const STANDARD_AFFILIATE_BPS = 1_000n;
const WINNERS_PER_COLLECTION = 6;

function formatEth(wei: bigint): string {
  const fraction = (wei % WEI_PER_ETH)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");
  return `${wei / WEI_PER_ETH}${fraction ? `.${fraction}` : ""}`;
}

/**
 * Public, planned sellout baseline for the catalog; never collected or paid ETH.
 * The original allocation uses Growth for seasons 1–4 and the first two
 * collections of every later season, and Standard for the remaining editions
 * (scripts/upgrade-season-drafts-v7.mjs; docs/season-v7-implementation.md).
 * V8 changed the prize split to six equal awards and preserved affiliate terms
 * (scripts/upgrade-season-drafts-v8.mjs); V9/V10 retain those economics.
 * Draft terms remain editable. This is not a read of current private plans,
 * funded balances, qualifying affiliate entitlements, or confirmed claims.
 */
export function summarizePlannedRewards(
  catalog: readonly PlannedSeason[],
): PlannedRewards {
  let collectionCount = 0;
  let growthCollectionCount = 0;
  for (const { season, collections } of catalog) {
    collectionCount += collections.length;
    growthCollectionCount +=
      season >= 1 && season <= 4
        ? collections.length
        : Math.min(2, collections.length);
  }

  const standardCollectionCount = collectionCount - growthCollectionCount;
  const collectionRevenueWei = COLLECTION_SUPPLY * MINT_PRICE_WEI;
  const prizePoolWei =
    (BigInt(collectionCount) * collectionRevenueWei * PRIZE_BPS) / 10_000n;
  const affiliatePoolWei =
    (collectionRevenueWei *
      (BigInt(growthCollectionCount) * GROWTH_AFFILIATE_BPS +
        BigInt(standardCollectionCount) * STANDARD_AFFILIATE_BPS)) /
    10_000n;

  return {
    seasonCount: catalog.length,
    collectionCount,
    growthCollectionCount,
    standardCollectionCount,
    winningNftCount: collectionCount * WINNERS_PER_COLLECTION,
    prizePoolEth: formatEth(prizePoolWei),
    affiliatePoolEth: formatEth(affiliatePoolWei),
    communityPoolEth: formatEth(prizePoolWei + affiliatePoolWei),
  };
}

export const plannedRewards = summarizePlannedRewards(seasons);
