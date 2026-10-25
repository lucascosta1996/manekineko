/** Explicit version selection for read-only observers and bounded executors. */
import { Contract, getAddress, isHexString, keccak256, type Provider } from 'ethers';
import controllerV12 from '../../packages/contracts/src/ManekinekoSeasonControllerV12.json' with { type: 'json' };
import controllerV13 from '../../packages/contracts/src/ManekinekoSeasonControllerV13.json' with { type: 'json' };
import roundV12 from '../../packages/contracts/src/ManekinekoRoundV12.json' with { type: 'json' };
import roundV13 from '../../packages/contracts/src/ManekinekoRoundV13.json' with { type: 'json' };
import { verifyHolderPool } from '../../packages/protocol/src/holder-rewards.ts';

export type RuntimeConfig = { version?: 12 | 13; chainId: number; controller: string; codeHash: string; holderRewardsCodeHash?: string };
export function runtimeVersion(config: Pick<RuntimeConfig, 'version' | 'holderRewardsCodeHash'>): 12 | 13 {
  const version = config.version ?? 12;
  if (version !== 12 && version !== 13) throw new Error('Unsupported protocol version.');
  if (version === 13 && !isHexString(config.holderRewardsCodeHash, 32)) throw new Error('V13 requires an explicit holder rewards runtime pin.');
  if (version === 12 && config.holderRewardsCodeHash) throw new Error('V13 pins require explicit version 13.');
  return version;
}
export async function workerRuntime(provider: Provider, config: RuntimeConfig, block: number) {
  const version = runtimeVersion(config), at = { blockTag: block };
  if (Number((await provider.getNetwork()).chainId) !== config.chainId) throw new Error('Worker network mismatch.');
  const code = await provider.getCode(config.controller, block);
  if (code === '0x' || keccak256(code).toLowerCase() !== config.codeHash.toLowerCase()) throw new Error('Controller pin mismatch.');
  const controller = new Contract(config.controller, version === 13 ? controllerV13 : controllerV12, provider);
  if (await controller.CONTRACT_VERSION(at) !== `season-controller-v${version}`) throw new Error('Controller version mismatch.');
  const pool = version === 13 ? await verifyHolderPool(provider, { ...config, version, rpcUrl: '' }, block) : null;
  return { controller, version, roundAbi: version === 13 ? roundV13 : roundV12, holderRewards: pool ? getAddress(await pool.getAddress()) : null };
}
export async function verifyWorkerRound(round: Contract, runtime: Awaited<ReturnType<typeof workerRuntime>>, block: number) {
  const at = { blockTag: block }, c = runtime.controller;
  const [version, voting, expectedVoting, id] = await Promise.all([round.CONTRACT_VERSION(at), round.voting(at), c.voting(at), round.roundId(at)]);
  if (version !== `affiliate-v${runtime.version}` || getAddress(voting) !== getAddress(expectedVoting) ||
    getAddress(await c.rounds(id, at)) !== getAddress(await round.getAddress())) throw new Error('Round binding mismatch.');
  if (runtime.version === 13 && getAddress(await round.holderRewards(at)) !== runtime.holderRewards) throw new Error('Round holder binding mismatch.');
}
