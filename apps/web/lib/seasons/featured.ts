import type { FeaturedCollectionSummary } from "@manekineko/contract-abi/lifecycle";
import type { CollectionPublic } from "../collections/model.ts";
import { collectionChainNow, isCollectionLive, publicCollectionLifecycle, publicSeasonLifecycle } from "./model.ts";
import type { AnnouncedSeason } from "./schedule.ts";

/** Live sale > published future opening > latest observed outcome. Worker status is never chain authority. */
export function featuredPublicCollection(collections: CollectionPublic[], seasons: AnnouncedSeason[], now: number): FeaturedCollectionSummary | null {
  const ordered = [...collections].filter(c => c.mode === "live" && c.contractStatus === "deployed").sort((a, b) => Date.parse(b.saleStartAt ?? b.updatedAt) - Date.parse(a.saleStartAt ?? a.updatedAt));
  const base = { serverNow: new Date(now).toISOString(), chainTimestamp: null, remainingSupply: null, unpaidPrizes: null, completedCollections: null, totalCollections: null };
  const live = ordered.find(c => isCollectionLive(c, now));
  if (live) return { ...base, name: live.name, href: `/mint/${live.id}`, status: "live", label: "Mint open", target: live.observation?.chainTimestamp ? live.mintDeadline : null, updatedAt: live.updatedAt, stale: false,
    chainTimestamp: collectionChainNow(live, now) === null ? null : new Date(collectionChainNow(live, now)!).toISOString(), remainingSupply: live.maxSupply - live.totalMinted };
  const next = seasons.flatMap(s => s.collections.filter(c => c.saleStartAt && Date.parse(c.saleStartAt) > now && !["sold_out", "revealed", "refundable"].includes(c.status)
    && !ordered.some(actual => actual.id === c.id && ["processing", "claimable", "paid", "refundable"].includes(publicCollectionLifecycle(actual, now).state))).map(c => ({ s, c })))
    .sort((a, b) => Date.parse(a.c.saleStartAt!) - Date.parse(b.c.saleStartAt!))[0];
  if (next) return { ...base, name: next.c.name ?? `Collection ${next.c.number}`, href: `/seasons/${next.s.chainId}/${next.s.seasonId}`, status: "scheduled", label: "Announced collection · readiness unconfirmed", target: next.c.saleStartAt,
    updatedAt: next.c.observedAt ?? next.s.updatedAt, stale: true };
  const latest = ordered[0];
  if (!latest) return null;
  const lifecycle = publicCollectionLifecycle(latest, now);
  const announcement = seasons.find(s => s.chainId === latest.chainId && s.seasonId === latest.seasonId);
  const members = ordered.filter(c => c.chainId === latest.chainId && c.seasonId && c.seasonId === latest.seasonId);
  const season = publicSeasonLifecycle(members, now, announcement);
  const complete = Boolean(announcement && season.state === "complete");
  const status = complete ? "complete" : ["paid", "claimable", "processing", "refundable"].includes(lifecycle.state) ? lifecycle.state as "paid" | "claimable" | "processing" | "refundable" : "unavailable";
  return { ...base, name: complete ? announcement!.seasonName : latest.name,
    href: complete ? `/seasons/${latest.chainId}/${latest.seasonId}` : `/mint/${latest.id}`, status,
    label: complete ? `Season complete · ${season.completedCollections}/${season.totalCollections} collections${season.allPrizesPaid ? " · All prizes paid" : ""}` : lifecycle.label,
    target: null, updatedAt: latest.updatedAt, stale: !lifecycle.fresh || lifecycle.state === "unavailable",
    unpaidPrizes: complete ? season.unpaidPrizes : lifecycle.unpaidPrizes,
    completedCollections: complete ? season.completedCollections : null, totalCollections: announcement ? season.totalCollections : null };
}
