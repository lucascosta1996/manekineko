import { createHash } from 'node:crypto';
import { getAddress, parseEther } from 'ethers';
import type { DeploymentExpectation } from '../verify-deployment.mts';
export const PROFILE = 'sepolia-v13-aster-8-sellouts-2-refunds-v1';
export const RECOVERY = '0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145';
export const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
export const canonicalHash = (data: unknown) => hash(JSON.stringify(data));
export function assertSepolia(chain: number | bigint) { if (BigInt(chain) !== 11155111n) throw new Error('This buyer runner is Sepolia only.'); }
export function makePlan(expected: DeploymentExpectation) {
  assertSepolia(expected.chainId);
  const season = expected.catalog[0]?.seasonId;
  const collections = expected.catalog.filter(c => c.seasonId === season);
  if (collections.length !== 10 || expected.catalog.slice(0, 10).some(c => c.seasonId !== season) || expected.settings.votingDuration !== 3600 || expected.settings.votingDelay !== 60 ||
    expected.options[0]?.supply !== '1000' || expected.options[0]?.price !== String(parseEther('0.01')) || expected.options[0]?.winners !== '6' || expected.options[0]?.duration !== '3600')
    throw new Error('This rehearsal requires the reviewed first ten-collection season and option zero.');
  return { version: 1 as const, profile: PROFILE, chainId: 11155111, recovery: getAddress(RECOVERY), expected,
    walletCount: 50, initialFundingEth: '20', maximumFundingEth: '30', maxGasEth: '1.5', recoveryGasReserveEth: '1', maxFeeGwei: '5',
    maxGrossSpendEth: '300', walletGasReserveEth: '0.02', operatorGasReserveEth: '0.005', confirmations: 2,
    collections: collections.map((c, i) => ({ ...c, number: i + 1, option: 0, scenario: i === 4 || i === 9 ? 'unsold-refund' as const : 'sellout' as const })) };
}
export type Plan = ReturnType<typeof makePlan>;
export function validatePlan(plan: Plan) {
  if (canonicalHash(plan) !== canonicalHash(makePlan(plan.expected))) throw new Error('Rehearsal policy differs from the reviewed fixed plan.');
}
