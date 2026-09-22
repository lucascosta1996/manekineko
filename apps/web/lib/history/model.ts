import type { CollectionAward } from "../collections/awards.ts";
import { decodeScrambledCombination } from "@manekineko/contract-abi/scrambled-rank";
import type { AlgorithmVersion, CollectionPublic, RandomnessProvider } from "../collections/model.ts";

/** Public archive records. Contract integers cross JSON as exact decimal strings. */
export interface HistoryWinner {
  tokenId: number;
  combination: [number, number, number, number];
  combinationCode: string;
  combinationKey?: string | null;
  score: string;
  /** NFT holder at payout, recorded separately from a holder-selected V2 destination. */
  winningHolder: string;
  /** Actual payment destination; V2 holders may choose a separate receiving address. */
  prizeRecipient: string;
  prizePaidWei: string;
  paidAt: string;
}

export interface HistoryCollection {
  contractVersion: "legacy" | "affiliate-v3" | "affiliate-v4" | "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
  winnerCount?: number | null; secondPrizeBps?: number | null; awards?: CollectionAward[];
  prizeBps: number;
  affiliatePoolBps?: number | null;
  algorithmVersion: AlgorithmVersion;
  randomnessProvider: RandomnessProvider;
  id: string;
  seriesId: string;
  seriesName: string;
  seasonId?: string | null;
  seasonName?: string | null;
  collectionColor?: string | null;
  textColor?: string | null;
  roundId: string;
  name: string;
  symbol: string;
  chainId: number;
  networkName: string;
  nativeCurrency: { symbol: string; decimals: number };
  maxSupply: number;
  totalMinted: number;
  mintPriceWei: string;
  totalMintRevenueWei: string;
  /** Confirmed on-chain affiliate withdrawals, not projected earnings. */
  totalAffiliatePaidWei?: string;
  totalRefundedWei: string;
  status: "completed" | "refunded";
  openedAt: string;
  closedAt: string;
  /** Mock archive records never stand in for verified deployment or chain state. */
  isMock: boolean;
  winner: HistoryWinner | null;
}

export interface HistoryCurrencyStats {
  chainId: number;
  networkName: string;
  nativeCurrency: { symbol: string; decimals: number };
  totalMintRevenueWei: string;
  totalPrizePaidWei: string;
  totalAffiliatePaidWei: string;
  totalRefundedWei: string;
  largestPrizeWei: string;
}

export interface HistoryStats {
  collectionCount: number;
  completedCount: number;
  refundedCount: number;
  totalTicketsMinted: number;
  /** Distinct NFT holder addresses at payout, regardless of payment destination. */
  uniqueWinners: number;
  /** Keep currencies and networks separate; native amounts are not USD values. */
  currencies: HistoryCurrencyStats[];
}

export interface HistoryResponse {
  collections: HistoryCollection[];
  /** Deployed collections without an archived outcome; never invent a winner. */
  inProgress: CollectionPublic[];
  stats: HistoryStats;
  source: "postgres";
  /** Public history excludes all sample records. */
  isMock: false;
}

/** Deterministic contract arithmetic; this does not generate reveal entropy. */
export function calculateHistoryScore(
  combination: readonly [number, number, number, number],
  algorithmVersion: AlgorithmVersion = "feistel-v1",
  combinationKey?: string | null
): { combinationCode: string; score: string } {
  if (algorithmVersion === "unique-rank-v3" || algorithmVersion === "unique-rank-v4" || algorithmVersion === "unique-rank-v5") {
    if (typeof combinationKey !== "string") throw new Error("Invalid history combination key");
    return decodeScrambledCombination(combination, combinationKey);
  }
  if (!["feistel-v1", "unique-rank-v2"].includes(algorithmVersion)) throw new Error("Invalid history algorithm version");
  const v2 = algorithmVersion === "unique-rank-v2";
  if (
    combination.length !== 4 ||
    combination.some((value) => !Number.isInteger(value) || value < 1 || value > (v2 ? 16 : 256))
  ) {
    throw new Error("Invalid history combination");
  }
  const [a, b, c, d] = combination.map(BigInt);
  if (v2) {
    const code = (a - 1n) * 4096n + (b - 1n) * 256n + (c - 1n) * 16n + d - 1n;
    return { combinationCode: code.toString(), score: (code + 1n).toString() };
  }
  const code = ((a - 1n) << 24n) + ((b - 1n) << 16n) + ((c - 1n) << 8n) + d - 1n;
  return {
    combinationCode: code.toString(),
    score: ((a * b + c * d) * 4_294_967_296n + code).toString(),
  };
}

/** Accept only validated records at repository boundaries before aggregating. */
export function calculateHistoryStats(records: readonly HistoryCollection[], inProgress: readonly CollectionPublic[] = []): HistoryStats {
  const currencies = new Map<string, HistoryCurrencyStats>();
  const winners = new Set<string>();
  let completedCount = 0;
  let totalTicketsMinted = 0;
  for (const record of records) {
    const currencyKey = `${record.chainId}:${record.nativeCurrency.symbol}:${record.nativeCurrency.decimals}`;
    let currency = currencies.get(currencyKey);
    if (!currency) {
      currency = {
        chainId: record.chainId,
        networkName: record.networkName,
        nativeCurrency: { ...record.nativeCurrency },
        totalMintRevenueWei: "0",
        totalPrizePaidWei: "0",
        totalAffiliatePaidWei: "0",
        totalRefundedWei: "0",
        largestPrizeWei: "0",
      };
      currencies.set(currencyKey, currency);
    }
    totalTicketsMinted += record.totalMinted;
    currency.totalAffiliatePaidWei = String(BigInt(currency.totalAffiliatePaidWei) + BigInt(record.totalAffiliatePaidWei ?? "0"));
    currency.totalMintRevenueWei = (BigInt(currency.totalMintRevenueWei) + BigInt(record.totalMintRevenueWei)).toString();
    currency.totalRefundedWei = (BigInt(currency.totalRefundedWei) + BigInt(record.totalRefundedWei)).toString();
    if (record.status === "completed" && record.winner) {
      completedCount += 1;
      const paidAwards = record.awards?.map(a=>({holder:a.winningHolder!,amount:a.amountWei})) ?? [{holder:record.winner.winningHolder,amount:record.winner.prizePaidWei}];
      for (const award of paidAwards) {
        winners.add(award.holder.toLowerCase());
        const prize = BigInt(award.amount);
        currency.totalPrizePaidWei = (BigInt(currency.totalPrizePaidWei) + prize).toString();
        if (prize > BigInt(currency.largestPrizeWei)) currency.largestPrizeWei = prize.toString();
      }
    }
  }
  for (const record of inProgress) {
    totalTicketsMinted += record.totalMinted;
    const currencyKey = `${record.chainId}:${record.nativeCurrency.symbol}:${record.nativeCurrency.decimals}`;
    const currency = currencies.get(currencyKey) ?? {
      chainId: record.chainId,
      networkName: record.networkName,
      nativeCurrency: { ...record.nativeCurrency },
      totalMintRevenueWei: "0",
      totalPrizePaidWei: "0",
        totalAffiliatePaidWei: "0",
      totalRefundedWei: "0",
      largestPrizeWei: "0",
    };
    currency.totalAffiliatePaidWei = String(BigInt(currency.totalAffiliatePaidWei) + BigInt(record.totalAffiliatePaidWei ?? "0"));
    currency.totalMintRevenueWei = (BigInt(currency.totalMintRevenueWei) + BigInt(record.totalMintRevenueWei)).toString();
    currency.totalRefundedWei = String(BigInt(currency.totalRefundedWei) + BigInt(record.totalRefundedWei ?? "0"));
    for (const award of record.awards ?? []) if (award.claimed) {
      winners.add(award.winningHolder!.toLowerCase());
      currency.totalPrizePaidWei = String(BigInt(currency.totalPrizePaidWei)+BigInt(award.amountWei));
      if (BigInt(award.amountWei)>BigInt(currency.largestPrizeWei)) currency.largestPrizeWei=award.amountWei;
    }
    currencies.set(currencyKey, currency);
  }
  return {
    collectionCount: records.length + inProgress.length,
    completedCount,
    refundedCount: records.filter((record) => record.status === "refunded").length,
    totalTicketsMinted,
    uniqueWinners: winners.size,
    currencies: [...currencies.values()].sort((a, b) => a.chainId - b.chainId || a.nativeCurrency.symbol.localeCompare(b.nativeCurrency.symbol) || a.nativeCurrency.decimals - b.nativeCurrency.decimals),
  };
}

/** The public archive includes only real outcomes and never counts a collection twice. */
export function buildHistoryResponse(archive: readonly HistoryCollection[], deployed: readonly CollectionPublic[]): HistoryResponse {
  const completedV7: HistoryCollection[] = deployed.filter(c=>["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(c.contractVersion) && c.prizePaid && c.awards?.length===((c.contractVersion === "affiliate-v8" || c.contractVersion === "affiliate-v9" || c.contractVersion === "affiliate-v10") ? c.winnerCount : 2)).map(c=>{
    const first=c.awards![0];
    return {...c,seriesName:c.seasonName ?? c.name,status:"completed",openedAt:c.saleStartAt!,closedAt:c.awards!.map(a=>a.paidAt!).sort().at(-1)!,isMock:false,
      totalRefundedWei:"0",winner:{tokenId:first.tokenId,combination:first.numbers as [number,number,number,number],combinationCode:first.combinationCode,combinationKey:first.combinationKey,
        score:first.score,winningHolder:first.winningHolder!,prizeRecipient:first.recipient!,prizePaidWei:first.amountWei,paidAt:first.paidAt!}};
  });
  const refundedV7: HistoryCollection[] = deployed.filter(c=>["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(c.contractVersion) && c.phase==="refundable" && c.refundedAt
    && c.totalMinted>0 && c.refundedCount===c.totalMinted && c.totalRefundedWei===c.totalMintRevenueWei).map(c=>({
      ...c,seriesName:c.seasonName ?? c.name,status:"refunded",openedAt:c.saleStartAt!,closedAt:c.refundedAt!,isMock:false,
      totalRefundedWei:c.totalRefundedWei!,winner:null,
    }));
  const collections = [...archive.filter((collection) => !collection.isMock),...[...completedV7,...refundedV7].filter(c=>!archive.some(a=>a.id===c.id))];
  const archivedIds = new Set(collections.map((collection) => collection.id));
  const inProgress = deployed.filter((collection) => collection.mode === "live" &&
    collection.contractStatus === "deployed" && !archivedIds.has(collection.id));
  return {
    collections,
    inProgress,
    stats: calculateHistoryStats(collections, inProgress),
    source: "postgres",
    isMock: false,
  };
}
