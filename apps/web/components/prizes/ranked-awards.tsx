"use client";
import { Icon } from "@manekineko/ui/icons";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CollectionPublic } from "../../lib/collections/model";
import type { AffiliateProgram } from "../../lib/affiliates/types";
import { shortWallet, walletError, type ContractTarget } from "../../lib/affiliates/wallet";
import { formatWei } from "../../lib/mint/format";
import { prizeOperationKey } from "../../lib/prizes/operation";
import { WalletAccountPicker } from "../affiliates/wallet-account-picker";
import { WalletOpenAction } from "../affiliates/wallet-open-action";
import { useWalletSession } from "../affiliates/use-wallet-session";
import { usePrizeClaims } from "./use-prize-claims";

/** Holder signatures stay bound to the account and provider explicitly displayed here. */
export function RankedAwards({ collection, claim = false }: { collection: CollectionPublic; claim?: boolean }) {
  const wallet = useWalletSession(), claims = usePrizeClaims();
  const [recoveryHash, setRecoveryHash] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  useEffect(() => {
    if (!collection.contractAddress) return;
    try { claims.restore(collection.id, { chainId: collection.chainId, contractAddress: collection.contractAddress }, collection.observation?.blockNumber); }
    catch (error) { setRecoveryError(walletError(error)); }
    // Restoring a durable intent must not request a wallet or submit a transaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.id, collection.chainId, collection.contractAddress, collection.observation?.blockNumber]);
  if (!["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(collection.contractVersion) || !collection.awards?.length) return null;
  async function target(): Promise<ContractTarget> {
    const response = await fetch(`/api/collections/${collection.id}/affiliates`, { cache: "no-store" });
    if (!response.ok) throw new Error("The collection deployment could not be verified. Try again shortly.");
    const { program } = await response.json() as { program: AffiliateProgram };
    if (program.contractVersion !== collection.contractVersion || program.chainId !== collection.chainId || !program.contractAddress || program.contractAddress.toLowerCase() !== collection.contractAddress?.toLowerCase() || !program.runtimeCodeHash) throw new Error("Collection verification is unavailable. Refresh before claiming.");
    return { chainId: program.chainId, contractAddress: program.contractAddress, contractVersion: program.contractVersion, runtimeCodeHash: program.runtimeCodeHash,
      mintPriceWei: program.mintPriceWei, maxSupply: program.maxSupply, maxAffiliateSlots: program.maxSlots, prizeBps: program.prizeBps, winnerCount: program.winnerCount, secondPrizeBps: program.secondPrizeBps,
      minAffiliateReferrals: program.minAffiliateReferrals, affiliatePayoutCapBps: program.affiliatePayoutCapBps, affiliatePoolBps: program.affiliatePoolBps, affiliateRatesBps: [] };
  }
  const allPaid = collection.awards.every(award => award.claimed || !!claims.paid[prizeOperationKey(collection.id, award.rank)]);
  return <section id="prizes" className="ranked-awards" aria-label="Ranked collection prizes">
    <h3>Winning tickets</h3><p>{allPaid ? "All prizes paid. Results and payment receipts remain available below." : "The draw is finalized. Each prize is reserved until its winning NFT holder claims it. One wallet may hold several winning tickets."}</p>
    {claim && !allPaid && <div>
      {wallet.session && <p>{wallet.session.providerName ?? "Connected wallet"} · <code title={wallet.session.address}>{shortWallet(wallet.session.address)}</code> · {collection.chainId === 1 ? "Ethereum Mainnet" : "Sepolia testnet"}</p>}
      <button type="button" className="secondary-button" disabled={claims.busy} onClick={() => wallet.openPicker(collection.chainId)}>{wallet.session ? "Switch wallet or account" : "Connect wallet"}</button>
      {wallet.pickerChain !== null && <WalletAccountPicker chainId={wallet.pickerChain} onConnected={wallet.connect} onCancel={wallet.closePicker} purpose="prize claims" />}
      {wallet.notice && <p role="status">{wallet.notice}</p>}
    </div>}
    <div className="ranked-awards-grid">{collection.awards.map(award => {
      const key = prizeOperationKey(collection.id, award.rank), operation = claims.operation?.key === key ? claims.operation : null;
      const payment = award.claimTransaction || claims.paid[key], paid = award.claimed || !!payment;
      return <div key={award.rank}>
        <strong>Prize #{award.rank} · {formatWei(award.amountWei)} ETH</strong>
        <p><Link href={`/nfts/${collection.id}/${award.tokenId}`}>Ticket #{award.tokenId}</Link> · Score {award.score}</p>
        <p>{award.numbers.join(" / ")} · {paid ? "Paid" : "Available to its holder"}</p>
        {payment && <a href={`${collection.explorerUrl}/tx/${payment}`} target="_blank" rel="noreferrer">View prize payment <Icon name="diagonal" /></a>}
        {claim && !paid && <button type="button" className="primary-button" disabled={claims.busy || !!recoveryError} onClick={() => {
          if (!wallet.session) { wallet.openPicker(collection.chainId); return; }
          void claims.claim({ ...award, collectionId: collection.id }, wallet.session, target, recoveryHash);
        }}>{claims.busy && operation ? operation.phase === "wallet" ? "Confirm in your wallet" : operation.phase === "pending" ? "Checking receipt…" : "Checking this ticket…" : operation?.journal ? `Check prize #${award.rank} receipt` : wallet.session ? `Claim prize #${award.rank}` : `Connect to claim prize #${award.rank}`}</button>}
        {operation && <div role="status" aria-live="polite"><p>{operation.message}</p>{operation.phase==="wallet"&&<WalletOpenAction provider={wallet.session?.injected}/> }{operation.phase === "error" && !paid && <button type="button" className="text-button" disabled={claims.busy} onClick={() => wallet.openPicker(collection.chainId)}>Switch wallets</button>}
          {operation.journal && <div className="mint-recovery">
            <p>Original account: <code>{operation.journal.wallet}</code></p>
            {operation.hash && <a href={`${collection.explorerUrl}/tx/${operation.hash}`} target="_blank" rel="noreferrer">View submitted transaction</a>}
            {!operation.hash && <><label htmlFor={`prize-recovery-${collection.id}`}>Transaction hash from your wallet</label><input id={`prize-recovery-${collection.id}`} value={recoveryHash} onChange={event => setRecoveryHash(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} disabled={claims.busy} /><p>Recovery verifies the original account, prize, recipient, network and nonce. It never submits another transaction.</p></>}
          </div>}
        </div>}
      </div>;
    })}</div>
    {recoveryError && <p role="alert">{recoveryError}</p>}
  </section>;
}
