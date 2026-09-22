"use client";
import Link from "next/link";
import { announcedCollectionActivity, type AnnouncedCollection, type AnnouncedSeason } from "../lib/seasons/schedule";
import { ProtocolCountdown, useProtocolClock } from "./collection-activity";
import { SeasonColorBar, SeasonColorStack } from "./season-color-preview";

export function AnnouncedActivity({ season, collection }: { season: AnnouncedSeason; collection: AnnouncedCollection }) {
  const now = useProtocolClock();
  if (now === null) return null;
  const activity = announcedCollectionActivity(season, collection, now);
  return <div className="collection-activity">
    {activity.target ? <ProtocolCountdown target={activity.target} label={activity.label} now={now} /> : <span className="activity-label">{activity.label}</span>}
    <p className="activity-detail">{activity.detail}</p>
    {collection.contractAddress && collection.status === "enrollment" && <Link className="activity-link" href={`/mint/${collection.id}/affiliates`}>View affiliate program ↗</Link>}
  </div>;
}
export function AnnouncedSeasonCard({ season }: { season: AnnouncedSeason }) {
  const collection = season.collections.find(item => !["sold_out","revealed","refundable"].includes(item.status)) ?? season.collections.at(-1);
  const href = `/seasons/${season.chainId}/${season.seasonId}`;
  return <article className="season-card season-card-upcoming">
    <Link className="season-cover season-cover-link" href={href}><div className="season-cover-label"><span>{season.chainId === 1 ? "ETHEREUM" : "SEPOLIA"}</span><span>ANNOUNCED</span></div><SeasonColorStack colors={season.colors} /><SeasonColorBar colors={season.colors} /></Link>
    <div className="season-card-heading"><h3><Link href={href}>{season.seasonName}</Link></h3><span aria-hidden="true">↗</span></div>
    <p>{season.colors.length} collections · Season announced</p>
    {collection && <AnnouncedActivity season={season} collection={collection} />}
    <Link className="season-card-foot" href={href}><span>Explore the season schedule</span><span aria-hidden="true">→</span></Link>
  </article>;
}
export function AnnouncedCollectionCard({ season, collection }: { season: AnnouncedSeason; collection: AnnouncedCollection }) {
  return <article className="catalog-card catalog-card-upcoming">
    <div className="catalog-art is-portrait"><span>SCHEDULED</span><div className="collection-color-preview" style={{ backgroundColor: collection.color }} role="img" aria-label={`Collection color ${collection.color}`} /><SeasonColorBar colors={season.colors} /></div>
    <div className="catalog-card-body"><div className="catalog-card-title"><h3>{collection.name ?? `Collection ${String(collection.number).padStart(2, "0")}`}</h3></div><p>Collection {String(collection.number).padStart(2, "0")} · {season.seasonName}</p></div>
    <AnnouncedActivity season={season} collection={collection} />
  </article>;
}
