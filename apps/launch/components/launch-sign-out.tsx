'use client';
import { useRef, useState } from 'react';
import { TextAction } from '@manekineko/ui/button';
export function LaunchSignOut() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const inFlight = useRef(false);
  async function signOut() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/session', { method: 'DELETE', cache: 'no-store' });
      if (!response.ok) throw new Error('Sign-out could not be completed. Please try again.');
      // Drop all prefetched private page data when leaving the authenticated app.
      window.location.assign('/login');
    } catch { setError('Sign-out could not be completed. Please try again.'); inFlight.current = false; setBusy(false); }
  }
  return <div className="launch-session-actions"><TextAction disabled={busy} onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</TextAction>{error && <p role="alert">{error}</p>}</div>;
}
