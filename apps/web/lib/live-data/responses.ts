import { validateCollection } from "../collections/validation.ts";
import type { CollectionPublic } from "../collections/model.ts";
import { buildHistoryResponse, type HistoryResponse, type HistoryCollection } from "../history/model.ts";
import { validateHistoryCollection } from "../history/validation.ts";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid collection response.");
  return value as Record<string, unknown>;
}

export function collectionResponse(value: unknown): CollectionPublic {
  return validateCollection(object(value).collection as CollectionPublic);
}

export function collectionsResponse(value: unknown): CollectionPublic[] {
  const { collections } = object(value);
  if (!Array.isArray(collections)) throw new Error("Invalid collections response.");
  return collections.map((collection) => validateCollection(collection as CollectionPublic));
}

export function historyResponse(value: unknown): HistoryResponse {
  const data = object(value);
  if (data.source !== "postgres" || data.isMock !== false || !Array.isArray(data.collections) || !Array.isArray(data.inProgress) || !data.stats) throw new Error("Invalid history response.");
  const archive = data.collections.map((collection) => validateHistoryCollection(collection as HistoryCollection));
  if (archive.some((collection) => collection.isMock)) throw new Error("Invalid live history response.");
  const inProgress = data.inProgress.map((collection) => validateCollection(collection as CollectionPublic));
  return buildHistoryResponse(archive, inProgress);
}

/** Indexed heartbeat timestamps do not trigger another full RPC verification. */
export function mintAvailabilityRevision(collection: CollectionPublic): string {
  return `${collection.id}:${collection.contractAddress}:${collection.phase}:${collection.totalMinted}:${collection.prizePaid}`;
}
