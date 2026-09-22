"use client";

import { WalletMintCap, useWalletMintCap } from "../launch/wallet-mint-cap";
import { PrizeFields } from "../launch/prize-fields";
import { SeasonTimingFields } from "./season-timing-fields";
import { NetworkSocialPanel } from "./network-social-panel";
import { SeasonRuntimePanel } from "./season-runtime-panel";
import { MAX_SEASON_COLLECTIONS } from "@manekineko/contract-abi/season-appearance";
import { SeasonAppearanceFields, previewAppearance } from "../launch/season-appearance-fields";
import { createSeasonId } from "../launch/form-values";
import { isCurrentCollection, isCurrentSeason } from "../../lib/current-launch";
import { HistoricalSnapshot } from "../launch/historical-snapshot";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { AutomationPlan, AutomationSummary, AutomationValidation } from "../../lib/launch-automation";
import { orderAutomationSummaries } from "../../lib/automation-summary-order";
import type { LaunchConfiguration } from "../../lib/launch-config";
import { LaunchHeader } from "../launch/launch-header";
import { AffiliateEligibilityFields } from "../launch/affiliate-eligibility-fields";
import { WinnerCreditFields } from "../launch/winner-credit-fields";
import { winnerCreditBudget } from "../launch/form-values";
import { collectionEconomics, type DurationUnit, type LaunchForm } from "../launch/form-values";
import { applyTemplate, cloneStep, cloneAutomationForm, defaultAutomationForm, formFromAutomation, dateInputToUtc, payloadFromAutomationForm, resizeSteps, type AutomationForm, type StepForm } from "./form-values";

class SessionExpired extends Error {}
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/launch${path}`, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", ...options?.headers } });
  const data = await response.json().catch(() => null);
  if (response.status === 401) throw new SessionExpired("Your session has expired. Sign in again in a new tab, then retry. Your unsaved changes are still here.");
  if (!response.ok) throw new Error(`${data?.message || data?.error || "The request could not be completed."}${Array.isArray(data?.issues) && data.issues.length ? ` ${data.issues.join(" ")}` : ""}`);
  return data as T;
}

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`launch-field${wide ? " launch-field-wide" : ""}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Duration({ label, value, unit, disabled, onValue, onUnit, hint }: { label: string; value: string; unit: DurationUnit; disabled: boolean; onValue: (value: string) => void; onUnit: (value: DurationUnit) => void; hint: string }) {
  const id = `automation-${label.replaceAll(" ", "-").toLowerCase()}`;
  return <div className="launch-field"><label htmlFor={id}>{label}</label><div className="launch-duration"><input id={id} inputMode="numeric" value={value} onChange={(event) => onValue(event.target.value)} disabled={disabled} /><select aria-label={`${label} unit`} value={unit} onChange={(event) => onUnit(event.target.value as DurationUnit)} disabled={disabled}><option value="days">days</option><option value="hours">hours</option><option value="seconds">seconds</option></select></div><small>{hint}</small></div>;
}

function dateLabel(value: string | null) {
  if (!value) return "When enabled";
  return `${new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
}

function deadlineLabel(step: StepForm) {
  if (step.deadlineMode === "fixed") return step.deadlineInput ? dateLabel(dateInputToUtc(step.deadlineInput, "Deadline")) : "Set a deadline";
  return `${step.form.duration || "—"} ${step.form.durationUnit} from scheduled mint opening`;
}

function summaryOf(record: AutomationPlan): AutomationSummary {
  return { id: record.id, currentModel: isCurrentSeason(record.plan), seasonOrder: record.seasonOrder, name: record.plan.name, chainId: record.plan.chainId, collectionCount: record.plan.steps.length, status: record.status, revision: record.revision, contentHash: record.contentHash, createdAt: record.createdAt, updatedAt: record.updatedAt, preparedAt: record.preparedAt };
}

export function AutomationConsole({ username, allowedChainId = null }: { username: string; allowedChainId?: "1" | "11155111" | null }) {
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [network, setNetwork] = useState<"1" | "11155111">("1");
  const [records, setRecords] = useState<AutomationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [templates, setTemplates] = useState<LaunchConfiguration[]>([]);
  const [selected, setSelected] = useState<AutomationPlan | null>(null);
  const [form, setForm] = useState<AutomationForm>(() => defaultAutomationForm([], "1"));
  const [baseline, setBaseline] = useState(() => JSON.stringify(defaultAutomationForm([], "1")));
  const [stepId, setStepId] = useState("");
  const [count, setCount] = useState("3");
  const [templateId, setTemplateId] = useState("");
  const [view, setView] = useState<"editor" | "review">("editor");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<"mocks" | "save" | "validate" | "prepare" | "logout" | "open" | "more" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [validation, setValidation] = useState<AutomationValidation | null>(null);
  const [accepted, setAccepted] = useState(false);
  const timezone = "UTC";
  const initialized = useRef(false);
  const generation = useRef(0);
  const leaving = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(form) !== baseline;
  const prepared = selected?.status === "prepared";
  const currentRecords = records.filter(record => record.currentModel !== false);
  const historicalRecords = records.filter(record => record.currentModel === false);
  const blocked = loading || loadFailed || pending !== null;
  const historical = selected !== null && !isCurrentSeason(selected.plan);
  const disabled = blocked || prepared || historical;
  const stepIndex = Math.max(0, form.steps.findIndex((step) => step.id === stepId));
  const step = form.steps[stepIndex];
  const current = step?.form;
  const economics = current ? collectionEconomics(current) : null;
  const creditBudget = current ? winnerCreditBudget(current) : null;

  const openRecord = useCallback((record: AutomationPlan | null) => {
    const next = record ? formFromAutomation(record) : defaultAutomationForm(Array.from({ length: 3 }, () => crypto.randomUUID()), network, createSeasonId());
    setSelected(record); setForm(next); setBaseline(JSON.stringify(next)); setStepId(next.steps[0]?.id ?? ""); setCount(String(next.steps.length)); setView(record?.status === "prepared" ? "review" : "editor"); setError(""); setNotice(""); setValidation(null); setAccepted(false); setTemplateId("");
  }, [network]);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setLoadFailed(false); setError("");
    try {
      const [plans, configurations] = await Promise.all([api<{ automations: AutomationSummary[]; nextCursor: string | null }>(`/automations?chainId=${network}`), api<{ configurations: LaunchConfiguration[] }>("/configurations")]);
      if (request !== generation.current) return;
      setRecords(plans.automations); setNextCursor(plans.nextCursor); setTemplates(configurations.configurations.filter(item => isCurrentCollection(item.payload) && item.payload.contract.chainId === network));
      if (!initialized.current) {
        const firstSummary = plans.automations.find(record => record.currentModel !== false);
        const first = firstSummary ? (await api<{ automation: AutomationPlan }>(`/automations/${firstSummary.id}`)).automation : null;
        if (request !== generation.current) return;
        openRecord(first);
      }
      initialized.current = true;
    } catch (cause) { if (request === generation.current) { setError(cause instanceof Error ? cause.message : "Seasons could not be loaded."); setSessionExpired(cause instanceof SessionExpired); setLoadFailed(true); } }
    finally { if (request === generation.current) setLoading(false); }
  }, [openRecord, network]);

  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (!leaving.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(next: AutomationForm) {
    if (disabled) return;
    setForm(next); setValidation(null); setAccepted(false); setNotice("");
  }
  function editPlan<K extends keyof AutomationForm>(key: K, value: AutomationForm[K]) {
    const next = { ...form, [key]: value };
    if (key === "name" && next.seasonId !== undefined) next.steps = next.steps.map(item => ({ ...item, form: { ...item.form, seasonId: next.seasonId, seasonName: next.name } }));
    change(next);
  }
  function editStep(next: StepForm) { change({ ...form, steps: form.steps.map((item) => item.id === next.id ? next : item) }); }
  function edit<K extends keyof LaunchForm>(key: K, value: LaunchForm[K]) {
    if (!step) return;
    editStep({ ...step, form: { ...step.form, [key]: value } });
  }
  async function selectRecord(record: AutomationSummary | null) {
    if (blocked || (dirty && !window.confirm("Discard unsaved changes and open another season?"))) return;
    if (!record) { openRecord(null); return; }
    setPending("open"); setError("");
    try { const result = await api<{ automation: AutomationPlan }>(`/automations/${record.id}`); openRecord(result.automation); }
    catch (cause) { failure(cause); }
    finally { setPending(null); }
  }
  async function loadMore() {
    if (blocked || !nextCursor) return;
    setPending("more"); setError("");
    try {
      const result = await api<{ automations: AutomationSummary[]; nextCursor: string | null }>(`/automations?chainId=${network}&cursor=${encodeURIComponent(nextCursor)}`);
      setRecords((items) => orderAutomationSummaries([...items, ...result.automations.filter((item) => !items.some((existing) => existing.id === item.id))])); setNextCursor(result.nextCursor);
    } catch (cause) { failure(cause); }
    finally { setPending(null); }
  }
  function switchNetwork(next: "1" | "11155111") {
    if (next === network || blocked || (dirty && !window.confirm("Discard unsaved changes and switch season networks?"))) return;
    generation.current++; initialized.current = false;
    setLoading(true); setRecords([]); setNextCursor(null); setTemplates([]); setSelected(null);
    setValidation(null); setAccepted(false); setTemplateId(""); setError(""); setNotice("");
    const empty = defaultAutomationForm([], next);
    setForm(empty); setBaseline(JSON.stringify(empty)); setNetwork(next);
  }
  function remember(record: AutomationPlan) {
    const next = formFromAutomation(record);
    setRecords((items) => orderAutomationSummaries([summaryOf(record), ...items.filter((item) => item.id !== record.id)]));
    setSelected(record); setForm(next); setBaseline(JSON.stringify(next)); setCount(String(next.steps.length)); setAccepted(false);
  }
  function failure(cause: unknown) { setError(cause instanceof Error ? cause.message : "The request could not be completed."); setSessionExpired(cause instanceof SessionExpired); }

  async function createMocks() {
    if (blocked || dirty) return;
    setPending("mocks"); setError(""); setNotice("");
    try {
      const result = await api<{ createdSeasons: number; createdCollections: number; existingSeasons: number }>("/automations/sepolia-mocks", { method: "POST", body: "{}" });
      initialized.current = false;
      await load();
      setNotice(result.createdSeasons ? `${result.createdSeasons} Sepolia seasons and ${result.createdCollections} collections saved with independent names. Configure Sepolia wallets and dates before preparation.` : "All Mainnet seasons already have Sepolia copies. Existing names and edits were preserved.");
    } catch (cause) { failure(cause); }
    finally { setPending(null); }
  }

  async function save() {
    if (disabled) return;
    setPending("save"); setError(""); setNotice(""); setSessionExpired(false); setValidation(null);
    try {
      const plan = payloadFromAutomationForm(form);
      const result = await api<{ automation: AutomationPlan }>(selected ? `/automations/${selected.id}` : "/automations", { method: selected ? "PUT" : "POST", body: JSON.stringify({ plan, ...(selected ? { revision: selected.revision } : {}) }) });
      remember(result.automation); setNotice("Season draft saved. Each collection keeps its own name, color and settings.");
    } catch (cause) { failure(cause); }
    finally { setPending(null); }
  }
  async function validate() {
    if (!selected || dirty || blocked) return;
    setPending("validate"); setError(""); setNotice(""); setSessionExpired(false); setValidation(null);
    try {
      const result = await api<{ validation: AutomationValidation }>(`/automations/${selected.id}/validate`, { method: "POST", body: JSON.stringify({ revision: selected.revision }) });
      setValidation(result.validation);
      if (result.validation.valid) setNotice("Every collection passes configuration checks. Review the saved sequence before preparing it.");
      setView("review");
    } catch (cause) { failure(cause); }
    finally { setPending(null); }
  }
  async function prepare() {
    if (!selected || dirty || disabled || !accepted || !validation?.valid) return;
    setPending("prepare"); setError(""); setNotice("");
    try {
      const result = await api<{ automation: AutomationPlan }>(`/automations/${selected.id}/prepare`, { method: "POST", body: JSON.stringify({ revision: selected.revision }) });
      remember(result.automation); setNotice("Season prepared. Review the event previews and X account below, then request execution.");
    } catch (cause) { failure(cause); }
    finally { setPending(null); }
  }
  async function logout() {
    if (dirty && !window.confirm("Sign out and discard unsaved season changes?")) return;
    setPending("logout"); setError("");
    try { await api("/auth/logout", { method: "POST", body: "{}" }); leaving.current = true; window.location.replace("/login?next=/seasons"); }
    catch (cause) { failure(cause); setPending(null); }
  }

  function resize() {
    if (disabled) return;
    try {
      if (Number(count) < form.steps.length && !window.confirm(`Remove the last ${form.steps.length - Number(count)} collections from this draft?`)) return;
      const steps = resizeSteps(form.steps, count, () => crypto.randomUUID());
      change({ ...form, steps });
      if (!steps.some((item) => item.id === stepId)) setStepId(steps.at(-1)!.id);
      setError("");
    } catch (cause) { failure(cause); }
  }
  function duplicateStep() {
    if (!step || disabled || form.steps.length >= MAX_SEASON_COLLECTIONS) return;
    const next = cloneStep(step, crypto.randomUUID(), form.steps.length + 1);
    const steps = [...form.steps]; steps.splice(stepIndex + 1, 0, next);
    change({ ...form, steps }); setCount(String(steps.length)); setStepId(next.id); setTemplateId("");
  }
  function removeStep() {
    if (!step || disabled || form.steps.length < 2 || !window.confirm(`Remove ${step.form.label || "this collection"} from the season?`)) return;
    const steps = form.steps.filter((item) => item.id !== step.id);
    if (stepIndex === 0) {
      const first = step.form;
      steps[0] = { ...steps[0], form: { ...steps[0].form, factoryMode: first.factoryMode, factoryAddress: first.factoryAddress, deployerAddress: first.deployerAddress, factoryOwnerAddress: first.factoryOwnerAddress } };
    }
    change({ ...form, steps }); setCount(String(steps.length)); setStepId(steps[Math.min(stepIndex, steps.length - 1)].id);
  }
  function move(direction: -1 | 1) {
    const nextIndex = stepIndex + direction;
    if (disabled || nextIndex < 0 || nextIndex >= form.steps.length) return;
    const first = form.steps[0].form;
    const steps = [...form.steps]; [steps[stepIndex], steps[nextIndex]] = [steps[nextIndex], steps[stepIndex]];
    steps[0] = { ...steps[0], form: { ...steps[0].form, factoryMode: first.factoryMode, factoryAddress: first.factoryAddress, deployerAddress: first.deployerAddress, factoryOwnerAddress: first.factoryOwnerAddress } };
    change({ ...form, steps });
  }
  function duplicatePlan() {
    if (blocked || historical) return;
    const next = cloneAutomationForm(form, () => crypto.randomUUID(), createSeasonId);
    setSelected(null); setForm(next); setBaseline(""); setStepId(next.steps[0].id); setView("editor"); setValidation(null); setAccepted(false); setNotice("Independent season copy created. Keep up to 10 collections, review their settings and save a new draft."); setError("");
  }

  const address = (label: string, key: "initialOwner" | "enrollmentSigner" | "deployerAddress" | "factoryOwnerAddress" | "factoryAddress", hint: string) => current && <Field label={label} hint={hint} wide><input value={current[key]} onChange={(event) => edit(key, event.target.value)} disabled={disabled} className="launch-address-input" placeholder="0x…" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={42} /></Field>;
  const safeDeadline = (item: StepForm) => { try { return deadlineLabel(item); } catch { return "Check deadline"; } };

  return <div className="launch-shell automation-shell">
    <a className="launch-skip" href="#launch-main">Skip to workspace</a>
    <LaunchHeader username={username} active="seasons" onLogout={logout} pending={pending !== null} />
    <main id="launch-main">
      <div className="season-network-switch" role="group" aria-label="Season network">
        <button type="button" aria-pressed={network === "1"} onClick={() => switchNetwork("1")} disabled={blocked}>Ethereum Mainnet</button>
        <button type="button" aria-pressed={network === "11155111"} onClick={() => switchNetwork("11155111")} disabled={blocked}>Sepolia testnet</button>
      </div>
      <p className="launch-context-note" role="status">{network === "1" ? "Mainnet seasons · Production plans, separate from Sepolia rehearsals." : "Sepolia seasons · Rehearsals using test ETH. Mainnet plans are kept separately."}{allowedChainId && allowedChainId !== network ? " This environment allows saving these drafts; preparation and deployment remain restricted to its configured network." : ""}</p>
      <section className="launch-hero automation-hero"><div><span className="launch-eyebrow">TINCTA / SEASONS</span><h1>A season of possibilities.</h1><p>Create a named season with up to 10 collections. Give each its own name, color, terms and timeline.</p></div><button className="launch-button launch-button-primary" onClick={() => selectRecord(null)} disabled={blocked}><span aria-hidden="true">＋</span> New season</button></section>
      <div className="automation-service-status"><span className="automation-status-icon" aria-hidden="true">↗</span><div><strong>Plan, preview and run a season.</strong><p>Prepare immutable V10 terms or preserve a saved V9 plan, configure a separate X account for each network, and request the persistent worker to launch the season.</p></div><span className="automation-service-badge">V9/V10 worker controls</span></div>
      {error && <div ref={errorRef} tabIndex={-1} className="launch-alert launch-alert-error" role="alert"><strong>Action needed</strong><p>{error}</p>{sessionExpired && <a className="launch-inline-link" href="/login?next=/seasons" target="_blank" rel="noreferrer">Sign in in a new tab</a>}{loadFailed && <button className="launch-inline-link" onClick={() => void load()} disabled={loading}>Retry loading</button>}</div>}
      {notice && <div className="launch-alert launch-alert-success" role="status">{notice}</div>}
      <NetworkSocialPanel key={network} chainId={network} allowedChainId={allowedChainId} onSaved={() => setProfileEpoch(value => value + 1)} />
      {network === "11155111" && <section className="automation-service-status"><div><strong>Mainnet terms, independent test identities.</strong><p>Create Sepolia copies of saved Mainnet seasons, keeping collection counts, colors, economics and cadence. Existing test copies stay unchanged. Set Sepolia wallets, dates and Twitter / X credentials separately.</p><button type="button" className="launch-button launch-button-secondary" disabled={blocked || dirty} onClick={() => void createMocks()}>{pending === "mocks" ? "Creating mock seasons…" : "Create Sepolia mock seasons"}</button>{dirty && <p>Save your current edits before creating mock seasons.</p>}</div></section>}
      <section className="automation-library" aria-label="Saved seasons"><div className="automation-library-label"><span className="launch-eyebrow">YOUR SEASONS</span><span>{currentRecords.length}{nextCursor ? "+" : ""} saved</span></div><div className="automation-plan-list">{currentRecords.map((record) => <button key={record.id} className={`automation-plan-card${selected?.id === record.id ? " is-active" : ""}`} onClick={() => selectRecord(record)} disabled={blocked} aria-pressed={selected?.id === record.id}><span className="automation-plan-card-top"><strong>{record.name}</strong><span className={`launch-status${record.status === "prepared" ? " is-finalized" : ""}`}>{record.status}</span></span><span>{record.collectionCount} collections <i>·</i> {record.chainId === "1" ? "Ethereum" : "Sepolia"}</span></button>)}{nextCursor && <button className="automation-plan-card automation-more" onClick={loadMore} disabled={blocked}>{pending === "more" ? "Loading…" : "Load more seasons"}</button>}{!loading && !currentRecords.length && <p className="automation-library-empty">No editable seasons on this network yet. Start with the draft below.</p>}{loading && <p className="automation-library-empty" role="status">Loading your seasons…</p>}</div></section>
      {templates.some(item => item.status === "finalized") && <section className="automation-library" aria-label="Finalized test seasons">
        <div className="automation-library-label"><span className="launch-eyebrow">FINALIZED {network === "11155111" ? "TEST " : ""}SEASONS</span><span>Original contract terms</span></div>
        <div className="automation-plan-list">{Array.from(new Set(templates.filter(item => item.status === "finalized").map(item => item.payload.contract.seasonName))).map(name => {
          const entries = templates.filter(item => item.status === "finalized" && item.payload.contract.seasonName === name);
          const names = Array.from(new Set(entries.map(item => item.payload.contract.name)));
          return <a key={name ?? "unnamed"} className="automation-plan-card" href="/launch"><span className="automation-plan-card-top"><strong>{name || "Unnamed season"}</strong><span className="launch-status is-finalized">Finalized</span></span><span>{names.join(" · ")} · {network === "11155111" ? "Sepolia" : "Mainnet"}</span><small>View saved collection configurations →</small></a>;
        })}</div><p className="automation-library-empty">Finalized and deployed collections keep their original referral minimum. New editable collections default to 1 paid referral.</p>
      </section>}
      {historicalRecords.length > 0 && <details className="launch-advanced"><summary>Historical seasons <span>{historicalRecords.length} read-only</span></summary><div className="automation-plan-list">{historicalRecords.map(record => <button key={record.id} className="automation-plan-card" onClick={() => selectRecord(record)} disabled={blocked}><span className="launch-eyebrow">HISTORICAL RECORD</span><strong>{record.name}</strong><span>{record.collectionCount} collections · {record.status}</span></button>)}</div></details>}
      {historical && selected ? <section className="launch-editor"><HistoricalSnapshot title={selected.plan.name} revision={selected.revision} status={selected.status} payload={selected.plan} contentHash={selected.contentHash} exportHref={prepared ? `/api/launch/automations/${selected.id}/export` : undefined} /></section> : form.steps.length > 0 && <>
        <section className="automation-plan-settings" aria-labelledby="automation-settings-title"><div className="automation-section-intro"><span className="launch-eyebrow">THE SEASON</span><h2 id="automation-settings-title">{prepared ? "Prepared season" : "Give your season an identity"}</h2><p>One season name across up to 10 collections. Every collection has its own identity and settings.</p><div className="season-capacity" aria-label={`${form.steps.length} of 10 collection positions used`}>{Array.from({ length: MAX_SEASON_COLLECTIONS }, (_, index) => <i key={index} className={index < form.steps.length ? "is-filled" : ""} />)}</div>{form.seasonId && <details className="season-identity-details"><summary>Season identity</summary><p className="season-summary-id">{form.seasonId}</p></details>}</div><div className="launch-fields automation-plan-fields">
          <Field label="Season name" wide><input value={form.name} maxLength={64} onChange={(event) => editPlan("name", event.target.value)} disabled={disabled} placeholder="Crimson & Blood Orange" /></Field>
          <Field label="Network" hint="Use the network switch above to work on a separate season."><input value={network === "1" ? "Ethereum Mainnet" : "Ethereum Sepolia"} readOnly /></Field>
          <Field label="Number of collections" hint="1–10 collections per season. New entries copy the last collection’s settings."><span className="automation-count-input"><input value={count} inputMode="numeric" maxLength={2} aria-label="Number of collections, maximum 10" onChange={(event) => setCount(event.target.value)} disabled={disabled} /><button type="button" disabled={disabled || count === String(form.steps.length)} onClick={resize}>Apply</button></span></Field>
          <Field label="First collection mint opening (UTC)" hint="Required before preparation. Allow deployment and the full enrollment window beforehand."><input type="datetime-local" step="1" value={form.startInput} onChange={(event) => editPlan("startInput", event.target.value)} disabled={disabled} /></Field>
        </div></section>
        <SeasonTimingFields form={form} disabled={disabled} onChange={change}/>
        <div className="automation-rule-strip"><span aria-hidden="true">✓</span><p><strong>Next launch is fixed from the previous sellout.</strong> The draw must be verified and prizes fully reserved. Holder claims do not delay the sequence. Missed targets, unsold collections and errors pause for review.</p></div>
        <div className="automation-workspace">
          <aside className="automation-queue" aria-label="Collection launch order"><div className="automation-queue-heading"><span className="launch-eyebrow">LAUNCH ORDER</span><span>{form.steps.length} collections</span></div><ol>{form.steps.map((item, index) => <li key={item.id}><button className={`automation-queue-item${item.id === step?.id && view === "editor" ? " is-active" : ""}`} onClick={() => { setStepId(item.id); setView("editor"); setTemplateId(""); }} disabled={blocked} aria-pressed={item.id === step?.id && view === "editor"}><span className="automation-queue-number" style={{ background: previewAppearance(item.form.collectionColor).background, color: previewAppearance(item.form.collectionColor).text }}>{String(index + 1).padStart(2, "0")}</span><span className="automation-queue-text"><strong>{item.form.name || item.form.label || `Collection ${index + 1}`}</strong><span>{item.form.maxSupply || "—"} tickets · {item.form.mintPriceEth || "—"} ETH</span><small>{safeDeadline(item)}</small></span></button></li>)}</ol><button className={`automation-review-link${view === "review" ? " is-active" : ""}`} onClick={() => setView("review")} disabled={blocked}><span aria-hidden="true">☷</span> Review sequence <span aria-hidden="true">→</span></button><p className="automation-queue-footnote">Up to 10 collections share this season name. Names, colors and launch terms are independent.</p></aside>
          <section className="launch-editor automation-editor" aria-label={view === "review" ? "Season review" : "Collection settings"}>
            <div className="launch-editor-heading"><div><span className="launch-eyebrow">{view === "review" ? "BEFORE EXECUTION" : `COLLECTION ${String(stepIndex + 1).padStart(2, "0")} OF ${String(form.steps.length).padStart(2, "0")}`}</span><h2>{view === "review" ? "Review the sequence" : current?.name || current?.label || "Collection settings"}</h2></div><span className={`launch-status${prepared ? " is-finalized" : ""}`}>{prepared ? "Prepared" : dirty ? "Unsaved changes" : "Draft"}</span></div>
            {prepared && <div className="launch-frozen-note"><span aria-hidden="true">✓</span><p>This snapshot is fixed. Duplicate it to change collection terms or timing.</p><button onClick={duplicatePlan} disabled={blocked}>Duplicate season</button></div>}
            {view === "editor" && current && step ? <div className="launch-editor-body">
              <div className="automation-entry-toolbar"><p>Terms for this collection</p><div><button onClick={() => move(-1)} disabled={disabled || stepIndex === 0} aria-label="Move collection earlier">↑</button><button onClick={() => move(1)} disabled={disabled || stepIndex === form.steps.length - 1} aria-label="Move collection later">↓</button><button onClick={duplicateStep} disabled={disabled || form.steps.length >= MAX_SEASON_COLLECTIONS}>Duplicate</button><button onClick={removeStep} disabled={disabled || form.steps.length === 1}>Remove</button></div></div>
              {templates.length > 0 && <div className="automation-template"><label htmlFor="automation-template">Start from a saved configuration</label><div><select id="automation-template" value={templateId} disabled={disabled} onChange={(event) => setTemplateId(event.target.value)}><option value="">Choose a configuration…</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.label} · {template.status}</option>)}</select><button disabled={disabled || !templateId} onClick={() => { const template = templates.find((item) => item.id === templateId); if (template && window.confirm("Replace this collection’s settings with an independent copy of the selected configuration?")) { editStep(applyTemplate(step, template)); setTemplateId(""); } }}>Copy settings</button></div><small>The season network and first collection’s factory settings take precedence. Templates keep this collection’s name and color, season identity, payout model and canonical affiliate eligibility registry.</small></div>}
              <div className="launch-fields">
                <Field label="Collection label" hint="Private label used in this launch sequence." wide><input value={current.label} onChange={(event) => edit("label", event.target.value)} disabled={disabled} maxLength={100} /></Field>
                <Field label="Collection name"><input value={current.name} onChange={(event) => edit("name", event.target.value)} disabled={disabled} placeholder="Velvet Ember" maxLength={80} /></Field>
                <Field label="Collection symbol"><input value={current.symbol} onChange={(event) => edit("symbol", event.target.value)} disabled={disabled} placeholder="TINCTA" /></Field>
                <Field label="Ticket supply"><input inputMode="numeric" value={current.maxSupply} onChange={(event) => edit("maxSupply", event.target.value)} disabled={disabled} /></Field>
                <Field label="Ticket price"><div className="launch-input-unit"><input inputMode="decimal" value={current.mintPriceEth} onChange={(event) => edit("mintPriceEth", event.target.value)} disabled={disabled} /><span>ETH</span></div></Field>
                <Field label="Deadline type" wide><select value={step.deadlineMode} onChange={(event) => editStep({ ...step, deadlineMode: event.target.value as "duration" | "fixed" })} disabled={disabled}><option value="duration">Duration from scheduled mint opening</option><option value="fixed">Fixed calendar deadline</option></select></Field>
                {step.deadlineMode === "duration" ? <Duration label="Collection lifetime" value={current.duration} unit={current.durationUnit} disabled={disabled} onValue={(value) => edit("duration", value)} onUnit={(value) => edit("durationUnit", value)} hint="The sale duration starts at the scheduled mint opening. Affiliate enrollment happens before it." /> : <Field label="Collection deadline (UTC)" hint={`In ${timezone}. This deadline will not move if the previous collection is delayed.`}><input type="datetime-local" step="1" value={step.deadlineInput} onChange={(event) => editStep({ ...step, deadlineInput: event.target.value })} disabled={disabled} /></Field>}
                <Duration label="Affiliate enrollment window" value={current.enrollmentDuration} unit={current.enrollmentDurationUnit} disabled={disabled} onValue={(value) => edit("enrollmentDuration", value)} onUnit={(value) => edit("enrollmentDurationUnit", value)} hint="Must fit inside the sellout-to-launch delay, leaving time to confirm deployment. Enrollment closes at the fixed mint opening." />
              </div>
              <SeasonAppearanceFields form={{ ...current, ...(form.seasonId !== undefined ? { seasonId: form.seasonId, seasonName: form.name } : {}) }} disabled={disabled} inheritedSeason={form.seasonId !== undefined} onChange={(next) => editStep({ ...step, form: next })} />
              <WalletMintCap form={current} disabled={disabled} onUpgrade={() => change({ ...form, steps: form.steps.map(item => ({ ...item, form: useWalletMintCap(item.form) })) })}/>
              <PrizeFields form={current} disabled={disabled} onChange={next => editStep({ ...step, form: next })}/>
              <AffiliateEligibilityFields mintCap={current.maxMintsPerWallet} version={current.algorithmVersion} address={form.steps[0]?.form.affiliateEligibilityAddress} disabled={disabled} inherited={stepIndex > 0} onAddress={(value) => change({ ...form, steps: form.steps.map(item => ({ ...item, form: { ...item.form, affiliateEligibilityAddress: value } })) })}/>
              <WinnerCreditFields form={current} disabled={disabled} onRegistry={(value) => edit("winnerCreditsAddress", value)} onBudget={(value) => edit("winnerCreditSponsorshipEth", value)} onConfigure={() => editStep({ ...step, form: { ...current, winnerCreditsAddress: "", winnerCreditSponsorshipEth: "" } })}/>
              <details className="launch-advanced automation-advanced"><summary>Ownership & randomness <span>Wallets and VRF funding</span></summary><div className="launch-fields">
                {address("Collection owner", "initialOwner", "Wallet controlling this collection. A production multisig can be used here.")}
                {address("Affiliate enrollment signer", "enrollmentSigner", "Dedicated enrollment signer; separate from collection owner and deployment authority.")}
                <Field label="Randomness funding" hint="Separate ETH budget for this collection’s Chainlink VRF subscription."><div className="launch-input-unit"><input inputMode="decimal" value={current.fundingEth} onChange={(event) => edit("fundingEth", event.target.value)} disabled={disabled} placeholder="Set funding" /><span>ETH</span></div></Field>
                <Field label="Request confirmations" hint="64–200 confirmations."><input inputMode="numeric" value={current.requestConfirmations} onChange={(event) => edit("requestConfirmations", event.target.value)} disabled={disabled} /></Field>
                <Field label="VRF callback gas limit" hint="100,000–2,500,000 gas."><input inputMode="numeric" value={current.callbackGasLimit} onChange={(event) => edit("callbackGasLimit", event.target.value)} disabled={disabled} /></Field>
              </div><p>Ethereum VRF coordinator and key hash are pinned by the selected network. Funding and on-chain readiness must be checked again before execution.</p></details>
              <details className="launch-advanced automation-advanced"><summary>Factory & deployment authority <span>{stepIndex === 0 ? "Shared across the sequence" : "Inherited from collection 01"}</span></summary>{stepIndex === 0 ? <div className="launch-fields">
                <Field label="Factory mode" wide><select value={current.factoryMode} onChange={(event) => edit("factoryMode", event.target.value as "new" | "existing")} disabled={disabled}><option value="new">Create a new factory with the first collection</option><option value="existing">Use an existing factory</option></select></Field>
                {current.factoryMode === "existing" && address("Existing factory", "factoryAddress", "Verified factory on the season’s selected network.")}
                {address("Deployment wallet", "deployerAddress", "The future execution service must be authorized to use this wallet. No private keys are stored here.")}
                {address("Factory owner", "factoryOwnerAddress", "The current deployment workflow requires the same address as the deployment wallet.")}
              </div> : <p>This collection will use the factory and deployment authority defined by collection 01. Change those shared settings in the first entry; collection owners and enrollment signers remain independent.</p>}</details>
              <details className="launch-advanced automation-advanced"><summary>Operator notes <span>Optional</span></summary><div className="launch-fields"><Field label="Collection notes" wide hint="Operational notes only. Never add passwords, seed phrases or private keys."><textarea value={current.notes} onChange={(event) => edit("notes", event.target.value)} disabled={disabled} maxLength={4000} rows={3} /></Field></div></details>
              {economics && <div className="automation-economics"><span>AT SELLOUT</span><div><span>Total ticket sales<strong>{economics.sales} ETH</strong></span><span>Total prize reserve<strong>{economics.prize} ETH</strong></span><span>Affiliate pool<strong>{economics.maxCommission} ETH</strong></span><span>Minimum operator gross proceeds<strong>{economics.operatorMinimum} ETH</strong></span></div><div><span>Winner credit reserve<strong>{creditBudget ? `${creditBudget.sponsorshipEth} ETH` : "Not set"}</strong></span><span>Reserve + randomness<strong>{creditBudget?.upfrontFundingEth ? `${creditBudget.upfrontFundingEth} ETH` : "Not set"}</strong></span></div><p>Gross proceeds exclude operator sponsorship, deployment gas and randomness funding. Qualified affiliates share the pool equally, subject to the payout cap. Unallocated funds remain in the separate growth reserve.</p></div>}
            </div> : <div className="launch-editor-body automation-review">
              <div className="automation-review-summary"><div><span>SEASON</span><strong>{form.name}</strong><small>Shared name on each NFT</small></div><div><span>NETWORK</span><strong>{form.chainId === "1" ? "Ethereum Mainnet" : "Ethereum Sepolia"}</strong></div><div><span>COLLECTIONS</span><strong>{form.steps.length} in sequence</strong></div><div><span>FIRST MINT OPENING</span><strong>{form.startInput ? form.startInput.replace("T", " ") : "Not configured"}</strong><small>{form.startInput ? timezone : "Required before preparation"}</small></div><div><span>ADVANCE RULE</span><strong>Sold out + verified draw + funded prizes</strong><small>Pause on refunds or errors</small></div>{form.timing && <div><span>FIXED SELLOUT DELAYS</span><strong>{form.timing.nextLaunchDelaySeconds}s to mint opening</strong><small>{form.timing.nextAnnouncementDelaySeconds}s to next launch announcement · X disconnected</small></div>}</div>
              <div className="launch-context-note"><p><strong>Canonical affiliate eligibility registry</strong><br/>{form.steps[0].form.affiliateEligibilityAddress || "Not configured"}<br/>Shared across the sequence. Only the first official collection on the network is exempt from NFT ownership; the first entry of a new season is not automatically exempt. Later collections require a currently held NFT from an earlier official collection that sold out and completed its verified draw with protected prizes. Earlier versions keep their original settlement requirements. Each NFT and wallet can unlock one position per collection. Enroll before the scheduled mint opening; subsequent transfers leave the registered position and earnings in place.</p></div>
              <ol className="automation-review-list">{form.steps.map((item, index) => <li key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong><span className="season-swatch" style={{ background: previewAppearance(item.form.collectionColor).background }} />{item.form.name || "Collection name needed"}</strong><p>{item.form.collectionColor || "Color not configured"} · {item.form.maxSupply} tickets at {item.form.mintPriceEth || "—"} ETH</p><small>{safeDeadline(item)} · {item.form.enrollmentDuration} {item.form.enrollmentDurationUnit} enrollment</small><small>{`${item.form.winnerCount} equal prizes · ${item.form.prizePercent}% total`} · {`${item.form.affiliatePoolPercent || "—"}% affiliate pool · `}{item.form.slots} affiliate positions · VRF {item.form.fundingEth || "not set"}{item.form.fundingEth ? " ETH" : ""}</small><small>Winner credit reserve: {item.form.winnerCreditSponsorshipEth ? `${item.form.winnerCreditSponsorshipEth} ETH` : "not set"} · Up to {winnerCreditBudget(item.form)?.maximumClaims ?? "—"} sponsored NFTs</small>{item.deadlineMode === "fixed" && item.deadlineInput && <small>UTC: {(() => { try { return dateInputToUtc(item.deadlineInput, "Deadline"); } catch { return "Check deadline"; } })()}</small>}</div><button className="launch-inline-link" onClick={() => { setStepId(item.id); setView("editor"); }} disabled={blocked}>{prepared ? "View" : "Edit"}</button></li>)}</ol>
              {validation && !validation.valid && <div className="launch-alert launch-alert-error" role="alert"><strong>Complete these checks before preparing</strong><ul>{validation.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
              {prepared && selected ? <div className="launch-finalized-card"><span className="launch-eyebrow">PREPARED SNAPSHOT</span><h3>Your sequence is ready for execution review.</h3><p>These collection settings are immutable. Configure the X account and use the season execution controls below to start the worker.</p><dl><dt>Prepared</dt><dd>{dateLabel(selected.preparedAt)}</dd><dt>Content hash</dt><dd>{selected.contentHash}</dd></dl><a className="launch-button launch-button-primary" href={`/api/launch/automations/${selected.id}/export`} download>Export season manifest <span aria-hidden="true">↓</span></a></div> : <div className="launch-finalize-card"><h3>Prepare this season.</h3><p>Preparation freezes a versioned snapshot for the version-aware execution worker. It does not start a launch, schedule a transaction or spend funds.</p>{(!selected || dirty) && <p className="launch-save-reminder">Save your latest changes before validating the sequence.</p>}<button className="launch-button launch-button-secondary automation-validate" onClick={validate} disabled={blocked || dirty || !selected}>{pending === "validate" ? "Checking collections…" : "Validate all collections"}</button>{validation?.valid && <><p className="automation-validation-pass">✓ Every collection passes configuration checks.</p><label className="launch-checkbox"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={blocked} /><span>I reviewed every collection, deadline and wallet. Prepare this immutable snapshot for integration.</span></label><button className="launch-button launch-button-primary" onClick={prepare} disabled={blocked || dirty || !accepted}>{pending === "prepare" ? "Preparing…" : "Prepare season"}</button></>}</div>}
            </div>}
            <div className="launch-editor-footer"><div><span className={`launch-save-dot${dirty ? " is-dirty" : ""}`} /><span>{prepared ? "Immutable prepared snapshot" : dirty ? "Unsaved changes" : selected ? `Saved · revision ${selected.revision}` : "New draft · not saved yet"}</span></div><div>{view === "editor" && <button className="launch-button launch-button-secondary" onClick={() => setView("review")} disabled={blocked}>Review sequence <span aria-hidden="true">→</span></button>}{!prepared && <button className="launch-button launch-button-primary" onClick={save} disabled={disabled || (!!selected && !dirty)}>{pending === "save" ? "Saving…" : "Save season"}</button>}</div></div>
          </section>
        </div>
      </>}
      {selected && !historical && <SeasonRuntimePanel key={`${selected.id}:${profileEpoch}`} automation={selected} allowedChainId={allowedChainId} dirty={dirty}/>}
    </main><footer className="launch-page-footer"><span>Tincta · Private launch workspace</span><span>Prepared seasons run through a separately configured V9/V10 worker. Live status appears in the execution panel.</span></footer>
  </div>;
}
