"use client";

import { useEffect, useRef, useState } from "react";
import { unseenReferrals, type ReferralActivity, type ReferralActivityEvent } from "../../lib/affiliates/referral-activity";
import { walletError } from "../../lib/affiliates/wallet";

export function AffiliateReferralActivity({ collectionId, chainId, wallet, onConfirmed }: { collectionId: string; chainId: number; wallet: string; onConfirmed: () => void }) {
  const [activity, setActivity] = useState<ReferralActivity | null>(null), [error, setError] = useState("");
  const [notifications, setNotifications] = useState<ReferralActivityEvent[]>([]), [refresh, setRefresh] = useState(0);
  const onChange = useRef(onConfirmed); onChange.current = onConfirmed;
  useEffect(() => {
    const controller = new AbortController(), storageKey = `tincta:referral-notices:${chainId}:${collectionId}:${wallet.toLowerCase()}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seen = new Set<string>();
    try { const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]"); if (Array.isArray(saved)) seen = new Set(saved.filter(item => typeof item === "string")); } catch { /* Notification preferences do not authorize any financial action. */ }
    setActivity(null); setNotifications([]); setError("");
    async function poll() {
      try {
        const response = await fetch(`/api/collections/${collectionId}/affiliates/activity?${new URLSearchParams({ wallet })}`, { cache: "no-store", signal: controller.signal });
        const next = await response.json() as ReferralActivity & { error?: string };
        if (!response.ok) throw new Error(next.error || "Referral activity could not be verified.");
        if (controller.signal.aborted) return;
        if (next.wallet.toLowerCase() !== wallet.toLowerCase() || next.chainId !== chainId || next.collectionId !== collectionId) throw new Error("Referral activity returned a different wallet or network.");
        const fresh = unseenReferrals(next.events, seen);
        for (const event of fresh) seen.add(event.id);
        try { localStorage.setItem(storageKey, JSON.stringify([...seen].slice(-1000))); } catch { /* In-memory deduplication continues for this view. */ }
        setActivity(next); setError("");
        // Replacing the verified window removes orphaned/reorganized events and notices.
        setNotifications(current => [...fresh, ...current.filter(event => next.events.some(candidate => candidate.id === event.id))].slice(0, 20));
        if (fresh.length) onChange.current();
      } catch (cause) { if (!controller.signal.aborted) setError(walletError(cause)); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => { if (document.visibilityState === "visible") void poll(); else timer = setTimeout(() => void poll(), 15_000); }, 15_000); }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [collectionId, chainId, wallet, refresh]);
  const explorer = chainId === 1 ? "https://etherscan.io" : "https://sepolia.etherscan.io";
  return <section className="affiliate-referral-activity" aria-label="Confirmed referral activity">
    <h3>Confirmed referrals</h3>
    {notifications.length > 0 && !error && <p role="status" aria-live="polite">Confirmed: {notifications.reduce((sum, event) => sum + event.quantity, 0)} referred ticket(s) were attributed to your wallet. <button type="button" className="text-button" onClick={() => setNotifications([])}>Dismiss notification</button></p>}
    {error && <p role="alert">{error} {activity && "The previous observation is stale."}</p>}
    {activity ? <><p>{activity.referredMints} referred tickets · Verified at block {activity.blockNumber} · {new Date(activity.observedAt).toUTCString()}</p>
      <p>Referral receipts count toward qualification. Commission follows this collection's sellout and payout rules.</p>
      <ul>{activity.events.map(event => <li key={event.id}>{event.quantity} ticket(s), beginning with #{event.firstTokenId} · <a href={`${explorer}/tx/${event.transactionHash}`} target="_blank" rel="noreferrer">Mint receipt</a></li>)}</ul>
      {!activity.events.length && <p>{activity.referredMints > 0 ? "Referrals are recorded on chain; their receipts are still indexing." : "No confirmed referrals found for this wallet."}</p>}
      {activity.hasMore && <p>Showing the 20 most recent verified receipts. The referral total includes all attributed tickets.</p>}
    </> : !error && <p role="status">Checking confirmed referral receipts…</p>}
    <button type="button" className="text-button" onClick={() => setRefresh(value => value + 1)}>Refresh referral activity</button>
  </section>;
}
