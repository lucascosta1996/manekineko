import "server-only";

import { database } from "../database";
import { configuredChainId } from "../chain-policy";
import { isCollectionId } from "../collections/model";
import { collectionSource } from "../collections/source-policy";
import { isNftTokenId, type IndexedNftRecord, type NftGalleryQuery, type NftGalleryResponse, type NftItem } from "./model";
import { INDEXED_NFT_QUERY, NFT_GALLERY_QUERY } from "./queries";

interface NftRow extends Omit<IndexedNftRecord, "blockNumber" | "ownerWallet" | "burned" | "mintedAt"> {
  mintedAt: Date | string;
  updatedAt: Date | string;
}
interface GalleryRow {
  total: number;
  minted: number;
  held: number;
  ongoing: number;
  completed: number;
  updatedAt: Date | null;
  items: NftRow[];
}

function trustedFactories(): string {
  const enabled = configuredChainId();
  const factories = [1, 11155111].filter((chain) => enabled === null || chain === enabled).flatMap((chain) => ["V5", "V6", "V7", "V8", "V9", "V10"].flatMap((version) => {
    const factory = process.env[`AFFILIATE_TRUSTED_FACTORY_${version}_${chain}`]?.toLowerCase();
    const hash = process.env[`AFFILIATE_TRUSTED_FACTORY_CODEHASH_${version}_${chain}`]?.toLowerCase();
    return factory && /^0x[0-9a-f]{40}$/.test(factory) && !/^0x0{40}$/.test(factory) && /^0x[0-9a-f]{64}$/.test(hash ?? "")
      ? [{ chain_id: chain, factory, contract_version: version === "V10" ? "affiliate-v10" : version === "V9" ? "affiliate-v9" : version === "V8" ? "affiliate-v8" : version === "V7" ? "affiliate-v7" : version === "V6" ? "affiliate-v6" : "affiliate-v5" }] : [];
  }));
  if (factories.length === 0) throw new Error("The NFT gallery has no trusted collection factories configured.");
  return JSON.stringify(factories);
}

function publicNft(row: NftRow): NftItem {
  return {
    contractVersion: row.contractVersion, algorithmVersion: row.algorithmVersion,
    collectionId: row.collectionId, name: row.name, symbol: row.symbol, roundId: row.roundId,
    seasonId: row.seasonId, seasonName: row.seasonName, collectionColor: row.collectionColor, textColor: row.textColor,
    chainId: row.chainId, networkName: row.networkName, contractAddress: row.contractAddress,
    tokenId: row.tokenId, phase: row.phase, mintedAt: new Date(row.mintedAt).toISOString(),
    mintTransactionHash: row.mintTransactionHash, mintedBy: row.mintedBy, mintedTo: row.mintedTo,
    currentOwner: row.currentOwner, refunded: row.refunded, revealed: row.revealed,
    awardRank: row.awardRank, awardAmountWei: row.awardAmountWei,
    winningToken: row.winningToken, prizePaid: row.prizePaid,
    winningHolder: row.winningHolder, prizeRecipient: row.prizeRecipient,
    confirmedBlock: row.confirmedBlock, blockHash: row.blockHash,
  };
}

/** One statement provides counts, ownership, provenance, and page rows at one MVCC snapshot. */
export async function getNftGallery(query: NftGalleryQuery): Promise<NftGalleryResponse> {
  collectionSource();
  const { rows } = await database().query<GalleryRow>(NFT_GALLERY_QUERY, [
    configuredChainId(), trustedFactories(), query.wallet, query.view, query.status,
    query.pageSize, (query.page - 1) * query.pageSize,
  ]);
  const row = rows[0];
  return {
    ...query, total: row.total, hasMore: query.page * query.pageSize < row.total,
    items: row.items.map(publicNft), stats: { minted: row.minted, held: row.held, ongoing: row.ongoing, completed: row.completed },
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

export async function getIndexedNft(collectionId: string, tokenId: string): Promise<IndexedNftRecord | null> {
  if (!isCollectionId(collectionId) || !isNftTokenId(tokenId)) return null;
  collectionSource();
  const { rows } = await database().query<NftRow>(INDEXED_NFT_QUERY, [
    configuredChainId(), trustedFactories(), collectionId.toLowerCase(), Number(tokenId),
  ]);
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    ...publicNft(row), factoryAddress: row.factoryAddress, maxSupply: row.maxSupply,
    contractVersion: row.contractVersion, algorithmVersion: row.algorithmVersion,
    blockNumber: row.confirmedBlock, ownerWallet: row.currentOwner, burned: row.currentOwner === null,
  };
}
