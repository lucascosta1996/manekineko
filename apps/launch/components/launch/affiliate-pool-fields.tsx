"use client";

/** Historical proportional-pool display only. New collections use PrizeFields. */
export function AffiliatePoolFields({ poolPercent, slots }: {
  poolPercent: string; slots: string; disabled: boolean; onPool: (value: string) => void; onSlots: (value: string) => void;
}) {
  return <div className="launch-context-note"><strong>Historical affiliate terms</strong><p>This saved collection has a {poolPercent}% referral-weighted pool and {slots} positions. Its original terms are preserved. Current collections share a pool equally among affiliates who meet the referral minimum, subject to the common payout cap.</p></div>;
}
