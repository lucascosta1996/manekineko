"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BrandMark } from "../brand-mark";
import { WinnerCreditsHistory } from "../winner-credits/winner-credits-history";
import { collectionProgress } from "../../lib/collections/presentation";
import type { NftGalleryResponse, NftItem, NftStatus, NftView } from "../../lib/nfts/model";
import { nftLinks } from "../../lib/nfts/links";
import { createDataPoller } from "../../lib/live-data/poller";
import { formatWei, roundLabel } from "../../lib/mint/format";
import { NftWalletPicker, type NftWalletConnection } from "./nft-wallet-picker";
import { useNftWallet } from "./use-nft-wallet";
import { NftArt, NftNumbers, useArtworkVisibility, useNftMetadata } from "./nft-artwork";

export const shortWallet = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function NftCard({ item, wallet }: { item: NftItem; wallet: string }) {
  const { ref, visible } = useArtworkVisibility();
  const { data, error, retry } = useNftMetadata(item, visible);
  const links = nftLinks(item.chainId, item.contractAddress, item.tokenId);
  const url = `/nfts/${item.collectionId}/${item.tokenId}`;
  const held = item.currentOwner?.toLowerCase() === wallet.toLowerCase();
  return <article className={`nft-card${item.winningToken ? " nft-card-winner" : ""}`}>
    <div className="nft-card-art" ref={ref}>
      <div className="nft-card-art-label"><span>{item.seasonName ?? `COLLECTION ${roundLabel(item.roundId)}`}</span><span>#{item.tokenId}</span></div>
      <Link href={url} aria-label={`View NFT #${item.tokenId} from ${item.name}`}><NftArt item={item} data={data} error={false} retry={retry} /></Link>
      {item.winningToken && <span className="nft-winner-badge">✦ {item.awardRank ? `Prize #${item.awardRank}` : "Winning ticket"}</span>}
    </div>
    <div className="nft-card-body">
      <div className="nft-card-heading"><h2><Link href={url}>Ticket #{item.tokenId}</Link></h2><span className={`nft-status ${item.phase === "complete" ? "nft-status-complete" : ""}`}>{item.phase === "complete" ? "Completed" : collectionProgress(item).label}</span></div>
      <Link className="nft-collection-name" href={`/mint/${item.collectionId}`}>{item.name}</Link>
      <div className="nft-card-result"><NftNumbers data={data} revealed={item.revealed} permanent={item.contractVersion === "affiliate-v10"} /><div><span>{data?.score ? "SCORE" : "RESULT"}</span><strong>{data?.score ?? (item.refunded ? "Refunded" : item.revealed ? "Loading" : item.contractVersion === "affiliate-v10" ? item.phase === "refundable" ? "No draw" : "Draw pending" : "Sealed")}</strong></div></div>
      {error && <p className="nft-card-error">The on-chain preview is unavailable. <button type="button" onClick={retry}>Retry</button></p>}
      <div className="nft-card-ownership"><span>{item.networkName}</span><span>{held ? "In this wallet" : item.currentOwner === null ? "Burned" : "Held elsewhere"}</span></div>
      {item.awardAmountWei && <p className="nft-card-prize">{formatWei(item.awardAmountWei)} ETH prize · {item.prizePaid ? "Paid" : held ? <Link href={`/mint/${item.collectionId}`}>Available to claim →</Link> : "Available to its current holder"}</p>}
      <div className="nft-card-actions"><Link href={url}>View NFT <span aria-hidden="true">→</span></Link><a href={links.openSea ?? links.blockscout ?? links.explorer} target="_blank" rel="noopener noreferrer">{links.openSea ? "OpenSea" : links.blockscout ? "Blockscout" : "Etherscan"} <span aria-hidden="true">↗</span></a></div>
    </div>
  </article>;
}

function WalletPortfolio({ address, connection }: { address: string; connection: NftWalletConnection | null }) {
  const [view, setView] = useState<NftView>("minted");
  const [status, setStatus] = useState<NftStatus>("all");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; data: NftGalleryResponse } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const url = `/api/nfts?${new URLSearchParams({ wallet: address, view, status, page: String(page) })}`;
  useEffect(() => {
    const active = () => document.visibilityState === "visible" && navigator.onLine && (!connection || connection.isCurrent());
    const poller = createDataPoller({
      isActive: active,
      request: async (signal) => {
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
        if (!response.ok) throw new Error();
        const next = await response.json() as NftGalleryResponse;
        if (next.wallet !== address.toLowerCase() || next.view !== view || next.status !== status || next.page !== page || !Array.isArray(next.items)) throw new Error();
        return next;
      },
      onData: (data) => {
        if (connection && !connection.isCurrent()) return;
        const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
        if (page > lastPage) { setPage(lastPage); return; }
        setSnapshot({ key: url, data }); setFailedKey(null);
      },
      onError: () => setFailedKey(url),
    });
    const resume = () => { if (active()) poller.refresh(); else poller.pause(); };
    window.addEventListener("focus", resume); window.addEventListener("online", resume); window.addEventListener("offline", resume); document.addEventListener("visibilitychange", resume);
    poller.refresh();
    return () => { poller.stop(); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); window.removeEventListener("offline", resume); document.removeEventListener("visibilitychange", resume); };
  }, [url, address, view, status, page, attempt, connection]);
  const data = snapshot?.key === url ? snapshot.data : null;
  const error = failedKey === url;
  return <>
    <WinnerCreditsHistory wallet={address} />
    {data && <dl className="nft-stats" aria-label="Wallet NFT statistics"><div><dt>Mint history</dt><dd>{data.stats.minted}</dd></div><div><dt>Currently held</dt><dd>{data.stats.held}</dd></div><div><dt>Ongoing tickets</dt><dd>{data.stats.ongoing}</dd></div><div><dt>Completed tickets</dt><dd>{data.stats.completed}</dd></div></dl>}
    <div className="nft-gallery-toolbar"><div className="nft-tabs" role="group" aria-label="NFT ownership view"><button type="button" aria-pressed={view === "minted"} onClick={() => { setView("minted"); setPage(1); }}>Mint history</button><button type="button" aria-pressed={view === "held"} onClick={() => { setView("held"); setPage(1); }}>Currently held</button></div><label className="nft-filter">Collection status<select value={status} onChange={(event) => { setStatus(event.target.value as NftStatus); setPage(1); }}><option value="all">All collections</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="refundable">Refunds available</option></select></label></div>
    <p className="nft-gallery-caption">{view === "minted" ? "Tickets originally received or paid for by this wallet, including tickets now held elsewhere." : "Tickets currently held by this wallet, including transfers received from someone else."} Updates after blockchain confirmation.</p>
    {error && <div className="nft-notice" role="alert">{data ? "Updates are temporarily unavailable. Showing the last confirmed records." : "We couldn’t load this wallet’s NFTs. Please try again."}<button type="button" className="text-button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>}
    {!data && !error && <div className="nft-loading" role="status">Finding your on-chain tickets…</div>}
    {data && data.items.length > 0 && <section className="nft-grid" aria-label="Wallet NFTs">{data.items.map((item) => <NftCard key={`${item.collectionId}:${item.tokenId}`} item={item} wallet={address} />)}</section>}
    {data && data.items.length === 0 && <section className="nft-empty"><span className="nft-empty-symbol" aria-hidden="true">◇</span><h2>{status === "all" ? "No tickets here yet." : "No tickets match this filter."}</h2><p>{status === "all" ? "Try another wallet or explore the seasons. New mints appear after confirmation." : "Choose another collection status to see the rest of this wallet’s NFTs."}</p>{status === "all" ? <Link className="nft-button nft-button-outline" href="/seasons">Explore seasons <span aria-hidden="true">→</span></Link> : <button type="button" className="nft-button nft-button-outline" onClick={() => { setStatus("all"); setPage(1); }}>Show all collections</button>}</section>}
    {data && data.total > 0 && <div className="nft-pagination"><span>{Math.min((page - 1) * data.pageSize + 1, data.total)}–{Math.min(page * data.pageSize, data.total)} of {data.total} tickets</span><div><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page}</span><button type="button" disabled={!data.hasMore} onClick={() => setPage((value) => value + 1)}>Next →</button></div></div>}
  </>;
}

export function NftGallery({ initialWallet }: { initialWallet: string | null }) {
  const wallet = useNftWallet();
  const [watched, setWatched] = useState(initialWallet);
  const [input, setInput] = useState(initialWallet ?? "");
  const [inputError, setInputError] = useState("");
  const address = wallet.address ?? watched;
  const original = useRef(initialWallet);
  useEffect(() => { if (original.current !== initialWallet) { original.current = initialWallet; setWatched(initialWallet); setInput(initialWallet ?? ""); wallet.disconnect(); } }, [initialWallet, wallet.disconnect]);
  function updateUrl(next: string | null) { window.history.replaceState(null, "", next ? `/my-nfts?wallet=${encodeURIComponent(next)}` : "/my-nfts"); }
  useEffect(() => { if (wallet.notice && !address) updateUrl(null); }, [wallet.notice, address]);
  function viewAddress(event: FormEvent) {
    event.preventDefault(); const next = input.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(next) || /^0x0{40}$/i.test(next)) { setInputError("Enter a valid Ethereum wallet address."); return; }
    wallet.disconnect(); setWatched(next.toLowerCase()); setInputError(""); updateUrl(next.toLowerCase());
  }
  function openPicker() { setWatched(null); updateUrl(null); wallet.openPicker(); }
  return <div className="nft-page">
    <header className="nft-page-heading"><div><p className="eyebrow">YOUR TICKETS AND REWARDS</p><h1>Your tickets. Your rewards.</h1></div><p>Follow the tickets you hold, check draw results, and see available prize claims.</p></header>
    <section className="nft-wallet-bar" aria-label="Wallet selection"><div className="nft-wallet-identity"><span className="nft-wallet-icon" aria-hidden="true"><BrandMark /></span><div><span>{address ? wallet.address ? "CONNECTED WALLET" : "VIEWING WALLET" : "YOUR WALLET, YOUR COLLECTION"}</span><strong title={address ?? undefined}>{address ? shortWallet(address) : "Find your tickets"}</strong><p>{address ? "Public records · viewing never requires a signature" : "Connect your wallet to bring your tickets together."}</p></div></div><div className="nft-wallet-buttons"><button type="button" className="nft-button" onClick={openPicker}>{wallet.address ? "Switch account" : "Connect wallet"}<span aria-hidden="true">↗</span></button>{address && <button type="button" className="text-button" onClick={() => { wallet.disconnect(); setWatched(null); updateUrl(null); }}>Clear</button>}</div></section>
    {wallet.pickerOpen && <NftWalletPicker onConnected={(next) => { setWatched(null); wallet.connect(next); updateUrl(next.address); }} onCancel={wallet.closePicker} />}
    {wallet.notice && <p className="nft-notice" role="status">{wallet.notice}</p>}
    <details className="nft-address-lookup"><summary>View a wallet by address</summary><form onSubmit={viewAddress}><label htmlFor="nft-wallet-address">Ethereum wallet address</label><div><input id="nft-wallet-address" value={input} onChange={(event) => setInput(event.target.value)} placeholder="0x…" autoCapitalize="off" autoComplete="off" spellCheck={false} aria-invalid={Boolean(inputError)} aria-describedby={inputError ? "nft-address-error" : undefined} /><button type="submit" className="nft-button nft-button-outline">View tickets →</button></div>{inputError && <p id="nft-address-error" role="alert">{inputError}</p>}<p>Wallet holdings are public. Entering an address does not connect or authorize that wallet.</p></form></details>
    {address && (!wallet.connection || wallet.connection.isCurrent()) ? <WalletPortfolio key={address.toLowerCase()} address={address} connection={wallet.connection} /> : !wallet.pickerOpen && <section className="nft-welcome"><div className="nft-welcome-mark" aria-hidden="true"><BrandMark /></div><p className="eyebrow">CHECK YOUR REWARDS</p><h2>Your tickets and<br />results await.</h2><p>Connect to see your tickets, follow draw results, and check prize claims.</p><button type="button" className="nft-button" onClick={openPicker}>Connect your wallet <span aria-hidden="true">→</span></button><span>No signature. No transaction.</span></section>}
    <aside className="nft-footnote"><span aria-hidden="true">◇</span><p>Art and numbers are read from the NFT contract. Earlier collections may need an external preview refresh after reveal. V10 keeps its numbers and artwork fixed from mint, with scores and prizes read separately. <Link href="/docs/my-nfts">Read about NFT artwork and results →</Link></p></aside>
  </div>;
}
