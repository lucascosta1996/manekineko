import { configuredChainId } from "../../lib/chain-policy";
import type { Metadata } from "next";
import { SiteShell } from "../../components/site-shell";
import { HistoryExperience } from "../../components/history/history-experience";
import { getHistory } from "../../lib/history/repository";
import "./history.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Collection history | Tincta",
  description: "Follow deployed Tincta collections and explore verified winning outcomes, prize recipients, and collection statistics.",
};

export default async function HistoryPage() {
  const history = await getHistory();
  return <SiteShell section="history" chainId={configuredChainId()}><HistoryExperience collections={history.collections} inProgress={history.inProgress} stats={history.stats} /></SiteShell>;
}
