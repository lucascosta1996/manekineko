import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteShell } from "../../../../components/site-shell";
import { SeasonExperience } from "../../../../components/seasons-experience";
import { listCollections } from "../../../../lib/collections/repository";
import { groupSeasons, isSeasonId } from "../../../../lib/seasons/model";
import { listAnnouncedSeasons } from "../../../../lib/seasons/schedule-repository";

type Props = { params: Promise<{ chainId: string; seasonId: string }> };
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Season collections | Tincta" };

export default async function SeasonPage({ params }: Props) {
  const { chainId, seasonId } = await params;
  if (!["1", "11155111"].includes(chainId) || !isSeasonId(seasonId)) notFound();
  const [collections, schedules] = await Promise.all([listCollections(), listAnnouncedSeasons()]);
  const season = groupSeasons(collections).find(s => s.chainId === Number(chainId) && s.id === seasonId.toLowerCase());
  const announcement = schedules.find(s => s.chainId === Number(chainId) && s.seasonId === seasonId.toLowerCase());
  if (!season && !announcement) notFound();
  return <SiteShell chainId={Number(chainId)}><SeasonExperience initialCollections={collections} initialSchedules={schedules} initialNow={Date.now()} chainId={Number(chainId)} seasonId={seasonId.toLowerCase()} /></SiteShell>;
}
