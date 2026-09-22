import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteShell } from "../../../../components/site-shell";
import { NftDetail } from "../../../../components/nfts/nft-detail";
import { getIndexedNft } from "../../../../lib/nfts/repository";
import "../../../my-nfts/nfts.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "NFT details | Tincta", description: "View this ticket’s actual on-chain SVG, number combination, score, and collection status." };

export default async function NftPage({ params }: { params: Promise<{ collectionId: string; tokenId: string }> }) {
  const { collectionId, tokenId } = await params;
  const item = await getIndexedNft(collectionId, tokenId);
  if (!item) notFound();
  return <SiteShell section="nfts" chainId={item.chainId}><NftDetail item={item} /></SiteShell>;
}
