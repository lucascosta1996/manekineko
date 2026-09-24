import { configuredChainId } from "../../../../lib/chain-policy";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "../../../../components/site-shell";
import { AffiliateExperience } from "../../../../components/affiliates/affiliate-experience";
import { getCollection } from "../../../../lib/collections/repository";
import "./affiliates.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ collectionId: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collectionId } = await params;
  const collection = await getCollection(collectionId);
  return { title: collection ? `Affiliate rewards · ${collection.name} | Tincta` : "Collection not found | Tincta", description: "Check affiliate eligibility, track rewards in ETH, and claim directly from this collection’s contract.", robots: { index: false, follow: true } };
}
export default async function AffiliatePage({ params }: Props) {
  const { collectionId } = await params;
  const collection = await getCollection(collectionId);
  if (!collection) notFound();
  return <SiteShell chainId={configuredChainId()}>
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link href="/seasons">Seasons</Link><span aria-hidden="true">/</span>
      <Link href={`/mint/${collection.id}`}>{collection.name}</Link><span aria-hidden="true">/</span>
      <span aria-current="page">Affiliate rewards</span>
    </nav>
    <AffiliateExperience key={collection.id} collection={collection} />
  </SiteShell>;
}
