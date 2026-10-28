'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, LinkButton, TextAction } from '@manekineko/ui/button';
import { Field, Input, Checkbox } from '@manekineko/ui/forms';
import type { RuntimeProfile, RuntimeCredentials } from '../lib/season-runtime';

type Settings = { username: string; profile: RuntimeProfile | null; encryptionConfigured: boolean; allowedChainId: string | null };
const emptyCredentials = (): RuntimeCredentials => ({ apiKey: '', apiKeySecret: '', accessToken: '', accessTokenSecret: '' });
const credentialFields = [['apiKey', 'API key'], ['apiKeySecret', 'API key secret'], ['accessToken', 'Access token'], ['accessTokenSecret', 'Access token secret']] as const;
export function SocialAccount({ chainId }: { chainId: number }) {
  const [status, setStatus] = useState<'loading' | 'login' | 'ready' | 'error'>('loading');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), inFlight = useRef(false);
  const [handle, setHandle] = useState(''), [accountId, setAccountId] = useState(''), [website, setWebsite] = useState('');
  const [enabled, setEnabled] = useState(false), [credentials, setCredentials] = useState(emptyCredentials);
  const endpoint = `/api/social-account?chainId=${chainId}`;
  function hydrate(value: Settings) {
    setSettings(value); setHandle(value.profile?.handle ?? ''); setAccountId(value.profile?.expectedAccountId ?? '');
    setWebsite(value.profile?.publicBaseUrl ?? ''); setEnabled(value.profile?.enabled ?? false); setCredentials(emptyCredentials()); setStatus('ready');
  }
  async function load(signal?: AbortSignal) {
    setStatus('loading'); setError('');
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal });
      const value = await response.json();
      if (signal?.aborted) return;
      if (response.status === 401) { setSettings(null); setCredentials(emptyCredentials()); setStatus('login'); return; }
      if (!response.ok) throw new Error(value.error ?? 'Account settings could not be loaded.');
      hydrate(value);
    } catch (e) { if (!signal?.aborted) { setError(e instanceof Error ? e.message : 'Account settings could not be loaded.'); setStatus('error'); } }
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [endpoint]);
  async function perform(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Account settings could not be saved.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function send(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    const value = await response.json();
    if (!response.ok) {
      if (response.status === 401) { setStatus('login'); setSettings(null); setCredentials(emptyCredentials()); }
      throw new Error(value.error ?? 'The request could not be completed.');
    }
    return value;
  }
  function save(event: FormEvent) {
    event.preventDefault(); void perform(async () => {
      const entered = Object.values(credentials).filter(Boolean).length;
      if (entered > 0 && entered < 4) throw new Error('Enter all four OAuth credentials, or leave all four blank to keep the saved credentials.');
      const value = await send(endpoint, 'PUT', { revision: settings?.profile?.revision ?? 0, handle, expectedAccountId: accountId, publicBaseUrl: website, enabled, ...(entered ? { credentials } : {}) });
      hydrate({ ...settings!, profile: value.profile }); setNotice(`Verified @${value.profile.handle} and saved this network’s account. Publishing has not been started.`);
    });
  }
  const blocked = busy || !settings?.encryptionConfigured || settings.allowedChainId !== String(chainId);
  return <section className="social-preview social-account" aria-labelledby="account-title">
    <div><h1 id="account-title">X account</h1><p>Choose where Genesis, season and collection posts will be published on {chainId === 1 ? 'Mainnet' : 'Sepolia'}. Saving an account does not start publishing.</p></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {status === 'loading' && <p role="status">Loading account settings…</p>}
    {status === 'error' && <Button variant="secondary" onClick={() => void load()}>Try again</Button>}
    {status === 'login' && <div><p>Your session has ended. Sign in to continue.</p><LinkButton href={`/login?next=${encodeURIComponent(`/social/account?chainId=${chainId}`)}`}>Sign in to Launch</LinkButton></div>}
    {status === 'ready' && settings && <form onSubmit={save} className="social-account-form">
      <div><h2>{settings.profile ? `Posting account: @${settings.profile.handle}` : 'No posting account saved'}</h2><p>Credentials are encrypted on the server and never shown again. X verifies the account before saving and before publishing.</p></div>
      {settings.allowedChainId !== String(chainId) && <p role="status">Account changes for this network are unavailable in this deployment. Use the deployment configured for this network.</p>}
      {!settings.encryptionConfigured && <p role="status">Encrypted account storage is not configured. Contact the deployment operator.</p>}
      <div className="social-preview-fields">
        <Field label="X handle" hint="For example, @tinctarewards. Use a separate test account on Sepolia.">{p => <Input {...p} value={handle} onChange={e => setHandle(e.target.value)} required disabled={blocked} autoComplete="off" />}</Field>
        <Field label="Numeric X account ID">{p => <Input {...p} value={accountId} onChange={e => setAccountId(e.target.value)} required disabled={blocked} inputMode="numeric" autoComplete="off" />}</Field>
      </div>
      <Field label="Public website" hint="The HTTPS website linked from this network’s posts.">{p => <Input {...p} type="url" value={website} onChange={e => setWebsite(e.target.value)} required disabled={blocked} />}</Field>
      <div className="social-preview-fields">{credentialFields.map(([key, label]) => <Field key={key} label={label} hint={settings.profile ? 'Leave blank to keep the saved credential.' : undefined}>{p => <Input {...p} type="password" value={credentials[key]} onChange={e => setCredentials(c => ({ ...c, [key]: e.target.value }))} required={!settings.profile} disabled={blocked} autoComplete="new-password" />}</Field>)}</div>
      <Checkbox checked={enabled} onChange={e => setEnabled(e.target.checked)} label="Allow automated posts to this account" disabled={blocked} />
      <p className="social-preview-note">The sender must be started separately. Changing the destination stops an existing sender; its previous posting history stays bound to the old account.</p>
      <div className="social-account-actions"><Button type="submit" busy={busy} busyLabel="Verifying and saving…" reserveLabels={['Verify and save account', 'Verifying and saving…']} disabled={blocked}>Verify and save account</Button><TextAction disabled={busy} onClick={() => void load()}>Reload settings</TextAction></div>
    </form>}
    <LinkButton href={`/social?chainId=${chainId}`} variant="secondary">Review X images</LinkButton>
  </section>;
}
