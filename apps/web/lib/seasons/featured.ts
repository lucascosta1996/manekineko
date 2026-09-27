import { observationFresh } from "@manekineko/contract-abi/lifecycle";
import type { CollectionPublic } from "../collections/model.ts";
import type { AnnouncedSeason } from "./schedule.ts";

export function featuredPublicCollection(collections: CollectionPublic[], seasons: AnnouncedSeason[], now: number) {
  const live = collections.find(c => c.mode === "live" && c.contractStatus === "deployed" && c.phase === "minting" && c.totalMinted < c.maxSupply && observationFresh(c.updatedAt, now) && (!c.saleStartAt || Date.parse(c.saleStartAt) <= now) && Date.parse(c.mintDeadline ?? "") > now);
  if (live) return { name: live.name, href: `/mint/${live.id}`, status: "live", target: live.mintDeadline, updatedAt: live.updatedAt, stale: false };
  const next = seasons.filter(s => s.status === "running").flatMap(s => s.collections.filter(c => c.saleStartAt && Date.parse(c.saleStartAt) > now && !["sold_out", "revealed", "refundable"].includes(c.status)).map(c => ({ s, c }))).sort((a, b) => Date.parse(a.c.saleStartAt!) - Date.parse(b.c.saleStartAt!))[0];
  return next ? { name: next.c.name ?? `Collection ${next.c.number}`, href: `/seasons/${next.s.chainId}/${next.s.seasonId}`, status: "scheduled", target: next.c.saleStartAt, updatedAt: next.c.observedAt ?? next.s.updatedAt, stale: !observationFresh(next.c.observedAt ?? next.s.updatedAt, now) } : null;
}
