"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CollectionPublic } from "../lib/collections/model";
import { collectionPrizeCopy, collectionReferralCopy } from "../lib/collections/copy";
import { collectionsResponse } from "../lib/live-data/responses";
import { currentLiveCollection, groupSeasons, seasonHref, type SeasonPublic } from "../lib/seasons/model";
import { ticketDataUri } from "../lib/mint/preview";
import { useLiveData } from "./use-live-data";
import { LiveDataNotice } from "./live-data-notice";
import { CollectionGrid } from "./collections-experience";
import { SeasonSpectrum } from "./season-spectrum";
import { seasonColors, upcomingCollectionColors, upcomingSeasonPalettes, type SeasonPalette } from "../lib/seasons/palettes";
import { SeasonColorBar, SeasonColorStack } from "./season-color-preview";
import { CollectionActivity } from "./collection-activity";
import { featuredSeasonCollection, upcomingActivity } from "../lib/seasons/activity";
import { announcedSeasonsResponse, type AnnouncedSeason } from "../lib/seasons/schedule";
import { AnnouncedActivity, AnnouncedCollectionCard, AnnouncedSeasonCard } from "./announced-season";

function useSeasonCatalog(initialCollections: CollectionPublic[], initialNow: number) {
  const { data: collections, retrying } = useLiveData("/api/collections", initialCollections, collectionsResponse);
  const [now, setNow] = useState(initialNow);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(timer); }, []);
  return { collections, seasons: groupSeasons(collections), retrying, now };
}

function SeasonCard({ season, now, announcement }: { season: SeasonPublic; now: number; announcement?: AnnouncedSeason }) {
  const live = currentLiveCollection(season.collections, now);
  const cover = featuredSeasonCollection(season.collections, now);
  const previous = season.collections[season.collections.findIndex(c => c.id === cover.id) - 1];
  const colors = announcement?.colors ?? seasonColors(season);
  const previews = upcomingCollectionColors(season);
  const next = announcement?.collections.find(item => !["sold_out", "revealed", "refundable"].includes(item.status) && !season.collections.some(collection => collection.id === item.id));
  return <article className="season-card">
    <Link className="season-cover season-cover-link" href={seasonHref(season)} aria-label={`Explore ${season.name}`}>
      <div className="season-cover-label"><span>{season.networkName}</span><span>{live ? "MINT OPEN" : "SEASON"}</span></div>
      <SeasonColorStack colors={[cover.collectionColor ?? "#e8e8eb", ...previews.map(c => c.color)]}>
        <img src={ticketDataUri(cover.roundId, 1, false, cover.algorithmVersion, cover.maxSupply, cover)} width="640" height={["unique-rank-v5", "unique-rank-v6"].includes(cover.algorithmVersion) ? "800" : "640"} alt={`Illustrative ticket artwork from ${season.name}${previews.length ? `, with upcoming collection colors ${previews.map(c => c.color).join(", ")}` : ""}`} />
      </SeasonColorStack>
      <SeasonColorBar colors={colors} />
    </Link>
    <div className="season-card-heading"><h3><Link href={seasonHref(season)}>{season.name}</Link></h3><span aria-hidden="true">↗</span></div>
    <p>{season.collections.length} published {season.collections.length === 1 ? "collection" : "collections"} · Up to 10 in a season</p>
    <p className="catalog-prize-description">{cover.name} · {collectionPrizeCopy(cover)}</p>
    <CollectionActivity key={cover.id} collection={cover} previous={previous} initialNow={now} showEnrollment />
    {announcement && next && !live && <AnnouncedActivity season={announcement} collection={next} />}
    <Link className="season-card-foot" href={seasonHref(season)}><span>{live ? `Now minting · ${live.name}` : "View prizes and results"}</span><span aria-hidden="true">→</span></Link>
  </article>;
}

function UpcomingSeasonCard({ palette }: { palette: SeasonPalette }) {
  const label = `Season ${String(palette.ordinal).padStart(2, "0")}`;
  return <article className="season-card season-card-upcoming" aria-label={`${label} — coming soon`}>
    <div className="season-cover">
      <div className="season-cover-label"><span>{label.toUpperCase()}</span><span>COMING SOON</span></div>
      <SeasonColorStack colors={palette.colors} />
      <SeasonColorBar colors={palette.colors} />
    </div>
    <div className="season-card-heading"><h3>{label}</h3></div>
    <p>{palette.colors.length} upcoming collections · Reward details to follow</p>
    <div className="collection-activity"><span className="activity-label">Season schedule to be announced</span><p className="activity-detail">Launch countdowns and affiliate availability appear once the next collection is confirmed.</p></div>
    <div className="season-card-foot"><span>The next opportunities to win.</span><span className="season-coming-label">Coming soon</span></div>
  </article>;
}

function UpcomingCollectionCard({ ordinal, color, colors, previous }: { ordinal: number; color: string; colors: string[]; previous?: CollectionPublic }) {
  const label = `Collection ${String(ordinal).padStart(2, "0")}`;
  const activity = upcomingActivity(previous);
  return <article className="catalog-card catalog-card-upcoming" aria-label={`${label} — coming soon`}>
    <div className="catalog-art is-portrait">
      <span>COMING SOON</span>
      <div className="collection-color-preview" style={{ backgroundColor: color }} role="img" aria-label={`Upcoming collection color ${color}`} />
      <SeasonColorBar colors={colors} />
    </div>
    <div className="catalog-card-body">
      <div className="catalog-card-title"><h3><span className="collection-color-dot" style={{ backgroundColor: color }} aria-hidden="true" />{label}</h3></div>
      <p>A new collection is coming. Prize and opening details will appear when confirmed.</p>
    </div>
    <div className="collection-activity"><span className="activity-label">{activity.label}</span><p className="activity-detail">{activity.detail}</p></div>
  </article>;
}

export function SeasonsExperience({ initialCollections, initialNow, initialSchedules = [] }: { initialCollections: CollectionPublic[]; initialNow: number; initialSchedules?: AnnouncedSeason[] }) {
  const { collections, seasons, retrying, now } = useSeasonCatalog(initialCollections, initialNow);
  const schedules = useLiveData("/api/seasons/schedules", initialSchedules, announcedSeasonsResponse);
  const announced = schedules.data.filter(item => !seasons.some(season => season.chainId === item.chainId && season.id === item.seasonId));
  const earlier = collections.filter(c => !c.seasonId);
  const upcoming = upcomingSeasonPalettes(seasons, seasons.length ? 2 : 3).filter(palette => !announced.some(item => item.seasonNumber === palette.ordinal));
  return <>
    <div className="catalog-heading seasons-heading"><div><p className="eyebrow">TINCTA / ON-CHAIN REWARDS</p><h1>Explore your<br />next reward.</h1></div>
      <div className="catalog-intro"><SeasonSpectrum />
        <p>Compare prize values and ticket prices.<br />Mint a ticket for a chance to win, or qualify for affiliate rewards.</p><span className="catalog-intro-caption">FIXED RULES. PROTECTED REWARDS.</span></div></div>
    <div className="season-format"><p><strong>ETH rewards. Governed by smart contracts.</strong> In the current design, the contract holds prize funds and earned affiliate rewards, protects them from team withdrawals, and pays eligible claims directly to the chosen wallet. No manual payout approval.</p><p>V10 rollout is pending. Published collections keep their original draw, prize and affiliate rules. Reward values and claim availability follow each collection’s contract. <Link href="/docs/prizes">How reward funds are protected →</Link></p></div>
    <div className="catalog-section-heading"><h2>Seasons <span>{String(seasons.length + announced.length).padStart(2, "0")}</span></h2><span>Explore prizes and affiliate rewards.</span></div>
    <LiveDataNotice retrying={retrying || schedules.retrying} />
    <section className="seasons-grid" aria-label="Seasons">
      {seasons.map(season => <SeasonCard key={`${season.chainId}:${season.id}`} season={season} now={now} announcement={schedules.data.find(item => item.chainId === season.chainId && item.seasonId === season.id)} />)}
      {announced.map(season => <AnnouncedSeasonCard key={season.runId} season={season} />)}
      {upcoming.map(palette => <UpcomingSeasonCard key={`upcoming:${palette.ordinal}`} palette={palette} />)}
    </section>
    {earlier.length > 0 && <><div className="catalog-section-heading"><h2>Earlier collections <span>{earlier.length}</span></h2><span>Before the season format</span></div><p className="season-section-note">These collections retain their original artwork, prizes and affiliate rules.</p><CollectionGrid collections={earlier} now={now} /></>}
    <p className="catalog-data-note">Minting offers a chance to win; a prize is not guaranteed. Each collection’s contract fixes its prize amounts, eligibility and referral terms.</p>
  </>;
}

export function SeasonExperience({ initialCollections, initialNow, seasonId, chainId, initialSchedules = [] }: { initialCollections: CollectionPublic[]; initialNow: number; seasonId: string; chainId: number; initialSchedules?: AnnouncedSeason[] }) {
  const { seasons, retrying, now } = useSeasonCatalog(initialCollections, initialNow);
  const schedules = useLiveData("/api/seasons/schedules", initialSchedules, announcedSeasonsResponse);
  const announcement = schedules.data.find(item => item.chainId === chainId && item.seasonId === seasonId);
  const season = seasons.find(s => s.chainId === chainId && s.id === seasonId);
  if (!season && announcement) return <>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/seasons">Seasons</Link><span aria-hidden="true">/</span><span aria-current="page">{announcement.seasonName}</span></nav>
    <header className="season-heading"><div><p className="eyebrow">{chainId === 1 ? "ETHEREUM" : "SEPOLIA"} / ANNOUNCED SEASON</p><h1>{announcement.seasonName}</h1><p>Explore the upcoming collections. Prize values and affiliate rewards appear once their terms are confirmed.</p></div></header>
    <LiveDataNotice retrying={retrying || schedules.retrying} />
    <section className="catalog-grid" aria-label="Announced collections">{announcement.collections.map(collection => <AnnouncedCollectionCard key={collection.id} season={announcement} collection={collection} />)}</section>
  </>;
  if (!season) return <section className="route-message"><h1>This season is unavailable.</h1><Link href="/seasons" className="text-link">All seasons →</Link></section>;
  const live = currentLiveCollection(season.collections, now);
  const colors = announcement?.colors ?? seasonColors(season);
  const scheduled = announcement?.collections.filter(item => !season.collections.some(collection => collection.id === item.id)) ?? [];
  const upcoming = upcomingCollectionColors(season).filter(item => !scheduled.some(collection => collection.number === item.ordinal));
  return <>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/seasons">Seasons</Link><span aria-hidden="true">/</span><span aria-current="page">{season.name}</span></nav>
    <header className="season-heading"><div><p className="eyebrow">{season.networkName.toUpperCase()} / TINCTA SEASON</p><h1>{season.name}</h1><p>Explore each collection’s prize pool, ticket price and affiliate rewards.</p></div><div className="season-heading-count"><strong>{season.collections.length.toString().padStart(2, "0")}</strong><span>published collections</span></div></header>
    {live ? <section className="season-live-summary" aria-label="Current live collection"><div><p className="eyebrow">MINTING NOW</p><h2>{live.name}</h2><p>{collectionPrizeCopy(live)}</p><p>{collectionReferralCopy(live)}</p></div><Link className="primary-button" href={`/mint/${live.id}`}>Mint a ticket <span aria-hidden="true">↗</span></Link></section>
      : <div className="season-closed-note"><strong>No collection is minting right now.</strong><p>Review past rewards and upcoming collections. Opening times appear when confirmed; minting requires contract activation.</p></div>}
    <div className="catalog-section-heading"><h2>Collections <span>{season.collections.length}</span></h2><Link className="text-link" href="/seasons">All seasons →</Link></div>
    {announcement && (announcement.status === "paused" || announcement.status === "failed") && announcement.collections[0] && <AnnouncedActivity season={announcement} collection={announcement.collections[0]} />}
    <LiveDataNotice retrying={retrying || schedules.retrying} /><CollectionGrid collections={season.collections} liveId={live?.id} now={now} colors={colors}>
      {announcement && scheduled.map(collection => <AnnouncedCollectionCard key={collection.id} season={announcement} collection={collection} />)}
      {upcoming.map((item, index) => <UpcomingCollectionCard key={item.ordinal} {...item} colors={colors} previous={index === 0 ? season.collections[season.collections.length - 1] : undefined} />)}
    </CollectionGrid>
    <p className="catalog-data-note">Announced collections show their fixed schedule. Minting is available only after deployment and confirmed on-chain activation.</p>
  </>;
}
