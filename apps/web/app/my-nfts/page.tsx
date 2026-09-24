import type { Metadata } from "next";
import { SiteShell } from "../../components/site-shell";
import { NftGallery } from "../../components/nfts/nft-gallery";
import { configuredChainId } from "../../lib/chain-policy";
import "./nfts.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Tickets | Tincta",
  description: "Follow your Tincta tickets, draw results, and available prize claims.",
};

export default async function MyNftsPage({ searchParams }: { searchParams: Promise<{ wallet?: string | string[] }> }) {
  const { wallet } = await searchParams;
  const initialWallet = typeof wallet === "string" && /^0x[0-9a-fA-F]{40}$/.test(wallet) && !/^0x0{40}$/.test(wallet) ? wallet.toLowerCase() : null;
  return <SiteShell section="nfts" chainId={configuredChainId()}><NftGallery initialWallet={initialWallet} /></SiteShell>;
}
