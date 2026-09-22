import { sha256, toUtf8Bytes } from "ethers";
import { collectionProgress } from "../collections/presentation.ts";
import type { CollectionPublic } from "../collections/model.ts";

export interface SeasonPublic {
  id: string;
  chainId: number;
  name: string;
  networkName: string;
  collections: CollectionPublic[];
}

export function isSeasonId(id: string): boolean {
  return /^0x[0-9a-f]{64}$/i.test(id) && !/^0x0{64}$/i.test(id);
}

export function seasonHref(season: Pick<SeasonPublic, "id" | "chainId">): string {
  return `/seasons/${season.chainId}/${season.id.toLowerCase()}`;
}

export function collectionSeasonHref(collection: CollectionPublic): string | null {
  return collection.seasonId && isSeasonId(collection.seasonId)
    ? seasonHref({ id: collection.seasonId, chainId: collection.chainId }) : null;
}

/** A minting snapshot alone is not enough: scheduled, expired and sold-out sales are not live. */
export function isCollectionLive(collection: CollectionPublic, now: number): boolean {
  if (collection.mode !== "live" || collection.contractStatus !== "deployed" || !collection.contractAddress
    || collection.phase !== "minting" || collection.totalMinted >= collection.maxSupply || !collection.mintDeadline) return false;
  const deadline = Date.parse(collection.mintDeadline);
  const start = collection.saleStartAt ? Date.parse(collection.saleStartAt) : 0;
  return Number.isFinite(start) && Number.isFinite(deadline) && start <= now && now < deadline;
}

export function collectionAvailabilityLabel(collection: CollectionPublic, now: number): string {
  if (isCollectionLive(collection, now)) return "Mint open";
  if (collection.phase === "minting") {
    if (collection.totalMinted >= collection.maxSupply) return "Sold out";
    if (collection.mintDeadline && Date.parse(collection.mintDeadline) <= now) return "Mint closed";
    if (!collection.mintDeadline) return "Mint availability unconfirmed";
  }
  return collectionProgress(collection, now).label;
}

/** Stable priority if independent seasons overlap; snapshot refresh times never influence navigation. */
export function currentLiveCollection(collections: readonly CollectionPublic[], now: number): CollectionPublic | null {
  return collections.filter(c => isCollectionLive(c, now)).sort((a, b) => {
    const start = Date.parse(b.saleStartAt ?? "1970-01-01") - Date.parse(a.saleStartAt ?? "1970-01-01");
    if (start) return start;
    if (a.chainId !== b.chainId) return a.chainId - b.chainId;
    if (BigInt(a.roundId) !== BigInt(b.roundId)) return BigInt(a.roundId) > BigInt(b.roundId) ? -1 : 1;
    return a.id.localeCompare(b.id);
  })[0] ?? null;
}

// Same immutable namespace and order as the saved seasons.json importer.
const catalogOrder = new Map([1, 11155111].flatMap(chainId => Array.from({ length: 22 }, (_, index) => [
  sha256(toUtf8Bytes(`manekineko:seasons.json:chain:${chainId}:season:${index + 1}`)), index + 1,
] as const)));

export function groupSeasons(collections: readonly CollectionPublic[]): SeasonPublic[] {
  const seasons = new Map<string, SeasonPublic>();
  for (const collection of collections) {
    if (!collection.seasonId || !isSeasonId(collection.seasonId) || !collection.seasonName
      || collection.contractStatus !== "deployed" || collection.mode !== "live") continue;
    const id = collection.seasonId.toLowerCase();
    const key = `${collection.chainId}:${id}`;
    const season = seasons.get(key) ?? { id, chainId: collection.chainId, name: collection.seasonName,
      networkName: collection.networkName, collections: [] };
    season.collections.push(collection);
    seasons.set(key, season);
  }
  for (const season of seasons.values()) season.collections.sort((a, b) => BigInt(a.roundId) === BigInt(b.roundId)
    ? a.id.localeCompare(b.id) : BigInt(a.roundId) < BigInt(b.roundId) ? -1 : 1);
  return [...seasons.values()].sort((a, b) => (catalogOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER)
    - (catalogOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.chainId - b.chainId || a.id.localeCompare(b.id));
}

export function mintDestination(collections: readonly CollectionPublic[], now: number): string {
  const live = currentLiveCollection(groupSeasons(collections).flatMap(s => s.collections), now);
  return live ? `${collectionSeasonHref(live)}#collection-${live.id}` : "/seasons";
}
