"use client";
import { buttonClassName } from "@manekineko/ui/button-styles";

import { Icon } from "@manekineko/ui/icons";
import Link from "next/link";
import type { CollectionPublic } from "../lib/collections/model";
import { collectionPrizeCopy, collectionReferralCopy } from "../lib/collections/copy";
import { collectionsResponse } from "../lib/live-data/responses";
import { currentLiveCollection, groupSeasons, seasonHref, publicSeasonLifecycle, type SeasonPublic } from "../lib/seasons/model";
import { ticketDataUri } from "../lib/mint/preview";
import { useLiveData } from "./use-live-data";
import { LiveDataNotice } from "./live-data-notice";
import { CollectionGrid } from "./collections-experience";
import { SeasonSpectrum } from "./season-spectrum";

import { SeasonColorBar, SeasonColorStack } from "./season-color-preview";
import { CollectionActivity, useProtocolClock } from "./collection-activity";
import { featuredSeasonCollection } from "../lib/seasons/activity";
import { announcedSeasonsResponse, type AnnouncedSeason } from "../lib/seasons/schedule";
import { AnnouncedActivity, AnnouncedCollectionCard, AnnouncedSeasonCard } from "./announced-season";

function useSeasonCatalog(initialCollections: CollectionPublic[], initialNow: number) {
  const { data: collections, retrying } = useLiveData("/api/collections", initialCollections, collectionsResponse);
  const now = useProtocolClock(initialNow) ?? initialNow;
  return { collections, seasons: groupSeasons(collections), retrying, now };
}

function SeasonCard({ season, now, announcement }: { season: SeasonPublic; now: number; announcement?: AnnouncedSeason }) {
  const live = currentLiveCollection(season.collections, now);
  const cover = featuredSeasonCollection(season.collections, now);
  const previous = season.collections[season.collections.findIndex(c => c.id === cover.id) - 1];
  const colors = announcement?.collections.map(c => c.color) ?? season.collections.map(c => c.collectionColor ?? "#e8e8eb");
  const previews = announcement?.collections.filter(c => !season.collections.some(actual => actual.id === c.id)).map(c => ({ color: c.color })) ?? [];
  const lifecycle = publicSeasonLifecycle(season.collections, now, announcement);
  const next = announcement?.collections.find(item => !["sold_out", "revealed", "refundable"].includes(item.status) && !season.collections.some(collection => collection.id === item.id));
  return <article className="season-card">
    <Link className="season-cover season-cover-link" href={seasonHref(season)} aria-label={`Explore ${season.name}`}>
      <div className="season-cover-label"><span>{season.networkName}</span><span>{live ? "MINT OPEN" : announcement && lifecycle.state === "complete" ? "SEASON COMPLETE" : "SEASON"}</span></div>
      <SeasonColorStack colors={[cover.collectionColor ?? "#e8e8eb", ...previews.map(c => c.color)]}>
        <img src={ticketDataUri(cover.roundId, 1, false, cover.algorithmVersion, cover.maxSupply, cover)} width="640" height={["unique-rank-v5", "unique-rank-v6"].includes(cover.algorithmVersion) ? "800" : "640"} alt={`Illustrative ticket artwork from ${season.name}${previews.length ? `, with upcoming collection colors ${previews.map(c => c.color).join(", ")}` : ""}`} />
      </SeasonColorStack>
      <SeasonColorBar colors={colors} />
    </Link>
    <div className="season-card-heading"><h3><Link href={seasonHref(season)}>{season.name}</Link></h3><span aria-hidden="true"><Icon name="diagonal" /></span></div>
    <p>{announcement ? lifecycle.completedCollections === null ? `${lifecycle.totalCollections} collections · Observation delayed` : `${lifecycle.completedCollections} / ${lifecycle.totalCollections} collections complete` : `${season.collections.length} published collections`}</p>
    <p className="catalog-prize-description">{cover.name} · {collectionPrizeCopy(cover)}</p>
    <CollectionActivity key={cover.id} collection={cover} previous={previous} initialNow={now} showEnrollment />
    {announcement && next && !live && <AnnouncedActivity season={announcement} collection={next} />}
    <Link className="season-card-foot" href={seasonHref(season)}><span>{live ? `Now minting · ${live.name}` : "View prizes and results"}</span><span aria-hidden="true"><Icon name="arrow" /></span></Link>
  </article>;
}

export function SeasonsExperience({ initialCollections, initialNow, initialSchedules = [] }: { initialCollections: CollectionPublic[]; initialNow: number; initialSchedules?: AnnouncedSeason[] }) {
  const { collections, seasons, retrying, now } = useSeasonCatalog(initialCollections, initialNow);
  const schedules = useLiveData("/api/seasons/schedules", initialSchedules, announcedSeasonsResponse);
  const announced = schedules.data.filter(item => !seasons.some(season => season.chainId === item.chainId && season.id === item.seasonId));
  const earlier = collections.filter(c => !c.seasonId);
  return <>
    <div className="catalog-heading seasons-heading"><div><p className="eyebrow">TINCTA / ON-CHAIN REWARDS</p><h1>Explore your<br />next reward.</h1></div>
      <div className="catalog-intro"><SeasonSpectrum />
        <p>Compare prize values and ticket prices.<br />Mint a ticket for a chance to win, or qualify for affiliate rewards.</p><span className="catalog-intro-caption">FIXED RULES. PROTECTED REWARDS.</span></div></div>
    <div className="season-format"><p><strong>ETH rewards. Governed by smart contracts.</strong> In the current design, the contract holds prize funds and earned affiliate rewards, protects them from team withdrawals, and pays eligible claims directly to the chosen wallet. No manual payout approval.</p><p>Published collections keep their original draw, prize and affiliate rules. Reward values and claim availability follow each collection’s contract. <Link href="/docs/prizes">How reward funds are protected <Icon name="arrow" /></Link></p></div>
    <div className="catalog-section-heading"><h2>Seasons <span>{String(seasons.length + announced.length).padStart(2, "0")}</span></h2><span>Explore prizes and affiliate rewards.</span></div>
    <LiveDataNotice retrying={retrying || schedules.retrying} />
    <section className="seasons-grid" aria-label="Seasons">
      {seasons.map(season => <SeasonCard key={`${season.chainId}:${season.id}`} season={season} now={now} announcement={schedules.data.find(item => item.chainId === season.chainId && item.seasonId === season.id)} />)}
      {announced.map(season => <AnnouncedSeasonCard key={season.runId} season={season} />)}
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
  if (!season) return <section className="route-message"><h1>This season is unavailable.</h1><Link href="/seasons" className="ui-text-action ui-text-action-standalone">All seasons <Icon name="arrow" /></Link></section>;
  const live = currentLiveCollection(season.collections, now);
  const colors = announcement?.collections.map(c => c.color) ?? season.collections.map(c => c.collectionColor ?? "#e8e8eb");
  const scheduled = announcement?.collections.filter(item => !season.collections.some(collection => collection.id === item.id)) ?? [];
  const lifecycle = publicSeasonLifecycle(season.collections, now, announcement);
  const next = scheduled.find(c => c.saleStartAt && !["revealed", "sold_out", "refundable"].includes(c.status));
  return <>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/seasons">Seasons</Link><span aria-hidden="true">/</span><span aria-current="page">{season.name}</span></nav>
    <header className="season-heading"><div><p className="eyebrow">{season.networkName.toUpperCase()} / TINCTA SEASON</p><h1>{season.name}</h1><p>Explore each collection’s prize pool, ticket price and affiliate rewards.</p></div><div className="season-heading-count"><strong>{season.collections.length.toString().padStart(2, "0")}</strong><span>published collections</span></div></header>
    {live ? <section className="season-live-summary" aria-label="Current live collection"><div><p className="eyebrow">MINTING NOW</p><h2>{live.name}</h2><p>{collectionPrizeCopy(live)}</p><p>{collectionReferralCopy(live)}</p></div><Link className={buttonClassName({ variant: "primary" })} href={`/mint/${live.id}`}>Mint a ticket <span aria-hidden="true"><Icon name="diagonal" /></span></Link></section>
      : <div className="season-closed-note">{announcement && next ? <><strong>Next announced collection</strong><AnnouncedActivity season={announcement} collection={next} /></> : <><strong>{announcement && lifecycle.state === "complete" ? "Season complete" : lifecycle.state === "unavailable" ? "Season observation delayed" : "Collection results"}</strong><p>{announcement && lifecycle.completedCollections !== null ? `${lifecycle.completedCollections} / ${lifecycle.totalCollections} collections complete. ` : ""}{lifecycle.allPrizesPaid ? "All prizes paid. Explore the results and payment history below." : lifecycle.unpaidPrizes ? `${lifecycle.unpaidPrizes} prizes remain available to their current winning ticket holders.` : "View each collection’s last confirmed state below."}</p>{Boolean(lifecycle.unpaidPrizes) && <Link href="/prizes">View available prizes <Icon name="arrow" /></Link>}</>}</div>}
    <div className="catalog-section-heading"><h2>Collections <span>{season.collections.length}</span></h2><Link className="ui-text-action ui-text-action-standalone" href="/seasons">All seasons <Icon name="arrow" /></Link></div>
    {announcement && (announcement.status === "paused" || announcement.status === "failed") && <p className="season-section-note">Worker {announcement.status}. Collection results and remaining rewards are shown separately; deployed deadlines remain in effect.</p>}
    <LiveDataNotice retrying={retrying || schedules.retrying} /><CollectionGrid collections={season.collections} liveId={live?.id} now={now} colors={colors}>
      {announcement && scheduled.map(collection => <AnnouncedCollectionCard key={collection.id} season={announcement} collection={collection} />)}
    </CollectionGrid>
    <p className="catalog-data-note">Announced collections show their fixed schedule. Minting is available only after deployment and confirmed on-chain activation.</p>
  </>;
}
