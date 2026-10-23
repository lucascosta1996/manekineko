import type { RoundState } from './chain';

function duration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const h = Math.floor(total / 3600) % 24, m = Math.floor(total / 60) % 60, s = total % 60;
  return `${days ? `${days}d ` : ''}${[h, m, s].map(n => String(n).padStart(2, '0')).join(':')}`;
}
/** A timer never upgrades a cached phase to a claim or refund entitlement. */
export function collectionTiming(r: RoundState, now: number, stale = false) {
  if (stale) return { label: 'Timing unavailable', value: '—', detail: 'Refresh the network read before reviewing an action.', unavailable: true };
  if (r.phase === 0) {
    const beforeVote = now < Number(r.voteStart), target = Number(beforeVote ? r.voteStart : r.start);
    return { label: beforeVote ? 'Voting opens in' : 'Minting opens in', value: duration(target - now), detail: now >= Number(r.start) ? 'Voting deadline reached. Checking current contract state.' : 'Minting opens at the voting deadline without an operator signature.' };
  }
  if (r.phase === 1) return { label: 'Mint deadline in', value: duration(Number(r.deadline) - now), detail: now >= Number(r.deadline) ? 'Mint deadline reached. Checking whether the collection sold out before showing refund availability.' : 'If this collection remains unsold at its onchain deadline, holders can claim full mint-price refunds.' };
  if (r.phase === 7) return { label: 'Refunds available for', value: duration(now - Number(r.soldOutAt > 0n ? r.randomnessDeadline : r.deadline)), detail: `${r.soldOutAt > 0n ? 'No randomness was recorded within 72 hours of sellout.' : 'The mint deadline passed without a sellout.'} Holders can claim full mint-price refunds now; no operator approval is needed. The next collection can be prepared while refunds remain reserved.` };
  if (r.phase === 2 || r.phase === 3) return { label: 'Randomness deadline in', value: duration(Number(r.randomnessDeadline) - now), detail: now >= Number(r.randomnessDeadline) ? 'Randomness deadline reached. Checking the contract before showing refund availability.' : `${r.phase === 2 ? 'The VRF request has not succeeded. Anyone can retry it.' : 'Waiting for Chainlink randomness.'} If none is recorded before this deadline, full mint-price refunds become available. All mint funds remain reserved.` };
  if (r.phase === 4) return { label: 'Time since sellout', value: duration(now - Number(r.soldOutAt)), detail: 'Randomness recorded — refunds unavailable. Anyone can finalize the fixed draw and claim the separately funded executor reward. There is no expiry for recorded results; your signature is not required.' };
  return { label: 'Time since sellout', value: duration(now - Number(r.soldOutAt)), detail: 'Draw finalized — refunds unavailable. Winning holders and qualified affiliates can claim; the operator can settle and prepare the next collection.' };
}
