import { configuredChainId } from "../../../lib/chain-policy";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "../../../components/site-shell";
import { MintExperience } from "../../../components/mint-experience";
import { getCollection } from "../../../lib/collections/repository";
import { collectionSeasonHref } from "../../../lib/seasons/model";
import { roundLabel } from "../../../lib/mint/format";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ collectionId: string }>; searchParams: Promise<{ affiliate?: string | string[]; collection?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collectionId } = await params;
  const collection = await getCollection(collectionId);
  return {
    title: collection
      ? `Mint · ${collection.name} | Tincta`
      : "Collection not found | Tincta",
  };
}

export default async function MintPage({ params, searchParams }: Props) {
  const { collectionId } = await params;
  const collection = await getCollection(collectionId);
  if (!collection) notFound();
  const { affiliate, collection: referralCollection } = await searchParams;
  return (
    <SiteShell chainId={configuredChainId()}>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/seasons">Seasons</Link>
        {collectionSeasonHref(collection) && <><span aria-hidden="true">/</span><Link href={collectionSeasonHref(collection)!}>{collection.seasonName}</Link></>}
        <span aria-hidden="true">/</span>
        <span aria-current="page">
          Collection {roundLabel(collection.roundId)}
        </span>
      </nav>
      <MintExperience key={`${collection.id}:${String(affiliate)}:${String(referralCollection)}`} collection={collection} referralQuery={{ affiliate, collection: referralCollection }} />
    </SiteShell>
  );
}
