"use client";

import Link from "next/link";
import { winnerCreditKey, creditAwardRank } from "../../lib/winner-credits/model";
import { useState } from "react";
import { useWinnerCredits } from "./use-winner-credits";
import { LifetimeRedemptions } from "./lifetime-redemptions";

export function WinnerCreditsHistory({ wallet }: { wallet: string }) {
  const [page, setPage] = useState(1);
  const { data, error, refresh } = useWinnerCredits(wallet, null, page);
  return <section className="winner-credits" aria-label="Lifetime winner reward">
    <div className="winner-credits-heading"><div><p className="eyebrow">YOUR NEXT COLOR</p><h2>Your winner reward.</h2></div>{data && <strong>{data.networks.some((network) => network.configured) ? "One lifetime reward per wallet" : "Not enabled yet"}</strong>}</div>
    <p>Claiming any winning NFT’s prize qualifies your wallet for one sponsored ticket in a future eligible collection. This is a lifetime limit: more wins do not add more tickets. The operator covers its mint price; you pay the network fee.</p>
    {error && <p role="alert">{error} <button type="button" className="text-button" onClick={refresh}>Try again</button></p>}
    {!data && !error && <p role="status">Checking your lifetime winner reward…</p>}
    {data && !data.networks.some((network) => network.configured) && <p className="winner-credit-notice">Winner rewards are not enabled on this network yet. A verified past win can qualify after the program is configured.</p>}
    {data && <LifetimeRedemptions networks={data.networks} />}
    {data && data.networks.filter((network) => network.configured && !network.lifetimeRedemption).map((network) => <p key={network.chainId}><strong>{network.chainId === 1 ? "Ethereum" : "Sepolia"}: </strong>{data.credits.some((credit) => credit.chainId === network.chainId && credit.available) ? "1 lifetime sponsored ticket available." : "No verified qualifying win on this page is ready to use."}</p>)}
    {data && data.credits.length === 0 && data.networks.some((network) => network.configured) && <p>No completed collection wins are recorded on this page. Wins appear after the prize claim is confirmed and indexed.</p>}
    {data && data.credits.length > 0 && <><h3>Qualifying win history</h3><ul className="winner-credit-list">{data.credits.map((credit) => <li key={winnerCreditKey(credit)}><div><Link href={`/mint/${credit.collectionId}`}>{credit.name}</Link><span>Prize {creditAwardRank(credit)} · Ticket #{credit.tokenId} · {credit.chainId === 1 ? "Ethereum" : "Sepolia"}</span></div><div><strong>{credit.used ? "Reward redeemed" : credit.available ? "Qualifying win" : "Not eligible to redeem"}</strong>{credit.reason && <span>{credit.reason}</span>}{credit.available && <Link href="/mint">Choose a future collection →</Link>}</div></li>)}</ul></>}
    {data && (data.hasMore || page > 1) && <div className="winner-credit-pagination"><button type="button" className="text-button" disabled={page === 1} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page}</span><button type="button" className="text-button" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Next →</button></div>}
    <p className="winner-credit-small">The reward belongs to the wallet that held its prize-winning ticket when its prize was claimed. It cannot transfer with the NFT. The lifetime limit is enforced on this network. A sponsored ticket counts normally toward supply and the prize pool. If its collection is refunded, the ticket holder can claim the refund; the lifetime reward remains used.</p>
  </section>;
}
