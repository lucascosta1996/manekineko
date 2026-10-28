/** Separate immutable deployment profiles. Accelerated terms are Sepolia/local only. */
export const v17FastBallotOptions = [
  { supply: 20n, price: 100_000_000_000_000n, winners: 6n, duration: 600n },
  { supply: 40n, price: 200_000_000_000_000n, winners: 4n, duration: 180n },
  { supply: 20n, price: 100_000_000_000_000n, winners: 10n, duration: 600n },
];
export { v16LocalBallotOptions as v17ProductionBallotOptions } from './v16-ballot.ts';
export const v17FastTiming = { votingDelay: 1, votingDuration: 180, confirmations: 3 };
