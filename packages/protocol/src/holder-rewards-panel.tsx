"use client";
import { formatEther } from "ethers";
import { Button, textActionClassName } from "@manekineko/ui/button";
import { Field, Input } from "@manekineko/ui/forms";
import { Disclosure } from "@manekineko/ui/components";
import type { Snapshot } from "./chain";

export function HolderRewardsPanel({
  state,
  token,
  onToken,
  onClaim,
  disabled,
  busy,
  connected,
  explorer,
}: {
  state: Snapshot;
  token: string;
  onToken: (value: string) => void;
  onClaim: () => void;
  disabled: boolean;
  busy: boolean;
  connected: boolean;
  explorer: (address: string) => string;
}) {
  const h = state.holders;
  if (!h)
    return (
      <section className="public-empty">
        <h2>No holder pool in this deployment.</h2>
        <p>
          This collection does not include a season holder pool. Check its
          prize and affiliate rewards under the collection’s own terms.
        </p>
      </section>
    );
  const left = h.claimLimit - h.claims;
  const empty = h.unlocked && h.claimLimit === 0n;
  const exhausted = h.unlocked && !empty && left === 0n;
  const available = h.unlocked && left > 0n;
  return (
    <div className="holder-rewards">
      <section className="holder-pool" aria-label="Season holder pool">
        <div className="holder-pool-heading">
          <h2>{state.round?.season}</h2>
          <span className="holder-state">
            {!h.unlocked
              ? "Locked until season end"
              : empty
              ? "No eligible NFTs"
              : exhausted
              ? "Fully claimed"
              : "Claims open"}
          </span>
        </div>
        <p className="protocol-note">
          10% of this season’s actual mint revenue from successful draws accumulates here.
        </p>
        <p className="holder-total">
          <strong>{formatEther(h.funded)}</strong> <span>ETH accumulated</span>
        </p>
        <div className="holder-progress-label">
          <span>Season progress</span>
          <span>
            {String(h.settledCollections)} / {String(h.collections)} collections
            settled
          </span>
        </div>
        <progress
          className="holder-progress"
          aria-label="Season progress"
          value={Number(h.settledCollections)}
          max={Number(h.collections) || 1}
        />
        <p className="protocol-note">
          {!h.unlocked
            ? "Unlocks when every collection in this season has completed its draw or become refundable. Pending prize claims do not delay the unlock."
            : "This season has ended. Its reward amount and claim limit are final."}
        </p>
        <dl className="holder-stats">
          <div>
            <dt>
              {h.unlocked ? "ETH per NFT claim" : "Estimated ETH per claim"}
            </dt>
            <dd>{h.rewardPerNft ? formatEther(h.rewardPerNft) : "—"}</dd>
          </div>
          <div>
            <dt>{h.unlocked ? "Claims remaining" : "Claim slots so far"}</dt>
            <dd>
              {String(h.unlocked ? left : h.claimLimit)}
              {h.unlocked && <span> / {String(h.claimLimit)}</span>}
            </dd>
          </div>
          <div>
            <dt>Eligible NFTs</dt>
            <dd>{h.eligibleNfts.toLocaleString("en-US")}</dd>
          </div>
        </dl>
        {!h.unlocked && (
          <p className="protocol-note">
            Estimates can change as more collections settle. No claim is
            available or reserved yet.
          </p>
        )}
        {h.unlocked && (
          <p className="protocol-note">
            {formatEther(left * h.rewardPerNft)} ETH available for remaining
            claims · {formatEther(h.paid)} ETH paid.
          </p>
        )}
        <a
          className={textActionClassName()}
          href={explorer(h.address)}
          target="_blank"
          rel="noreferrer"
        >
          View holder pool contract ↗
        </a>
      </section>
      <section className="protocol-panel holder-claim">
        <h2>
          {empty
            ? "No successful draws this season."
            : exhausted
            ? "All claim slots have been taken."
            : "Claim with your NFT."}
        </h2>
        <p>
          {empty
            ? "Refundable NFTs retain their full mint-price refund in the original collection. They do not contribute to this pool."
            : "The first 5% of eligible NFTs to claim receive an equal share. Winning NFTs qualify too. Each NFT can claim once, through its current owner."}
        </p>
        {!empty && !exhausted && (
          <>
            <Field
              label="NFT token ID"
              hint={`Use an NFT you own from ${state.round?.name}. Choose a different collection above if needed.`}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => onToken(e.target.value)}
                />
              )}
            </Field>
            <Button
              busy={busy}
              busyLabel="Reviewing claim"
              disabled={disabled || !available || !/^[1-9][0-9]*$/.test(token)}
              onClick={onClaim}
            >
              {!h.unlocked ? "Claims locked" : "Review holder claim"}
            </Button>
            {!connected && (
              <p className="protocol-note">
                Connect your wallet above to claim. Ownership and previous
                claims are checked before review.
              </p>
            )}
          </>
        )}
        <p className="protocol-note">
          Onchain execution order determines who receives the available rewards.
          A pending transaction does not reserve a slot. Owning an eligible NFT
          does not guarantee a payout.
        </p>
      </section>
      <Disclosure title="Eligibility, transfers & the 5% limit">
        <p>
          Only NFTs minted in successfully drawn collections in this season
          qualify. The claim limit is 5% of their total number, rounded down.
          The pool is divided equally across those slots, rounded down to whole
          wei.
        </p>
        <p>
          Voting selects each collection’s price and supply. Those terms and
          actual successful mints determine the season pool, eligible NFT count
          and ETH per claim. The percentages are fixed; the ETH amounts vary
          by season. Once the season ends, every successful claim receives the
          same final amount, regardless of that NFT’s mint price.
        </p>
        <p>
          There is no per-wallet limit. Transferring an NFT transfers its
          unclaimed opportunity, but never resets a completed claim. These
          rewards are separate from winning-ticket prizes and affiliate
          earnings.
        </p>
        <p>
          There is no claim deadline. Rewards stay available until every slot is
          taken. The operator cannot withdraw the holder pool; any rounding dust
          stays in the contract.
        </p>
      </Disclosure>
    </div>
  );
}
