"use client";
import { Icon } from "@manekineko/ui/icons";
import Link from "next/link";
import { useEffect, useState } from "react";
import { lifecycleStage, observationFresh } from "@manekineko/contract-abi/lifecycle";
import type { CollectionPublic } from "../lib/collections/model";
import { useProtocolClock } from "./collection-activity";
import { publicCollectionLifecycle } from "../lib/seasons/model";
import { readConfirmedPrizes } from "../lib/prizes/confirmed";

export function DrawProgress({ collection }: { collection: CollectionPublic }) {
  const now = useProtocolClock();
  const stage = lifecycleStage(collection.phase, collection.contractStatus);
  const fresh = now !== null && observationFresh(collection.updatedAt, now);
  const [confirmedRanks, setConfirmedRanks] = useState<{ id: string; ranks: number[] }>({ id: collection.id, ranks: [] });
  useEffect(() => {
    setConfirmedRanks({ id: collection.id, ranks: readConfirmedPrizes(collection.id, collection.observation?.blockNumber).map(receipt => receipt.rank) });
    const confirmed = (event: Event) => {
      const detail = (event as CustomEvent<{ collectionId: string; rank: number }>).detail;
      if (detail?.collectionId === collection.id && Number.isInteger(detail.rank)) setConfirmedRanks(previous => ({ id: collection.id, ranks: [...new Set([...(previous.id === collection.id ? previous.ranks : []), detail.rank])] }));
    };
    window.addEventListener("tincta:prize-confirmed", confirmed);
    return () => window.removeEventListener("tincta:prize-confirmed", confirmed);
  }, [collection.id, collection.observation?.blockNumber]);
  const locallyPaid = Boolean(collection.awards?.length && collection.awards.every(a => a.claimed || confirmedRanks.id === collection.id && confirmedRanks.ranks.includes(a.rank)));
  const lifecycle = publicCollectionLifecycle(collection, now ?? NaN);
  const steps = ["Sold out", "Randomness requested", "Randomness received", "Results finalized"];
  const position = ["awaiting_prize", "complete"].includes(collection.phase ?? "") ? 3 : ["awaiting_finalization", "settling"].includes(collection.phase ?? "") ? 2 : collection.phase === "awaiting_randomness" ? 1 : 0;
  return <section className="draw-progress" aria-label="Draw progress">
    <span className="lifecycle-badge" data-busy={fresh && stage.busy} role="status">{stage.label}</span>
    <p>Chainlink VRF supplies verifiable randomness for the draw. The contract then finalizes the winning tickets. Each winner claims their prize.</p>
    <ol>{steps.map((label, i) => <li key={label} aria-current={i === position ? "step" : undefined}>{i <= position ? <Icon name="check" /> : <span aria-hidden="true">{i + 1}</span>}{label}</li>)}</ol>
    {collection.randomnessRequestId && <p>Request <code>{collection.randomnessRequestId}</code></p>}
    {collection.drawEvents?.map(event => <p key={event.name}><a href={`${collection.explorerUrl}/tx/${event.transactionHash}`} target="_blank" rel="noreferrer">{event.name} <Icon name="diagonal" /></a> · <time dateTime={event.at}>{new Date(event.at).toUTCString()}</time></p>)}
    <small>{fresh ? "Last indexed" : "Observation may be delayed"}: <time dateTime={collection.updatedAt}>{new Date(collection.updatedAt).toUTCString()}</time>. Unrecorded stages have no confirmed timestamp or ETA.</small>
    {locallyPaid || lifecycle.state === "paid" ? <p><strong>All prizes paid</strong> · <Link href={`/mint/${collection.id}#prizes`}>View results and payment history</Link></p>
      : lifecycle.state === "claimable" ? <p><Link className="primary-button" href="/prizes">Claim your prizes <Icon name="arrow" /></Link></p>
      : <p>{lifecycle.state === "unavailable" ? "Prize availability awaits a fresh observation." : "Winning tickets will appear after the draw is finalized."}</p>}
    <Link href={`/mint/${collection.id}/affiliates`}>View affiliate commissions <Icon name="arrow" /></Link>
  </section>;
}
