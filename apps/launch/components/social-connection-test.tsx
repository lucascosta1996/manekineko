'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, LinkButton } from '@manekineko/ui/button';

type Result = { chainId: string; account: { id: string; username: string }; checkedAt: string };
export function SocialConnectionTest({ chainId }: { chainId: number }) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error' | 'login'>('idle');
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function testConnection() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setStatus('pending'); setResult(null); setError('');
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(`/api/social-account?chainId=${chainId}`, { method: 'POST', cache: 'no-store', signal: controller.signal });
      const value = await response.json();
      if (response.status === 401) { setStatus('login'); return; }
      if (!response.ok) throw new Error(value.error ?? 'The connection could not be verified. Try again.');
      if (value.chainId !== String(chainId) || !value.account?.username || !value.account?.id || !Number.isFinite(Date.parse(value.checkedAt))) throw new Error('X returned an invalid connection result. Try again.');
      setResult(value); setStatus('success');
    } catch (cause) {
      setError(controller.signal.aborted ? 'The connection check timed out. Try again.' : cause instanceof Error && cause.name !== 'TypeError' ? cause.message : 'The connection check could not complete. Try again.');
      setStatus('error');
    } finally { clearTimeout(timeout); active.current = null; }
  }
  const settings = `/social/account?chainId=${chainId}`;
  return <section className="social-connection-test" aria-labelledby="connection-title" aria-busy={status === 'pending'}>
    <h2 id="connection-title">X connection</h2>
    <p>Verify the saved account’s identity and credentials with X. This check does not send a post.</p>
    <div className="social-account-actions">
      <Button variant="secondary" onClick={() => void testConnection()} busy={status === 'pending'} busyLabel="Testing connection…" reserveLabels={['Test X connection', 'Testing connection…']}>Test X connection</Button>
      <LinkButton variant="secondary" href={settings}>X account settings</LinkButton>
    </div>
    {status === 'success' && result && <p role="status">Connected to @{result.account.username} on {chainId === 1 ? 'Ethereum Mainnet' : 'Sepolia testnet'} · Account ID {result.account.id}. Checked <time dateTime={result.checkedAt}>{new Date(result.checkedAt).toLocaleTimeString()}</time>.</p>}
    {status === 'error' && <p role="alert">{error}</p>}
    {status === 'login' && <div><p role="status">Your session has ended. Sign in to test the connection.</p><LinkButton href={`/login?next=${encodeURIComponent(`/social?chainId=${chainId}`)}`}>Sign in to Launch</LinkButton></div>}
  </section>;
}
