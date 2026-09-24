"use client";

import Link from "next/link";
import { useState } from "react";
import type { NftItem } from "../../lib/nfts/model";
import { nftLinks } from "../../lib/nfts/links";
import { collectionProgress } from "../../lib/collections/presentation";
import { roundLabel } from "../../lib/mint/format";
import { NftArt, NftNumbers, useNftMetadata } from "./nft-artwork";

export function NftDetail({ item }: { item: NftItem }) {
  const { data, error, retry } = useNftMetadata(item, true, true);
  const nft = data?.nft ?? item;
  const links = nftLinks(nft.chainId, nft.contractAddress, nft.tokenId);
  const permanent = nft.contractVersion === "affiliate-v10";
  const scrambled = nft.algorithmVersion === "unique-rank-v3" || nft.algorithmVersion === "unique-rank-v4" || nft.algorithmVersion === "unique-rank-v5";
  const [copied, setCopied] = useState("");
  const explorer = nft.chainId === 1 ? "https://etherscan.io" : "https://sepolia.etherscan.io";
  return <div className="nft-page nft-detail-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/my-nfts">My Tickets</Link><span aria-hidden="true">/</span><Link href={`/mint/${nft.collectionId}`}>Collection {roundLabel(nft.roundId)}</Link><span aria-hidden="true">/</span><span aria-current="page">Ticket #{nft.tokenId}</span></nav>
    <div className="nft-detail-grid">
      <section className="nft-detail-art" aria-label="On-chain NFT artwork"><div className="nft-card-art-label"><span>{nft.seasonName ?? `COLLECTION ${roundLabel(nft.roundId)}`}</span><span>SVG · ON-CHAIN</span></div><NftArt item={nft} data={data} error={error} retry={retry} /><p>{data?.image ? "The actual SVG stored by this NFT’s contract." : nft.currentOwner === null ? "This NFT was burned. Its original mint remains in the collection record." : "Reading this ticket directly from its contract."}</p>{data?.image && <a href={data.image} download={`tincta-${nft.roundId}-${nft.tokenId}.svg`} className="text-button">Download SVG ↓</a>}</section>
      <section className="nft-detail-information" aria-labelledby="nft-title"><div className="nft-detail-badges"><span className="nft-status">{nft.networkName}</span><span className="nft-status nft-status-complete">{collectionProgress(nft).label}</span>{nft.winningToken && <span className="nft-winner-badge">✦ Winning ticket</span>}</div><p className="eyebrow">YOUR TICKET AND PRIZE STATUS</p><h1 id="nft-title">Ticket #{nft.tokenId}</h1><Link className="nft-detail-collection" href={`/mint/${nft.collectionId}`}>{nft.name} <span aria-hidden="true">↗</span></Link>
        <p className="nft-detail-description">{nft.refunded ? "This ticket’s mint payment was refunded." : permanent ? "Your four numbers permanently identify this NFT. Its score and prize status are recorded separately after the VRF draw." : data?.numbers ? "Four numbers. One result. Your ticket’s combination and score are recorded by the collection contract." : nft.revealed ? "This collection has revealed. Your ticket’s verified numbers and score are loading from the contract." : "Your ticket starts sealed. Its numbers appear after sellout, when the collection’s randomness is verified and the result is finalized."}</p>
        <div className="nft-detail-result"><div><p className="eyebrow">{permanent ? "PERMANENT COMBINATION" : data?.numbers ? "REVEALED COMBINATION" : nft.refunded ? "NO DRAW" : "YOUR COMBINATION"}</p><NftNumbers data={data} revealed={nft.revealed} permanent={permanent} /></div><div className="nft-detail-score"><span>{data?.score ? "SCORE" : "RESULT"}</span><strong>{data?.score ?? (nft.refunded ? "Refunded" : nft.revealed ? "Loading…" : permanent ? nft.phase === "refundable" ? "No draw" : "Draw pending" : "Sealed")}</strong></div></div>
        {data?.numbers && <p className="nft-score-equation">{permanent ? <>tokenIdForCombination([{data.numbers.join(", ")}]) = <strong>{nft.tokenId}</strong><br />{data.score ? `After the draw, scoreCombination() returns ${data.score}.` : nft.phase === "refundable" ? "The sale ended without a draw. These permanent numbers still identify the NFT until it is burned for a refund." : "The draw is pending. Permanent numbers do not predict a score."}</> : scrambled ? <>scoreCombination([{data.numbers.join(", ")}]) = <strong>{data.score}</strong><br />The contract reverses the collection’s number encoding to recover this unique rank.</> : <>1 + ({data.numbers[0]} − 1) × 4,096 + ({data.numbers[1]} − 1) × 256 + ({data.numbers[2]} − 1) × 16 + ({data.numbers[3]} − 1) = <strong>{data.score}</strong></>}</p>}
        {nft.winningToken && <div className="nft-winner-note"><strong>{nft.awardRank ? `Prize #${nft.awardRank} winning ticket.` : nft.prizePaid ? "This collection’s winning ticket." : "The highest score in this collection."}</strong><p>{nft.prizePaid ? "The prize has been delivered. The winning holder is recorded at payout, even if this NFT is transferred later." : "The winning result is finalized. Only this NFT’s holder can claim its prize from the collection page."}</p><Link href={`/mint/${nft.collectionId}`}>View prizes and claim →</Link></div>}
        {error && <p className="nft-notice" role="alert">{data ? "Live updates are temporarily unavailable. Showing the last verified artwork." : "The artwork and numbers could not be read right now."} <button type="button" className="text-button" onClick={retry}>Try again</button></p>}
        <div className="nft-detail-actions">{links.openSea && <a className="nft-button" href={links.openSea} target="_blank" rel="noopener noreferrer">View on OpenSea ↗</a>}{links.blockscout && <a className="nft-button" href={links.blockscout} target="_blank" rel="noopener noreferrer">View on Blockscout ↗</a>}<a className="nft-button nft-button-outline" href={links.explorer} target="_blank" rel="noopener noreferrer">View on Etherscan ↗</a><button type="button" className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied("NFT link copied."); } catch { setCopied("Copy the URL from your browser’s address bar."); } }}>Copy NFT link</button></div><p className="nft-copy-status" role="status">{copied}</p>
        <p className="nft-marketplace-note">{permanent ? "This NFT’s numbers and artwork stay fixed through the draw and claims. Explorers display that permanent metadata; scores and prize status are verified separately on this page. Initial explorer indexing may take time." : nft.chainId === 11155111 ? "View this ticket’s artwork and traits on Blockscout, or its token record on Etherscan. This collection’s external previews may take longer to refresh after reveal; this page reads the contract directly." : "This collection’s marketplace artwork can take longer to refresh after reveal. The preview here comes directly from the NFT contract."} <Link href="/docs/my-nfts">Understand your ticket and prize status →</Link></p>
      </section>
    </div>
    <section className="nft-provenance" aria-labelledby="nft-provenance-title"><div><p className="eyebrow">THE RECORD BEHIND YOUR TICKET</p><h2 id="nft-provenance-title">Verify your ticket and prize status.</h2><p>Mint history stays with a ticket. Ownership can change after the collection allows transfers.</p></div><dl>
      <div><dt>Current holder</dt><dd>{nft.currentOwner ? <Link href={`/my-nfts?wallet=${nft.currentOwner}`}>{nft.currentOwner}</Link> : "Burned · no current holder"}</dd></div>
      <div><dt>Original recipient</dt><dd><Link href={`/my-nfts?wallet=${nft.mintedTo}`}>{nft.mintedTo}</Link></dd></div>
      <div><dt>Mint paid by</dt><dd><Link href={`/my-nfts?wallet=${nft.mintedBy}`}>{nft.mintedBy}</Link></dd></div>
      {nft.winningToken && nft.winningHolder && <div><dt>Winning holder at payout</dt><dd><Link href={`/my-nfts?wallet=${nft.winningHolder}`}>{nft.winningHolder}</Link></dd></div>}
      <div><dt>Minted at (UTC)</dt><dd><time dateTime={nft.mintedAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(nft.mintedAt))}</time></dd></div>
      <div><dt>Contract</dt><dd><a href={`${explorer}/address/${nft.contractAddress}`} target="_blank" rel="noopener noreferrer">{nft.contractAddress} ↗</a></dd></div>
      <div><dt>Token ID</dt><dd>#{nft.tokenId}</dd></div>
      <div><dt>Mint transaction</dt><dd><a href={`${explorer}/tx/${nft.mintTransactionHash}`} target="_blank" rel="noopener noreferrer">{nft.mintTransactionHash} ↗</a></dd></div>
      {data && <div><dt>Artwork verified at block</dt><dd>{data.blockNumber}</dd></div>}
    </dl></section>
  </div>;
}
