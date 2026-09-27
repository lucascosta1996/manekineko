import type { FeaturedCollectionSummary } from "@manekineko/contract-abi/lifecycle";

export function parseLiveCollection(input: unknown, origin: URL): FeaturedCollectionSummary | null {
  if (input === null) return null;
  const c = input as FeaturedCollectionSummary;
  const statuses = ["live", "scheduled", "processing", "claimable", "paid", "complete", "refundable", "unavailable"];
  if (!c || typeof c.name !== "string" || c.name.length > 160 || typeof c.label !== "string" || c.label.length > 240
    || !/^\/(mint|seasons)\/[\da-z/-]+$/i.test(c.href) || !statuses.includes(c.status)
    || c.target !== null && !Number.isFinite(Date.parse(c.target)) || !Number.isFinite(Date.parse(c.updatedAt))
    || !Number.isFinite(Date.parse(c.serverNow)) || c.chainTimestamp !== null && !Number.isFinite(Date.parse(c.chainTimestamp)) || typeof c.stale !== "boolean"
    || [c.remainingSupply, c.unpaidPrizes, c.completedCollections, c.totalCollections].some(n => n !== null && (!Number.isSafeInteger(n) || n < 0))) throw new Error("Invalid summary");
  return { name: c.name, href: new URL(c.href, origin).href, status: c.status, label: c.label, target: c.target,
    updatedAt: c.updatedAt, stale: c.stale, serverNow: c.serverNow, chainTimestamp: c.chainTimestamp,
    remainingSupply: c.remainingSupply, unpaidPrizes: c.unpaidPrizes, completedCollections: c.completedCollections, totalCollections: c.totalCollections };
}
