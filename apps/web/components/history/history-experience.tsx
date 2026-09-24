"use client";

import { RankedAwards } from "../prizes/ranked-awards";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { HistoryCollection, HistoryStats } from "../../lib/history/model";
import type { CollectionPublic } from "../../lib/collections/model";
import { collectionProgress } from "../../lib/collections/presentation";
import { formatCount, formatWei, roundLabel } from "../../lib/mint/format";
import { HistoryIcon } from "./history-icons";
import { useLiveData } from "../use-live-data";
import { LiveDataNotice } from "../live-data-notice";
import { historyResponse } from "../../lib/live-data/responses";

const PAGE_SIZE = 6;
type HistoryFilter = "all" | "completed" | "refunded";
type HistorySort = "newest" | "oldest" | "prize";

function paidPrizes(collection: HistoryCollection): string {
  return collection.awards ? String(collection.awards.reduce((total, award) => total + (award.claimed ? BigInt(award.amountWei) : 0n), 0n)) : collection.winner?.prizePaidWei ?? "0";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(value));
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Combination({ numbers }: { numbers: readonly number[] }) {
  return <div className="history-combination" role="group" aria-label={`Combination: ${numbers.join(", ")}`}>
    {numbers.map((number, index) => <span className="history-number" key={index} aria-hidden="true">{number}</span>)}
  </div>;
}

function Address({ address, label }: { address: string; label: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 2500);
    return () => clearTimeout(timer);
  }, [copyState]);

  return <div><div className="history-full-wallet">
    <code>{address}</code>
    <button className="history-copy" type="button" aria-label={`Copy ${label} address`} onClick={async () => {
      try {
        await navigator.clipboard.writeText(address);
        setCopyState("copied");
      } catch {
        setCopyState("failed");
      }
    }}><HistoryIcon name={copyState === "copied" ? "check" : "copy"} /></button>
  </div><p className={copyState === "failed" ? "history-copy-feedback" : "history-sr-only"} role="status">{copyState === "copied" ? "Address copied." : copyState === "failed" ? "Unable to copy. Select the address to copy it manually." : ""}</p></div>;
}

function RecordDetails({ collection }: { collection: HistoryCollection }) {
  const { winner, nativeCurrency } = collection;
  const amount = (value: string) => `${formatWei(value, nativeCurrency.decimals)} ${nativeCurrency.symbol}`;

  return <div className="history-row-details">
    {!!collection.awards?.length && <section className="history-awards" aria-label="Collection prize winners"><h3>Collection prizes</h3><div className="history-awards-list">{collection.awards.map(award=><div className="history-award" key={award.rank}><strong>Prize #{award.rank} · Ticket #{award.tokenId} · {amount(award.amountWei)}</strong><Combination numbers={award.numbers}/><p>Score {award.score} · {award.claimed?"Paid":"Unclaimed"}</p>{award.winningHolder && <Address address={award.winningHolder} label="winning holder"/>}</div>)}</div></section>}
    {winner ? <section className="history-result" aria-label="Winning result">
      <h3>{collection.awards ? "First prize combination" : "Winning combination"} · Ticket #{formatCount(winner.tokenId)}</h3>
      <Combination numbers={winner.combination} />
      <p className="history-score-equation">
        {(collection.algorithmVersion === "unique-rank-v3" || collection.algorithmVersion === "unique-rank-v4" || collection.algorithmVersion === "unique-rank-v5" || collection.algorithmVersion === "unique-rank-v6")
          ? `scoreCombination([${winner.combination.join(", ")}])`
          : collection.algorithmVersion === "unique-rank-v2"
          ? `1 + (${winner.combination[0]} − 1) × 4,096 + (${winner.combination[1]} − 1) × 256 + (${winner.combination[2]} − 1) × 16 + (${winner.combination[3]} − 1)`
          : `(${winner.combination[0]} × ${winner.combination[1]} + ${winner.combination[2]} × ${winner.combination[3]}) × 2³² + ${winner.combinationCode}`}
        <strong>Score {winner.score}</strong>
      </p>
    </section> : <section className="history-refund-note" aria-label="Refund outcome">
      <h3>No winning ticket</h3>
      <p>This collection ended with refunds. Ticket payments were returned and no prize was awarded.</p>
    </section>}
    <dl className="history-detail-facts">
      {winner && <div className="history-detail-wide"><dt>Winning holder at payout</dt><dd><Address address={winner.winningHolder} label="winning holder" /></dd></div>}
      {winner && winner.winningHolder.toLowerCase() !== winner.prizeRecipient.toLowerCase() && <div className="history-detail-wide"><dt>Prize receiving address</dt><dd><Address address={winner.prizeRecipient} label="prize recipient" /></dd></div>}
      <div><dt>Tickets minted</dt><dd>{formatCount(collection.totalMinted)} / {formatCount(collection.maxSupply)}</dd></div>
      <div><dt>Affiliate rewards paid</dt><dd>{amount(collection.totalAffiliatePaidWei ?? "0")}</dd></div>
      <div><dt>Mint price</dt><dd>{amount(collection.mintPriceWei)}</dd></div>
      <div><dt>{winner ? collection.awards ? "Total prizes paid" : "Prize paid" : "Refunds paid"}</dt><dd>{amount(winner ? paidPrizes(collection) : collection.totalRefundedWei)}</dd></div>
      <div><dt>{winner ? "Payment date (UTC)" : "Closed (UTC)"}</dt><dd><time dateTime={winner ? winner.paidAt : collection.closedAt}>{dateLabel(winner ? winner.paidAt : collection.closedAt)}</time></dd></div>
      <div><dt>Network</dt><dd>{collection.networkName}</dd></div>
      <div><dt>Collection rules</dt><dd>{collection.algorithmVersion === "unique-rank-v6" ? "V10 · Permanent identities / separate VRF scores" : collection.algorithmVersion === "unique-rank-v5" ? "V5 · Equal ranked prizes / Chainlink VRF" : collection.algorithmVersion === "unique-rank-v4" ? "V4 · Two ranked prizes / Chainlink VRF" : collection.algorithmVersion === "unique-rank-v3" ? "V3 · Encoded unique ranks / Chainlink VRF" : collection.algorithmVersion === "unique-rank-v2" ? "V2 · Unique ranks / Chainlink VRF" : "V1 · Original blockhash rules"}</dd></div>
    </dl>
    <div className="history-result-note">
      <span>The winning holder is recorded at payout; the ticket may change hands later. A holder may select a separate prize receiving address.</span>
      <span>Collection ID <code>{collection.id}</code></span>
    </div>
  </div>;
}

function CurrentCollections({ collections }: { collections: CollectionPublic[] }) {
  if (!collections.length) return null;
  return <section className="history-current" aria-labelledby="history-current-title">
    <div className="history-archive-heading"><h2 id="history-current-title">In progress</h2><span className="history-count">{formatCount(collections.length)}</span></div>
    <p className="history-current-intro">Follow each collection from deployment to its final outcome. Winners and payments appear below after they are verified.</p>
    <div className="history-current-list">{collections.map((collection) => {
      const progress = collectionProgress(collection);
      return <article className="history-current-card" key={collection.id} style={collection.collectionColor ? { borderTop: `3px solid ${collection.collectionColor}` } : undefined}>
        <div className="history-current-heading">
          <div><p className="history-feature-round">{collection.seasonName ?? `COLLECTION ${roundLabel(collection.roundId)}`} · {collection.networkName}</p><h3><Link href={`/mint/${collection.id}`}>{collection.name}</Link></h3></div>
          <span className="history-current-status">{progress.label}</span>
        </div>
        <p className="history-current-detail">{progress.detail}</p><RankedAwards collection={collection} />
        <dl className="history-current-facts">
          <div><dt>Tickets minted</dt><dd>{formatCount(collection.totalMinted)} <span>/ {formatCount(collection.maxSupply)}</span></dd></div>
          <div><dt>Ticket price</dt><dd>{formatWei(collection.mintPriceWei, collection.nativeCurrency.decimals)} <span>{collection.nativeCurrency.symbol}</span></dd></div>
          <div><dt>Affiliate rewards paid</dt><dd>{formatWei(collection.totalAffiliatePaidWei ?? "0", collection.nativeCurrency.decimals)} <span>{collection.nativeCurrency.symbol}</span></dd></div>
          <div><dt>Prize payment</dt><dd className="history-current-payment">{collection.awards?.length ? `${collection.awards.filter(award=>award.claimed).length} / ${collection.awards.length} prizes paid` : collection.prizePaid ? "Paid · outcome indexing" : "Not paid"}</dd></div>
        </dl>
        <div className="history-current-footer">
          <div><p>Snapshot recorded <time dateTime={collection.updatedAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(collection.updatedAt))} UTC</time></p>
            {collection.contractAddress && <a href={`${collection.explorerUrl.replace(/\/$/, "")}/address/${collection.contractAddress}`} target="_blank" rel="noreferrer">View contract <code>{shortAddress(collection.contractAddress)}</code> ↗</a>}
          </div>
          <Link className="history-feature-link" href={`/mint/${collection.id}`}>Explore collection <HistoryIcon name="arrow" /></Link>
        </div>
      </article>;
    })}</div>
  </section>;
}

export function HistoryExperience({ collections: initialCollections, inProgress: initialInProgress, stats: initialStats }: {
  collections: HistoryCollection[];
  inProgress: CollectionPublic[];
  stats: HistoryStats;
}) {
  const { data: { collections, inProgress, stats }, retrying } = useLiveData("/api/history", { collections: initialCollections, inProgress: initialInProgress, stats: initialStats, source: "postgres" as const, isMock: false as const }, historyResponse);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<HistorySort>("newest");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const canComparePrizes = stats.currencies.length === 1;

  const latest = useMemo(() => collections.filter((collection) => collection.winner !== null)
    .sort((a, b) => b.winner!.paidAt.localeCompare(a.winner!.paidAt))[0], [collections]);

  const records = useMemo(() => {
    const search = query.trim().toLowerCase();
    return collections.filter((collection) => {
      if (filter !== "all" && collection.status !== filter) return false;
      if (!search) return true;
      return [collection.name, collection.id, collection.seriesName, collection.seasonName ?? "", collection.roundId, roundLabel(collection.roundId), collection.winner?.winningHolder ?? "", collection.winner?.prizeRecipient ?? "", collection.winner ? `#${collection.winner.tokenId}` : "", ...(collection.awards ?? []).flatMap(award=>[award.winningHolder ?? "", award.recipient ?? "", `#${award.tokenId}`])]
        .some((value) => value.toLowerCase().includes(search));
    }).sort((a, b) => {
      if (sort === "prize" && canComparePrizes) {
        const first = BigInt(paidPrizes(a));
        const second = BigInt(paidPrizes(b));
        if (first !== second) return first > second ? -1 : 1;
      }
      return (sort === "oldest" ? 1 : -1) * a.closedAt.localeCompare(b.closedAt) || a.id.localeCompare(b.id);
    });
  }, [collections, query, filter, sort, canComparePrizes]);
  const pageCount = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleRecords = records.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    if (!focusId) return;
    const record = document.getElementById(`history-record-${focusId}`);
    if (record) {
      record.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      record.querySelector("summary")?.focus({ preventScroll: true });
    }
    setFocusId(null);
  }, [focusId, currentPage]);

  function resetFilters() {
    setFilter("all");
    setQuery("");
    setSort("newest");
    setPage(1);
  }

  function showLatest() {
    if (!latest) return;
    const ordered = [...collections].sort((a, b) => b.closedAt.localeCompare(a.closedAt) || a.id.localeCompare(b.id));
    resetFilters();
    setPage(Math.floor(ordered.findIndex((collection) => collection.id === latest.id) / PAGE_SIZE) + 1);
    setExpandedId(latest.id);
    setFocusId(latest.id);
  }

  return <div className="history-page">
    <header className="history-heading">
      <div><p className="eyebrow">ON-CHAIN RESULTS</p><h1>Prizes and payouts, recorded on-chain.</h1><p>Explore winning tickets and confirmed prize and affiliate payments. Verify each payout on-chain.</p></div>
      <Link href="/seasons" className="history-mint-link">Explore seasons <HistoryIcon name="arrow" /></Link>
    </header>
    <LiveDataNotice retrying={retrying} />

    <dl className="history-stats" aria-label="Collection statistics">
      <div className="history-stat"><dt>Affiliate rewards paid</dt>
        {stats.currencies.length ? stats.currencies.map(currency => <dd key={`${currency.chainId}-${currency.nativeCurrency.symbol}-${currency.nativeCurrency.decimals}`}>
          <span>{formatWei(currency.totalAffiliatePaidWei, currency.nativeCurrency.decimals)}</span><small>{currency.nativeCurrency.symbol}{stats.currencies.length > 1 ? ` · ${currency.networkName}` : ""}</small>
        </dd>) : <dd>0</dd>}
        <p>Confirmed affiliate withdrawals</p>
      </div>
      <div className="history-stat"><dt>Prizes paid <HistoryIcon name="trophy" /></dt>
        {stats.currencies.length ? stats.currencies.map((currency) => <dd key={`${currency.chainId}-${currency.nativeCurrency.symbol}-${currency.nativeCurrency.decimals}`}>
          <span>{formatWei(currency.totalPrizePaidWei, currency.nativeCurrency.decimals)}</span><small>{currency.nativeCurrency.symbol}{stats.currencies.length > 1 ? ` · ${currency.networkName}` : ""}</small>
        </dd>) : <dd>0</dd>}
        <p>Confirmed payments, including partial prize claims</p>
      </div>
      <div className="history-stat"><dt>Collections completed <HistoryIcon name="check" /></dt><dd>{formatCount(stats.completedCount)}</dd><p>Sold out and every prize delivered</p></div>
      <div className="history-stat"><dt>Tickets minted <HistoryIcon name="ticket" /></dt><dd>{formatCount(stats.totalTicketsMinted)}</dd><p>Across {formatCount(stats.collectionCount)} {stats.collectionCount === 1 ? "collection" : "collections"}</p></div>
      <div className="history-stat"><dt>Winning wallets <HistoryIcon name="sparkle" /></dt><dd>{formatCount(stats.uniqueWinners)}</dd><p>Distinct winning holder wallets</p></div>
    </dl>

    <CurrentCollections collections={inProgress} />

    {latest?.winner && <section aria-labelledby="history-latest-title">
      <p className="history-section-kicker"><HistoryIcon name="trophy" /> Latest winning ticket</p>
      <div className="history-feature" style={latest.collectionColor ? { borderLeft: `3px solid ${latest.collectionColor}` } : undefined}>
        <div><p className="history-feature-round">{latest.seasonName ?? `COLLECTION ${roundLabel(latest.roundId)}`} · {latest.networkName}</p><h2 id="history-latest-title">{latest.name}</h2><div className="history-feature-wallet"><span className="history-wallet-mark" aria-hidden="true" /><span>{shortAddress(latest.winner.winningHolder)}</span><span className="history-muted">Winning holder</span></div></div>
        <div><p className="history-feature-label"><span>Winning combination</span><span>TICKET #{formatCount(latest.winner.tokenId)}</span></p><Combination numbers={latest.winner.combination} /><p className="history-feature-score">Winning score <strong>{latest.winner.score}</strong></p></div>
        <div className="history-feature-prize"><p>{latest.awards ? "First prize paid" : "Prize paid"}</p><strong className="history-feature-amount">{formatWei(latest.winner.prizePaidWei, latest.nativeCurrency.decimals)} <small>{latest.nativeCurrency.symbol}</small></strong><span><time dateTime={latest.winner.paidAt}>{dateLabel(latest.winner.paidAt)}</time></span><button type="button" className="history-feature-link" onClick={showLatest}>See winning details <HistoryIcon name="arrow" /></button></div>
      </div>
    </section>}

    <section aria-labelledby="history-archive-title" id="history-archive">
      <div className="history-archive-heading"><h2 id="history-archive-title">Past collections</h2><span className="history-count">{formatCount(collections.length)}</span></div>
      <div className="history-tools">
        <div className="history-filters" role="group" aria-label="Filter collection outcome">
          {([["all", "All collections"], ["completed", "Prize paid"], ["refunded", "Refunded"]] as const).map(([value, label]) => <button className="history-filter" type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); }}>{label}</button>)}
        </div>
        <div className="history-tool-inputs">
          <label className="history-search"><span className="history-sr-only">Search collections, tickets, or wallets</span><HistoryIcon name="search" /><input type="search" placeholder="Collection, ticket, or wallet" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
          <label className="history-sort"><span className="history-sr-only">Sort past collections</span><select value={sort} onChange={(event) => { setSort(event.target.value as HistorySort); setPage(1); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option>{canComparePrizes && <option value="prize">Largest prize</option>}</select><HistoryIcon name="chevron" /></label>
        </div>
      </div>
      <div className="history-list">
        {visibleRecords.length > 0 && <div className="history-columns" aria-hidden="true"><span>Collection</span><span>Winner / ticket</span><span>Prize paid</span><span>Closed (UTC)</span><span /></div>}
        {visibleRecords.map((collection) => <details className="history-record" key={collection.id} id={`history-record-${collection.id}`} open={expandedId === collection.id}>
          <summary className="history-row-summary" onClick={(event) => { event.preventDefault(); setExpandedId(expandedId === collection.id ? null : collection.id); }}>
            <span className="history-row-collection"><span className="history-round-art" data-refunded={collection.status === "refunded"} style={collection.collectionColor ? { backgroundColor: collection.collectionColor, color: collection.textColor ?? "#111111" } : undefined} aria-hidden="true"><HistoryIcon name={collection.winner ? "sparkle" : "ticket"} /></span><span className="history-row-collection-text"><strong>{collection.name}</strong><span className="history-row-meta"><span>#{roundLabel(collection.roundId)}</span><span className="history-status" data-refunded={collection.status === "refunded"}>{collection.winner && <HistoryIcon name="check" />}{collection.status === "completed" ? "Prize paid" : "Refunded"}</span></span></span></span>
            <span className="history-row-winner">{collection.winner ? <><strong><span className="history-wallet-mark history-wallet-mark-small" aria-hidden="true" />{shortAddress(collection.winner.winningHolder)}</strong><small>Ticket #{formatCount(collection.winner.tokenId)}</small></> : <span className="history-row-refunded">No winner</span>}</span>
            <span className="history-row-prize"><strong>{collection.winner ? `${formatWei(paidPrizes(collection), collection.nativeCurrency.decimals)} ${collection.nativeCurrency.symbol}` : "No prize"}</strong><small>{formatCount(collection.totalMinted)} tickets minted</small></span>
            <time className="history-row-date" dateTime={collection.closedAt}>{dateLabel(collection.closedAt)}</time>
            <span className="history-row-chevron"><HistoryIcon name="chevron" /><span className="history-sr-only">{expandedId === collection.id ? "Hide" : "View"} collection details</span></span>
          </summary>
          <RecordDetails collection={collection} />
        </details>)}
        {visibleRecords.length === 0 && <div className="history-empty"><HistoryIcon name={collections.length ? "search" : "ticket"} /><h3>{collections.length ? "No collections found" : "The archive starts here."}</h3><p>{collections.length ? "Try a different collection name, ticket number, or wallet address." : "Completed collections and their outcomes will appear here."}</p>{collections.length > 0 && <button type="button" onClick={resetFilters}>Clear filters</button>}</div>}
      </div>
      <div className="history-pagination"><p aria-live="polite" role="status">{records.length ? `Showing ${formatCount((currentPage - 1) * PAGE_SIZE + 1)}–${formatCount(Math.min(currentPage * PAGE_SIZE, records.length))} of ${formatCount(records.length)} collections` : "0 collections"}</p>{pageCount > 1 && <nav className="history-pagination-controls" aria-label="Collection history pages"><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setExpandedId(null); }}><HistoryIcon name="arrow" /></button><span>Page {currentPage} of {pageCount}</span><button type="button" aria-label="Next page" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setExpandedId(null); }}><HistoryIcon name="arrow" /></button></nav>}</div>
    </section>
    <aside className="history-footnote"><HistoryIcon name="sparkle" /><p>The current Tincta format awards six equal prizes to six distinct winning NFTs. Earlier collections retain their original winner count and prize split; each collection’s displayed results follow its contract. Ticket totals include deployed collections in progress. Paid prizes count only verified on-chain claims, including claims before all prizes are collected. Refunded collections are included in ticket totals and excluded from completed collections and prizes.</p></aside>
  </div>;
}
