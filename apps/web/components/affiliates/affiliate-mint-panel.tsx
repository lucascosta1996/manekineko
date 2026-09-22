"use client";

import Link from "next/link";
import { WinnerCreditMint } from "../winner-credits/winner-credit-mint";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CollectionPublic } from "../../lib/collections/types";
import type { AffiliateProgram, AffiliateReferral } from "../../lib/affiliates/types";
import { checkTransaction, connectWallet, invalidateWallet, parseReferralQuery, readTransaction, recoverTransaction, shortWallet, submitTransaction, verifiedRound, walletError, type ContractTarget, type ReferralQuery, type TransactionJournal, type WalletSession } from "../../lib/affiliates/wallet";
import { formatWei } from "../../lib/mint/format";
import { formatBasisPoints } from "./program-terms";
import { affiliateEnrollmentCopy } from "./enrollment-copy";
import { collectionProgress } from "../../lib/collections/presentation";
import { mintAvailabilityRevision } from "../../lib/live-data/responses";
import { scheduledMintRecheckDelay } from "../../lib/affiliates/scheduled-mint";
import { AffiliateWindow } from "../collection-activity";

export function AffiliateMintPanel({ collection, referralQuery, onReferralBlocked, onLiveContractVerified, children }: { collection: CollectionPublic; referralQuery: ReferralQuery; onReferralBlocked: (blocked: boolean) => void; onLiveContractVerified: (verified: boolean) => void; children: ReactNode }) {
  const [program, setProgram] = useState<AffiliateProgram | null>(null);
  const [referral, setReferral] = useState<AffiliateReferral | null>(null);
  const [referralError, setReferralError] = useState("");
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [journal, setJournal] = useState<TransactionJournal | null>(null);
  const [recoveryHash, setRecoveryHash] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [allowance, setAllowance] = useState<{ wallet: string; contract: string; remaining: number } | null>(null);
  const [allowanceError, setAllowanceError] = useState("");
  const inFlight = useRef(false);
  const availabilityRevision = mintAvailabilityRevision(collection);
  const target = program?.mode === "live" && program.contractAddress ? { chainId: program.chainId, contractAddress: program.contractAddress, contractVersion: program.contractVersion, winnerCount: program.winnerCount, secondPrizeBps: program.secondPrizeBps, minAffiliateReferrals: program.minAffiliateReferrals, affiliatePayoutCapBps: program.affiliatePayoutCapBps, prizeBps: program.prizeBps, affiliatePoolBps: program.affiliatePoolBps, affiliateRatesBps: program.affiliateRatesBps, ...(referral ? { affiliateId: referral.affiliateId, commissionBps: referral.commissionBps } : {}), mintPriceWei: program.mintPriceWei, maxSupply: program.maxSupply, maxAffiliateSlots: program.maxSlots, runtimeCodeHash: program.runtimeCodeHash ?? undefined } satisfies ContractTarget : null;
  const hasReferral = referralQuery.affiliate !== undefined || referralQuery.collection !== undefined;
  const live = program?.mode === "live" && !!program.contractAddress;
  const remaining = program ? program.maxSupply - program.totalMinted : 0;
  const capped = (program?.contractVersion === "affiliate-v9" || program?.contractVersion === "affiliate-v10");
  const walletRemaining = wallet && allowance?.wallet === wallet.address && allowance.contract === program?.contractAddress ? allowance.remaining : null;
  const maxQuantity = Math.min(collection.maxMintBatch, 20, remaining, capped && wallet ? walletRemaining ?? 0 : 20);
  const validQuantity = Number.isSafeInteger(quantity) && quantity > 0 && quantity <= maxQuantity;
  const total = BigInt(program?.mintPriceWei ?? collection.mintPriceWei) * BigInt(validQuantity ? quantity : 0);
  const selfReferral = !!wallet && !!referral && wallet.address.toLowerCase() === referral.affiliateWallet.toLowerCase();
  const progress = collectionProgress(collection);
  const scheduled = !!program?.saleStartAt && !program.readiness.canMint && !program.soldOut && !program.refundable && !!program.saleActivated;
  const mintClosedLabel = program?.refundable ? "Refunds available" : program?.prizePaid ? "Prize paid" : program?.soldOut ? "Collection sold out" : program && !program.saleActivated ? "Awaiting activation" : scheduled ? "Awaiting scheduled opening" : "Minting unavailable";
  const mintClosedReason = program && !program.saleActivated && !program.refundable
    ? "The collection is deployed. Ticket sales have not opened yet."
    : scheduled ? `Ticket sales open at ${program!.saleStartAt}. Availability updates after the chain reaches this time.` : program?.readiness.reason || "Minting is not available for this collection.";

  useEffect(() => {
    const delay = scheduledMintRecheckDelay(program);
    if (delay === null) return;
    const timer = setTimeout(() => setRefresh(value => value + 1), delay);
    return () => clearTimeout(timer);
  }, [program, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    // Keep the form mounted so background updates preserve quantity and transaction recovery.
    setLoading(true); setReferralError("");
    void (async () => {
      try {
        const parsed = parseReferralQuery(referralQuery, collection.mode === "demo" && collection.contractStatus === "undeployed" && collection.contractAddress === null);
        const base = `/api/collections/${collection.id}/affiliates`;
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]);
        const programRequest = fetch(base, { cache: "no-store", signal });
        const referralRequest = parsed ? fetch(`${base}/resolve?${new URLSearchParams({ affiliate: String(parsed.affiliate), collection: parsed.collection })}`, { cache: "no-store", signal }) : null;
        const [programResponse, referralResponse] = await Promise.all([programRequest, referralRequest]);
        if (controller.signal.aborted) return;
        if (programResponse.ok) setProgram((await programResponse.json()).program as AffiliateProgram);
        else if (collection.mode === "live" || parsed) throw new Error("Current mint availability could not be verified. Refresh before minting.");
        if (referralResponse) {
          const data = await referralResponse.json();
          if (!referralResponse.ok) throw new Error(data.error || "This referral could not be verified. No mint will be sent with an unverified referral.");
          setReferral(data.referral as AffiliateReferral);
        }
      } catch (cause) { if (!controller.signal.aborted) setReferralError(walletError(cause)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
    // Referral query comes from server route props; a navigation remounts this collection view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.id, referralQuery.affiliate, referralQuery.collection, refresh, availabilityRevision]);
  useEffect(() => { onLiveContractVerified(!!live && !!program?.runtimeCodeHash); }, [live, program?.runtimeCodeHash, onLiveContractVerified]);
  useEffect(() => { onReferralBlocked(hasReferral && (loading || !!referralError || !referral)); }, [hasReferral, loading, referralError, referral, onReferralBlocked]);
  useEffect(() => {
    if (!program || program.mode !== "live" || !program.contractAddress) return;
    try { setJournal(readTransaction({ chainId: program.chainId, contractAddress: program.contractAddress }, "mint")); }
    catch (cause) { setMessage(walletError(cause)); setReferralError("The previous transaction record needs attention before minting."); }
  }, [program?.mode, program?.chainId, program?.contractAddress]);
  useEffect(() => {
    if (!wallet) return;
    const changed = () => { invalidateWallet(wallet); setWallet(null); setMessage("Your account or network changed. Reconnect before minting."); };
    wallet.injected.on?.("accountsChanged", changed); wallet.injected.on?.("chainChanged", changed);
    return () => { wallet.injected.removeListener?.("accountsChanged", changed); wallet.injected.removeListener?.("chainChanged", changed); };
  }, [wallet]);

  useEffect(() => {
    let active = true;
    setAllowance(null); setAllowanceError("");
    if (!wallet || !target || !capped) return;
    void (async () => {
      try {
        const contract = await verifiedRound(wallet, target);
        const left = Number(await contract.remainingMints(wallet.address));
        if (!Number.isInteger(left) || left < 0 || left > 20) throw new Error("The wallet mint allowance could not be verified.");
        if (active) { setAllowance({ wallet: wallet.address, contract: target.contractAddress, remaining: left }); setQuantity(value => left > 0 ? Math.min(Math.max(1, value), left) : 1); }
      } catch (error) { if (active) setAllowanceError(walletError(error)); }
    })();
    return () => { active = false; };
    // A confirmed mint or a refreshed chain snapshot must refresh the wallet allowance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, program, capped, refresh]);

  async function run(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try { await work(); } catch (cause) { setMessage(walletError(cause)); }
    finally { setBusy(false); inFlight.current = false; }
  }
  async function mint() {
    await run(async () => {
      if (!program?.readiness.canMint || !target || !wallet || !validQuantity || journal || loading || referralError || (hasReferral && !referral) || selfReferral) throw new Error("Check the collection, wallet and referral details before minting.");
      const contract = await verifiedRound(wallet, target);
      if (capped && BigInt(quantity) > await contract.remainingMints(wallet.address)) throw new Error("This collection allows 20 primary mints per wallet in total. Refresh your remaining allowance before minting.");
      if (referral) {
        if (referral.mode !== "live" || !referral.mintReady || referral.contractVersion !== target.contractVersion || referral.prizeBps !== target.prizeBps || referral.chainId !== target.chainId || referral.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase()) throw new Error("The referral is not valid for this live collection.");
        const beneficiary = await contract.affiliateWallet(referral.affiliateId) as string;
        if (beneficiary.toLowerCase() !== referral.affiliateWallet.toLowerCase()) throw new Error("The referral beneficiary does not match the contract.");
        if (beneficiary.toLowerCase() === wallet.address.toLowerCase()) throw new Error("You cannot refer your own wallet. Open the collection without a referral to buy directly.");
      }
      const request = referral ? await contract.mintWithAffiliate.populateTransaction(wallet.address, quantity, referral.affiliateId, { value: total }) : await contract.mint.populateTransaction(wallet.address, quantity, { value: total });
      await submitTransaction(wallet, target, "mint", request, setJournal);
      setJournal(null); setMessage(`${quantity === 1 ? "Your ticket was" : "Your tickets were"} minted on-chain. Your wallet holds the NFT${quantity === 1 ? "" : "s"}.`); setRefresh((value) => value + 1);
    });
    if (target) { try { setJournal(readTransaction(target, "mint")); } catch (cause) { setMessage(walletError(cause)); } }
  }
  async function reconcile() {
    await run(async () => {
      if (!wallet || !target || !journal) throw new Error("Connect the wallet used for this transaction.");
      const status = recoveryHash.trim() ? await recoverTransaction(wallet, target, journal, recoveryHash.trim(), setJournal) : await checkTransaction(wallet, target, journal);
      if (status === "confirmed" || status === "reverted") { setJournal(null); setRecoveryHash(""); setRefresh((value) => value + 1); }
      setMessage(status === "confirmed" ? "The mint is confirmed. The collection supply has been refreshed." : status === "reverted" ? "The mint reverted. No NFT was issued by that transaction." : status === "pending" ? "The transaction is still pending. A second mint will not be sent." : "The wallet did not return a transaction hash. Paste it from your wallet activity below to verify the original payment. Another mint stays blocked until it is resolved.");
    });
  }
  return <>
    {program?.mode === "live" && !program.saleActivated && !program.soldOut && !program.refundable && <AffiliateWindow program={program} canLink />}
    {hasReferral && <div className={`mint-referral-note ${referralError ? "mint-referral-error" : ""}`} role="status" aria-live="polite">
      {loading ? <p>Verifying this collection’s referral…</p> : referralError ? <><strong>We could not verify this referral.</strong><p>{referralError}</p><Link className="text-link" href={`/mint/${collection.id}`}>Open collection without a referral →</Link></> : referral && <><strong>{referral.mode === "demo" ? "Example referral" : "Verified affiliate"} · Position #{referral.affiliateId}</strong><p>{(["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(referral.contractVersion ?? "")) ? <>This purchase counts toward <span title={referral.affiliateWallet}>{shortWallet(referral.affiliateWallet)}</span>’s referral minimum. Only qualifying affiliates share equally at sellout, subject to the published payout cap.</> : (referral.contractVersion === "affiliate-v5" || referral.contractVersion === "affiliate-v6") ? <>This purchase counts toward <span title={referral.affiliateWallet}>{shortWallet(referral.affiliateWallet)}</span>’s share of the collection affiliate pool. Their payout depends on all referred sales and becomes final at sellout.</> : <>{formatBasisPoints(referral.commissionBps)} of your ticket price goes to <span title={referral.affiliateWallet}>{shortWallet(referral.affiliateWallet)}</span>.</>} This is included in the price and does not reduce the collection’s configured prize.</p><code>{referral.affiliateWallet}</code>{referral.mode === "demo" && <p>This is a demo link. No payment or affiliate commission is generated.</p>}{selfReferral && <p>You cannot refer your own registered wallet. <Link className="text-link" href={`/mint/${collection.id}`}>Buy without a referral →</Link></p>}</>}
    </div>}
    {live ? <form className="mint-form" onSubmit={(event) => { event.preventDefault(); void mint(); }}>
      <div className="quantity-row"><label htmlFor="live-ticket-quantity">Your tickets<span>{capped ? "20 per wallet in total" : `Up to ${collection.maxMintBatch} per mint`} · {Math.max(0, remaining)} remaining</span></label><div className="quantity-control"><button type="button" aria-label="Decrease ticket quantity" disabled={busy || quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><input id="live-ticket-quantity" type="number" inputMode="numeric" min={1} max={Math.max(1, maxQuantity)} step={1} value={Number.isFinite(quantity) ? quantity : ""} onChange={(event) => setQuantity(event.target.value === "" ? 0 : Number(event.target.value))} disabled={busy || remaining <= 0} /><button type="button" aria-label="Increase ticket quantity" disabled={busy || quantity >= maxQuantity} onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}>+</button></div></div>
      <div className="total-row"><span>Mint total</span><strong>{formatWei(total)} ETH</strong></div>
      {capped && <p>Paid, referral and sponsored tickets share the same allowance. Transferring NFTs does not reset it.{wallet && <> {allowanceError || (walletRemaining === null ? "Checking your allowance…" : `${walletRemaining} of 20 mints remaining for this wallet.`)} <button type="button" className="text-link" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh allowance</button></>}</p>}
      {referral && <div className="mint-referral-total"><span>{(referral.contractVersion === "affiliate-v5" || (referral.contractVersion === "affiliate-v6" || referral.contractVersion === "affiliate-v7" || (referral.contractVersion === "affiliate-v8" || referral.contractVersion === "affiliate-v9" || referral.contractVersion === "affiliate-v10"))) ? "Included pool contribution" : "Included affiliate allocation"}</span><strong>{formatWei((total * BigInt(referral.commissionBps)) / 10_000n)} ETH</strong></div>}
      {wallet && <p className="mint-wallet-label">Minting to <strong title={wallet.address}>{shortWallet(wallet.address)}</strong> · {collection.networkName}</p>}
      {!wallet ? <button type="button" className="primary-button mint-button" disabled={busy || loading || !!referralError || !program.readiness.canMint} onClick={() => void run(async () => setWallet(await connectWallet(program.chainId)))}><span>{busy ? "Connecting…" : !program.readiness.canMint ? mintClosedLabel : "Connect wallet to mint"}</span><span aria-hidden="true">↗</span></button> : <button className="primary-button mint-button" type="submit" disabled={busy || loading || !validQuantity || !program.readiness.canMint || !!journal || !!referralError || selfReferral || (hasReferral && !referral)}><span>{busy ? "Check your wallet…" : !program.readiness.canMint ? mintClosedLabel : remaining <= 0 ? "Collection sold out" : capped && walletRemaining === 0 ? "Wallet mint limit reached" : !validQuantity ? "Choose a valid ticket quantity" : `Mint ${quantity === 1 ? "ticket" : `${quantity} tickets`}`}</span><span aria-hidden="true">↗</span></button>}
      <p className="transaction-note">{program.readiness.canMint ? "Ethereum transaction · network fee is additional." : mintClosedReason}</p>
      {referralError && <div className="mint-referral-note" role="alert">{!hasReferral && <p>{referralError}</p>}<button type="button" className="text-button" disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}>Check availability again</button></div>}
      {journal && <div className="mint-referral-note"><strong>Check the previous mint before continuing.</strong><p>{journal.hash || "The wallet submission result is unknown. Check your wallet activity."}</p>{journal.hash && <a className="text-link" target="_blank" rel="noreferrer" href={`${program.chainId === 1 ? "https://etherscan.io" : "https://sepolia.etherscan.io"}/tx/${journal.hash}`}>View transaction ↗</a>}<div className="mint-recovery"><label htmlFor="mint-recovery-hash">Transaction hash from your wallet</label><input id="mint-recovery-hash" value={recoveryHash} onChange={(event) => setRecoveryHash(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} disabled={busy} /><p>The wallet, collection, action, amount and nonce must match the original mint.</p></div><button type="button" className="text-button" onClick={() => void reconcile()} disabled={busy || !wallet}>Check receipt</button></div>}
      <div className="mint-feedback" role="status" aria-live="polite">{message && <p>{message}</p>}</div>
    </form> : collection.mode === "live" ? <div className="mint-form">
      <button className="primary-button mint-button" type="button" disabled><span>{collection.phase === "pending_activation" ? progress.label : loading ? "Checking mint availability…" : "Minting unavailable"}</span></button>
      <p className="transaction-note">{progress.detail}</p>
      <div className="mint-feedback" role="status" aria-live="polite"><p>{loading ? "Checking the current contract state…" : referralError || "Current mint availability is unavailable."}</p></div>
      {!loading && <button type="button" className="text-button" onClick={() => setRefresh((value) => value + 1)}>Check availability again</button>}
    </div> : children}
    {live && <WinnerCreditMint collectionId={collection.id} wallet={wallet} onMinted={() => setRefresh((value) => value + 1)} />}
    <Link href={`/mint/${collection.id}/affiliates`} className="mint-affiliate-entry"><span className="mint-affiliate-icon" aria-hidden="true">✳</span><span><strong>Explore the affiliate program.</strong><small>{affiliateEnrollmentCopy(program?.contractVersion ?? collection.contractVersion, program?.enrollmentEligibility?.policy).teaser}</small></span><span aria-hidden="true">↗</span></Link>
  </>;
}
