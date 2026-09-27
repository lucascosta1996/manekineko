"use client";
import Link from "next/link";
import { lifecycleStage, observationFresh } from "@manekineko/contract-abi/lifecycle";
import type { CollectionPublic } from "../lib/collections/model";
import { useProtocolClock } from "./collection-activity";

export function DrawProgress({ collection }: { collection: CollectionPublic }) {
  const now = useProtocolClock();
  const stage = lifecycleStage(collection.phase, collection.contractStatus);
  const fresh = now !== null && observationFresh(collection.updatedAt, now);
  const steps = ["Sold out", "Randomness requested", "Randomness received", "Results finalized"];
  const position = ["awaiting_prize", "complete"].includes(collection.phase ?? "") ? 3 : ["awaiting_finalization", "settling"].includes(collection.phase ?? "") ? 2 : collection.phase === "awaiting_randomness" ? 1 : 0;
  return <section className="draw-progress" aria-label="Draw progress">
    <span className="lifecycle-badge" data-busy={fresh && stage.busy} role="status">{stage.label}</span>
    <p>Chainlink VRF supplies verifiable randomness for the draw. The contract then finalizes the winning tickets. Each winner claims their prize.</p>
    <ol>{steps.map((label, i) => <li key={label} aria-current={i === position ? "step" : undefined}>{i <= position ? "✓ " : "○ "}{label}</li>)}</ol>
    {collection.randomnessRequestId && <p>Request <code>{collection.randomnessRequestId}</code></p>}
    {collection.drawEvents?.map(event => <p key={event.name}><a href={`${collection.explorerUrl}/tx/${event.transactionHash}`} target="_blank" rel="noreferrer">{event.name} ↗</a> · <time dateTime={event.at}>{new Date(event.at).toUTCString()}</time></p>)}
    <small>{fresh ? "Last indexed" : "Observation may be delayed"}: <time dateTime={collection.updatedAt}>{new Date(collection.updatedAt).toUTCString()}</time>. Unrecorded stages have no confirmed timestamp or ETA.</small>
    <p><Link className="primary-button" href="/prizes">Claim your prizes →</Link></p>
    <Link href={`/mint/${collection.id}/affiliates`}>View affiliate commissions →</Link>
  </section>;
}
