import Link from "next/link";
import type { ReactNode } from "react";
import type { CollectionPublic } from "../lib/collections/model";
import { collectionAvailabilityLabel } from "../lib/seasons/model";
import { collectionPrizeCopy } from "../lib/collections/copy";
import { formatCount, formatWei, roundLabel } from "../lib/mint/format";
import { ticketDataUri } from "../lib/mint/preview";
import { SeasonColorBar } from "./season-color-preview";
import { CollectionActivity } from "./collection-activity";

export function CollectionGrid({ collections, liveId = null, now, colors, children }: { collections: CollectionPublic[]; liveId?: string | null; now: number; colors?: string[]; children?: ReactNode }) {
  return <section className="catalog-grid" aria-label="Collections">{collections.map((collection, index) => {
    const live = collection.id === liveId;
    return <article id={`collection-${collection.id}`} className={`catalog-card${live ? " catalog-card-live" : ""}`} key={collection.id} aria-label={live ? `${collection.name} — current live collection` : collection.name}>
      {live && <div className="collection-live-banner"><span className="catalog-status-dot" aria-hidden="true" />Current live collection<span>Mint open</span></div>}
      <Link href={`/mint/${collection.id}`} className="catalog-main-link">
        <div className={`catalog-art${["unique-rank-v5", "unique-rank-v6"].includes(collection.algorithmVersion) ? " is-portrait" : ""}`}>
          <span>{collection.seasonName ?? `COLLECTION ${roundLabel(collection.roundId)}`}</span>
          <img src={ticketDataUri(collection.roundId, 1, false, collection.algorithmVersion, collection.maxSupply, collection)}
            alt={`Illustrative ticket artwork for ${collection.name}`} width="640" height={["unique-rank-v5", "unique-rank-v6"].includes(collection.algorithmVersion) ? "800" : "640"} />
          {colors && <SeasonColorBar colors={colors} />}
        </div>
        <div className="catalog-card-body">
          <div className="catalog-card-title"><h3>{collection.collectionColor && <span className="collection-color-dot" style={{ backgroundColor: collection.collectionColor }} aria-hidden="true" />}{collection.name}</h3><span aria-hidden="true">↗</span></div>
          <p className="catalog-card-status"><span className="catalog-status-dot" aria-hidden="true" />{collectionAvailabilityLabel(collection, now)}<span>{collection.networkName}</span></p>
          <p className="catalog-prize-description">{collectionPrizeCopy(collection)}</p>
          <dl><div><dt>Prizes at sellout</dt><dd>{formatWei(BigInt(collection.mintPriceWei) * BigInt(collection.maxSupply) * BigInt(collection.prizeBps) / 10_000n, collection.nativeCurrency.decimals)} {collection.nativeCurrency.symbol}</dd></div>
            <div><dt>Ticket price</dt><dd>{formatWei(collection.mintPriceWei, collection.nativeCurrency.decimals)} {collection.nativeCurrency.symbol}</dd></div>
            <div><dt>Tickets minted</dt><dd>{formatCount(collection.totalMinted)} / {formatCount(collection.maxSupply)}</dd></div></dl>
          <span className="catalog-cta">{live ? "Mint a ticket" : "View prizes"}<span aria-hidden="true">→</span></span>
        </div>
      </Link>
      <CollectionActivity collection={collection} previous={colors ? collections[index - 1] : undefined} initialNow={now} showEnrollment />
      {collection.contractVersion !== "legacy" && <Link className="catalog-affiliate-link" href={`/mint/${collection.id}/affiliates`}>Affiliate rewards <span aria-hidden="true">↗</span></Link>}
    </article>;
  })}{children}</section>;
}
