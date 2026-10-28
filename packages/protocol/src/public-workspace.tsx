"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { formatEther } from "ethers";
import {
  Button,
  buttonClassName,
  textActionClassName,
} from "@manekineko/ui/button";
import { Disclosure } from "@manekineko/ui/components";
import { Field } from "@manekineko/ui/forms";
import { CompactSelect } from "@manekineko/ui/select";
import { Icon } from "@manekineko/ui/icons";
import { RewardsArtwork } from "@manekineko/ui/rewards-artwork";
import type { Snapshot } from "./chain";
import { CollectionTiming } from "./collection-timing";
import "./public-workspace.css";

export type PublicView = "home" | "claims" | "affiliates" | "holders";
export function formatDuration(seconds: bigint) {
  if (seconds % 3600n === 0n)
    return `${seconds / 3600n} ${seconds === 3600n ? "hour" : "hours"}`;
  if (seconds % 60n === 0n) return `${seconds / 60n} minutes`;
  return `${seconds} seconds`;
}
const stageLabels = [
  "Voting open",
  "Minting open",
  "Preparing the draw",
  "Waiting for the draw",
  "Completing the draw",
  "Rewards ready",
  "Draw complete",
  "Refunds available",
];
const stageDescriptions = [
  "Choose a package of mint price, supply, winner count and mint duration. The winning option becomes final when voting closes.",
  "Mint an NFT with permanent onchain artwork to enter this collection’s draw.",
  "This collection sold out. Its randomness request needs to be submitted before the fixed cutoff.",
  "This collection sold out. The draw is waiting for verifiable randomness from Chainlink.",
  "Randomness is recorded. The results are fixed; anyone can complete the draw to make rewards claimable.",
  "The draw is complete. See every winning ticket and claim any rewards belonging to your wallet.",
  "Every ticket prize has been claimed. View the results or check for an unclaimed affiliate reward.",
  "The collection is refundable. The current NFT holder can burn a ticket to claim its full mint price at any time. Refunds do not expire.",
];

export function PublicWorkspace({
  view,
  state,
  configured,
  stale,
  status,
  onSelect,
  vote,
  genesis,
  mint,
  affiliates,
  awards,
  refund,
  sponsored,
  vault,
  explorer,
  controller,
  holders,
  protocolVersion = 12,
}: {
  view: PublicView;
  state: Snapshot | null;
  configured: boolean;
  stale: boolean;
  status: ReactNode;
  onSelect: (id: number) => void;
  vote: ReactNode;
  genesis?: ReactNode;
  mint: ReactNode;
  affiliates: ReactNode;
  awards: ReactNode;
  refund: ReactNode;
  sponsored: ReactNode;
  vault: ReactNode;
  explorer: (address: string) => string;
  controller?: string;
  holders?: ReactNode;
  protocolVersion?: 12 | 13 | 14 | 16;
}) {
  const r = state?.round;
  const step = r
    ? r.phase === 0
      ? 0
      : r.phase === 1
      ? 1
      : r.phase <= 4
      ? 2
      : 3
    : -1;
  const beforeVote = !!r && !!state && state.timestamp < Number(r.voteStart);
  const query = r ? `?collection=${r.id}` : "";
  return (
    <div className="protocol-page public-workspace" data-view={view}>
      <div className="public-primary">
      <header className="public-heading">
        <p className="protocol-eyebrow">
          {r
            ? `${r.season} · Collection ${r.id}`
            : "Tincta Rewards · Onchain seasons"}
        </p>
        <h1>
          {view === "holders" ? "Season holder rewards" : view === "claims"
            ? "Prizes and refunds"
            : view === "affiliates"
            ? "Affiliate rewards"
            : r?.name ?? (state?.genesis ? "Start with Tincta Genesis" : "Vote, mint and follow the draw")}
        </h1>
        <p>
          {view === "holders" ? (protocolVersion >= 13 ? "A share of the season pool for the first 5% of eligible NFTs to claim." : "This collection does not include season holder rewards. Check its prize and affiliate rewards instead.") : view === "claims"
            ? "See the winners. Claim prizes and refunds directly from the collection."
            : view === "affiliates"
            ? "Enroll, bring a qualifying paid referral and claim after a successful draw."
            : r
            ? beforeVote
              ? "The next collection is prepared. Voting begins at its onchain opening time."
              : protocolVersion >= 13 && [5, 6].includes(r.phase)
              ? "The draw is complete. Discover the winners and your rewards."
              : stageDescriptions[r.phase]
            : state?.genesis ? "Start with a free NFT. Help choose the first paid collection." : "Vote. Mint. Follow the draw."}
        </p>
      </header>
      {view === "home" && !(state?.genesis && !r) && (
        <ol className="public-steps" aria-label="Collection lifecycle">
          {["Vote", "Mint", "Draw", r?.phase === 7 ? "Refund" : "Claim"].map(
            (label, i) => (
              <li
                key={i}
                aria-current={i === step ? "step" : undefined}
                data-complete={step > i}
              >
                <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span>{label}</span>
              </li>
            )
          )}
        </ol>
      )}
      <div className="public-live-region">
      <div className="public-session">{status}</div>
      {!configured && (
        <section className="public-empty">
          <RewardsArtwork className="public-empty-art" />
          <h2>No collection is open yet.</h2>
          <p>
            No collection is open here yet. The planned launch begins with Genesis.
          </p>
          <p className="protocol-note">
            Existing NFTs and claims keep their rights in their original
            contracts.
          </p>
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/docs/onchain-voting"
          >
            Read how onchain seasons work
          </Link>
        </section>
      )}
      {view === "home" && state?.genesis && !r && genesis}
      {view !== "home" && state?.genesis && !r && <section className="public-empty"><h2>The free mint comes first.</h2><p>{protocolVersion===16?"Genesis holders can enroll as affiliates in every collection and season. Enrollment opens with the first ballot after Genesis sells out.":"This connected test collection grants first-ballot voting only. Its original rules do not include Genesis affiliate eligibility."}</p><Link className={buttonClassName({ variant: "secondary" })} href="/">View Genesis</Link></section>}
      {state && !r && !state.genesis && (
        <section className="public-empty">
          <h2>The first collection is next.</h2>
          <p>
            {state.sealed
              ? "The season plan is sealed onchain. Voting appears here once the first collection is prepared."
              : "The season plan is being prepared. There is no open vote or mint yet."}
          </p>
        </section>
      )}
      {r && state && (
        <>
          {view !== "home" && (
            <div className="public-selection">
              <Field label="Collection">
                {(p) => (
                  <CompactSelect
                    {...p}
                    value={String(r.id)}
                    onChange={(e) => onSelect(Number(e.target.value))}
                  >
                    {Array.from({ length: state.count }, (_, i) => (
                      <option key={i + 1} value={String(i + 1)}>
                        {i + 1 === r.id
                          ? `${i + 1} · ${r.name}`
                          : `Collection ${i + 1}${
                              i + 1 === state.count ? " · Latest" : ""
                            }`}
                      </option>
                    ))}
                  </CompactSelect>
                )}
              </Field>
              <p className="protocol-note">
                {r.name} · {stageLabels[r.phase]}
              </p>
            </div>
          )}
          {view === "home" && r.id !== state.count && (
            <div className="public-previous">
              <p>You’re viewing an earlier collection from a saved link.</p>
              <Button variant="secondary" onClick={() => onSelect(0)}>
                Go to the current collection
              </Button>
            </div>
          )}
          {view === "home" && (
            <>
              <div className="public-stage" data-phase={r.phase}>
                {stale && (
                  <p className="public-stage-label">
                    Last verified state · Signing paused
                  </p>
                )}
                {r.phase === 1 && (
                  <dl className="public-terms">
                    <div>
                      <dt>Price per ticket</dt>
                      <dd>
                        {formatEther(r.price)} <span>ETH</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Tickets minted</dt>
                      <dd>
                        {r.minted.toLocaleString("en-US")} /{" "}
                        {r.supply.toLocaleString("en-US")}
                      </dd>
                    </div>
                    <div>
                      <dt>Equal prizes</dt>
                      <dd>{String(r.winners)}</dd>
                    </div>
                  </dl>
                )}
                {r.phase === 0 ? (
                  vote
                ) : r.phase === 1 ? (
                  mint
                ) : r.phase === 7 ? (
                  refund
                ) : (
                  <section className="public-outcome">
                    <h2>
                      {r.phase >= 5
                        ? "The winning NFTs"
                        : r.phase === 4
                        ? "The draw is ready to finalize."
                        : "The collection has sold out."}
                    </h2>
                    <p>
                      {r.phase >= 5
                        ? `${r.winners} winning NFTs. Equal prizes of ${
                            r.awards[0] ? formatEther(r.awards[0].amount) : "—"
                          } ETH each.`
                        : "You don’t need to keep this page open. Return here to see the results once the draw is finalized."}
                    </p>
                    {r.phase >= 5 && (
                      <Link
                        className={buttonClassName()}
                        href={`/claims${query}`}
                      >
                        View winners & claim rewards
                      </Link>
                    )}
                    {r.phase < 5 && (
                      <Link
                        className={buttonClassName({ variant: "secondary" })}
                        href={`/claims${query}`}
                      >
                        View draw & rewards
                      </Link>
                    )}
                  </section>
                )}
                {r.phase < 5 || r.phase === 7 ? (
                  <CollectionTiming state={state} stale={stale} compact />
                ) : (
                  <p className="protocol-note">
                    Prizes stay available to eligible holders. Starting another
                    collection does not remove your claim.
                  </p>
                )}
              </div>
              {vault && (
                <div className="public-secondary-form">
                  <Disclosure title="Manage earlier NFTs for voting">
                    {vault}
                  </Disclosure>
                </div>
              )}
              {r.phase === 1 && (
                <div className="public-secondary-form">
                  <Disclosure title="Have a sponsored ticket from an earlier win?">
                    {sponsored}
                  </Disclosure>
                </div>
              )}
            </>
          )}
          {view === "claims" && (
            <div className="public-claim-content">
              {vault && (
                <Disclosure title="Manage earlier NFTs for voting">
                  {vault}
                </Disclosure>
              )}
              {r.phase === 7 ? refund : awards}
              {r.phase < 5 && (
                <CollectionTiming state={state} stale={stale} compact />
              )}
              {r.phase === 1 && (
                <Disclosure title="Redeem a sponsored ticket">
                  {sponsored}
                </Disclosure>
              )}
            </div>
          )}
          {view === "affiliates" && (
            <div className="public-affiliate-content">
              {affiliates}
              {r.phase < 5 && (
                <CollectionTiming state={state} stale={stale} compact />
              )}
            </div>
          )}
          {view === "holders" && holders}
        </>
      )}
      </div>
      <nav className="public-shortcuts" aria-label="Collection guide">
        <Link className={textActionClassName()} href={view === "holders" ? "/docs/holder-rewards" : view === "affiliates" ? "/docs/affiliates" : view === "claims" ? "/docs/prizes" : !r ? "/docs/genesis" : "/docs/onchain-voting"}>
          {view === "holders" ? "Read the holder reward rules" : view === "affiliates" ? "Read the affiliate guide" : view === "claims" ? "Read the prize and claim rules" : !r ? "Read the Genesis guide" : "Read the participation guide"}
          <Icon name="arrow" />
        </Link>
      </nav>
      </div>
      {state && controller && (
        <p className="public-verification protocol-note">
          {stale ? "Last contract state check" : "Contract state checked"} at block {state.block}.{" "}
          <a
            className={textActionClassName({ inline: true })}
            href={`${explorer(controller)}#code`}
            target="_blank"
            rel="noreferrer"
          >
            Season contract ↗
          </a>
          {r && (
            <>
              {" "}
              ·{" "}
              <a
                className={textActionClassName({ inline: true })}
                href={`${explorer(r.address)}#code`}
                target="_blank"
                rel="noreferrer"
              >
                Collection contract ↗
              </a>
            </>
          )}
        </p>
      )}
      <noscript>
        <p className="protocol-note">
          Enable JavaScript to read live contract state and connect your wallet.
        </p>
      </noscript>
    </div>
  );
}
