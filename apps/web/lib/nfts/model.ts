import type { CollectionPublic } from "../collections/model";

export type NftView = "minted" | "held";
export type NftStatus = "all" | "ongoing" | "completed" | "refundable";

/** Public, confirmed NFT provenance. Token IDs remain strings at the JSON boundary. */
export interface NftItem {
  contractVersion: "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
  algorithmVersion: "unique-rank-v2" | "unique-rank-v3" | "unique-rank-v4" | "unique-rank-v5" | "unique-rank-v6";
  collectionId: string;
  name: string;
  seasonId?: string | null;
  seasonName?: string | null;
  collectionColor?: string | null;
  textColor?: string | null;
  symbol: string;
  roundId: string;
  chainId: number;
  networkName: string;
  contractAddress: string;
  tokenId: string;
  phase: NonNullable<CollectionPublic["phase"]>;
  mintedAt: string;
  mintTransactionHash: string;
  /** Wallet that paid for the mint; it can differ from the NFT's original recipient. */
  mintedBy: string;
  mintedTo: string;
  /** Latest confirmed Transfer recipient, or null after a burn. */
  currentOwner: string | null;
  refunded: boolean;
  revealed: boolean;
  awardRank?: number | null; awardAmountWei?: string | null;
  winningToken: boolean;
  prizePaid: boolean;
  winningHolder: string | null;
  prizeRecipient: string | null;
  confirmedBlock: string;
  blockHash: string;
}

/** Server record used to verify tokenURI against the registered factory at this exact block. */
export interface IndexedNftRecord extends NftItem {
  factoryAddress: string;
  maxSupply: number;
  blockNumber: string;
  ownerWallet: string | null;
  burned: boolean;
}

export interface NftGalleryQuery {
  wallet: string;
  view: NftView;
  status: NftStatus;
  page: number;
  pageSize: 12;
}

export interface NftGalleryResponse extends NftGalleryQuery {
  total: number;
  hasMore: boolean;
  items: NftItem[];
  /** Unique tokens across the entire wallet history; phase counts follow the selected view. */
  stats: { minted: number; held: number; ongoing: number; completed: number };
  updatedAt: string | null;
}

export class NftQueryError extends Error {}

/** Reject ambiguous, unbounded or unexpected parameters before accessing the database. */
export function parseNftGalleryQuery(params: URLSearchParams): NftGalleryQuery {
  const allowed = new Set(["wallet", "view", "status", "page", "pageSize"]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) {
      throw new NftQueryError("Invalid NFT gallery parameters.");
    }
  }
  const wallet = params.get("wallet") ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet) || /^0x0{40}$/i.test(wallet)) {
    throw new NftQueryError("Enter a valid Ethereum wallet address.");
  }
  const view = params.get("view") ?? "minted";
  const status = params.get("status") ?? "all";
  const page = params.get("page") ?? "1";
  if ((view !== "minted" && view !== "held") || !["all", "ongoing", "completed", "refundable"].includes(status)) {
    throw new NftQueryError("Choose a valid NFT view and collection status.");
  }
  if (!/^[1-9][0-9]{0,4}$/.test(page) || Number(page) > 10000 || (params.has("pageSize") && params.get("pageSize") !== "12")) {
    throw new NftQueryError("The NFT gallery page is invalid.");
  }
  return { wallet: wallet.toLowerCase(), view, status: status as NftStatus, page: Number(page), pageSize: 12 };
}

export function isNftTokenId(value: string): boolean {
  return /^[1-9][0-9]{0,4}$/.test(value) && Number(value) <= 65536;
}
