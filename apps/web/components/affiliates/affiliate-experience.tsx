"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionPublic } from "../../lib/collections/types";
import { DEMO_SCENARIOS, type AffiliateChallenge, type AffiliatePermit, type AffiliateProgram, type AffiliateStatus, type DemoScenario, type AffiliateNftSelection } from "../../lib/affiliates/types";
import { assertWallet, checkTransaction, invalidateWallet, readTransaction, recoverTransaction, shortWallet, submitTransaction, transactionKey, verifiedRound, walletError, type ContractTarget, type TransactionJournal, type WalletSession } from "../../lib/affiliates/wallet";
import { formatCount, formatWei, roundLabel } from "../../lib/mint/format";
import { TurnstileCheck } from "./turnstile-check";
import { contrastTextColor } from "@manekineko/contract-abi/season-appearance";
import { formatBasisPoints } from "./program-terms";
import { affiliateAccountView, createWalletViewScope } from "./wallet-view";
import { collectionResponse, mintAvailabilityRevision } from "../../lib/live-data/responses";
import { useLiveData } from "../use-live-data";
import { LiveDataNotice } from "../live-data-notice";
import { ZeroAddress } from "ethers";
import { verifyEnrollmentNft } from "../../lib/affiliates/eligibility-wallet";
import { WalletAccountPicker } from "./wallet-account-picker";
import { affiliateEnrollmentCopy } from "./enrollment-copy";
import { AffiliateEnrollmentRules } from "./enrollment-rules";
import { AffiliateWindow, useProtocolClock } from "../collection-activity";
import { enrollmentWindowClosed } from "../../lib/affiliates/enrollment-window";

const states: Record<AffiliateStatus, { label: string; title: string; description: string; step: number }> = {
  unregistered: { label: "Not enrolled", title: "Start with your collection link.", description: "Enroll with your wallet to receive a position and a referral link for this collection. Registration uses automated checks, with no manual selection.", step: 0 },
  no_commission: { label: "Referrals recorded", title: "Your link is working. No commission is due.", description: "Successful purchases used your link, but this position’s configured commission rate is zero. Your referred tickets are recorded without generating an unpaid balance.", step: 3 },
  no_referrals: { label: "Ready to share", title: "Your link is ready. Your first referral is next.", description: "No successful NFT purchases have used your link yet, so no commission has accrued. A click alone does not generate earnings.", step: 1 },
  pending_sellout: { label: "Pending sellout", title: "Your referrals are adding up.", description: "Purchases through your link have earned pending commission. It becomes available to withdraw when this collection sells out.", step: 2 },
  claimable: { label: "Available to withdraw", title: "The collection sold out. Your earnings are ready.", description: "Withdraw your available commission to your wallet or another receiving address. You do not need to wait for prize payments to winners.", step: 3 },
  paid: { label: "Paid", title: "Your commission is paid.", description: "Your accrued commission has been withdrawn. The payment stays recorded for this collection, even after the next collection opens.", step: 4 },
  refunded: { label: "Refund period", title: "This collection closed before sellout.", description: "Pending commission was cancelled so NFT holders can receive their full mint-price refunds. There is no affiliate payment due for this collection.", step: 2 },
};
const scenarioLabels: Record<DemoScenario, string> = { no_commission: "No commission", no_referrals: "No referrals", pending_sellout: "Pending sellout", claimable: "Claimable", paid: "Paid", refunded: "Refund period" };
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(25_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The affiliate service could not complete your request.");
  return result as T;
}
function targetFor(program: AffiliateProgram): ContractTarget {
  if (program.mode !== "live" || !program.contractAddress) throw new Error("This is an illustrative program. No wallet transactions are enabled.");
  return { chainId: program.chainId, contractAddress: program.contractAddress, contractVersion: program.contractVersion, winnerCount: program.winnerCount, secondPrizeBps: program.secondPrizeBps, minAffiliateReferrals: program.minAffiliateReferrals, affiliatePayoutCapBps: program.affiliatePayoutCapBps, prizeBps: program.prizeBps, affiliatePoolBps: program.affiliatePoolBps, affiliateRatesBps: program.affiliateRatesBps, affiliateId: program.account?.affiliateId ?? program.enrollmentOffer?.affiliateId, commissionBps: program.account?.affiliateId ? program.account.commissionBps : program.enrollmentOffer?.commissionBps, mintPriceWei: program.mintPriceWei, maxSupply: program.maxSupply, maxAffiliateSlots: program.maxSlots, runtimeCodeHash: program.runtimeCodeHash ?? undefined };
}

export function AffiliateExperience({ collection: initialCollection }: { collection: CollectionPublic }) {
  const { data: collection, retrying } = useLiveData(initialCollection.mode === "live" ? `/api/collections/${initialCollection.id}` : null, initialCollection, collectionResponse);
  const availabilityRevision = mintAvailabilityRevision(collection);
  const displayedRevision = useRef(availabilityRevision);
  const endpoint = `/api/collections/${collection.id}/affiliates`;
  const [programSnapshot, setProgram] = useState<AffiliateProgram | null>(null);
  const clock = useProtocolClock();
  const program: AffiliateProgram | null = programSnapshot && clock !== null && programSnapshot.mode === "live" && enrollmentWindowClosed(programSnapshot.contractVersion, programSnapshot.saleStartAt, clock / 1000)
    ? { ...programSnapshot, enrollmentStatus: "closed", enrollmentOffer: null, readiness: { ...programSnapshot.readiness, canEnroll: false } } : programSnapshot;
  const [scenario, setScenario] = useState<DemoScenario>("no_referrals");
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [choosingAccount, setChoosingAccount] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [eligibilityPage, setEligibilityPage] = useState(1);
  const [selectedNft, setSelectedNft] = useState("");
  const [auth, setAuth] = useState<{ challenge: AffiliateChallenge; signature: string; offer: { affiliateId: number; commissionBps: number } | null; eligibility: AffiliateNftSelection | null } | null>(null);
  const [token, setToken] = useState("");
  const [recipient, setRecipient] = useState("");
  const [journal, setJournal] = useState<TransactionJournal | null>(null);
  const [recoveryHash, setRecoveryHash] = useState("");
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);
  const walletView = useRef(createWalletViewScope());

  const refresh = useCallback(async () => {
    const requestView = walletView.current.begin();
    setLoading(true); setError("");
    const query = new URLSearchParams();
    if (collection.mode === "demo") query.set("demoScenario", scenario);
    if (requestView.wallet) query.set("wallet", requestView.wallet);
    query.set("eligibilityPage",String(eligibilityPage));
    try {
      const { program: next } = await api<{ program: AffiliateProgram }>(`${endpoint}?${query}`);
      if (!requestView.isCurrent()) return;
      setProgram(next);
      if (next.mode === "live" && next.contractAddress) {
        const target = targetFor(next);
        setJournal(readTransaction(target, "enroll") || readTransaction(target, "claim"));
      }
    } catch (cause) { if (requestView.isCurrent()) setError(walletError(cause)); }
    finally { if (requestView.isCurrent()) setLoading(false); }
  }, [endpoint, wallet, scenario, collection.mode, eligibilityPage]);
  useEffect(() => { setEligibilityPage(1); setSelectedNft(""); }, [wallet?.address]);
  useEffect(() => { void refresh(); return () => { walletView.current.invalidate(); }; }, [refresh]);
  useEffect(() => {
    if (busy || displayedRevision.current === availabilityRevision) return;
    displayedRevision.current = availabilityRevision;
    void refresh();
  }, [availabilityRevision, busy, refresh]);
  useEffect(() => {
    if (!wallet) return;
    const changed = () => {
      invalidateWallet(wallet);
      walletView.current.select(null); setWallet(null); setAuth(null); setToken(""); setRecipient(""); setCopied(false);
      setProgram((current) => current ? { ...current, account: null } : current);
      setMessage("Your wallet account or network changed. Connect again to continue with that account.");
    };
    wallet.injected.on?.("accountsChanged", changed); wallet.injected.on?.("chainChanged", changed);
    return () => { wallet.injected.removeListener?.("accountsChanged", changed); wallet.injected.removeListener?.("chainChanged", changed); };
  }, [wallet]);

  async function action(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try { await work(); } catch (cause) { setMessage(walletError(cause)); }
    finally { setBusy(false); inFlight.current = false; }
  }
  function connect() {
    if (inFlight.current) return;
    if (wallet) invalidateWallet(wallet);
    walletView.current.select(null); setWallet(null); setAuth(null); setToken(""); setRecipient(""); setCopied(false); setMessage("");
    setProgram((current) => current ? { ...current, account: null } : current);
    setChoosingAccount(true);
  }
  function accountSelected(next: WalletSession) {
    walletView.current.select(next.address); setWallet(next); setRecipient(next.address); setLoading(true); setChoosingAccount(false);
    setMessage(`Connected to ${shortWallet(next.address)}.`);
  }
  function enrollmentSelection(): AffiliateNftSelection | null {
    if (!program || (program?.contractVersion!=="affiliate-v6" && !["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(program?.contractVersion ?? "")))return null;
    const eligibility=program.enrollmentEligibility;
    if (!eligibility)throw new Error("The collection’s NFT eligibility could not be verified.");
    if (eligibility.policy==="bootstrap")return {sourceCollection:ZeroAddress,sourceTokenId:"0"};
    const token=eligibility.tokens.find(item=>`${item.sourceCollection}:${item.sourceTokenId}`===selectedNft&&item.eligible);
    if(!token)throw new Error("Choose a qualifying NFT that this wallet currently holds.");
    return {sourceCollection:token.sourceCollection,sourceTokenId:token.sourceTokenId};
  }
  async function prepareEnrollment() {
    await action(async () => {
      if (!program?.readiness.canEnroll || !wallet) throw new Error("Connect your wallet when enrollment is available.");
      const contract = await verifiedRound(wallet, targetFor(program));
      if (await contract.affiliateIdOf(wallet.address) !== 0n) { await refresh(); setMessage("This wallet is already enrolled. Its position is shown below."); return; }
      const offer = program.contractVersion !== "affiliate-v3" ? program.enrollmentOffer : null;
      if (program.contractVersion !== "affiliate-v3") {
        if (!offer) throw new Error("No affiliate position is currently offered. Refresh and review the available positions.");
        if (await contract.affiliateWallet(offer.affiliateId) !== "0x0000000000000000000000000000000000000000" || ((program.contractVersion === "affiliate-v5" || (program.contractVersion === "affiliate-v6" || program.contractVersion === "affiliate-v7" || (program.contractVersion === "affiliate-v8" || program.contractVersion === "affiliate-v9" || program.contractVersion === "affiliate-v10"))) ? await contract.affiliatePoolBps() : await contract.affiliateRateBps(offer.affiliateId)) !== BigInt(offer.commissionBps)) throw new Error("The offered position is no longer available. Refresh and review the next offer; your rate will not be changed automatically.");
      }
      const eligibility = enrollmentSelection();
      if (eligibility) await verifyEnrollmentNft(wallet,targetFor(program),program.enrollmentEligibility,eligibility);
      const { challenge } = await api<{ challenge: AffiliateChallenge }>(`${endpoint}/challenge`, { wallet: wallet.address, ...(offer ?? {}),...eligibility });
      const { domain, types, message: payload } = challenge.typedData;
      if (challenge.contractVersion !== program.contractVersion || domain.name !== "ManekinekoAffiliateAuthentication" || domain.version !== ((program.contractVersion === "affiliate-v6" || program.contractVersion === "affiliate-v7" || (program.contractVersion === "affiliate-v8" || program.contractVersion === "affiliate-v9" || program.contractVersion === "affiliate-v10")) ? "4" : program.contractVersion === "affiliate-v5" ? "3" : program.contractVersion === "affiliate-v4" ? "2" : "1") || domain.chainId !== program.chainId || domain.verifyingContract.toLowerCase() !== program.contractAddress?.toLowerCase() || payload.applicant.toLowerCase() !== wallet.address.toLowerCase() || payload.collectionId !== collection.id || payload.origin !== location.origin) throw new Error("The wallet authentication challenge does not match this collection.");
      if (offer && (challenge.affiliateId !== offer.affiliateId || challenge.commissionBps !== offer.commissionBps || String(payload.affiliateId) !== String(offer.affiliateId) || String((program.contractVersion === "affiliate-v5" || (program.contractVersion === "affiliate-v6" || program.contractVersion === "affiliate-v7" || (program.contractVersion === "affiliate-v8" || program.contractVersion === "affiliate-v9" || program.contractVersion === "affiliate-v10"))) ? payload.poolBps : payload.commissionBps) !== String(offer.commissionBps))) throw new Error("The offered position or rate changed. Refresh and review it before signing.");
      if (eligibility && (challenge.sourceCollection?.toLowerCase()!==eligibility.sourceCollection.toLowerCase() || challenge.sourceTokenId!==eligibility.sourceTokenId || payload.sourceCollection?.toLowerCase()!==eligibility.sourceCollection.toLowerCase() || payload.sourceTokenId!==eligibility.sourceTokenId)) throw new Error("The authentication challenge changed the qualifying NFT. Request a new challenge.");
      if (eligibility) await verifyEnrollmentNft(wallet,targetFor(program),program.enrollmentEligibility,eligibility);
      await assertWallet(wallet);
      const signature = await wallet.signer.signTypedData(domain, types, payload);
      await assertWallet(wallet);
      setAuth({ challenge, signature, offer, eligibility }); setToken(""); setMessage("Wallet ownership verified. Complete the automated check to enroll.");
    });
  }
  async function enroll() {
    await action(async () => {
      if (!program?.readiness.canEnroll || !wallet || !auth || !token) throw new Error("Complete the wallet and automated checks first.");
      const target = { ...targetFor(program), ...(auth.offer ? { affiliateId: auth.offer.affiliateId, commissionBps: auth.offer.commissionBps } : {}) };
      const contract = await verifiedRound(wallet, target);
      if (auth.offer && await contract.affiliateWallet(auth.offer.affiliateId) !== "0x0000000000000000000000000000000000000000") { setAuth(null); setToken(""); throw new Error("This position was filled before enrollment. Refresh and review the next offer; no different position will be selected automatically."); }
      if (!program.enrollmentSigner || (await contract.enrollmentSigner()).toLowerCase() !== program.enrollmentSigner.toLowerCase()) throw new Error("The enrollment verifier does not match the collection configuration.");
      if (auth.eligibility) await verifyEnrollmentNft(wallet,target,program.enrollmentEligibility,auth.eligibility);
      let permit: AffiliatePermit;
      try {
        ({ permit } = await api<{ permit: AffiliatePermit }>(`${endpoint}/permit`, { challengeId: auth.challenge.challengeId, signature: auth.signature, turnstileToken: token }));
      } finally { setAuth(null); setToken(""); }
      if (permit.applicant.toLowerCase() !== wallet.address.toLowerCase() || permit.chainId !== target.chainId || permit.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase() || BigInt(permit.deadline) <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("The enrollment authorization is invalid or expired.");
      if (permit.contractVersion !== program.contractVersion || (auth.offer && (permit.affiliateId !== auth.offer.affiliateId || permit.commissionBps !== auth.offer.commissionBps))) throw new Error("The enrollment authorization does not match the position and rate you reviewed.");
      if (auth.eligibility && (permit.sourceCollection?.toLowerCase()!==auth.eligibility.sourceCollection.toLowerCase() || permit.sourceTokenId!==auth.eligibility.sourceTokenId)) throw new Error("The enrollment permit changed the qualifying NFT. No transaction was submitted.");
      if (auth.eligibility) await verifyEnrollmentNft(wallet,target,program.enrollmentEligibility,auth.eligibility);
      const request = (program.contractVersion === "affiliate-v6" || program.contractVersion === "affiliate-v7" || (program.contractVersion === "affiliate-v8" || program.contractVersion === "affiliate-v9" || program.contractVersion === "affiliate-v10"))
        ? await contract.enrollAffiliate.populateTransaction(permit.applicant,permit.affiliateId,permit.commissionBps,permit.sourceCollection,permit.sourceTokenId,permit.nonce,permit.deadline,permit.signature)
        : program.contractVersion !== "affiliate-v3"
        ? await contract.enrollAffiliate.populateTransaction(permit.applicant, permit.affiliateId, permit.commissionBps, permit.nonce, permit.deadline, permit.signature)
        : await contract.enrollAffiliate.populateTransaction(permit.applicant, permit.nonce, permit.deadline, permit.signature);
      await submitTransaction(wallet, target, "enroll", request, setJournal);
      setJournal(null); setMessage("Your affiliate position is registered on-chain. Your referral link is ready."); await refresh();
    });
    if (program?.mode === "live") { try { setJournal(readTransaction(targetFor(program), "enroll") || readTransaction(targetFor(program), "claim")); } catch (cause) { setMessage(walletError(cause)); } }
  }
  async function claim() {
    await action(async () => {
      if (!wallet || !program?.readiness.canClaim || !program.account || BigInt(program.account.claimableWei) <= 0n) throw new Error("There is no available commission to withdraw.");
      if (!/^0x[0-9a-f]{40}$/i.test(recipient) || /^0x0{40}$/i.test(recipient)) throw new Error("Enter a valid Ethereum receiving address.");
      const target = targetFor(program);
      const contract = await verifiedRound(wallet, target);
      const request = await contract.claimAffiliateCommission.populateTransaction(recipient);
      await submitTransaction(wallet, target, "claim", request, setJournal);
      setJournal(null); setMessage("Your affiliate commission was paid. The balance has been refreshed."); await refresh();
    });
    if (program?.mode === "live") { try { setJournal(readTransaction(targetFor(program), "claim") || readTransaction(targetFor(program), "enroll")); } catch (cause) { setMessage(walletError(cause)); } }
  }
  async function reconcile() {
    await action(async () => {
      if (!program || !journal || !wallet) throw new Error("Connect the wallet that submitted the transaction first.");
      const target = targetFor(program);
      let result = recoveryHash.trim() ? await recoverTransaction(wallet, target, journal, recoveryHash.trim(), setJournal) : await checkTransaction(wallet, target, journal);
      if (result === "unknown" && journal.action === "enroll") {
        const contract = await verifiedRound(wallet, target);
        if (await contract.affiliateIdOf(wallet.address) !== 0n) { sessionStorage.removeItem(transactionKey(target, "enroll")); result = "confirmed"; }
      }
      if (result === "confirmed" || result === "reverted") { setJournal(null); setRecoveryHash(""); await refresh(); }
      setMessage(result === "confirmed" ? "The transaction is confirmed. Your collection data has been refreshed." : result === "reverted" ? "The transaction reverted. No payment or enrollment was completed." : result === "pending" ? "The transaction has not confirmed yet. No duplicate transaction will be sent." : "The wallet did not return a transaction hash. Paste it from your wallet activity below to verify the original transaction. Another transaction stays blocked until it is resolved.");
    });
  }
  async function copyLink() {
    if (!program?.account?.referralUrl) return;
    try { await navigator.clipboard.writeText(new URL(program.account.referralUrl, location.origin).href); setCopied(true); }
    catch { setMessage("Copy the referral URL from the field below. Your browser did not allow clipboard access."); }
  }

  const demo = program?.mode === "demo";
  const accountView = affiliateAccountView(program?.account, wallet?.address ?? null, !!demo, loading, error);
  const account = accountView.account;
  const pool = (program?.contractVersion === "affiliate-v5" || (program?.contractVersion === "affiliate-v6" || (["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(program?.contractVersion ?? ""))));
  const equalPool = (["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(program?.contractVersion ?? ""));
  const holderProgram = ["affiliate-v6","affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(program?.contractVersion ?? collection.contractVersion);
  const equalTerms = `Qualify with at least ${program?.minAffiliateReferrals ?? "—"} paid referrals. Qualified affiliates share equally, capped at ${formatBasisPoints(program?.affiliatePayoutCapBps ?? 0)} of the lowest qualifying affiliate’s referred revenue. Unused positions receive nothing. Unallocated funds stay in the protocol growth reserve.`;
  const bootstrap = holderProgram && program?.enrollmentEligibility?.policy === "bootstrap";
  const enrollmentCopy = affiliateEnrollmentCopy(program?.contractVersion ?? collection.contractVersion, program?.enrollmentEligibility?.policy);
  const baseStatus = accountView.state === "disconnected" ? { label: "Wallet not connected", title: "See your affiliate position.", description: "Connect the wallet you enrolled with to see its referrals, payments and available commission.", step: 0 }
    : accountView.state === "loading" ? { label: "Checking wallet", title: "Reading your on-chain position.", description: "Checking this wallet’s enrollment, referrals and commission. No transaction is needed.", step: 0 }
    : accountView.state === "unavailable" ? { label: "Account unavailable", title: "Your balance could not be loaded.", description: "Refresh on-chain data to try again. Missing data does not mean you are unregistered or have a zero balance.", step: 0 }
    : account?.status === "unregistered" ? { ...states.unregistered, description: program?.enrollmentStatus === "closed" ? "This wallet did not enroll before the enrollment window closed. Owning a ticket does not create an affiliate position." : enrollmentCopy.summary } : states[account!.status];
  const status = equalPool && account?.affiliateId ? { ...baseStatus, description: account.qualified ? "You meet the referral minimum. Your equal share stays provisional until sellout; it can change as other affiliates qualify." : `You need ${account.referralsRemaining} more paid referrals to qualify for the equal split. Enrollment alone earns no commission.` } : pool && account?.status === "pending_sellout" ? { ...baseStatus, description: "Your estimate follows your share of all referred sales. It can rise or fall until sellout, when your final pool allocation becomes claimable." } : pool && account?.status === "no_commission" ? { ...baseStatus, description: "Your referred tickets are recorded. No payable pool share is available yet; final allocation is determined at sellout." } : baseStatus;
  const eth = (value: string | undefined) => accountView.state === "ready" ? formatWei(value ?? "0") : "—";
  const commissionBps = pool ? program?.affiliatePoolBps ?? undefined : account?.affiliateId ? account.commissionBps : program?.enrollmentOffer?.commissionBps;
  const referralShare = program?.totalReferredMints ? ((account?.referredMints ?? 0) * 100 / program.totalReferredMints).toFixed(2) : "0.00";
  const nftSelectionReady = (program?.contractVersion!=="affiliate-v6" && !["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(program?.contractVersion ?? "")) || program?.enrollmentEligibility?.policy==="bootstrap" || !!program?.enrollmentEligibility?.tokens.some(item=>item.eligible&&`${item.sourceCollection}:${item.sourceTokenId}`===selectedNft);
  const enrollmentRate = auth?.offer?.commissionBps ?? program?.enrollmentOffer?.commissionBps;
  const collectionColor = /^#[0-9a-f]{6}$/i.test(collection.collectionColor ?? "") ? collection.collectionColor! : "#F4F4F5";
  return <div className="affiliate-experience">
    <section className="affiliate-hero" aria-labelledby="affiliate-title">
      <div>
        <p className="eyebrow">TINCTA AFFILIATES</p>
        <h1 id="affiliate-title">Good color.<br /><span>Better shared.</span></h1>
        <p>Introduce someone to {collection.name}. Check your eligibility, share your link and follow your referral earnings on-chain.</p>
      </div>
      <Link href={`/mint/${collection.id}`} className="affiliate-share-card" aria-label={`View ${collection.name}`}>
        <div className="affiliate-color-field" style={{ backgroundColor: collectionColor, color: contrastTextColor(collectionColor) }}>
          <span>COLLECTION {roundLabel(collection.roundId)}</span>
          <svg viewBox="0 0 160 80" fill="none" aria-hidden="true"><rect x="18" y="22" width="72" height="36" rx="18" stroke="currentColor" /><rect x="70" y="22" width="72" height="36" rx="18" stroke="currentColor" /><path d="M63 40h34m-8-8 8 8-8 8" stroke="currentColor" /></svg>
          <span>{collection.collectionColor ? collectionColor : "ON-CHAIN REFERRALS"}</span>
        </div>
        <div className="affiliate-share-caption"><div><p>{collection.seasonName || "Your collection"}</p><strong>{collection.name}</strong></div><span aria-hidden="true">↗</span></div>
      </Link>
    </section>

    {collection.mode === "live" && <LiveDataNotice retrying={retrying} />}

    {error && <div className="affiliate-notice affiliate-error" role="alert"><p>{error}</p><button className="text-button" onClick={() => void refresh()} disabled={loading}>Try again</button></div>}
    {!program && loading && <p className="affiliate-loading" role="status">Loading this collection’s affiliate program…</p>}
    {program && <>
      <div className="affiliate-program-bar">
        <div><span className="affiliate-dot" /><strong>{demo ? "Database preview" : program.enrollmentStatus === "open" ? "Enrollment available" : program.enrollmentStatus === "full" ? "All positions filled" : "Enrollment closed"}</strong><span>{program.enrolledSlots} / {program.maxSlots} positions</span></div>
        <div>{demo ? <span>Illustrative balances · no funds or enrollment</span> : <><span>{program.chainId === 11155111 ? "Sepolia" : "Ethereum"}{program.snapshotBlock ? ` · block ${program.snapshotBlock}` : ""}</span><button className="text-button" title="Read the latest position and commission from the blockchain. No gas or wallet signature." disabled={busy || loading} onClick={() => void refresh()}>{loading ? "Refreshing…" : "Refresh on-chain data"}</button></>}</div>
      </div>
      {!demo && <p className="affiliate-refresh-note">Refreshing reads your enrollment, referrals and payments from the blockchain. It costs no gas and does not withdraw funds.</p>}
      {!demo && <AffiliateWindow program={program} />}
      {demo && <div className="affiliate-preview-picker">
        <div><strong>Explore the affiliate journey</strong><p>Choose a saved example from the database. These are fictional accounts and earnings.</p></div>
        <div role="group" aria-label="Affiliate demo scenario">{DEMO_SCENARIOS.filter((item) => item !== "no_commission" || program.affiliateRatesBps.some((rate) => rate === 0)).map((item) => <button key={item} onClick={() => { setScenario(item); setCopied(false); setMessage(""); }} aria-pressed={scenario === item} disabled={loading}>{scenarioLabels[item]}</button>)}</div>
      </div>}
      <section className="affiliate-dashboard" aria-label="Your affiliate position" aria-busy={loading}>
        <div className="affiliate-position-card">
          <div className="affiliate-card-heading"><span className="eyebrow">{demo ? "EXAMPLE AFFILIATE POSITION" : "YOUR AFFILIATE POSITION"}</span><span className={`affiliate-status affiliate-status-${account?.status ?? "unregistered"}`}>{status.label}</span></div>
          <h2>{status.title}</h2><p className="affiliate-status-description">{status.description}</p>
          {account?.affiliateId && <div className="affiliate-identity"><span>Position <strong>#{String(account.affiliateId).padStart(2, "0")}</strong></span><span title={account.wallet}>{shortWallet(account.wallet)}{demo ? " · example wallet" : " · registered wallet"}</span></div>}
          <div className="affiliate-journey" aria-label="Commission lifecycle">{(account?.status === "refunded" ? ["Enroll", "Share", "Closed unsold", "No payment"] : account?.status === "no_commission" ? ["Enroll", "Share", "Referrals", "No payment"] : ["Enroll", "Share", "Sell out", "Withdraw"]).map((step, i) => <div key={step} className={status.step > i ? "is-complete" : ""}><span>{status.step > i ? "✓" : `0${i + 1}`}</span><small>{step}</small></div>)}</div>
          {account?.referralUrl && <div className="affiliate-share">
            <label htmlFor="affiliate-link">{demo ? "Example referral link" : "Your collection referral link"}</label>
            <div><input id="affiliate-link" value={account.referralUrl} readOnly onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void copyLink()}>{copied ? "Copied ✓" : "Copy link"}</button></div>
            <p>{demo ? "This link opens a demo mint. It cannot create real commission." : "The contract fixes your beneficiary wallet. Each successful referred mint is counted once."}</p>
          </div>}
          {!demo && account?.affiliateId && !account.referralUrl && <p className="affiliate-readiness">Referral sharing is not configured on this site. Your registered position, payment history and withdrawals remain available.</p>}
          {!demo && <div className="affiliate-wallet-actions">
            {choosingAccount ? <WalletAccountPicker chainId={collection.chainId} onConnected={accountSelected} onCancel={() => setChoosingAccount(false)} /> : !wallet ? <button className="primary-button" onClick={connect} disabled={busy}><span>{busy ? "Check your wallet…" : "Connect wallet"}</span><span aria-hidden="true">↗</span></button> : <p className="affiliate-connected">Connected: <strong title={wallet.address}>{shortWallet(wallet.address)}</strong><button type="button" className="text-button" disabled={busy} onClick={connect}>Switch account</button></p>}
            {program.enrollmentEligibility && <div className="affiliate-eligibility">
              <h3>{bootstrap ? "First collection · no NFT required" : account?.affiliateId ? "Your holder enrollment" : "Check your qualifying NFT"}</h3>
              <p>{account?.affiliateId ? bootstrap ? "Your position and earnings belong to your registered wallet. This first collection did not require an earlier NFT." : "Your position and earnings belong to your registered wallet. You do not need to keep holding the qualifying NFT after enrollment." : enrollmentCopy.summary}</p>
              {wallet && account?.status==="unregistered" && program.enrollmentEligibility.policy==="nft_holder" && !auth && <>
                <label htmlFor="affiliate-qualifying-nft">Choose your qualifying NFT</label>
                <select id="affiliate-qualifying-nft" value={selectedNft} disabled={busy || loading} onChange={(event)=>setSelectedNft(event.target.value)}><option value="">Select an NFT…</option>{program.enrollmentEligibility.tokens.map(item=><option key={`${item.sourceCollection}:${item.sourceTokenId}`} value={`${item.sourceCollection}:${item.sourceTokenId}`} disabled={!item.eligible}>{item.collectionName} · #{item.sourceTokenId}{item.eligible?"":` · ${item.reason}`}</option>)}</select>
                {program.enrollmentEligibility.tokens.length===0&&<p>No completed-collection NFTs were found on this page for this wallet. <Link className="text-link" href="/my-nfts">View my NFTs →</Link> If you just received one, wait for confirmation and refresh. Ownership is checked again when enrollment executes.</p>}
                {(program.enrollmentEligibility.hasMore||eligibilityPage>1)&&<div className="affiliate-eligibility-pages"><button type="button" className="text-button" disabled={busy||loading||eligibilityPage===1} onClick={()=>{setSelectedNft("");setEligibilityPage(value=>value-1);}}>← Previous NFTs</button><span>Page {eligibilityPage}</span><button type="button" className="text-button" disabled={busy||loading||!program.enrollmentEligibility.hasMore} onClick={()=>{setSelectedNft("");setEligibilityPage(value=>value+1);}}>More NFTs →</button></div>}
              </>}
              {auth?.eligibility&&program.enrollmentEligibility.policy==="nft_holder"&&<p>Qualifying NFT: #{auth.eligibility.sourceTokenId} from <code>{shortWallet(auth.eligibility.sourceCollection)}</code>. Keep it in this wallet until enrollment confirms. This NFT cannot unlock another position in this collection afterward.</p>}
            </div>}
            {wallet && account?.status === "unregistered" && program.enrollmentStatus === "open" && !auth && <><p className="affiliate-enrollment-review">{program.enrollmentOffer ? <>Offered position #{program.enrollmentOffer.affiliateId}: <strong>{formatBasisPoints(program.enrollmentOffer.commissionBps)}</strong> {equalPool ? equalTerms : pool ? "of total mint revenue funds the shared pool. Your share is earned through referral sales and becomes final at sellout." : "of purchases through your own link. This rate is fixed for the collection."}</> : "No affiliate position is currently offered."}</p><button className="primary-button" disabled={busy || loading || !program.readiness.canEnroll || !nftSelectionReady || !!journal} onClick={() => void prepareEnrollment()}><span>{busy ? "Waiting for wallet…" : "Verify wallet & enroll"}</span><span aria-hidden="true">↗</span></button></>}
            {auth && program.turnstileSiteKey && <><p className="affiliate-enrollment-review">Enrollment terms{auth.offer ? ` · position #${auth.offer.affiliateId}` : ""}: {enrollmentRate === undefined ? "the rate recorded for this position" : formatBasisPoints(enrollmentRate)} {equalPool ? equalTerms : pool ? "of all mint revenue is the shared pool; your payout is proportional to your share of all referred sales." : "of successful purchases through your own link."} {enrollmentRate === 0 ? "This position records referrals but does not earn commission." : "Commission becomes available at sellout; it is cancelled if the collection expires unsold."}</p><TurnstileCheck siteKey={program.turnstileSiteKey} challengeId={auth.challenge.challengeId} onToken={setToken} /><button className="primary-button" onClick={() => void enroll()} disabled={!token || busy || !!journal}><span>{busy ? "Registering your position…" : "Confirm on-chain enrollment"}</span><span aria-hidden="true">↗</span></button><p>Enrollment requires an Ethereum network fee. Your position is assigned only when the transaction succeeds.</p></>}
          </div>}
          {program.readiness.reason && <p className="affiliate-readiness">{program.readiness.reason}</p>}
        </div>
        <div className="affiliate-balance-card">
          <div className="affiliate-card-heading"><span className="eyebrow">{demo ? "EXAMPLE COMMISSION" : "YOUR COMMISSION"}</span><span aria-hidden="true">↗</span></div>
          <span className="affiliate-balance-label">Available to withdraw</span><p className="affiliate-main-balance">{eth(account?.claimableWei)} <small>ETH</small></p>
          <dl className="affiliate-balances"><div><dt>{pool ? "Estimate until sellout" : "Pending sellout"}</dt><dd>{eth(account?.pendingWei)} ETH</dd></div><div><dt>Already paid</dt><dd>{eth(account?.claimedWei)} ETH</dd></div><div><dt>Referred tickets</dt><dd>{accountView.state === "ready" ? formatCount(account?.referredMints ?? 0) : "—"}</dd></div>{pool && !equalPool && <div><dt>Share of referred sales</dt><dd>{accountView.state === "ready" ? `${referralShare}%` : "—"}</dd></div>}{equalPool && <><div><dt>Qualification</dt><dd>{account?.qualified ? "Qualified" : `${account?.referredMints ?? 0} / ${program.minAffiliateReferrals} referrals`}</dd></div><div><dt>Qualified affiliates</dt><dd>{program.qualifiedSlots} / {program.enrolledSlots} enrolled</dd></div><div><dt>{program.soldOut ? "Equal payout per qualifier" : "Provisional equal share"}</dt><dd>{formatWei(program.equalShareWei ?? "0")} ETH</dd></div><div><dt>Unfilled positions</dt><dd>{program.availableSlots}</dd></div></>}</dl>
          {!demo && account?.status === "claimable" && <div className="affiliate-recipient"><label htmlFor="affiliate-recipient">Receiving address</label><input id="affiliate-recipient" type="text" value={recipient} onChange={(event) => setRecipient(event.target.value.trim())} placeholder="0x…" autoComplete="off" spellCheck={false} disabled={busy} /><p>Only your registered wallet can authorize this withdrawal.</p></div>}
          <button className="primary-button" onClick={() => void claim()} disabled={demo || !wallet || busy || accountView.state !== "ready" || !!journal || !program.readiness.canClaim || BigInt(account?.claimableWei ?? "0") === 0n}><span>{busy ? "Check your wallet…" : demo ? "Preview only · no withdrawal" : account?.status === "paid" ? "Commission already paid" : "Withdraw commission"}</span><span aria-hidden="true">↗</span></button>
          <p className="affiliate-claim-note">{accountView.state === "disconnected" ? "Connect your registered wallet to check its commission. Reading balances is free." : accountView.state !== "ready" ? "Your balance is not verified yet. Refresh on-chain data before attempting a withdrawal." : account?.status === "paid" ? "All commission earned by this position has already been withdrawn. The total appears under Already paid." : account?.status === "unregistered" ? "This wallet has no affiliate position in this collection." : account?.status === "no_commission" ? "Your referrals are recorded. This position has no commission payment due." : account?.status === "no_referrals" ? program.soldOut || program.refundable ? "No purchases were attributed to this position. There is no commission to withdraw from this closed collection." : "No referrals yet means no unpaid commission. Share your link to start." : account?.status === "refunded" ? "Full NFT refunds take priority. Pending affiliate earnings were cancelled." : "Available at sellout. Accumulate earnings and withdraw together to save on network fees."}</p>
        </div>
      </section>
      <details className="affiliate-program-terms">
        <summary>Program terms <span aria-hidden="true">+</span></summary>
        <dl><div><dt>{pool ? "Collection affiliate pool" : account?.affiliateId ? "Your commission rate" : "Offered commission rate"}</dt><dd>{commissionBps === undefined ? "No position currently offered" : `${formatBasisPoints(commissionBps)} of ${pool ? "total mint revenue" : "referred mint value"}`}</dd></div><div><dt>Collection prize</dt><dd>{formatBasisPoints(program.prizeBps)} of mint revenue</dd></div><div><dt>Payment availability</dt><dd>{commissionBps === 0 ? "No commission for this position" : equalPool ? `At sellout, after at least ${program.minAffiliateReferrals} paid referrals` : "At sellout, after a successful referred mint"}</dd></div><div><dt>If the sale expires unsold</dt><dd>Pending commission is cancelled; NFT holders keep full refund rights</dd></div></dl>
        {equalPool ? <p>{equalTerms} Estimates may rise or fall before sellout. Referrals credited to another position cannot count toward your minimum.</p> : pool ? <p>The pool includes all primary mint revenue. Your final payout is the pool multiplied by your referred sales divided by all affiliates’ referred sales. Shares change until sellout. No referrals means no earnings. If one affiliate brings all referred sales, they receive the whole pool. If nobody refers a sale, the unused pool stays with the operator. Increasing the number of positions does not enlarge the pool.</p> : <>
        <p>The buyer pays the advertised ticket price. Affiliate commission comes from the collection’s operating allocation and does not reduce its configured prize. Each affiliate earns only from their own referrals. Positions and rates are fixed for this collection; unused positions do not redistribute their rates.</p><div className="affiliate-rate-schedule"><h3>Rates by position</h3><ol>{program.affiliateRatesBps.map((rate, index) => <li key={index}><span>#{String(index + 1).padStart(2, "0")}</span><strong>{formatBasisPoints(rate)}</strong></li>)}</ol></div></>}

      </details>
      {journal && <div className="affiliate-notice" role="status"><div><strong>A transaction needs your attention.</strong><p>{journal.hash ? `Submitted ${journal.action} transaction: ${journal.hash}` : "The wallet submission result is unknown. Another transaction will not be sent automatically."}</p>{journal.hash && <a className="text-link" href={`${program.chainId === 1 ? "https://etherscan.io" : "https://sepolia.etherscan.io"}/tx/${journal.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}<div className="affiliate-recovery"><label htmlFor="affiliate-recovery-hash">Transaction hash from your wallet</label><input id="affiliate-recovery-hash" value={recoveryHash} onChange={(event) => setRecoveryHash(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} disabled={busy} /><p>We verify the wallet, collection, action, amount and transaction nonce before accepting a recovery hash.</p></div></div><button className="text-button" disabled={busy || !wallet} onClick={() => void reconcile()}>Check transaction</button></div>}
      <div className="affiliate-feedback" role="status" aria-live="polite" aria-atomic="true">{message && <p>{message}</p>}</div>
    </>}
    <AffiliateEnrollmentRules holderProgram={holderProgram} bootstrap={bootstrap} />
    <section className="affiliate-explainer" aria-labelledby="affiliate-how-title">
      <div className="section-heading"><div><p className="eyebrow">THE REFERRAL PROGRAM</p><h2 id="affiliate-how-title">From your link to your wallet.</h2></div><Link className="text-link" href={`/mint/${collection.id}/contract#affiliate-rules`}>Read the contract <span aria-hidden="true">↗</span></Link></div>
      <div className="how-grid"><article><span className="step-label">01 / JOIN</span><h3>{holderProgram && !bootstrap ? "Put your NFT to use." : "A position for your wallet."}</h3><p>{enrollmentCopy.join}</p></article><article><span className="step-label">02 / SHARE</span><h3>Share a collection worth collecting.</h3><p>Share your collection link. Buyers see the registered beneficiary and payment terms before signing their mint. Their ticket price stays the same. Clicks and NFT ownership alone do not generate earnings.</p></article><article><span className="step-label">03 / EARN</span><h3>Sellout unlocks your commission.</h3><p>{equalPool ? equalTerms : pool ? "Your successful referrals determine your share of the affiliate pool. Estimates can change until sellout, when the final allocation becomes withdrawable." : "Successful purchases add pending commission that becomes withdrawable at sellout."} No successful referrals means no earnings. If the sale expires unsold, there is no affiliate payout.</p></article></div>
      <div className="affiliate-trust-note"><span aria-hidden="true">◇</span><p>{holderProgram ? "The smart contracts check NFT ownership and prevent the same NFT from unlocking multiple positions in one collection. " : "This collection follows its original admission rules. "}Referral payments are enforced on-chain. Automated checks reduce abuse, but wallets and IP addresses do not prove unique people. Each new collection requires its own enrollment and keeps separate earnings.</p></div>
    </section>
    <div className="affiliate-back"><Link className="text-link" href={`/mint/${collection.id}`}>← Back to {collection.name}</Link><span>Referral activity. Recorded on-chain.</span></div>
  </div>;
}
