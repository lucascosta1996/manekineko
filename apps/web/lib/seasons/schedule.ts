/** Public announcements only. Never deserialize a private launch plan here. */
export type AnnouncedCollection = {
  id: string; number: number; name: string | null; color: string;
  status: "scheduled" | "preparing" | "enrollment" | "minting" | "sold_out" | "revealed" | "refundable";
  enrollmentOpensAt: string | null; saleStartAt: string | null; mintDeadline: string | null;
  contractAddress: string | null;
};
export type AnnouncedSeason = {
  version: 1; runId: string; chainId: 1 | 11155111; seasonId: string; seasonName: string;
  seasonNumber: number | null; colors: string[]; status: "running" | "paused" | "failed" | "completed";
  announcedAt: string; updatedAt: string; collections: AnnouncedCollection[];
};
const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid season announcement.");
  return value as Record<string, unknown>;
}
function name(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 160 || /[\u0000-\u001f]/.test(value)) throw new Error("Invalid announcement name.");
  return value;
}
function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid announcement time.");
  const normalized = new Date(value).toISOString();
  if (normalized !== (value.length === 20 ? value.replace("Z", ".000Z") : value)) throw new Error("Invalid announcement time.");
  return normalized;
}
function color(value: unknown): string {
  if (typeof value !== "string" || !/^#[0-9A-F]{6}$/i.test(value)) throw new Error("Invalid announcement color.");
  return value.toUpperCase();
}
/** Whitelist every field; an accidental extra secret in stored JSON cannot escape. */
export function parseAnnouncedSeason(input: unknown): AnnouncedSeason {
  const value = object(input);
  if (value.version !== 1 || !id.test(String(value.runId)) || (value.chainId !== 1 && value.chainId !== 11155111) || !/^0x[0-9a-f]{64}$/i.test(String(value.seasonId)) || /^0x0{64}$/i.test(String(value.seasonId))) throw new Error("Invalid season identity.");
  if (!Array.isArray(value.colors) || value.colors.length < 1 || value.colors.length > 10 || !Array.isArray(value.collections) || value.collections.length > 10) throw new Error("Invalid announced collections.");
  if (!["running","paused","failed","completed"].includes(String(value.status))) throw new Error("Invalid season status.");
  const colors = value.colors.map(color);
  const collections = value.collections.map(raw => {
    const item = object(raw);
    if (!id.test(String(item.id)) || !Number.isInteger(item.number) || Number(item.number) < 1 || Number(item.number) > colors.length || !["scheduled","preparing","enrollment","minting","sold_out","revealed","refundable"].includes(String(item.status))) throw new Error("Invalid collection identity.");
    if (item.contractAddress !== null && (typeof item.contractAddress !== "string" || !/^0x[0-9a-f]{40}$/i.test(item.contractAddress) || /^0x0{40}$/i.test(item.contractAddress))) throw new Error("Invalid collection address.");
    const result: AnnouncedCollection = { id: String(item.id), number: Number(item.number), name: item.name === null ? null : name(item.name), color: color(item.color),
      status: item.status as AnnouncedCollection["status"], enrollmentOpensAt: date(item.enrollmentOpensAt), saleStartAt: date(item.saleStartAt), mintDeadline: date(item.mintDeadline), contractAddress: item.contractAddress as string | null };
    if (result.color !== colors[result.number - 1]) throw new Error("Announced palette mismatch.");
    if (result.enrollmentOpensAt && result.saleStartAt && Date.parse(result.enrollmentOpensAt) >= Date.parse(result.saleStartAt)
      || result.saleStartAt && result.mintDeadline && Date.parse(result.saleStartAt) >= Date.parse(result.mintDeadline)) throw new Error("Invalid announced schedule order.");
    return result;
  });
  if (new Set(collections.map(item => item.id)).size !== collections.length || new Set(collections.map(item => item.number)).size !== collections.length) throw new Error("Duplicate collection announcement.");
  const announcedAt = date(value.announcedAt), updatedAt = date(value.updatedAt);
  if (!announcedAt || !updatedAt) throw new Error("An announcement needs confirmed publication time.");
  return { version: 1, runId: String(value.runId), chainId: Number(value.chainId) as 1 | 11155111, seasonId: String(value.seasonId).toLowerCase(), seasonName: name(value.seasonName),
    seasonNumber: value.seasonNumber === null ? null : Number.isInteger(value.seasonNumber) && Number(value.seasonNumber) > 0 ? Number(value.seasonNumber) : null,
    colors, status: value.status as AnnouncedSeason["status"], announcedAt, updatedAt, collections };
}
export function announcedSeasonsResponse(input: unknown): AnnouncedSeason[] {
  const value = object(input);
  if (!Array.isArray(value.seasons) || value.seasons.length > 100) throw new Error("Invalid season announcements.");
  return value.seasons.map(parseAnnouncedSeason);
}
export function announcedCollectionActivity(season: AnnouncedSeason, collection: AnnouncedCollection, now: number) {
  if (season.status === "paused" || season.status === "failed") return { label: "Season automation paused", target: null, detail: "New launch events are paused. Existing on-chain mint and claim terms remain in effect." };
  if (season.status === "completed") return { label: "Season complete", target: null, detail: "Explore collection results and any remaining claims." };
  if (!Number.isFinite(now) || now - Date.parse(season.updatedAt) > 180_000 || Date.parse(season.updatedAt) > now + 60_000) return { label: "Checking season status", target: null, detail: "Waiting for a fresh update before showing the next launch countdown." };
  if (["refundable","sold_out","revealed"].includes(collection.status)) return { label: collection.status === "refundable" ? "Refunds available" : collection.status === "sold_out" ? "Sold out · draw pending" : "Draw verified", target: null, detail: "View the collection for current blockchain state and available actions." };
  if (collection.mintDeadline && Date.parse(collection.mintDeadline) <= now) return { label: "Mint deadline reached", target: null, detail: "Minting has closed. Waiting for the confirmed final outcome and available claims." };
  if (collection.enrollmentOpensAt && now < Date.parse(collection.enrollmentOpensAt)) return { label: "Affiliate enrollment scheduled in", target: collection.enrollmentOpensAt, detail: "Enrollment opens after deployment and admission readiness are confirmed." };
  if (collection.saleStartAt && now < Date.parse(collection.saleStartAt)) return { label: "Mint scheduled in", target: collection.saleStartAt, detail: collection.status === "enrollment" ? "Affiliate enrollment is open. Minting starts after its fixed opening and on-chain activation." : "The announced opening is fixed. Deployment and enrollment readiness are being confirmed." };
  if (!collection.saleStartAt) return { label: "Schedule to be announced", target: null, detail: "The next opening is set after the preceding collection’s confirmed sellout." };
  if (collection.status !== "minting" || !collection.contractAddress || !collection.mintDeadline) return { label: "Waiting for on-chain activation", target: null, detail: "The scheduled time has arrived; minting is not confirmed open yet." };
  return { label: "Mint deadline in", target: collection.mintDeadline, detail: "Minting is confirmed active. View the collection for current availability and actions." };
}
