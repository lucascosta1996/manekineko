'use client';
import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@manekineko/ui/button';
import { Field, Input } from '@manekineko/ui/forms';
import { safeLaunchDestination } from '../../lib/launch-navigation';

export function LaunchLogin({ destination = '/dashboard' }: { destination?: string }) {
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const inFlight = useRef(false);
  async function login(event: FormEvent) {
    event.preventDefault(); if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }), cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Sign-in is unavailable. Please try again.');
      window.location.assign(safeLaunchDestination(destination));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in is unavailable. Please try again.'); inFlight.current = false; setBusy(false); }
    finally { setPassword(''); }
  }
  return <section className="social-preview launch-sign-in" aria-labelledby="login-title">
    <div><h1 id="login-title">Sign in to Launch</h1><p>Use your operator account to access the dashboard, X previews and posting settings.</p></div>
    <form onSubmit={login} className="social-account-form" aria-busy={busy}>
      {error && <p role="alert">{error}</p>}
      <Field label="Launch username">{p => <Input {...p} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required disabled={busy} />}</Field>
      <Field label="Launch password">{p => <Input {...p} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" maxLength={128} required disabled={busy} />}</Field>
      <Button type="submit" busy={busy} busyLabel="Signing in…" reserveLabels={['Sign in', 'Signing in…']}>Sign in</Button>
      <p className="social-preview-note">Access is reserved for provisioned operators. Use your existing Launch credentials.</p>
    </form>
  </section>;
}
