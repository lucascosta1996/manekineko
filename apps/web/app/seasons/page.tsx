import type { Metadata } from "next";
import { configuredChainId } from "../../lib/chain-policy";
import { SiteShell } from "../../components/site-shell";
import { SeasonsExperience } from "../../components/seasons-experience";
import { listCollections } from "../../lib/collections/repository";
import { listAnnouncedSeasons } from "../../lib/seasons/schedule-repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seasons | Tincta", description: "Earn prizes by adding color to your wallet. Explore Tincta seasons, six-prize collections, and affiliate programs." };

export default async function SeasonsPage() {
  const [collections, schedules] = await Promise.all([listCollections(), listAnnouncedSeasons()]);
  return <SiteShell chainId={configuredChainId()}><SeasonsExperience initialCollections={collections} initialSchedules={schedules} initialNow={Date.now()} /></SiteShell>;
}
