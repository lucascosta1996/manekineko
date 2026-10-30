/** Pure read-only projection at a caller-verified block; never signs transactions. */
import type { Provider } from 'ethers';
import { verifySingleContract } from './v16.ts';
import { socialPublicUrl } from '../../contracts/src/season-social.ts';
import type { Config, Observation } from '../../contracts/src/social-delivery.ts';
import { message, genesisStages, collectionStages, STAGES } from '../../contracts/src/tincta-social-content.ts';
export function assertTinctaSocialConfig(config: Config) {
  if (config.version !== 18 || config.chainId !== 1 || config.holderRewardsCodeHash || config.genesisCodeHash) throw new Error('A dedicated Tincta Rewards Mainnet configuration is required.');
  socialPublicUrl(config.appUrl);
  const app = new URL(config.appUrl);
  if (app.pathname !== '/' || app.search || app.hash) throw new Error('Use the public app origin.');
}
export async function observeTinctaAt(config: Config, provider: Provider, block: {number:number;hash:string;timestamp:number}, observedAt = Date.now()): Promise<Observation[]> {
  assertTinctaSocialConfig(config);

  if (!block?.hash || Math.abs(observedAt / 1000 - block.timestamp) > 3600) throw new Error('Fresh chain state unavailable.');
  const c = await verifySingleContract(provider, { version: 18, chainId: 1, controller: config.controller, codeHash: config.controllerCodeHash, rpcUrl: config.rpcUrl }, block.number);
  const at = { blockTag: block.number }, now = BigInt(block.timestamp);
  const [sealed, count, total, genesis, start, soldOutAt] = await Promise.all([
    c.catalogSealed(at), c.prepared(at), c.catalogCount(at), c.round(0, at), c.genesisStartsAt(at), c.genesisSoldOutAt(at),
  ]);
  if (total < 1n || total > 256n || count > total || genesis.minted > 1000n || (soldOutAt > 0n) !== (genesis.minted === 1000n)) throw new Error('Inconsistent production catalog or Genesis state.');
  if (!sealed) return [];
  const plans = await Promise.all(Array.from({ length: Number(total) }, (_, i) => c.collection(i + 1, at)));
  const seasonIds = [...new Set(plans.map(p => String(p.seasonId)))];
  const identity = (id: number) => {
    const p = plans[id - 1], siblings = plans.filter(p2 => p2.seasonId === p.seasonId);
    return {
      season: { id: String(p.seasonId), number: seasonIds.indexOf(String(p.seasonId)) + 1, name: String(p.seasonName), colors: siblings.map(p2 => String(p2.color)) },
      collection: { id: `${config.controller}:${id}`, number: siblings.indexOf(p) + 1, name: String(p.name), color: String(p.color), supply: 0, mintPriceEth: '0', winnerCount: 0, prizePerWinnerEth: '0' },
    };
  };
  const observations: Observation[] = [];
  const add = (stage: typeof STAGES[number], id: number, timestamp: number) => {
    const image = message({ stage, id, chainId: 1, appUrl: config.appUrl, timestamp, ...identity(Math.max(1, id)) });
    observations.push({ key: `${config.chainId}:${config.controller.toLowerCase()}:${id}:${stage}`, text: image.post, image, block: block.number, blockHash: block.hash! });
  };
  for (const stage of genesisStages(sealed, start, soldOutAt, now)) add(stage, 0, Number(stage === 'genesis-open' ? start : soldOutAt));
  const terminal = new Set<number>();
  const terminalAt = new Map<number, number>();
  for (let id = 1; id <= Number(count); id++) {
    const [r, terms, deadline] = await Promise.all([c.round(id, at), c.terms(id, at), c.mintDeadline(id, at)]);
    const stages = collectionStages({ voteStart: r.voteStart, saleStart: r.saleStart, soldOutAt: r.soldOutAt, entropyAt: r.entropyAt, finalizedAt: r.finalizedAt, prizesClaimed: r.prizesClaimed, deadline, winners: terms.winners }, now);
    if (stages.includes('voting') && identity(id).collection.number === 1) add('season-open', id, Number(r.voteStart));
    for (const stage of stages) add(stage, id, Number(r.voteStart));
    if (stages.some(stage => ['revealed', 'refunds', 'draw-refunds'].includes(stage))) {
      terminal.add(id);
      terminalAt.set(id, Number(r.finalizedAt || (r.soldOutAt ? r.soldOutAt + 259200n : deadline)));
    }
  }
  for (const seasonId of seasonIds) {
    const ids = plans.flatMap((p, i) => String(p.seasonId) === seasonId ? [i + 1] : []);
    if (ids.every(id => terminal.has(id))) add('season-complete', ids.at(-1)!, Math.max(...ids.map(id => terminalAt.get(id)!)));
  }
  return observations;

}
