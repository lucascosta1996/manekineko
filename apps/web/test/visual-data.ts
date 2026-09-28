/** Isolated visual specimens only. Never imported by an app page, API or repository. */
import { encodePermanentCombination } from "@manekineko/contract-abi/permanent-combinations";
import type { CollectionPublic } from "../lib/collections/model";
import type { WalletPrizes } from "../lib/prizes/model";
import type { NftItem } from "../lib/nfts/model";
import type { AffiliateProgram } from "../lib/affiliates/types";
import { calculateHistoryStats, type HistoryCollection } from "../lib/history/model";
import { ticketDataUri } from "../lib/mint/preview";
import { nftLinks } from "../lib/nfts/links";

export const visualNow = "2026-09-28T12:00:00.000Z";
export const visualWallet = "0x1111111111111111111111111111111111111111";
export const visualCollection: CollectionPublic = {
  id: "11111111-1111-4111-8111-111111111111", slug: "visual-study", name: "Visual study", symbol: "VISUAL",
  description: "An isolated collection specimen for local interface checks.", seasonId: `0x${"2".repeat(64)}`, seasonName: "Visual fixture season",
  collectionColor: "#DCDADA", textColor: "#000000", seriesId: "44444444-4444-4444-8444-444444444444", roundId: "1",
  chainId: 11155111, networkName: "Sepolia testnet", nativeCurrency: { symbol: "ETH", decimals: 18 }, explorerUrl: "https://sepolia.etherscan.io",
  contractVersion: "affiliate-v10", algorithmVersion: "unique-rank-v6", randomnessProvider: "chainlink-vrf-v2.5", randomnessRequestId: null, randomnessState: "not_requested",
  contractStatus: "deployed", contractAddress: "0x2222222222222222222222222222222222222222", mode: "live", source: "postgres",
  maxSupply: 1000, mintPriceWei: "10000000000000000", mintDurationSeconds: 86400, maxMintBatch: 20, mintDeadline: "2026-09-29T00:00:00.000Z", saleStartAt: "2026-09-28T00:00:00.000Z", revealDelayBlocks: null,
  prizeBps: 6000, affiliatePoolBps: 2000, winnerCount: 6, secondPrizeBps: null, minAffiliateReferrals: 1, affiliatePayoutCapBps: 1000,
  scoreFormula: "scoreCombination([a,b,c,d])", totalMinted: 250, totalMintRevenueWei: "2500000000000000000", totalAffiliatePaidWei: "0", phase: "minting", prizePaid: false, awards: [], updatedAt: visualNow,
  observation: { blockNumber: "100", blockHash: `0x${"1".repeat(64)}`, chainTimestamp: visualNow, observedAt: visualNow, servedAt: visualNow },
};
const visualKey = `0x${"42".repeat(32)}`;
const visualIdentity = encodePermanentCombination(1, visualKey);
export const visualArchive: HistoryCollection = {
  ...visualCollection, id: "33333333-3333-4333-8333-333333333333", name: "Completed visual study", seriesName: "Visual fixture season", roundId: "2", maxSupply: 1000, totalMinted: 1000,
  totalMintRevenueWei: "10000000000000000000", totalRefundedWei: "0", status: "completed", openedAt: "2026-09-26T00:00:00.000Z", closedAt: "2026-09-27T00:00:00.000Z", isMock: false,
  winner: { tokenId: 1, combination: visualIdentity.numbers, combinationCode: visualIdentity.combinationCode, combinationKey: visualKey, score: "1000", winningHolder: visualWallet, prizeRecipient: visualWallet, prizePaidWei: "1000000000000000000", paidAt: "2026-09-27T00:00:00.000Z" },
  awards: Array.from({ length: 6 }, (_, i) => ({ ...encodePermanentCombination(i + 1, visualKey), tokenId: i + 1, rank: i + 1, score: String(1000 - i), amountWei: "1000000000000000000", combinationKey: visualKey, currentHolder: visualWallet, claimed: true, winningHolder: visualWallet, recipient: visualWallet, determinedAt: "2026-09-26T23:00:00.000Z", paidAt: "2026-09-27T00:00:00.000Z", claimTransaction: `0x${"4".repeat(64)}` })),
};
export const visualNft: NftItem = {
  contractVersion: "affiliate-v10", algorithmVersion: "unique-rank-v6", collectionId: visualCollection.id, name: visualCollection.name, symbol: visualCollection.symbol,
  seasonId: visualCollection.seasonId, seasonName: visualCollection.seasonName, collectionColor: visualCollection.collectionColor, textColor: visualCollection.textColor,
  roundId: "1", chainId: 11155111, networkName: "Sepolia testnet", contractAddress: visualCollection.contractAddress!, tokenId: "1", phase: "minting",
  mintedAt: "2026-09-28T10:00:00.000Z", mintTransactionHash: `0x${"3".repeat(64)}`, mintedBy: visualWallet, mintedTo: visualWallet, currentOwner: visualWallet,
  refunded: false, revealed: false, winningToken: false, prizePaid: false, winningHolder: null, prizeRecipient: null, confirmedBlock: "100", blockHash: `0x${"1".repeat(64)}`,
};
export const visualProgram: AffiliateProgram = {
  collectionId: visualCollection.id, collectionName: visualCollection.name, chainId: 11155111, contractAddress: visualCollection.contractAddress,
  contractVersion: "affiliate-v10", mode: "live", source: "ethereum", maxSlots: 10, enrolledSlots: 4, availableSlots: 6, commissionBps: 0,
  prizeBps: 6000, affiliatePoolBps: 2000, affiliateRatesBps: Array(10).fill(0), enrollmentOffer: null, enrollmentStatus: "closed",
  readiness: { canEnroll: false, canMint: true, canClaim: false, reason: null }, saleActivated: true, soldOut: false, refundable: false, prizePaid: false,
  mintPriceWei: visualCollection.mintPriceWei, mintDeadline: visualCollection.mintDeadline, totalMinted: 250, maxSupply: 1000, totalAccruedWei: "0", totalClaimedWei: "0",
  snapshotBlock: "100", snapshotBlockHash: `0x${"1".repeat(64)}`, enrollmentSigner: null, runtimeCodeHash: null, turnstileSiteKey: null, account: null, demoScenario: null,
  winnerCount: 6, minAffiliateReferrals: 1, affiliatePayoutCapBps: 1000, saleStartAt: visualCollection.saleStartAt!,
};
/** Synthetic availability only; browser fixtures never return deployable bytecode or signing permission. */
export const visualPrizes: WalletPrizes = {
  wallet: visualWallet, checkedAt: visualNow, nextCursor: null, unavailable: [],
  prizes: [{ collectionId: visualCollection.id, collectionName: visualCollection.name, rank: 1, tokenId: 1,
    amountWei: "1000000000000000000", currentHolder: visualWallet, claimed: false, paidHolder: null,
    recipient: null, transactionHash: null, paidAt: null, availableAt: "2026-09-27T12:00:00.000Z", observedAt: visualNow,
    block: "100", target: { chainId: 11155111, contractAddress: visualCollection.contractAddress!, contractVersion: "affiliate-v10", winnerCount: 6, runtimeCodeHash: `0x${"f".repeat(64)}` } }],
};
export function webVisualResponse(path: string, state = "loaded"): unknown {
  const url = new URL(path, "http://visual.invalid");
  if (url.pathname === "/api/clock") return { now: visualNow };
  if (url.pathname === "/api/collections") return { collections: state === "empty" ? [] : [visualCollection] };
  if (url.pathname === `/api/collections/${visualCollection.id}`) return { collection: visualCollection };
  if (url.pathname.endsWith("/affiliates")) return { program: visualProgram };
  if (url.pathname === "/api/seasons/schedules") return { seasons: [] };
  if (url.pathname === "/api/history") return { source: "postgres", isMock: false, collections: state === "empty" ? [] : [visualArchive], inProgress: [], stats: calculateHistoryStats(state === "empty" ? [] : [visualArchive]) };
  if (url.pathname === "/api/nfts") return { wallet: (url.searchParams.get("wallet") ?? visualWallet).toLowerCase(), page: Number(url.searchParams.get("page") ?? 1), pageSize: 12, view: url.searchParams.get("view") ?? "minted", status: url.searchParams.get("status") ?? "all", items: state === "empty" ? [] : [visualNft], total: state === "empty" ? 0 : 1, hasMore: false, stats: state === "empty" ? { minted: 0, held: 0, ongoing: 0, completed: 0 } : { minted: 1, held: 1, ongoing: 1, completed: 0 }, updatedAt: visualNow };
  if (url.pathname.startsWith("/api/nfts/")) return { status: "available", collectionId: visualCollection.id, tokenId: "1", blockNumber: "100", blockHash: visualNft.blockHash, name: "Visual specimen #1", description: "Isolated artwork fixture; no chain verification is implied.", image: ticketDataUri("1", 1, false, "unique-rank-v6", 1000, visualCollection), attributes: [], numbers: visualIdentity.numbers, score: null, links: nftLinks(11155111, visualNft.contractAddress, "1"), nft: visualNft };
  if (url.pathname === "/api/winner-credits") return { wallet: (url.searchParams.get("wallet") ?? visualWallet).toLowerCase(), page: 1, pageSize: 12, credits: [], total: 0, hasMore: false, target: null, availableOnPage: 0, networks: [{ chainId: 11155111, configured: false, registryAddress: null, runtimeCodeHash: null, verifiedBlock: null, lifetimeRedemption: null }] };
  if (url.pathname === "/api/prizes") return { wallet: visualWallet, prizes: [], unavailable: [], nextCursor: null };
  return null;
}
