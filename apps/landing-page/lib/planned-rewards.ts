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
  communityPoolEth: string;
};

const WEI_PER_ETH = 10n ** 18n;
const MINT_PRICE_WEI = 10n ** 16n;
const COLLECTION_SUPPLY = 1_000n;
const PRIZE_BPS = 6_000n;
const AFFILIATE_BPS = 2_000n;
const WINNERS_PER_COLLECTION = 6;

function formatEth(wei: bigint): string {
  const fraction = (wei % WEI_PER_ETH)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");
  return `${wei / WEI_PER_ETH}${fraction ? `.${fraction}` : ""}`;
}

/** Minimum-term sellout illustration (1,000 NFTs at 0.01 ETH). Not collected funds.
 * Every V12 collection uses the fixed 60/20/20 split. Voting chooses actual terms. */
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

  return {
    seasonCount: catalog.length,
    collectionCount,
    winningNftCount: collectionCount * WINNERS_PER_COLLECTION,
    prizePoolEth: formatEth(prizePoolWei),
    affiliatePoolEth: formatEth(affiliatePoolWei),
    communityPoolEth: formatEth(prizePoolWei + affiliatePoolWei),
  };
}

export const plannedRewards = summarizePlannedRewards(seasons);
