import { getAddress } from "ethers";

export class WinnerCreditQueryError extends Error {}
export interface WinnerCreditQuery { wallet: string; collectionId: string | null; page: number; pageSize: number }
export interface WinnerCreditSource {
  collectionId: string; name: string; chainId: number; roundId: string;
  contractAddress: string; factoryAddress: string; contractVersion: "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
  awardRank?: number;
  winningHolder: string; tokenId: string;
}
export interface WinnerCredit extends WinnerCreditSource {
  available: boolean; used: boolean; reason: string | null;
  proof: string[]; legacy: boolean;
  legacyWin: { sourceRound: string; holder: string; tokenId: string; paidAt: string; transactionHash: string } | null;
  claimed: boolean; canRegisterSource?: boolean; redeemedIn: string | null; redeemedTokenId: string | null;
}
export interface WinnerCreditTarget {
  contractVersion?: WinnerCreditSource["contractVersion"];
  collectionId: string; contractAddress: string; chainId: number; name: string;
  mintPriceWei: string; ready: boolean; reason: string | null;
  remaining: number; sponsorBalanceWei: string;
}
export interface WinnerCreditRedemption {
  sourceRound: string; targetRound: string; tokenId: string; awardRank?: number; registryAddress?: string;
}
export interface WinnerCreditNetwork {
  registryVersion?: "winner-credits-v2" | "winner-credits-v3" | "winner-credits-v4" | "winner-credits-v5" | "winner-credits-v6";
  chainId: number; configured: boolean; registryAddress: string | null;
  runtimeCodeHash: string | null; verifiedBlock: string | null;
  lifetimeRedemption: WinnerCreditRedemption | null;
}
export interface WinnerCreditResponse {
  wallet: string; page: number; pageSize: number; total: number; hasMore: boolean;
  availableOnPage: number; networks: WinnerCreditNetwork[];
  credits: WinnerCredit[]; target: WinnerCreditTarget | null;
}
const COLLECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseWinnerCreditQuery(params: URLSearchParams): WinnerCreditQuery {
  let wallet: string;
  try { wallet = getAddress(params.get("wallet") ?? "").toLowerCase(); }
  catch { throw new WinnerCreditQueryError("Enter a valid Ethereum wallet address."); }
  if (/^0x0{40}$/.test(wallet)) throw new WinnerCreditQueryError("Enter a nonzero Ethereum wallet address.");
  const collectionId = params.get("collectionId");
  if (collectionId !== null && !COLLECTION_ID.test(collectionId)) throw new WinnerCreditQueryError("Choose a valid collection.");
  const value = params.get("page") ?? "1";
  if (!/^[1-9][0-9]{0,5}$/.test(value)) throw new WinnerCreditQueryError("Choose a valid results page.");
  return { wallet, collectionId: collectionId?.toLowerCase() ?? null, page: Number(value), pageSize: 10 };
}

/** Qualifying wins offer a choice of source, never additional lifetime rewards. */
export function availableLifetimeRewards(credits: readonly WinnerCredit[]): number {
  return new Set(credits.filter((credit) => credit.available).map((credit) => credit.chainId)).size;
}

/** Each winning NFT is a distinct source; multiple wins never create extra lifetime rewards. */
export function creditAwardRank(credit: Pick<WinnerCreditSource, "contractVersion" | "awardRank">): number {
  const rank = credit.awardRank ?? 1;
  if (!Number.isInteger(rank) || rank < 1 || rank > ((credit.contractVersion === "affiliate-v8" || credit.contractVersion === "affiliate-v9" || credit.contractVersion === "affiliate-v10") ? 10 : credit.contractVersion === "affiliate-v7" ? 2 : 1)) throw new Error("Invalid winner award rank.");
  return rank;
}
export function winnerCreditKey(credit: Pick<WinnerCreditSource, "chainId" | "contractAddress" | "contractVersion" | "awardRank">): string {
  return `${credit.chainId}:${credit.contractAddress.toLowerCase()}:${creditAwardRank(credit)}`;
}

/** A registry may recognize earlier sources, but an older registry cannot issue newer award credits. */
export function registrySupportsCredit(contractVersion: WinnerCreditSource["contractVersion"], registryVersion: string): boolean {
  if (!["winner-credits-v2", "winner-credits-v3", "winner-credits-v4", "winner-credits-v5", "winner-credits-v6"].includes(registryVersion)) return false;
  if (contractVersion === "affiliate-v10") return registryVersion === "winner-credits-v6";
  if (contractVersion === "affiliate-v9") return ["winner-credits-v5", "winner-credits-v6"].includes(registryVersion);
  if (contractVersion === "affiliate-v8") return ["winner-credits-v4", "winner-credits-v5", "winner-credits-v6"].includes(registryVersion);
  if (contractVersion === "affiliate-v7") return registryVersion !== "winner-credits-v2";
  return true;
}
