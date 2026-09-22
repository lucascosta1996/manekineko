"use client";

import { PrizeFields } from "./prize-fields";
import { equalPrizeEconomics } from "./form-values";
import { isCurrentCollection } from "../../lib/current-launch";
import { HistoricalSnapshot } from "./historical-snapshot";
import { SeasonAppearanceFields, CollectionArtworkPreview } from "./season-appearance-fields";
import { createSeasonId } from "./form-values";
import { AffiliateEligibilityFields } from "./affiliate-eligibility-fields";
import { WinnerCreditFields } from "./winner-credit-fields";
import { winnerCreditBudget } from "./form-values";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { LaunchConfiguration } from "../../lib/launch-config";
import { WalletMintCap, useWalletMintCap } from "./wallet-mint-cap";
import { LaunchHeader } from "./launch-header";
import { collectionEconomics, defaultLaunchForm, formFromConfiguration, payloadFromForm, type DurationUnit, type LaunchForm } from "./form-values";

type Tab = "collection" | "affiliates" | "operations" | "review";
const tabs: { id: Tab; label: string; number: string }[] = [{ id: "collection", label: "Collection", number: "01" }, { id: "affiliates", label: "Prizes & affiliates", number: "02" }, { id: "operations", label: "Operations", number: "03" }, { id: "review", label: "Review", number: "04" }];
class SessionExpired extends Error {}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/launch${path}`, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", ...options?.headers } });
  const data = await response.json().catch(() => null);
  if (response.status === 401) throw new SessionExpired("Your session has expired. Sign in again, then retry. Your unsaved changes are still here.");
  if (!response.ok) {
    const details = Array.isArray(data?.issues) ? data.issues.join(" ") : "";
    throw new Error(`${data?.message || data?.error || "The request could not be completed."}${details ? ` ${details}` : ""}`);
  }
  return data as T;
}

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`launch-field${wide ? " launch-field-wide" : ""}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Section({ step, title, description, children }: { step: string; title: string; description: string; children: ReactNode }) {
  return <section className="launch-section"><div className="launch-section-heading"><span className="launch-step">{step}</span><div><h2>{title}</h2><p>{description}</p></div></div>{children}</section>;
}

function DurationInput({ label, value, unit, disabled, onValue, onUnit, hint }: { label: string; value: string; unit: DurationUnit; disabled: boolean; onValue: (value: string) => void; onUnit: (value: DurationUnit) => void; hint: string }) {
  return <div className="launch-field"><label htmlFor={`duration-${label}`}>{label}</label><div className="launch-duration"><input id={`duration-${label}`} inputMode="numeric" value={value} onChange={(event) => onValue(event.target.value)} disabled={disabled} /><select aria-label={`${label} unit`} value={unit} onChange={(event) => onUnit(event.target.value as DurationUnit)} disabled={disabled}><option value="days">days</option><option value="hours">hours</option><option value="seconds">seconds</option></select></div><small>{hint}</small></div>;
}

function timestamp(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function LaunchConsole({ username, allowedChainId = null }: { username: string; allowedChainId?: "1" | "11155111" | null }) {
  const [records, setRecords] = useState<LaunchConfiguration[]>([]);
  const [selected, setSelected] = useState<LaunchConfiguration | null>(null);
  const [form, setForm] = useState<LaunchForm>(() => defaultLaunchForm(allowedChainId ?? "1"));
  const [baseline, setBaseline] = useState(() => JSON.stringify(defaultLaunchForm(allowedChainId ?? "1")));
  const [tab, setTab] = useState<Tab>("collection");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<"save" | "finalize" | "logout" | null>(null);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<{ record: LaunchConfiguration | null } | null>(null);
  const activeRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const allowLeaveRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(form) !== baseline;
  const finalized = selected?.status === "finalized";
  const editorBlocked = loading || loadFailed || pending !== null;
  const historical = selected !== null && !isCurrentCollection(selected.payload);
  const disabled = finalized || historical || editorBlocked;
  const economics = collectionEconomics(form);
  const creditBudget = winnerCreditBudget(form);
  const equalPrizes = equalPrizeEconomics(form);
  const currentRecords = records.filter(record => isCurrentCollection(record.payload));
  const historicalRecords = records.filter(record => !isCurrentCollection(record.payload));
  const draftCount = currentRecords.filter((record) => record.status === "draft").length;
  const finalizedCount = currentRecords.length - draftCount;

  const openRecord = useCallback((record: LaunchConfiguration | null) => {
    const next = record ? formFromConfiguration(record) : { ...defaultLaunchForm(allowedChainId ?? "1"), seasonId: createSeasonId() };
    setSelected(record); setForm(next); setBaseline(JSON.stringify(next)); setError(""); setNotice(""); setReviewAccepted(false); setTab(record?.status === "finalized" ? "review" : "collection");
  }, [allowedChainId]);

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setLoading(true); setLoadFailed(false); setError("");
    try {
      const result = await api<{ configurations: LaunchConfiguration[] }>("/configurations");
      if (generation !== loadGenerationRef.current) return;
      setRecords(result.configurations);
      if (!activeRef.current) openRecord(result.configurations.find(record => isCurrentCollection(record.payload)) ?? null);
      activeRef.current = true;
    } catch (cause) {
      if (generation !== loadGenerationRef.current) return;
      setError(cause instanceof Error ? cause.message : "Configurations could not be loaded.");
      setSessionExpired(cause instanceof SessionExpired); setLoadFailed(true);
    } finally { if (generation === loadGenerationRef.current) setLoading(false); }
  }, [openRecord]);

  useEffect(() => { void load(); return () => { loadGenerationRef.current++; }; }, [load]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (!allowLeaveRef.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit<K extends keyof LaunchForm>(key: K, value: LaunchForm[K]) {
    if (disabled) return;
    setForm((current) => ({ ...current, [key]: value })); setReviewAccepted(false); setNotice("");
  }

  function selectRecord(record: LaunchConfiguration | null) {
    if (editorBlocked) return;
    if (dirty) setSwitchTarget({ record }); else openRecord(record);
  }

  function remember(record: LaunchConfiguration) {
    setRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    const next = formFromConfiguration(record);
    setSelected(record); setForm(next); setBaseline(JSON.stringify(next)); setReviewAccepted(false);
  }

  async function save() {
    if (disabled) return;
    setPending("save"); setError(""); setNotice(""); setSessionExpired(false);
    try {
      const payload = payloadFromForm(form);
      const result = await api<{ configuration: LaunchConfiguration }>(selected ? `/configurations/${selected.id}` : "/configurations", { method: selected ? "PUT" : "POST", body: JSON.stringify({ label: form.label, payload, ...(selected ? { revision: selected.revision } : {}) }) });
      remember(result.configuration); setNotice("Draft saved to the database.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The draft could not be saved."); setSessionExpired(cause instanceof SessionExpired);
    } finally { setPending(null); }
  }

  async function finalize() {
    if (!selected || dirty || !reviewAccepted || disabled) return;
    setPending("finalize"); setError(""); setNotice(""); setSessionExpired(false);
    try {
      const result = await api<{ configuration: LaunchConfiguration }>(`/configurations/${selected.id}/finalize`, { method: "POST", body: JSON.stringify({ revision: selected.revision }) });
      remember(result.configuration); setNotice("Configuration finalized. The saved snapshot is ready for deployment preflight.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The configuration could not be finalized."); setSessionExpired(cause instanceof SessionExpired);
    } finally { setPending(null); }
  }

  async function logout() {
    if (dirty && !window.confirm("Leave this workspace and discard your unsaved changes?")) return;
    setPending("logout"); setError("");
    try { await api("/auth/logout", { method: "POST", body: "{}" }); allowLeaveRef.current = true; window.location.replace("/login"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign-out could not be completed."); setPending(null); }
  }

  function duplicate() {
    if (editorBlocked || historical) return;
    const next = { ...form, label: `${form.label} — copy` };
    setSelected(null); setForm(next); setBaseline(JSON.stringify(defaultLaunchForm(allowedChainId ?? "1"))); setReviewAccepted(false); setTab("collection"); setNotice("A new draft has been prepared. Review its details and save it."); setError("");
  }

  const addressField = (label: string, key: "initialOwner" | "enrollmentSigner" | "deployerAddress" | "factoryOwnerAddress" | "factoryAddress", hint: string) => <Field label={label} hint={hint} wide><input className="launch-address-input" value={form[key]} onChange={(event) => edit(key, event.target.value)} disabled={disabled} placeholder="0x…" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={42} /></Field>;

  return <div className="launch-shell">
    <a className="launch-skip" href="#launch-main">Skip to workspace</a>
    <LaunchHeader username={username} active="configurations" onLogout={logout} pending={pending !== null} />
    <main id="launch-main">
      <section className="launch-hero"><div><span className="launch-eyebrow">TINCTA / COLLECTIONS</span><h1>Prepare the next color.</h1><p>Set the terms. Review every detail. Get your collection ready for launch.</p></div><button className="launch-button launch-button-primary" onClick={() => selectRecord(null)} disabled={editorBlocked}><span aria-hidden="true">＋</span> New collection</button></section>
      {allowedChainId === "11155111" && <p className="launch-alert launch-alert-success" role="status">Sepolia staging · Testnet configurations only. Use test ETH.</p>}
      <div className="season-overview-note"><p>Start in Seasons to group up to 10 collections under one shared name. Use this workspace for individual configurations and templates.</p><a href="/seasons">Manage seasons →</a></div><div className="launch-workflow"><span className="launch-workflow-current"><i>1</i>Configuration</span><span aria-hidden="true">→</span><span><i>2</i>Deployment preflight</span><span aria-hidden="true">→</span><span><i>3</i>On-chain qualification</span><p>You are preparing step 1.</p></div>
      {error && <div className="launch-alert launch-alert-error" role="alert" tabIndex={-1} ref={errorRef}><strong>Something needs attention</strong><p>{error}</p>{sessionExpired && <a className="launch-inline-link" href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab ↗</a>}{loadFailed && <button className="launch-inline-link" onClick={() => void load()}>Try loading again</button>}</div>}
      {notice && <div className="launch-alert launch-alert-success" role="status">{notice}</div>}
      <div className="launch-workspace" aria-busy={loading}>
        <aside className="launch-sidebar" aria-label="Saved configurations"><div className="launch-sidebar-heading"><h2>Collections</h2><span>{currentRecords.length}</span></div><div className="launch-sidebar-stats"><span>{draftCount} draft{draftCount === 1 ? "" : "s"}</span><span>{finalizedCount} finalized</span></div>{loading ? <p className="launch-sidebar-empty" role="status">Loading your workspace…</p> : currentRecords.length === 0 ? <div className="launch-sidebar-empty"><span className="launch-empty-icon" aria-hidden="true">◇</span><strong>Your next collection lives here.</strong><p>Save your first draft to start building a launch configuration.</p></div> : <div className="launch-record-list">{currentRecords.map((record) => <button key={record.id} className={`launch-record${selected?.id === record.id ? " is-selected" : ""}`} onClick={() => selectRecord(record)} disabled={editorBlocked} aria-pressed={selected?.id === record.id}><span className="launch-record-top"><span className={`launch-status launch-status-${record.status}`}>{record.status === "finalized" ? "Finalized" : "Draft"}</span><span className="launch-record-chain">{record.payload.contract.chainId === "1" ? "ETH" : "TEST"}</span></span><strong>{record.label}</strong><span>{record.payload.contract.maxSupply || "—"} tickets · {timestamp(record.updatedAt)}</span></button>)}</div>}{historicalRecords.length > 0 && <details className="launch-advanced"><summary>Historical records <span>{historicalRecords.length}</span></summary><div className="launch-record-list">{historicalRecords.map(record => <button key={record.id} className={`launch-record${selected?.id === record.id ? " is-selected" : ""}`} onClick={() => selectRecord(record)} disabled={editorBlocked} aria-pressed={selected?.id === record.id}><span className="launch-record-chain">READ-ONLY</span><strong>{record.label}</strong><span>{record.status} · revision {record.revision}</span></button>)}</div></details>}<div className="launch-sidebar-note"><span aria-hidden="true">↗</span><p>Finalized configurations keep a fixed snapshot that a future launch worker can consume.</p></div></aside>
        <div className="launch-editor"><div className="launch-editor-heading"><div><span className="launch-eyebrow">{selected ? `SAVED CONFIGURATION · REVISION ${selected.revision}` : "NEW CONFIGURATION"}</span><h2>{form.label || "Untitled configuration"}</h2></div><span className={`launch-status launch-status-${finalized ? "finalized" : "draft"}`}>{finalized ? "Finalized" : dirty ? "Unsaved changes" : selected ? "Draft saved" : "Draft"}</span></div>
          {historical && selected ? <HistoricalSnapshot title={selected.label} revision={selected.revision} status={selected.status} payload={selected.payload} contentHash={selected.contentHash} exportHref={finalized ? `/api/launch/configurations/${selected.id}/export` : undefined} /> : <><nav className="launch-tabs" aria-label="Configuration sections">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} disabled={editorBlocked} aria-current={tab === item.id ? "step" : undefined}><span>{item.number}</span>{item.label}</button>)}</nav>
          {loading || loadFailed ? <div className="launch-editor-unavailable"><p>{loading ? "Getting your saved configurations…" : "Load your saved configurations before making changes."}</p></div> : <>
          {finalized && <div className="launch-frozen-note"><span aria-hidden="true">✓</span><p>This configuration is finalized. Create a copy to prepare a different collection.</p><button onClick={duplicate} disabled={editorBlocked}>Create a copy ↗</button></div>}
          <div className="launch-editor-body">
          {tab === "collection" && <Section step="01" title="The collection" description="The identity, supply and economics written into this collection."><div className="launch-fields"><Field label="Configuration name" hint="Internal name for this launch configuration." wide><input value={form.label} onChange={(event) => edit("label", event.target.value)} disabled={disabled} maxLength={100} placeholder="September collection" /></Field><Field label="Collection name"><input value={form.name} onChange={(event) => edit("name", event.target.value)} disabled={disabled} placeholder="Velvet Ember" maxLength={80} /></Field><Field label="NFT symbol"><input value={form.symbol} onChange={(event) => edit("symbol", event.target.value)} disabled={disabled} placeholder="TINCTA" maxLength={16} /></Field><Field label="Network"><select value={form.chainId} onChange={(event) => edit("chainId", event.target.value)} disabled={disabled}>{allowedChainId !== "11155111" && <option value="1">Ethereum Mainnet</option>}{allowedChainId !== "1" && <option value="11155111">Ethereum Sepolia · Testnet</option>}</select></Field><Field label="Number of tickets" hint="A fixed supply of 1 to 65,536 NFTs."><input inputMode="numeric" value={form.maxSupply} onChange={(event) => edit("maxSupply", event.target.value)} disabled={disabled} /></Field><Field label="Price per ticket" hint="ETH amount, with up to 14 decimal places for exact commission accounting."><div className="launch-input-unit"><input inputMode="decimal" value={form.mintPriceEth} onChange={(event) => edit("mintPriceEth", event.target.value)} disabled={disabled} /><span>ETH</span></div></Field><Field label="Total prize allocation" hint="Divided equally among the winning NFTs selected in prize settings."><div className="launch-input-unit"><input inputMode="decimal" value={form.prizePercent} onChange={(event) => edit("prizePercent", event.target.value)} disabled={disabled} /><span>%</span></div></Field><DurationInput label="Sale lifetime" value={form.duration} unit={form.durationUnit} disabled={disabled} onValue={(value) => edit("duration", value)} onUnit={(value) => edit("durationUnit", value)} hint="Begins at the scheduled mint opening, after enrollment." /></div><Field label="Scheduled mint opening (UTC)" hint="Enrollment closes at this time. Set a future time before finalizing; a season worker resolves it from the previous sellout."><input type="datetime-local" step="1" value={form.saleStartAt && form.saleStartAt !== "0" && /^\d{1,10}$/.test(form.saleStartAt) ? new Date(Number(form.saleStartAt) * 1000).toISOString().slice(0, 19) : ""} onChange={event => edit("saleStartAt", event.target.value ? String(Date.parse(`${event.target.value}Z`) / 1000) : "0")} disabled={disabled}/></Field><SeasonAppearanceFields form={form} disabled={disabled} onChange={next => { setForm(next); setReviewAccepted(false); setNotice(""); }} showPreview={false} /><div className="launch-context-note"><span aria-hidden="true">◇</span><p>Each collection uses verifiable randomness and unique ranks. {`The top ${form.winnerCount || "configured number of"} NFTs each receive an equal prize. One wallet may hold multiple winning NFTs.`} Terms become fixed when its contract is deployed.</p></div></Section>}
          {tab === "affiliates" && <Section step="02" title="Prizes and referral rewards" description="An equal prize for each winning NFT, with qualified affiliate payouts."><WalletMintCap form={form} disabled={disabled} onUpgrade={() => { setForm(useWalletMintCap(form)); setReviewAccepted(false); }}/><PrizeFields form={form} disabled={disabled} onChange={next => { setForm(next); setReviewAccepted(false); setNotice(""); }}/></Section>}
          {tab === "operations" && <Section step="03" title="Who runs this collection" description="Set the public wallet addresses and the operational parameters."><div className="launch-fields">{addressField("Round owner", "initialOwner", "Controls this collection’s owner-only functions, including sale activation and settlement. Use your intended owner or multisig address.")}{addressField("Deployment signer", "deployerAddress", "The wallet expected to submit deployment transactions. No private key is stored in this workspace.")}<Field label="Factory setup" wide><select value={form.factoryMode} onChange={(event) => edit("factoryMode", event.target.value as "new" | "existing")} disabled={disabled}><option value="new">Create a new {form.algorithmVersion === "unique-rank-v6" ? "V10" : form.maxMintsPerWallet === "20" ? "V9" : "V8"} factory</option><option value="existing">Use an existing {form.algorithmVersion === "unique-rank-v6" ? "V10" : form.maxMintsPerWallet === "20" ? "V9" : "V8"} factory</option></select></Field>{form.factoryMode === "existing" && addressField("Existing factory", "factoryAddress", "The matching contract-version factory on the selected network. Deployment preflight must verify its code, owner and previous-round state.")}{addressField("Factory owner at deployment", "factoryOwnerAddress", "Must match the deployment signer for the current deployment workflow. A later ownership transfer is a separate on-chain action.")}{addressField("Affiliate enrollment signer", "enrollmentSigner", "A separate externally owned wallet for enrollment authorizations. Must differ from the round owner and deployment signer.")}<DurationInput label="Planned enrollment window" value={form.enrollmentDuration} unit={form.enrollmentDurationUnit} disabled={disabled} onValue={(value) => edit("enrollmentDuration", value)} onUnit={(value) => edit("enrollmentDurationUnit", value)} hint="Planned enrollment before the scheduled mint opening. Enrollment closes on-chain at that fixed time." /><Field label="Initial randomness funding" hint="ETH funded separately from ticket revenue. The required buffer must be checked against live Chainlink pricing."><div className="launch-input-unit"><input inputMode="decimal" value={form.fundingEth} onChange={(event) => edit("fundingEth", event.target.value)} disabled={disabled} placeholder="Enter funding amount"/><span>ETH</span></div></Field></div><AffiliateEligibilityFields mintCap={form.maxMintsPerWallet} version={form.algorithmVersion} address={form.affiliateEligibilityAddress} disabled={disabled} onAddress={(value) => edit("affiliateEligibilityAddress", value)}/><WinnerCreditFields form={form} disabled={disabled} onRegistry={(value) => edit("winnerCreditsAddress", value)} onBudget={(value) => edit("winnerCreditSponsorshipEth", value)} onConfigure={() => { setForm(current => ({ ...current, winnerCreditsAddress: "", winnerCreditSponsorshipEth: "" })); setReviewAccepted(false); setNotice(""); }}/><details className="launch-advanced"><summary>Advanced randomness settings <span>Chainlink VRF v2.5</span></summary><div className="launch-fields"><Field label="Request confirmations" hint="64 to 200. Higher confirmation counts increase the wait before fulfillment."><input inputMode="numeric" value={form.requestConfirmations} onChange={(event) => edit("requestConfirmations", event.target.value)} disabled={disabled}/></Field><Field label="Callback gas limit" hint="100,000 to 2,500,000 gas. Qualify the selected limit on Sepolia."><input inputMode="numeric" value={form.callbackGasLimit} onChange={(event) => edit("callbackGasLimit", event.target.value)} disabled={disabled}/></Field></div><p>The coordinator and key hash are pinned by network and included in the finalized snapshot.</p></details><Field label="Operator notes" hint="Deployment context or instructions for the future operator. Never include credentials or private keys." wide><textarea value={form.notes} onChange={(event) => edit("notes", event.target.value)} disabled={disabled} maxLength={4000} rows={4} placeholder="Add context for this collection…"/></Field></Section>}
          {tab === "review" && <Section step="04" title={finalized ? "A fixed point to launch from." : "One last look."} description={finalized ? "This snapshot records the exact configuration selected for deployment preflight." : "Review the collection and its operational terms before finalizing the snapshot."}><div className="launch-review-grid"><ReviewItem label="Contract version" value={form.algorithmVersion === "unique-rank-v6" ? "V10 · permanent numbers" : form.maxMintsPerWallet === "20" ? "V9 · reveal-time numbers" : "V8 · reveal-time numbers"} detail={form.algorithmVersion === "unique-rank-v6" ? "Identity in Solidity at mint; VRF scores and prizes after sellout" : "Numbers encode the final score after the draw"}/><ReviewItem label="Primary mints per recipient" value={form.maxMintsPerWallet ?? "No cumulative limit"} detail="Direct, referral and sponsored mints share the allowance"/>{form.seasonName !== undefined && <ReviewItem label="Season" value={form.seasonName || "Not configured"} detail={`Collection color ${form.collectionColor || "not configured"}`}/>}<ReviewItem label="Collection" value={form.name || "Not configured"} detail={form.symbol || "No symbol"}/><ReviewItem label="Network" value={form.chainId === "1" ? "Ethereum Mainnet" : "Ethereum Sepolia"} detail={`Chain ID ${form.chainId}`}/><ReviewItem label="Ticket supply" value={form.maxSupply || "Not configured"} detail={`${form.mintPriceEth || "—"} ETH per ticket`}/><ReviewItem label="Total prize allocation" value={`${form.prizePercent || "—"}%`} detail={economics ? `${economics.prize} ETH at sellout` : "Complete valid economics to calculate"}/>{equalPrizes && <><ReviewItem label="Winning NFTs" value={String(equalPrizes.count)} detail="Highest scores · equal prizes"/><ReviewItem label="Prize per winning NFT" value={`${equalPrizes.each} ETH`} detail={`${equalPrizes.percentEach}% of mint revenue · independently claimable`}/></>}<ReviewItem label="Affiliate qualification" value={`${form.minAffiliateReferrals} paid referrals`} detail={`${form.affiliatePayoutCapPercent}% common revenue cap`}/><ReviewItem label="Affiliate program" value={`${form.slots} positions`} detail={`${form.affiliatePoolPercent || "—"}% of mint revenue, equally shared by qualified affiliates`}/><ReviewItem label="Sale lifetime" value={`${form.duration} ${form.durationUnit}`} detail="From scheduled mint opening"/><ReviewItem label="Randomness funding" value={form.fundingEth ? `${form.fundingEth} ETH` : "Not configured"} detail="Separate funding transaction"/><ReviewItem label="Winner credit sponsorship" value={creditBudget ? `${creditBudget.sponsorshipEth} ETH` : "Not configured"} detail={creditBudget ? `Up to ${creditBudget.maximumClaims} sponsored NFTs · separate operator funds` : "Registry and budget required for a new launch"}/><ReviewItem label="Initial sale state" value="Enrollment open" detail="Sales require later activation"/></div><div className="launch-review-addresses"><ReviewItem label="Round owner" value={form.initialOwner || "Not configured"}/><ReviewItem label="Deployment signer / factory owner" value={form.deployerAddress || "Not configured"} detail={form.factoryOwnerAddress && form.factoryOwnerAddress !== form.deployerAddress ? `Factory owner: ${form.factoryOwnerAddress}` : undefined}/><ReviewItem label="Enrollment signer" value={form.enrollmentSigner || "Not configured"}/><ReviewItem label="Canonical affiliate eligibility registry" value={form.affiliateEligibilityAddress || "Not configured"}/><ReviewItem label="Winner credits registry" value={form.winnerCreditsAddress || "Not configured"}/>{form.factoryMode === "existing" && <ReviewItem label="Existing factory" value={form.factoryAddress || "Not configured"}/>}</div><details className="launch-advanced"><summary>Exact configuration <span>JSON</span></summary><pre tabIndex={0}>{(() => { try { return JSON.stringify(finalized && selected ? selected.payload : payloadFromForm(form), null, 2); } catch (cause) { return cause instanceof Error ? cause.message : "Complete the fields to preview JSON."; } })()}</pre></details>{finalized ? <div className="launch-finalized-card"><span className="launch-eyebrow">FINALIZED SNAPSHOT</span><h3>Configuration is ready for preflight.</h3><p>Finalizing does not deploy a contract or qualify it for accepting funds. Live network checks, public-chain qualification and the remaining launch gates come next.</p><dl><dt>Configuration ID</dt><dd>{selected.id}</dd><dt>Content hash</dt><dd>{selected.contentHash}</dd><dt>Finalized</dt><dd>{selected.finalizedAt ? timestamp(selected.finalizedAt) : "—"}</dd></dl><a className="launch-button launch-button-primary" href={`/api/launch/configurations/${selected.id}/export`} download>Download deployment configuration <span aria-hidden="true">↓</span></a></div> : <div className="launch-finalize-card"><h3>Finalize this configuration</h3><p>Finalizing locks this snapshot and records its content hash. You can create a copy for later changes. Deployment is a separate step.</p>{(!selected || dirty) && <p className="launch-save-reminder">Save your draft before finalizing.</p>}<label className="launch-checkbox"><input type="checkbox" checked={reviewAccepted} onChange={(event) => setReviewAccepted(event.target.checked)} disabled={!selected || dirty || editorBlocked}/><span>I have reviewed the terms and public wallet addresses and want to finalize this configuration.</span></label><button className="launch-button launch-button-primary" onClick={finalize} disabled={!selected || dirty || !reviewAccepted || editorBlocked}>{pending === "finalize" ? "Validating and finalizing…" : "Finalize configuration"}<span aria-hidden="true">↗</span></button></div>}</Section>}
          </div>
          <footer className="launch-editor-footer"><div><span className={`launch-save-dot${dirty ? " is-dirty" : ""}`} aria-hidden="true"/>{finalized ? "Finalized · editing locked" : dirty ? "You have unsaved changes" : selected ? "All changes saved" : "Save when you’re ready"}</div><div>{tab !== "review" && <button className="launch-button launch-button-secondary" onClick={() => setTab("review")} disabled={editorBlocked}>Review configuration</button>}{!finalized && <button className="launch-button launch-button-primary" onClick={save} disabled={editorBlocked || (selected !== null && !dirty)}>{pending === "save" ? "Saving…" : "Save draft"}</button>}</div></footer>
          </>}</> }
        </div>
        {!historical && <aside className="launch-summary" aria-label="Collection summary"><span className="launch-eyebrow">AT A GLANCE</span><CollectionArtworkPreview form={form} compact /><div className="launch-summary-heading"><h2>At sellout</h2><span>Estimated totals</span></div><dl><div><dt>Ticket sales</dt><dd>{economics ? `${economics.sales} ETH` : "—"}</dd></div>{equalPrizes ? <><div><dt>Total prize reserve</dt><dd>{equalPrizes.total} ETH</dd></div><div><dt>Each of {equalPrizes.count} winning NFTs</dt><dd>{equalPrizes.each} ETH</dd></div></> : <><div><dt>Total prize reserve</dt><dd>{economics ? `${economics.prize} ETH` : "—"}</dd></div><div><dt>Prize per winning NFT</dt><dd>Check winner count</dd></div></>}<div><dt>Affiliate pool</dt><dd>{economics ? `${economics.maxCommission} ETH` : "—"}</dd></div><div><dt>Operator gross minimum</dt><dd>{economics ? `${economics.operatorMinimum} ETH` : "—"}</dd></div></dl><div className="launch-summary-heading"><h2>Operator funding</h2><span>Before gas</span></div><dl><div><dt>Winner credit reserve</dt><dd>{creditBudget ? `${creditBudget.sponsorshipEth} ETH` : "—"}</dd></div><div><dt>Reserve + randomness</dt><dd>{creditBudget?.upfrontFundingEth ? `${creditBudget.upfrontFundingEth} ETH` : "—"}</dd></div></dl><p className="launch-summary-footnote">Qualified affiliates receive equal payouts subject to the common revenue cap. Unused affiliate funds enter the separate growth reserve. Operator sponsorship, gas and randomness costs are excluded from gross proceeds.</p><div className="launch-summary-callout"><span aria-hidden="true">◇</span><strong>{`One collection. ${form.winnerCount || "—"} winning NFT${form.winnerCount === "1" ? "" : "s"}.`}</strong><p>{form.algorithmVersion === "unique-rank-v6" ? "Permanent numbers identify each NFT from mint. The later VRF draw assigns distinct scores independently." : "On-chain unique ranks keep every ticket’s score distinct."}</p></div></aside>}
      </div>
    </main>
    <footer className="launch-page-footer"><span>Color, collected.</span><span>Tincta launch · Equal prizes · Qualified affiliates</span></footer>
    {switchTarget && <DiscardDialog onKeep={() => setSwitchTarget(null)} onDiscard={() => { openRecord(switchTarget.record); setSwitchTarget(null); }}/>}
  </div>;
}

function ReviewItem({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="launch-review-item"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function DiscardDialog({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog className="launch-modal" ref={dialog} aria-labelledby="discard-title" aria-describedby="discard-description" onCancel={(event) => { event.preventDefault(); onKeep(); }}><h2 id="discard-title">Keep working on this draft?</h2><p id="discard-description">Your latest changes haven’t been saved. Switching configurations will discard them.</p><div><button className="launch-button launch-button-secondary" onClick={onKeep} autoFocus>Keep editing</button><button className="launch-button launch-button-primary" onClick={onDiscard}>Discard and continue</button></div></dialog>;
}
