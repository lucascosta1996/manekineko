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
  "Choose the mint price, supply and prize count. The winning option becomes final when voting closes.",
  "Mint an NFT. Keep its onchain artwork. Join the draw.",
  "This collection sold out. Its randomness request needs to be submitted before the fixed cutoff.",
  "This collection sold out. Chainlink is delivering the randomness that determines its winning tickets.",
  "Randomness is recorded. The results are fixed; anyone can complete the draw to make rewards claimable.",
  "The draw is complete. See every winning ticket and claim any rewards belonging to your wallet.",
  "Every ticket prize has been claimed. View the results or check for an unclaimed affiliate reward.",
  "The collection is refundable. The current NFT holder can return a ticket for its full mint price.",
];

export function PublicWorkspace({
  view,
  state,
  configured,
  stale,
  status,
  onSelect,
  vote,
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
  mint: ReactNode;
  affiliates: ReactNode;
  awards: ReactNode;
  refund: ReactNode;
  sponsored: ReactNode;
  vault: ReactNode;
  explorer: (address: string) => string;
  controller?: string;
  holders?: ReactNode;
  protocolVersion?: 12 | 13;
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
      <header className="public-heading">
        <p className="protocol-eyebrow">
          {r
            ? `${r.season} · Collection ${r.id}`
            : "Tincta Rewards · Onchain seasons"}
        </p>
        <h1>
          {view === "holders" ? "Not a winner, but still a holder?" : view === "claims"
            ? "Your rewards."
            : view === "affiliates"
            ? "Grow the collection."
            : r?.name ?? "Your next move, onchain."}
        </h1>
        <p>
          {view === "holders" ? (protocolVersion === 13 ? "Follow the season pool. At season end, the first 5% of eligible NFTs to claim share the rewards equally." : "This collection does not include season holder rewards. Check its prize and affiliate rewards instead.") : view === "claims"
            ? "See the winners. Claim prizes and refunds directly from the collection."
            : view === "affiliates"
            ? "Enroll, share your link and claim your equal share of the affiliate pool."
            : r
            ? beforeVote
              ? "The next collection is prepared. Voting begins at its onchain opening time."
              : protocolVersion === 13 && [5, 6].includes(r.phase)
              ? "The draw is complete. Check winning-ticket and affiliate claims now; season holder claims open after every collection settles, while slots remain."
              : stageDescriptions[r.phase]
            : "Vote on the next collection. Mint a ticket. Follow the draw. Everything starts here."}
        </p>
      </header>
      {view === "home" && (
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
      <div className="public-session">{status}</div>
      {!configured && (
        <section className="public-empty">
          <RewardsArtwork className="public-empty-art" />
          <h2>Onchain seasons are being prepared.</h2>
          <p>
            The new collection contracts are not connected yet. When a
            collection opens, its live stage and available actions will appear
            here.
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
      {state && !r && (
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
                {r.name} · {stageLabels[r.phase]}. Earlier collections remain
                available here.
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
                        ? "Meet the winning tickets."
                        : r.phase === 4
                        ? "The results are on their way."
                        : "Your tickets are in the draw."}
                    </h2>
                    <p>
                      {r.phase >= 5
                        ? `${r.winners} winning NFTs. Equal prizes of ${
                            r.awards[0] ? formatEther(r.awards[0].amount) : "—"
                          } ETH each.`
                        : "You do not need to keep this page open. Return here to see the results once the draw is finalized."}
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
      <nav className="public-shortcuts" aria-label="Your collection actions">
        {view !== "holders" && <Link className={buttonClassName({ variant: "secondary" })} href={`/holders${query}`}>Season holder rewards</Link>}
        {view !== "home" && (
          <Link className={buttonClassName({ variant: "secondary" })} href="/">
            Back to the current collection
          </Link>
        )}
        {view !== "claims" && (
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href={`/claims${query}`}
          >
            Rewards & refunds
          </Link>
        )}
        {view !== "affiliates" && (
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href={`/affiliates${query}`}
          >
            Affiliate program
          </Link>
        )}
      </nav>
      <section className="public-explainer" aria-label="How a collection works">
        <dl className="public-allocation-grid">
          <div><dt>60% · Winning tickets</dt><dd>Equal prizes for the winning NFTs after a successful draw.</dd></div>
          <div><dt>20% · Qualified affiliates</dt><dd>Shared equally by affiliates with at least one paid referral.</dd></div>
          {protocolVersion === 13 && <div><dt>8% · Holder rewards</dt><dd>A season pool for the first 5% of eligible NFTs to claim.</dd></div>}
          <div><dt>{protocolVersion === 13 ? "12%" : "20%"} · Protocol treasury</dt><dd>For infrastructure costs, future functionality and Tincta projects.</dd></div>
        </dl>
        {!configured && <p className="public-explainer-note">Planned for Tincta seasons. Check the selected collection’s published terms before participating.</p>}
        <Disclosure title="How it works · Voting, prizes and refunds">
          <div className="public-rules-grid">
            <section><h3>1. Vote &amp; mint</h3><p>Voting selects the collection’s price, supply, winner count and mint duration. Mint price is always at least 0.01 ETH. Voted supply is 1,000–65,536 NFTs, with up to 20 primary mints per recipient.</p><p>Voting opens at the scheduled time; its deadline opens minting without another operator signature. The next collection needs a preparation transaction after this collection’s outcome. No one can pause a live collection.</p></section>
            <section><h3>2. Follow the draw</h3><p>After sellout, verified randomness selects the winning NFTs. Their current holders claim equal shares of the 60% prize pool directly from the contract.</p><p>Prize, earned affiliate and refund obligations stay protected.</p><Link className={textActionClassName()} href="/docs/prizes">Read the prize rules</Link></section>
            <section><h3>3. Check refund eligibility</h3><p>If the collection is still unsold at its mint deadline, holders can burn their NFT to receive its full original mint price.</p><p>A sold-out collection becomes refundable if no randomness is recorded within 72 hours of sellout. On-time recorded randomness commits the draw permanently. A timer alone never grants a refund. Gas and secondary-market price differences are excluded.</p><Link className={textActionClassName()} href="/docs/refunds">Read the refund rules</Link></section>
            <section><h3>Affiliate rewards</h3><p>Affiliates need at least one paid referral. The 20% affiliate pool is shared equally among those who qualify, after draw finalization. With no qualified affiliates, the unused pool follows the contract’s operator recovery rule.</p><Link className={textActionClassName()} href="/docs/affiliates">Read the affiliate rules</Link></section>
            {protocolVersion === 13 && <section className="public-rules-holder"><h3>Season holder rewards</h3><p>Each successful draw sends 8% of actual mint revenue to its season’s holder pool. Voting selects prices and supplies, so pool totals and ETH rewards vary by season. The allocation percentages stay fixed.</p><p>Holder claims unlock when every planned collection in the season has drawn or become refundable. Only NFTs from successful draws qualify, including winners. The first 5% of eligible NFTs to claim, rounded down, share the final pool equally. Each NFT can claim once through its current owner, in onchain execution order. Transfers do not reset a used claim. The operator cannot withdraw this pool.</p><Link className={textActionClassName()} href="/docs/holder-rewards">Read the holder reward rules</Link></section>}
          </div>
          <Link className={textActionClassName()} href="/docs">Read the full rules</Link>
        </Disclosure>
      </section>
      {state && controller && (
        <p className="public-verification protocol-note">
          {stale ? "Last verified" : "Verified"} at block {state.block}.{" "}
          <a
            className={textActionClassName({ inline: true })}
            href={explorer(controller)}
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
                href={explorer(r.address)}
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
