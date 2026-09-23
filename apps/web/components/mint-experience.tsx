"use client";

import { collectionReferralCopy } from "../lib/collections/copy";
import { RankedAwards } from "./prizes/ranked-awards";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CollectionPublic } from "../lib/collections/types";
import {
  demoStorageKey,
  mintDemoTickets,
  readDemoState,
  type DemoState,
} from "../lib/mint/demo";
import {
  formatCount,
  formatDuration,
  formatWei,
  roundLabel,
} from "../lib/mint/format";
import { previewExample, ticketDataUri } from "../lib/mint/preview";
import { AffiliateMintPanel } from "./affiliates/affiliate-mint-panel";
import type { ReferralQuery } from "../lib/affiliates/wallet";
import { collectionProgress } from "../lib/collections/presentation";
import { collectionResponse } from "../lib/live-data/responses";
import { useLiveData } from "./use-live-data";
import { LiveDataNotice } from "./live-data-notice";
import { CollectionActivity } from "./collection-activity";
import { TinctaWordmark } from "./tincta-logo";

export function MintExperience({
  collection: initialCollection,
  referralQuery = {},
}: {
  collection: CollectionPublic;
  referralQuery?: ReferralQuery;
}) {
  const { data: collection, retrying } = useLiveData(initialCollection.mode === "live" ? `/api/collections/${initialCollection.id}` : null, initialCollection, collectionResponse);
  const [quantity, setQuantity] = useState(1);
  const [liveContractVerified, setLiveContractVerified] = useState(false);
  const [referralBlocked, setReferralBlocked] = useState(referralQuery.affiliate !== undefined || referralQuery.collection !== undefined);
  const [example, setExample] = useState(false);
  const [demo, setDemo] = useState<DemoState>(() =>
    readDemoState(null, collection.id, collection.maxSupply)
  );
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineDetails = useRef<HTMLDetailsElement>(null);
  const inFlight = useRef(false);
  const isDemo =
    collection.mode === "demo" &&
    collection.contractStatus === "undeployed" &&
    collection.contractAddress === null;

  useEffect(() => {
    if (!isDemo) {
      setReady(true);
      return;
    }
    try {
      setDemo(
        readDemoState(
          sessionStorage.getItem(demoStorageKey(collection.id)),
          collection.id,
          collection.maxSupply
        )
      );
    } catch {
      setStorageAvailable(false);
    }
    setReady(true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [collection.id, collection.maxSupply, isDemo]);

  const remaining = Math.max(0, collection.maxSupply - (isDemo ? demo.minted : collection.totalMinted));
  const maxQuantity = Math.min(collection.maxMintBatch, 20, remaining);
  const validQuantity =
    Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= maxQuantity;
  const total =
    BigInt(collection.mintPriceWei) * BigInt(validQuantity ? quantity : 0);
  const selloutPrize =
    (BigInt(collection.mintPriceWei) *
      BigInt(collection.maxSupply) *
      BigInt(collection.prizeBps)) /
    10_000n;
  const symbol = collection.nativeCurrency.symbol;
  const decimals = collection.nativeCurrency.decimals;
  const previewId = isDemo ? demo.minted || 1 : 1;
  const permanent = collection.contractVersion === "affiliate-v10";
  const v2 = collection.algorithmVersion !== "feistel-v1";
  const equalPrizes = (collection.contractVersion === "affiliate-v8" || collection.contractVersion === "affiliate-v9" || collection.contractVersion === "affiliate-v10");
  const ranked = equalPrizes || collection.contractVersion === "affiliate-v7";
  const winners = equalPrizes ? collection.winnerCount! : 2;
  const v3 = collection.algorithmVersion === "unique-rank-v3" || ranked;
  const progress = collectionProgress(collection);
  const exampleNumbers = previewExample(collection.algorithmVersion, collection.maxSupply).numbers;

  function mint() {
    if (!ready || !isDemo || !validQuantity || referralBlocked || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage("");
    timer.current = setTimeout(() => {
      try {
        const next = mintDemoTickets(
          demo,
          quantity,
          collection.maxSupply,
          collection.maxMintBatch
        );
        try {
          sessionStorage.setItem(
            demoStorageKey(collection.id),
            JSON.stringify(next)
          );
        } catch {
          setStorageAvailable(false);
        }
        setDemo(next);
        setExample(false);
        setQuantity(
          Math.min(quantity, Math.max(1, collection.maxSupply - next.minted))
        );
        setMessage(
          `${
            quantity === 1
              ? "Your demo ticket is ready."
              : `Your ${quantity} demo tickets are ready.`
          } No payment was taken and no NFT was issued on-chain.`
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "The demo could not be completed. Please try again."
        );
      } finally {
        inFlight.current = false;
        setPending(false);
        timer.current = null;
      }
    }, 450);
  }

  function resetDemo() {
    if (inFlight.current) return;
    try {
      sessionStorage.removeItem(demoStorageKey(collection.id));
    } catch {
      setStorageAvailable(false);
    }
    setDemo(readDemoState(null, collection.id, collection.maxSupply));
    setQuantity(1);
    setMessage("Your local demo has been reset.");
  }

  return (
    <>
      <RankedAwards collection={collection} claim />
      <section className="mint-hero" aria-labelledby="collection-title">
        <div className="preview-column">
          <div className={`preview-stage${["unique-rank-v5", "unique-rank-v6"].includes(collection.algorithmVersion) ? " is-portrait" : ""}`}>
            <div className="preview-stage-top">
              <span>{collection.seasonName ?? `COLLECTION ${roundLabel(collection.roundId)}`}</span>
              <span className="svg-label">SVG · ON-CHAIN ART</span>
            </div>
            <div className="ticket-image-wrap">
              <img
                className="ticket-image"
                src={ticketDataUri(collection.roundId, previewId, example, collection.algorithmVersion, collection.maxSupply, collection)}
                width="640"
                height={["unique-rank-v5", "unique-rank-v6"].includes(collection.algorithmVersion) ? "800" : "640"}
                alt={
                  permanent ? `Illustrative permanent NFT for round ${collection.roundId}. Sample numbers show the design; this is not an assigned token.` : example
                    ? `Illustrative revealed ticket for round ${collection.roundId}: numbers ${exampleNumbers.join(", ")}. These are sample numbers, not assigned results.`
                    : `Sealed NFT preview for round ${collection.roundId}, example token ${previewId}. The combination is hidden until reveal.`
                }
              />
            </div>
            <div className="preview-stage-bottom">
              <span>
                {example
                  ? "AN EXAMPLE. NOT YOUR RESULT."
                  : "COLOR, COLLECTED. ENTIRELY ON-CHAIN."}
              </span>
              <TinctaWordmark className="preview-signature" />
            </div>
          </div>
          {!permanent && <div
            className="preview-controls"
            role="group"
            aria-label="NFT preview state"
          >
            <button
              type="button"
              aria-pressed={!example}
              onClick={() => setExample(false)}
            >
              Before reveal
            </button>
            <button
              type="button"
              aria-pressed={example}
              onClick={() => setExample(true)}
            >
              Example after reveal
            </button>
          </div>}
          <p className="preview-caption">
            {permanent ? "Illustrative permanent artwork with sample numbers. Solidity assigns your NFT’s actual numbers at mint; VRF determines its result after sellout." : example
              ? "Sample numbers explain the artwork. Your ticket’s numbers cannot be known before reveal."
              : "Illustrative sealed SVG preview. The contract stores NFT images and metadata entirely on-chain."}
          </p>
        </div>

        <div className="mint-panel">
          <div className="mint-panel-kicker">
            <span className="eyebrow">A COLOR TO CALL YOURS</span>
            <span className="pill demo-pill">
              {isDemo ? "Demo collection" : collection.contractStatus === "deployed" ? "On-chain collection" : "Collection preview"}
            </span>
          </div>
          <h1 id="collection-title">{collection.name}</h1>
          <p className="mint-description">
            One ticket. Four numbers. {equalPrizes ? `${winners} winning NFTs, each with an equal prize.` : ranked ? `The top ${winners} scores win.` : "One winning NFT under this collection’s original rules."}
            <br />Collect for a chance to win. Explore referral rewards in the affiliate program.
          </p>
          {!equalPrizes && <p className="mint-version-note">This earlier collection keeps its original prize terms. The current Tincta format has six equal prizes per collection.</p>}
          {!isDemo && <LiveDataNotice retrying={retrying} />}
          <div className="mint-summary">
            <div>
              <span>Ticket price</span>
              <strong>
                {formatWei(collection.mintPriceWei, decimals)}{" "}
                <small>{symbol}</small>
              </strong>
            </div>
            <div>
              <span>Limited collection</span>
              <strong>
                {formatCount(collection.maxSupply)} <small>tickets</small>
              </strong>
            </div>
          </div>

          <div className="prize-note">
            <span className="prize-symbol" aria-hidden="true">
              ✳
            </span>
            <div>
              <span className="prize-label">{ranked ? "Prizes at sellout" : "Prize at sellout"}</span>
              <strong className="prize-amount">{equalPrizes ? `${winners} × ${formatWei(selloutPrize / BigInt(winners), decimals)}` : formatWei(selloutPrize, decimals)} <small>{symbol}</small></strong>
              <p>{ranked
                ? `After sellout and reveal, holders of the ${winners} highest-scoring NFTs can claim their prizes.`
                : "After sellout and reveal, the holder of the highest-scoring NFT receives the prize."}</p>
              {ranked && !equalPrizes && <p>First prize: {formatWei(selloutPrize - BigInt(collection.maxSupply)*BigInt(collection.mintPriceWei)*BigInt(collection.secondPrizeBps ?? 0)/10000n, decimals)} {symbol} · Second prize: {formatWei(BigInt(collection.maxSupply)*BigInt(collection.mintPriceWei)*BigInt(collection.secondPrizeBps ?? 0)/10000n, decimals)} {symbol}</p>}
              <p>If the collection does not sell out by the <Link href="#collection-deadline" onClick={() => { if (deadlineDetails.current) deadlineDetails.current.open = true; }}>deadline</Link>, NFT holders can claim a refund of the mint price.</p>
              {isDemo && <p>Demo prizes are illustrative and unfunded.</p>}
            </div>
          </div>

          {!isDemo && <CollectionActivity collection={collection} />}
          <AffiliateMintPanel collection={collection} referralQuery={referralQuery} onReferralBlocked={setReferralBlocked} onLiveContractVerified={setLiveContractVerified}>
          <form
            className="mint-form"
            onSubmit={(event) => {
              event.preventDefault();
              mint();
            }}
          >
            <div className="quantity-row">
              <label htmlFor="ticket-quantity">
                Your tickets
                <span>Up to {collection.maxMintBatch} per mint</span>
              </label>
              <div className="quantity-control">
                <button
                  type="button"
                  aria-label="Decrease ticket quantity"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1 || pending || maxQuantity === 0}
                >
                  −
                </button>
                <input
                  id="ticket-quantity"
                  type="number"
                  min="1"
                  max={Math.max(1, maxQuantity)}
                  step="1"
                  inputMode="numeric"
                  value={Number.isFinite(quantity) ? quantity : ""}
                  disabled={pending || maxQuantity === 0}
                  onChange={(event) =>
                    setQuantity(
                      event.target.value === "" ? 0 : Number(event.target.value)
                    )
                  }
                  aria-describedby="demo-mint-note"
                />
                <button
                  type="button"
                  aria-label="Increase ticket quantity"
                  onClick={() =>
                    setQuantity(
                      Math.min(maxQuantity, Math.max(1, quantity + 1))
                    )
                  }
                  disabled={quantity >= maxQuantity || pending}
                >
                  +
                </button>
              </div>
            </div>
            <div className="total-row">
              <span>{isDemo ? "Demo total" : "Mint total"}</span>
              <strong>
                {formatWei(total, decimals)} {symbol}
              </strong>
            </div>
            <button
              className="primary-button mint-button"
              type="submit"
              disabled={
                !ready ||
                !isDemo ||
                referralBlocked ||
                !validQuantity ||
                pending ||
                remaining === 0
              }
            >
              <span>
                {pending
                  ? "Creating your demo…"
                  : referralBlocked
                  ? "Verify the referral link first"
                  : !isDemo
                  ? collection.phase === "pending_activation" ? "Awaiting activation" : "Checking mint availability…"
                  : remaining === 0
                  ? "Demo supply reached"
                  : !validQuantity
                  ? `Choose 1–${Math.max(1, maxQuantity)} tickets`
                  : quantity === 1
                  ? "Mint demo ticket"
                  : `Mint ${quantity} demo tickets`}
              </span>
              {pending ? (
                <span className="button-spinner" aria-hidden="true" />
              ) : (
                <span aria-hidden="true">↗</span>
              )}
            </button>
            <p className="transaction-note" id="demo-mint-note">
              <span aria-hidden="true">◇</span>{" "}
              {isDemo
                ? "No wallet. No payment. Just a preview."
                : progress.detail}
            </p>
            <div
              className="mint-feedback"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {message && <p>{message}</p>}
            </div>
          </form>
          </AffiliateMintPanel>

          {isDemo && demo.minted > 0 && (
            <div className="demo-receipt">
              <span className="receipt-check" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>
                  {formatCount(demo.minted)}{" "}
                  {demo.minted === 1 ? "demo ticket" : "demo tickets"} in this
                  tab
                </strong>
                <p>
                  Latest: DEMO-{demo.minted.toString().padStart(3, "0")} ·
                  {permanent ? "permanent artwork preview" : "sealed preview"}
                </p>
              </div>
              <button
                type="button"
                onClick={resetDemo}
                disabled={pending}
                className="text-button"
              >
                Reset demo
              </button>
            </div>
          )}
          {isDemo && !storageAvailable && (
            <p className="storage-note">
              Browser storage is unavailable. Your demo tickets will last only
              while this page stays open.
            </p>
          )}
          <div className="contract-note">
            <span className="contract-status-dot" aria-hidden="true" />
            <div>
              <strong>
                {collection.networkName} ·{" "}
                {collection.contractStatus === "undeployed"
                  ? "contract not deployed"
                  : liveContractVerified ? "verified contract" : "deployed contract"}
              </strong>
              <p>
                {isDemo
                  ? "These are the collection’s configured terms. Demo tickets do not reserve real NFTs or change the supply."
                  : progress.detail}
              </p>
            </div>
            <Link
              href={`/mint/${collection.id}/contract`}
              aria-label="Read the collection smart contract"
            >
              ↗
            </Link>
          </div>
        </div>
      </section>

      <section
        className="how-section"
        id="how-it-works"
        aria-labelledby="how-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">DESIGNED IN COLOR. VERIFIED ON-CHAIN.</p>
            <h2 id="how-title">Four numbers. Transparent rules.</h2>
          </div>
          <Link className="text-link" href={`/mint/${collection.id}/contract`}>
            Read the smart contract <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="how-grid">
          <article>
            <span className="step-label">01 / MINT</span>
            <h3>{permanent ? "Your numbers are permanent from mint." : "Your ticket starts sealed."}</h3>
            <p>
              {permanent ? "Solidity turns each token ID into a unique four-number identity. You supply no numbers or seed. Numbers and artwork stay fixed, while the draw result remains pending." : "Every ticket has a unique ID. Its four numbers stay hidden until the collection sells out, so ordinary buyers cannot inspect their result before minting."}
            </p>
          </article>
          <article>
            <span className="step-label">02 / REVEAL</span>
            <h3>One fixed source. No rerolls.</h3>
            <p>
              {permanent ? `After sellout, one verified Chainlink VRF result selects ${winners} distinct winning NFTs. Final scores are stored separately; your permanent numbers and artwork do not change.` : ranked ? `After sellout, one verified Chainlink VRF result selects ${winners} distinct winning tickets without replacement. The remaining unique ranks and reversible number encoding are calculated on-chain.` : v3 ? `After sellout, one Chainlink VRF request supplies randomness whose proof is verified on Ethereum. Every rank from 1 to ${formatCount(collection.maxSupply)} appears once. A reversible on-chain encoding represents each rank as four numbers from 1 to 16.` : v2 ? `After sellout, one Chainlink VRF request supplies randomness whose proof is verified on Ethereum. A fixed rotation assigns every rank from 1 to ${formatCount(collection.maxSupply)} once. Four numbers from 1 to 16 encode each rank.` : <>A block {collection.revealDelayBlocks} blocks after sellout
              supplies the reveal seed. A one-to-one shuffle turns each ID into
              four numbers from 1 to 256. No two tickets in a collection share a
              combination.</>}
            </p>
          </article>
          <article>
            <span className="step-label">03 / VERIFY</span>
            <h3>{ranked ? `The top ${winners} scores win.` : "The greatest result wins."}</h3>
            <p>
              {ranked ? `The top ${winners} ranks, ${formatCount(collection.maxSupply)} through ${formatCount(collection.maxSupply-winners+1)}, belong to distinct NFTs. Only the current holder of each winning ticket can claim its separate prize. A wallet may own more than one winning ticket.` : <>{v2 && `Exactly one NFT scores ${formatCount(collection.maxSupply)}. `}The contract calculates every score. The highest-scoring NFT’s holder claims its configured prize.</>}
            </p>
          </article>
        </div>
        <div className="algorithm-strip">
          <div>
            <span className="mono-label">THE SCORE, IN THE CONTRACT</span>
            <code>{v3 ? "scoreCombination([a, b, c, d])" : v2 ? "1 + (a − 1) × 4,096 + (b − 1) × 256 + (c − 1) × 16 + (d − 1)" : "(a × b + c × d) × 4,294,967,296 + combinationCode"}</code>
            <p>
              {permanent ? `The contract decodes these numbers to a token ID, then reads that NFT’s final VRF-derived score. The top ${winners} scores identify the winning NFTs. Numbers alone do not reveal or predict a prize.` : ranked ? `The contract decodes the four numbers to their unique rank. The top ${winners} ranks each identify one winning NFT; a wallet can hold multiple winning tickets. The number encoding changes the artwork, not the odds.` : v3 ? "The contract decodes the four numbers using the collection’s public combination key to recover their unique rank. The encoding changes how the numbers look; it does not add randomness. This earlier collection has one highest-ranked winning NFT." : v2 ? "Every rank appears once, so the highest result has exactly one winner. Anyone can reproduce the calculation." : "The unique combination code breaks ties. Anyone can reproduce the full calculation."}
            </p>
          </div>
          <span className="algorithm-badge">
            Public rules
            <br />
            <strong>Verifiable results</strong>
          </span>
        </div>
        <p className="fairness-note">
          <strong>The same fixed rules apply to every ticket.</strong>{" "}{ranked ? "The VRF proof is verified on-chain. Winning tickets are selected without replacement under the VRF and cryptographic hashing assumptions. NFT art, ranks and protected prize balances stay on-chain. Each winning holder can claim independently immediately after finalization; operator payment approval is not required." : v2 ? "The VRF proof is verified on-chain, and each ticket has the same chance under the VRF and cryptographic hashing assumptions. Chainlink is an external randomness provider; the NFT art, ranking and prize accounting stay on-chain. Transfers pause from sellout until prize delivery. Seven days after finalization, the winning holder can claim any unpaid prize to a receiving address." : <>The
          algorithm is public and verifiable, but the reveal is not
          manipulation-proof: block producers can influence its source. The
          owner must also submit the prize payment.</>}
        </p>
      </section>

      <section className="details-section" aria-labelledby="details-title">
        <h2 id="details-title">Before you mint</h2>
        <div className="faq-list">
          <details>
            <summary>{permanent ? "How do permanent numbers and draw results work?" : "How does this collection differ from V10?"}<span aria-hidden="true">+</span></summary>
            <p>{permanent ? "This V10 collection generates permanent numbers in Solidity at mint, then uses a separate VRF draw after sellout to assign scores and prizes. Its artwork stays unchanged." : "This collection follows its original contract: its numbers appear when the draw is revealed. V10 generates permanent numbers in Solidity at mint and reads later VRF scores separately."} <Link href="/docs/randomness">Read about permanent numbers and draw results</Link>.</p>
          </details>
          <details><summary>How do affiliates earn?<span aria-hidden="true">+</span></summary><p>{collectionReferralCopy(collection)} Referral rewards are separate from the collection’s prize reserve. <Link href={`/mint/${collection.id}/affiliates`}>View eligibility, referrals and commission</Link>.</p></details>
          <details id="collection-deadline" ref={deadlineDetails}>
            <summary>
              What if the collection does not sell out?
              <span aria-hidden="true">+</span>
            </summary>
            <p>
              Minting closes after the configured sale period of{" "}
              {formatDuration(collection.mintDurationSeconds)}.
              {collection.mintDeadline && (
                <>
                  {" "}
                  Its recorded deadline is{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  }).format(new Date(collection.mintDeadline))}{" "}
                  UTC.
                </>
              )}{" "}
              If it is not sold out, current NFT holders can burn their tickets
              to recover the original mint price. Network fees are not refunded.{" "}{v2 ? "A sold-out VRF collection waits for its original VRF request. It cannot reroll or refund after sellout. Provider delays can delay reveal and prize delivery." : "Refunds also become available if the reveal hash is not captured within its 256-block window."}
            </p>
          </details>
          <details>
            <summary>
              Can I verify the numbers myself?<span aria-hidden="true">+</span>
            </summary>
            <p>
              {permanent ? <>Yes. Use <code>tokenIdForCombination()</code> to verify the permanent identity. After draw finalization, <code>scoreCombination()</code> returns the NFT’s separately assigned score. Inspect both in the </> : v3 ? <>Yes. Inspect the fulfilled VRF request and the collection’s public <code>combinationKey()</code>. The <code>scoreCombination()</code> function decodes the four numbers back to their assigned rank. Both are in the </> : v2 ? <>Yes. Inspect the fulfilled VRF request, then reproduce the accepted offset, rank and four numbers with <code>finalizeDraw</code> and the <code>UniqueRank</code> library in the </> : <>Yes. After reveal, the public seed and token ID reproduce the
              four-round shuffle, combination, and score. Read{" "}
              <code>_combinationCode</code>, <code>_score</code>, and{" "}
              <code>settle</code> in the </>}
              <Link href={`/mint/${collection.id}/contract`}>
                contract source
              </Link>
              .{" "}
              {collection.contractStatus === "deployed"
                ? liveContractVerified ? "The collection bytecode is checked against its recorded deployment. The contract enforces ranking, prize reserves and affiliate commissions." : "The deployed address and its blockchain snapshot are recorded. Current bytecode and collection terms are checked before any wallet mint."
                : "This collection is not deployed yet, so there is no explorer-verified address to inspect."}
            </p>
          </details>
          <details>
            <summary>
              Is this a real NFT mint?<span aria-hidden="true">+</span>
            </summary>
            <p>
              {isDemo
                ? "This is a functional demo using the collection’s server-provided settings. Your sample tickets stay in this browser tab, separated by collection. No wallet is connected, no money moves, and no blockchain transaction is sent. Real minting will require a deployed contract."
                : <>This collection is deployed on {collection.networkName}. {progress.detail} When minting is open and the current contract checks pass, connect your wallet and confirm the ticket price plus the network fee. Your wallet receives the NFT after the transaction confirms.</>}
            </p>
          </details>
        </div>
      </section>
    </>
  );
}
