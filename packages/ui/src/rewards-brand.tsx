import type { ReactNode } from "react";
import { RewardsArtwork } from "./rewards-artwork";

/** The Rewards subproject lockup; the parent wordmark remains canonical. */
export function RewardsBrand({ children, decorative = false, compact = false }: { children: ReactNode; decorative?: boolean; compact?: boolean }) {
  return (
    <span className={`ui-rewards-brand${compact ? " ui-rewards-brand-compact" : ""}`} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "Tincta Rewards"} aria-hidden={decorative || undefined}>
      <span className="ui-rewards-signature"><RewardsArtwork className="ui-rewards-symbol" title="" />{children}</span>
      <span className="ui-rewards-label">Rewards</span>
    </span>
  );
}
