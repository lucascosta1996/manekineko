import { configuredChainId } from "../../lib/chain-policy";
import type { Metadata } from "next";
import { SiteShell } from "../../components/site-shell";
import { HistoryExperience } from "../../components/history/history-experience";
import { getHistory } from "../../lib/history/repository";
import "./history.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Results | Tincta",
  description: "Explore winning tickets and confirmed prize and affiliate payments recorded on-chain.",
};

export default async function HistoryPage() {
  const history = await getHistory();
  return <SiteShell section="history" chainId={configuredChainId()}><HistoryExperience collections={history.collections} inProgress={history.inProgress} stats={history.stats} /></SiteShell>;
}
