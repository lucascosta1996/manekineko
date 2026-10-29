/** Read-only V17 chain observer. X delivery is independent of all wallet actions. */
import { JsonRpcProvider, type Provider } from 'ethers';
import { pathToFileURL } from 'node:url';
import { verifyV17 } from '../../packages/protocol/src/v16.ts';
import { socialPublicUrl } from '../../packages/contracts/src/season-social.ts';
import { run, type Config, type Observation } from '../protocol-v12/social.ts';
import { message, genesisStages, collectionStages, STAGES, TEMPLATE_VERSION } from './social-content.ts';
import { rehearsalProvider } from '../protocol-v14/rehearsal/rpc.mts';
import { XApiError } from '../season-runner/social.ts';

export async function observeV17(config: Config, suppliedProvider?: Provider, observedAt = Date.now()): Promise<Observation[]> {
  if (config.version !== 17 || config.chainId !== 11155111 || config.holderRewardsCodeHash || config.genesisCodeHash) throw new Error('A dedicated V17 Sepolia configuration is required.');
  socialPublicUrl(config.appUrl);
  const app = new URL(config.appUrl);
  if (app.pathname !== '/' || app.search || app.hash) throw new Error('Use the public app origin.');
  const provider = suppliedProvider ?? rehearsalProvider(config.rpcUrl);
  try {
    const block = await provider.getBlock('finalized');
    if (!block?.hash || Math.abs(observedAt / 1000 - block.timestamp) > 3600) throw new Error('Fresh finalized chain state unavailable.');
    const c = await verifyV17(provider, { version: 17, chainId: 11155111, controller: config.controller, codeHash: config.controllerCodeHash, rpcUrl: config.rpcUrl }, block.number);
    const at = { blockTag: block.number }, now = BigInt(block.timestamp);
    const [sealed, count, total, genesis, start, soldOutAt] = await Promise.all([
      c.catalogSealed(at), c.prepared(at), c.catalogCount(at), c.round(0, at), c.genesisStartsAt(at), c.genesisSoldOutAt(at),
    ]);
    if (total < 1n || total > 256n || count > total || genesis.minted > 20n || (soldOutAt > 0n) !== (genesis.minted === 20n)) throw new Error('Inconsistent V17 catalog or Genesis state.');
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
      const image = message({ stage, id, chainId: 11155111, appUrl: config.appUrl, timestamp, ...identity(Math.max(1, id)) });
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
        terminalAt.set(id, Number(r.finalizedAt || (r.soldOutAt ? r.soldOutAt + 900n : deadline)));
      }
    }
    for (const seasonId of seasonIds) {
      const ids = plans.flatMap((p, i) => String(p.seasonId) === seasonId ? [i + 1] : []);
      if (ids.every(id => terminal.has(id))) add('season-complete', ids.at(-1)!, Math.max(...ids.map(id => terminalAt.get(id)!)));
    }
    return observations;
  } finally { if (!suppliedProvider) (provider as JsonRpcProvider).destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { loadLaunchSocialAccount, fixedLaunchSocialAccountSource } = await import('../protocol-v16/social-account.ts');
  const watch = process.argv[4] === '--watch';
  const resolveAccount = watch ? fixedLaunchSocialAccountSource() : loadLaunchSocialAccount;
  if (watch) process.argv[4] = '--publish';
  try {
    do {
      await run(17, { version: 17, observe: observeV17, templateVersion: TEMPLATE_VERSION, stages: STAGES, resolveAccount });
      if (watch) await new Promise(resolve => setTimeout(resolve, 60_000));
    } while (watch);
  } catch (error) {
    const api = error instanceof XApiError ? error : error instanceof Error && error.cause instanceof XApiError ? error.cause : undefined;
    console.error(JSON.stringify({ status: 'stopped', ...(api ? { httpStatus: api.status, retryAfterSeconds: api.retryAfterSeconds, diagnostics: api.diagnostics } : {}) }));
    console.error('V17 social delivery stopped. Check the private configuration and outbox; reconcile any unresolved delivery before restarting.');
    process.exitCode = 1;
  }
}
