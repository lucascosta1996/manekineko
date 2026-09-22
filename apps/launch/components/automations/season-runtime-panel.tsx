"use client";

import { useCallback, useEffect, useState } from "react";
import type { AutomationPlan } from "../../lib/launch-automation";
import type { RuntimeSnapshot } from "../../lib/season-runtime";
import type { SeasonSocialMessage } from "@manekineko/contract-abi/season-social";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", ...options?.headers } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? "The season runtime could not be loaded. Check the database migration and sign-in session.");
  return data as T;
}
type Preview = { key: string; collectionLabel: string; message: SeasonSocialMessage; imageUrl: string };
function date(value: string | null) { return value ? new Date(value).toLocaleString(undefined, { timeZone: "UTC" }) + " UTC" : "Not connected yet"; }

export function SeasonRuntimePanel({ automation, allowedChainId, dirty }: { automation: AutomationPlan; allowedChainId: "1" | "11155111" | null; dirty: boolean }) {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [acceptedBinding, setAcceptedBinding] = useState("");
  const [accepted, setAccepted] = useState(false), [previews, setPreviews] = useState<Preview[]>([]), [previewKey, setPreviewKey] = useState("");
  const path = `/api/launch/automations/${automation.id}/runtime`;
  const restricted = allowedChainId !== null && allowedChainId !== automation.plan.chainId;
  const preview = previews.find(item => item.key === previewKey) ?? previews[0];
  const load = useCallback(async () => {
    try {
      const next = await request<RuntimeSnapshot>(path);
      setSnapshot(next); setLoadError("");
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : "Unable to load the season."); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 10000); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    let active = true;
    void request<{ previews: Preview[] }>(`${path}/previews`).then(value => { if (active) setPreviews(value.previews); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Previews unavailable."); });
    return () => { active = false; };
  }, [path, automation.revision]);
  async function control(action: "start" | "pause" | "resume") {
    if (!snapshot || (action !== "pause" && (!accepted || acceptedBinding !== reviewBinding))) return;
    setPending(true); setError(""); setNotice("");
    try {
      await request(path, { method: action === "start" ? "POST" : "PATCH", body: JSON.stringify(action === "start" ? { revision: automation.revision, preparedHash: automation.contentHash, profileRevision: snapshot.profile?.revision } : { action, revision: snapshot.run?.revision, profileRevision: snapshot.profile?.revision }) });
      setAccepted(false); await load(); setNotice(action === "pause" ? "Pause requested. Already submitted transactions cannot be cancelled here." : "Execution requested. The worker will validate the network, versioned terms, funding and X account before the first announcement.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not be completed."); }
    finally { setPending(false); }
  }
  const run = snapshot?.run, active = run && run.desiredState === "running";
  const reviewBinding = `${automation.revision}:${snapshot?.profile?.revision ?? 0}:${run?.revision ?? 0}`;
  const reviewAccepted = accepted && acceptedBinding === reviewBinding;
  const blocked = loading || pending || restricted;
  const canRun = !blocked && !dirty && automation.status === "prepared" && !!snapshot?.profile?.enabled && !!snapshot?.encryptionConfigured && automation.plan.social?.enabled === true;
  return <section className="season-runtime" aria-labelledby="season-runtime-title">
    <div className="season-runtime-heading"><div><span className="launch-eyebrow">SEASON EXECUTION / V9 + V10</span><h2 id="season-runtime-title">Ready when you are.</h2><p>Review the images and this network’s Twitter / X configuration, then start the prepared season.</p></div><span className="launch-status">{loading ? "Loading" : run?.status ?? "Not started"}</span></div>
    {error && <div className="launch-alert launch-alert-error" role="alert">{error}</div>}
    {loadError && <div className="launch-alert launch-alert-error" role="alert">{loadError}</div>}
    {notice && <div className="launch-alert launch-alert-success" role="status">{notice}</div>}
    {restricted && <p className="launch-context-note">This environment supports draft planning for {automation.plan.chainId === "1" ? "Mainnet" : "Sepolia"}. Open the matching execution environment to save credentials or run this season.</p>}
    <div>
      <div className="season-runtime-controls"><span className="launch-eyebrow">PERSISTENT WORKER</span><h3>{run ? `Season ${run.status}` : "Start this season"}</h3><p>The external worker deploys and prepares each version-pinned collection in order, posts confirmed events, and publishes countdowns after the first announcement.</p><dl><dt>Snapshot</dt><dd>{automation.status === "prepared" ? `Prepared revision ${automation.revision}` : "Save, review and prepare first"}</dd><dt>X account</dt><dd>{snapshot?.profile ? `@${snapshot.profile.handle} · revision ${snapshot.profile.revision}` : "Not configured"}</dd><dt>Worker heartbeat</dt><dd>{date(run?.heartbeatAt ?? null)}</dd><dt>Run ID</dt><dd>{run?.id ?? "Created when you start"}</dd></dl>
        {run?.lastError && <p className="launch-alert launch-alert-error">{run.lastError}</p>}
        {run?.status === "queued" && <p className="season-runtime-note">Waiting for the configured worker to pick up this request. Starting here does not start the worker process.</p>}
        {run?.desiredState === "paused" && run.status !== "paused" && <p className="season-runtime-note">Pause requested. Waiting for the worker to finish its current action.</p>}
        {dirty && <p className="season-runtime-note">Save the latest changes to refresh previews and prepare the reviewed settings.</p>}
        {!automation.plan.social?.enabled && <p className="season-runtime-note">Enable automatic X posts in season cadence before preparing.</p>}
        {!active && <><label className="launch-checkbox"><input type="checkbox" checked={reviewAccepted} onChange={event => { setAccepted(event.target.checked); setAcceptedBinding(reviewBinding); }} disabled={!canRun}/><span>I reviewed this version-pinned season and @{snapshot?.profile?.handle || "the X account"}. {run?.status === "completed" ? "Resume confirmed claim announcements" : "Start autonomous deployments and event posts"} on {automation.plan.chainId === "1" ? "Ethereum Mainnet" : "Sepolia"}.</span></label><button type="button" className="launch-button launch-button-primary" onClick={() => void control(run ? "resume" : "start")} disabled={!canRun || !reviewAccepted}>{pending ? "Requesting…" : run?.status === "completed" ? "Resume claim monitoring" : run ? "Resume season" : "Start season"}</button></>}
        {active && <button type="button" className="launch-button launch-button-secondary" disabled={blocked} onClick={() => void control("pause")}>{run.status === "completed" ? "Pause claim monitoring" : "Pause season"}</button>}
      </div>
    </div>
    <div className="season-runtime-preview"><div><span className="launch-eyebrow">POSTS & IMAGES</span><h3>Every event, in the season’s colors.</h3><p>Preview examples use saved names, colors and terms. Dates, winners and totals shown here are illustrative; the worker replaces them with confirmed event data.</p><select aria-label="Social event preview" value={preview?.key ?? ""} onChange={event => setPreviewKey(event.target.value)}>{previews.map(item => <option key={item.key} value={item.key}>{item.collectionLabel} · {item.message.header}</option>)}</select></div>
      {preview && <div className="season-runtime-preview-grid"><div><img src={preview.imageUrl} alt={`Preview example: ${preview.message.alt}`} width={1600} height={900}/><span className="season-runtime-note">PREVIEW EXAMPLE · 1600 × 900</span></div><div><pre>{preview.message.post}</pre><details><summary>Thread replies ({preview.message.replies.length})</summary>{preview.message.replies.map((reply, index) => <pre key={index}>{reply}</pre>)}</details></div></div>}
      {!preview && !loading && <p className="season-runtime-note">Complete and save the collection terms to generate event previews.</p>}
    </div>
    {run && <div className="season-runtime-audit"><div><h3>Activity</h3>{snapshot?.events.length ? <ol>{snapshot.events.map(event => <li key={event.id}><time>{date(event.createdAt)}</time><p>{event.message}</p></li>)}</ol> : <p>No worker activity yet.</p>}</div><div><h3>Transactions & posts</h3>{snapshot?.actions.length ? <ol>{snapshot.actions.map(action => <li key={action.id}><strong>{action.kind.replaceAll("-", " ").replaceAll("_", " ")}</strong><span>{action.status}</span>{action.postId && <a href={`https://x.com/i/status/${action.postId}`} target="_blank" rel="noreferrer">View post ↗</a>}{action.txHash && <a href={`https://${automation.plan.chainId === "11155111" ? "sepolia." : ""}etherscan.io/tx/${action.txHash}`} target="_blank" rel="noreferrer">Transaction ↗</a>}{action.lastError && <p>{action.lastError}</p>}</li>)}</ol> : <p>The durable outbox appears here when the worker starts.</p>}</div></div>}
  </section>;
}
