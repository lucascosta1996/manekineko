import type { CollectionPublic } from "../collections/model.ts";
import { collectionProgress } from "../collections/presentation.ts";

export function collectionHasClosed(collection: CollectionPublic): boolean {
  return collection.mode === "live" && collection.contractStatus === "deployed" && (
    collection.totalMinted >= collection.maxSupply || collection.phase === "refundable" || collection.phase === "complete"
  );
}

export function countdownParts(target: string, now: number) {
  const timestamp = Date.parse(target);
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return null;
  const seconds = Math.max(0, Math.ceil((timestamp - now) / 1000));
  return { days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600), minutes: Math.floor(seconds % 3600 / 60), seconds: seconds % 60, expired: seconds === 0 };
}

export function collectionActivity(collection: CollectionPublic, now: number, previous?: CollectionPublic) {
  const base = { target: null as string | null, countdownLabel: "", ...collectionProgress(collection, now) };
  if (collection.mode !== "live" || collection.contractStatus !== "deployed") return { ...base, label: "Launch to be announced", detail: "The opening time will appear when this collection is published." };
  if (collectionHasClosed(collection)) return collection.phase === "refundable"
    ? { ...base, label: collection.refundedAt ? "Refunds completed" : "Refunds available", detail: collection.refundedAt ? "All minted tickets have been refunded." : "The mint ended without selling out. Ticket holders can claim their mint-price refund." }
    : base;
  if (!["minting", "pending_activation"].includes(collection.phase ?? "")) return base;
  const deadline = Date.parse(collection.mintDeadline ?? "");
  if (Number.isFinite(deadline) && now >= deadline) return { ...base, label: "Mint deadline reached", detail: "Minting has ended. Waiting for the next confirmed blockchain update." };
  if (previous && !collectionHasClosed(previous)) return { ...base, label: "Waiting for the previous collection", detail: "Its mint must close before this collection is ready to launch." };
  const start = Date.parse(collection.saleStartAt ?? "");
  if (Number.isFinite(start) && now < start) return { ...base, label: "Scheduled mint", target: collection.saleStartAt!, countdownLabel: "Mint scheduled in", detail: "Sales begin once the scheduled time and on-chain activation are confirmed." };
  if (collection.phase === "pending_activation") return { ...base, detail: Number.isFinite(start) ? "The scheduled opening has arrived. Waiting for on-chain activation; minting is not open yet." : "Waiting for on-chain activation. Minting is not open yet." };
  return { ...base, target: Number.isFinite(deadline) ? collection.mintDeadline : null, countdownLabel: "Mint closes in" };
}

export function upcomingActivity(previous?: CollectionPublic) {
  if (!previous) return { label: "Launch to be announced", detail: "The countdown will appear once the launch time is confirmed." };
  if (collectionHasClosed(previous)) return {
    label: "Next launch to be announced",
    detail: previous.phase === "refundable"
      ? "The previous mint ended unsold. The next collection’s schedule and affiliate availability are not confirmed yet."
      : "The previous collection sold out. The next collection’s schedule and affiliate availability are not confirmed yet.",
  };
  return { label: "Waiting for the previous collection", detail: "The next launch time and affiliate enrollment will appear here when confirmed." };
}

export function featuredSeasonCollection(collections: CollectionPublic[], now: number): CollectionPublic {
  return collections.find(c => !collectionHasClosed(c) && c.phase === "minting" && Date.parse(c.saleStartAt ?? "1970-01-01") <= now)
    ?? collections.find(c => !collectionHasClosed(c)) ?? collections[collections.length - 1];
}
