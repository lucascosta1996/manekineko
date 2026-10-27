/**
 * Draft V16 ballot shared by the local contract suites and voting preview.
 * Options 1 and 2 preserve the previous Sepolia packages; option 3 adds ten prizes.
 * This is not a frozen deployment manifest or authorization to deploy.
 * The immutable menu applies to every paid collection in the deployment.
 */
export const v16LocalBallotOptions = [
  { supply: 1000n, price: 10_000_000_000_000_000n, winners: 6n, duration: 3600n },
  { supply: 2000n, price: 20_000_000_000_000_000n, winners: 4n, duration: 86400n },
  { supply: 1000n, price: 10_000_000_000_000_000n, winners: 10n, duration: 86400n },
];
