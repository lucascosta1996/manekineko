'use client';

import { useEffect, useRef, useState } from 'react';
import { IconButton, textActionClassName } from './button';
import { Icon } from './icons';
import { mintActivityId, mintTransactionUrl, parseMintActivity, type MintActivity } from './mint-activity';
import './mint-notification.css';

const mutedKey = 'tincta:mint-notifications:hidden';

export function MintNotification() {
  const [muted, setMuted] = useState(false);
  const [queue, setQueue] = useState<MintActivity[]>([]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const seen = useRef(new Set<string>());
  const current = queue[0];

  useEffect(() => {
    try { if (sessionStorage.getItem(mutedKey)) { setMuted(true); return; } } catch { /* Storage is optional. */ }
    if (muted) return;
    let baseline = false, disposed = false, request: AbortController | undefined;
    let lastSuccess = 0;
    const active = () => document.visibilityState === 'visible' && navigator.onLine;
    async function poll() {
      if (disposed || request || !active()) return;
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch('/api/mint-activity', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Unavailable');
        const events = parseMintActivity(await response.json());
        if (disposed || controller.signal.aborted || !active()) return;
        const ids = new Set(events.map(mintActivityId));
        const fresh = events.filter(event => !seen.current.has(mintActivityId(event)));
        // The first snapshot, a return to this tab, or a long outage establishes a baseline.
        // Never replay old mints as new activity.
        if (baseline && Date.now() - lastSuccess < 90_000) {
          setQueue(previous => [...previous.filter(event => ids.has(mintActivityId(event))), ...fresh]
            .filter((event, index, all) => all.findIndex(item => mintActivityId(item) === mintActivityId(event)) === index).slice(0, 3));
        }
        for (const id of ids) seen.current.add(id);
        if (seen.current.size > 500) seen.current = new Set([...seen.current].slice(-250));
        baseline = true;
        lastSuccess = Date.now();
      } catch { /* Activity is optional; errors never interrupt the page. */ }
      finally { window.clearTimeout(timeout); if (request === controller) request = undefined; }
    }
    function availabilityChanged() {
      baseline = false;
      request?.abort();
      request = undefined;
      setQueue([]);
      if (active()) void poll();
    }
    void poll();
    const interval = window.setInterval(() => void poll(), 15_000);
    document.addEventListener('visibilitychange', availabilityChanged);
    window.addEventListener('online', availabilityChanged);
    window.addEventListener('offline', availabilityChanged);
    return () => {
      disposed = true; request?.abort(); window.clearInterval(interval);
      document.removeEventListener('visibilitychange', availabilityChanged);
      window.removeEventListener('online', availabilityChanged);
      window.removeEventListener('offline', availabilityChanged);
    };
  }, [muted]);

  useEffect(() => {
    if (!current || hovered || focused) return;
    const timer = window.setTimeout(() => setQueue(previous => previous.slice(1)), 8_000);
    return () => window.clearTimeout(timer);
  }, [current, hovered, focused]);

  function hide() {
    setMuted(true); setQueue([]);
    try { sessionStorage.setItem(mutedKey, '1'); } catch { /* Still hidden until unmount. */ }
  }

  return <aside className="ui-mint-notification" aria-label="Mint activity" hidden={muted || !current}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <Icon name="ticket" />
    <div className="ui-mint-notification-content">
      <div role="status" aria-live="polite" aria-atomic="true">
        {current && <><p className="ui-mint-notification-label">Mint confirmed{current.chainId === 11155111 ? ' · Sepolia testnet' : ''}</p>
          <p className="ui-mint-notification-name">{current.name} #{current.tokenId}</p></>}
      </div>
      {current && <a className={textActionClassName({})} href={mintTransactionUrl(current)} target="_blank" rel="noreferrer">View mint <Icon name="diagonal" /></a>}
    </div>
    <IconButton aria-label="Hide mint notifications for this visit" onClick={hide}><Icon name="close" /></IconButton>
  </aside>;
}
