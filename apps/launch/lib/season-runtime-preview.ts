import { launchContractVersion } from "./launch-config.ts";
import { formatEther } from "ethers";
import { buildSeasonSocialMessage, SEASON_SOCIAL_EVENTS, type SeasonSocialInput, type SeasonSocialMessage } from "@manekineko/contract-abi/season-social";
import type { AutomationPlan } from "./launch-automation.ts";

export type RuntimePreview = { key: string; collectionLabel: string; message: SeasonSocialMessage; imageUrl: string };
/** Illustrations only: no database or chain observation is manufactured for execution. */
export function seasonRuntimePreviews(saved: AutomationPlan, publicBaseUrl?: string, now = new Date()): RuntimePreview[] {
  const plan = saved.plan;
  if (!plan.seasonId || !plan.steps.length) return [];
  const base = publicBaseUrl ?? (plan.chainId === "11155111" ? "https://color-study-preview.vercel.app" : "https://tincta.xyz");
  const colors = plan.steps.map(step => step.payload.contract.collectionColor ?? "#000000");
  if (colors.some(color => !/^#[0-9a-fA-F]{6}$/.test(color))) return [];
  const season = { id: plan.seasonId, number: saved.seasonOrder ?? 1, name: plan.name, colors };
  const parsedStart = plan.startAt ? Date.parse(plan.startAt) : Number.NaN;
  const initialStart = Number.isFinite(parsedStart) ? parsedStart : Math.floor(now.getTime() / 1000) * 1000 + 86400000;
  const iso = (value: number) => new Date(value).toISOString();
  const entries: RuntimePreview[] = [];
  for (const event of SEASON_SOCIAL_EVENTS) {
    const seasonEvent = event === "upcoming-season" || event === "season-complete";
    for (const [index, step] of (seasonEvent ? plan.steps.slice(0, 1) : plan.steps).entries()) {
      try {
        const terms = step.payload.contract, winners = Number(terms.winnerCount ?? 6), supply = Number(terms.maxSupply);
        const mintPrice = BigInt(terms.mintPriceWei), prize = BigInt(supply) * mintPrice * BigInt(terms.prizeBps) / 10000n / BigInt(winners);
        const start = initialStart + index * 86400000;
        const enrollment = start - Number(step.payload.operations.enrollmentWindowSeconds) * 1000;
        const deadline = step.deadline.mode === "fixed" && step.deadline.at ? Date.parse(step.deadline.at) : start + Number(terms.mintDurationSeconds) * 1000;
        const collectionUrl = `${base}/mint/${step.id}`;
        const sampleNow = event === "affiliate-opening-soon" ? enrollment - 3600000 : event === "affiliate-enrollment-open" ? enrollment : event === "collection-live" ? start : event === "refunds-available" || event === "season-complete" ? deadline + 60000 : start + 1000;
        const input: SeasonSocialInput = {
          event, contractVersion: launchContractVersion(step.payload) === "affiliate-v10" ? "affiliate-v10" : "affiliate-v9", chainId: Number(plan.chainId) as 1 | 11155111, season,
          ...(!seasonEvent ? { collection: { id: step.id, number: index + 1, name: terms.name, color: colors[index], supply, mintPriceEth: formatEther(mintPrice), winnerCount: winners, prizePerWinnerEth: formatEther(prize) } } : {}),
          now: iso(sampleNow), enrollmentOpensAt: iso(enrollment), saleStartsAt: iso(start), deadline: iso(deadline),
          urls: { season: `${base}/seasons/${plan.chainId}/${plan.seasonId}`, collection: collectionUrl, affiliate: `${collectionUrl}/affiliates`, docs: `${base}/docs`, refund: collectionUrl, commissions: `${collectionUrl}/affiliates`, prizeClaim: collectionUrl },
          drawVerified: event === "winners-revealed",
          ...(event === "winners-revealed" ? { winners: Array.from({ length: winners }, (_, rank) => ({ rank: rank + 1, tokenId: String(rank + 1), awardEth: formatEther(prize), holderWallet: `0x${String(rank + 1).padStart(40, "0")}`, holderBlock: "0", nftUrl: `${base}/nfts/${step.id}/${rank + 1}`, claimed: false })) } : {}),
          ...(event === "season-complete" ? { stats: { collectionsSoldOut: plan.steps.length, nftsMinted: plan.steps.reduce((sum, item) => sum + Number(item.payload.contract.maxSupply), 0), prizesClaimedEth: "0", affiliateClaimedEth: "0", snapshotBlock: "0" } } : {}),
        };
        const key = `${event}:${seasonEvent ? "season" : step.id}`;
        entries.push({ key, collectionLabel: seasonEvent ? "Season" : `Collection ${String(index + 1).padStart(2, "0")} · ${terms.name}`, message: buildSeasonSocialMessage(input), imageUrl: `/api/launch/automations/${saved.id}/runtime/previews?image=${encodeURIComponent(key)}&revision=${saved.revision}` });
      } catch { /* Incomplete drafts have no publishable preview; validation remains authoritative. */ }
    }
  }
  return entries;
}
