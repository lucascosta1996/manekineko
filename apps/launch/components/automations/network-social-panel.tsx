"use client";

import { useEffect, useState } from "react";
import type { RuntimeChainId, RuntimeCredentials, RuntimeProfile } from "../../lib/season-runtime";

const emptyCredentials: RuntimeCredentials = { apiKey: "", apiKeySecret: "", accessToken: "", accessTokenSecret: "" };
const fields = [["apiKey", "API key"], ["apiKeySecret", "API key secret"], ["accessToken", "Access token"], ["accessTokenSecret", "Access token secret"]] as const;
type Settings = { profile: RuntimeProfile | null; encryptionConfigured: boolean };
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store", headers: { "Content-Type": "application/json" } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? "Twitter / X configuration could not be loaded.");
  return data as T;
}

/** Network settings remain available even when the network has no saved season. */
export function NetworkSocialPanel({ chainId, allowedChainId, onSaved }: { chainId: RuntimeChainId; allowedChainId: RuntimeChainId | null; onSaved: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [handle, setHandle] = useState(""), [accountId, setAccountId] = useState(""), [baseUrl, setBaseUrl] = useState("");
  const [enabled, setEnabled] = useState(false), [credentials, setCredentials] = useState<RuntimeCredentials>(emptyCredentials);
  const path = `/api/launch/runtime/profiles/${chainId}`;
  const testnet = chainId === "11155111";
  const restricted = allowedChainId !== null && chainId !== allowedChainId;
  const blocked = loading || pending || restricted || !settings;
  function populate(next: Settings) {
    setSettings(next); setHandle(next.profile?.handle ?? ""); setAccountId(next.profile?.expectedAccountId ?? "");
    setBaseUrl(next.profile?.publicBaseUrl ?? ""); setEnabled(next.profile?.enabled ?? false); setCredentials(emptyCredentials);
  }
  useEffect(() => {
    let active = true;
    void request<Settings>(path).then(next => { if (active) populate(next); }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path]);
  async function reload() {
    setLoading(true); setError(""); setNotice("");
    try { populate(await request<Settings>(path)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reload settings."); }
    finally { setLoading(false); }
  }
  async function save() {
    if (blocked) return;
    setPending(true); setError(""); setNotice("");
    try {
      const result = await request<{ profile: RuntimeProfile }>(path, { method: "PUT", body: JSON.stringify({ revision: settings.profile?.revision ?? 0, enabled, handle, expectedAccountId: accountId, publicBaseUrl: baseUrl, ...(Object.values(credentials).some(Boolean) ? { credentials } : {}) }) });
      populate({ ...settings, profile: result.profile }); onSaved();
      setNotice(`${testnet ? "Sepolia" : "Mainnet"} Twitter / X configuration saved. The worker verifies the account ID before publishing.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save settings."); }
    finally { setPending(false); }
  }
  return <section className="season-runtime" aria-labelledby="network-social-title">
    <div className="season-runtime-heading"><div><span className="launch-eyebrow">{testnet ? "SEPOLIA / TEST ACCOUNT" : "MAINNET / REAL ACCOUNT"}</span><h2 id="network-social-title">Twitter / X configuration</h2><p>{testnet ? "Use a separate test account and website for Sepolia announcements." : "Configure the production account and website for Mainnet announcements."} These settings apply to every season on this network.</p></div><span className="launch-status">{loading ? "Loading" : settings?.profile ? "Configured" : "Not configured"}</span></div>
    {error && <div className="launch-alert launch-alert-error" role="alert">{error}</div>}
    {notice && <div className="launch-alert launch-alert-success" role="status">{notice}</div>}
    {restricted && <p className="launch-context-note">Open this network’s execution environment to save its credentials.</p>}
    <details><summary>{settings?.profile ? `@${settings.profile.handle} · Edit account settings` : "Configure account"}</summary>
      <div className="season-runtime-account"><p>Credentials are encrypted and never returned to the browser. Leave all four secret fields empty to keep saved credentials. Pause this network’s worker before changing settings.</p>
        <div className="launch-fields">
          <label className="launch-field"><span>Account handle</span><input value={handle} onChange={event => setHandle(event.target.value)} autoComplete="off" placeholder={testnet ? "@your_test_account" : "@tincta"} disabled={blocked}/></label>
          <label className="launch-field"><span>Numeric account ID</span><input value={accountId} onChange={event => setAccountId(event.target.value)} inputMode="numeric" autoComplete="off" disabled={blocked}/></label>
          <label className="launch-field launch-field-wide"><span>Public website for this network</span><input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder={testnet ? "https://your-test-website" : "https://tincta.xyz"} disabled={blocked}/><small>Every published thread uses this website.</small></label>
          {fields.map(([key, label]) => <label className="launch-field" key={key}><span>{label}</span><input type="password" value={credentials[key]} onChange={event => setCredentials(values => ({ ...values, [key]: event.target.value }))} autoComplete="new-password" placeholder={settings?.profile ? "Saved · enter to replace" : "Required"} disabled={blocked}/></label>)}
        </div>
        <label className="launch-checkbox"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={blocked}/><span>Enable publishing for this network</span></label>
        <button type="button" className="launch-button launch-button-secondary" disabled={blocked || !settings?.encryptionConfigured} onClick={() => void save()}>{pending ? "Saving…" : "Save Twitter / X configuration"}</button>{" "}
        <button type="button" className="launch-inline-link" disabled={loading || pending} onClick={() => void reload()}>Reload saved settings</button>
        {!loading && settings && !settings.encryptionConfigured && <p className="season-runtime-note">Configure the shared worker encryption key on Launch before saving credentials.</p>}
        {testnet && <p className="season-runtime-note">Names and accounts are independent. Shared colors, artwork, websites or wallets can still link public activity.</p>}
      </div>
    </details>
  </section>;
}
