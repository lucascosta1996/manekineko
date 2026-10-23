import { createHash } from 'node:crypto';
export const PROFILE = 'sepolia-fast-v12-15m-15m';
export const CHAIN = 11155111;
export const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
export const canonicalHash = (data: unknown) => hash(JSON.stringify(data));
export type PlannedCollection = { seasonId: string; seasonName: string; name: string; symbol: string; color: string; textColor: string; scenario: 'sellout' | 'unsold-refund'; season: number; choice: number };
export function assertSepolia(chain: bigint | number) { if (BigInt(chain) !== 11155111n) throw new Error('This rehearsal cannot run on Mainnet or any other network.'); }
export function makePlan(catalog: any) {
  assertSepolia(catalog.chainId);
  if (catalog.seasons.length < 2 || catalog.seasons.slice(0, 2).some((s: any) => s.collections.length !== 10)) throw new Error('Expected the first two ten-collection Sepolia seasons.');
  const collections: PlannedCollection[] = catalog.seasons.slice(0, 2).flatMap((s: any, season: number) => s.collections.map((c: any, index: number) => ({
    seasonId: s.seasonId, seasonName: s.name, name: c.name, symbol: c.symbol, color: c.color, textColor: c.textColor,
    scenario: index === 9 ? 'unsold-refund' : 'sellout', season: season + 1,
    choice: season === 0 && index === 0 ? 0 : (season * 10 + index) % 3,
  })));
  return {
    schemaVersion: 1, profile: PROFILE, chainId: CHAIN, walletCount: 100,
    votingDuration: 900, votingDelay: 60, mintDuration: 900, randomnessTimeout: 259200,
    confirmations: 2, vrfConfirmations: 64, callbackGas: 200000,
    coordinator: '0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B', keyHash: '0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae',
    maxFeeGwei: '5', maxGrossSpendEth: '1000', walletGasReserveEth: '0.01', minimumInitialEth: '30',
    randomnessBudget: '50000000000000000', sponsorshipBudget: '12000000000000000',
    options: [
      { supply: '1000', price: '10000000000000000', winners: '6', duration: '900' },
      { supply: '2000', price: '10000000000000000', winners: '6', duration: '900' },
      { supply: '1000', price: '12000000000000000', winners: '4', duration: '900' },
    ], collections,
  };
}
export type Plan = ReturnType<typeof makePlan>;
