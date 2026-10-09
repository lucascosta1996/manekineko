import type { ReactNode } from "react";

/** The Rewards subproject lockup; the parent wordmark remains canonical. */
export function RewardsBrand({ children, decorative = false }: { children: ReactNode; decorative?: boolean }) {
  return (
    <span className="ui-rewards-brand" role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "Tincta Rewards"} aria-hidden={decorative || undefined}>
      {children}
      <span className="ui-rewards-label">Rewards</span>
    </span>
  );
}
