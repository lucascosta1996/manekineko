import { Contract, type Provider } from 'ethers';
import { controllerAbi, type Snapshot } from './chain.ts';
import type { ProtocolConfig } from './config.ts';
import {v16Abi} from './v16.ts';

export type CatalogSeason = { seasonId: string; name: string; collections: { id?: string; name: string; symbol: string; color: string; textColor: string }[] };
export type Catalog = { chainId: number; seasons: CatalogSeason[] };
const caches = new WeakMap<Provider, Map<string, { block: number; hash: string; catalog: Catalog }>>();

/** The sealed catalog is immutable. Verify its anchor against reorgs before reuse. */
export async function readCatalog(provider: Provider, config: ProtocolConfig, state: Snapshot, preparedOnly = false): Promise<Catalog> {
  const count = preparedOnly ? state.count : state.catalogCount;
  const key = `${config.chainId}:${config.controller}:${config.codeHash}:${count}`;
  const cache = caches.get(provider) ?? new Map(); caches.set(provider, cache);
  const previous = cache.get(key);
  if (previous && state.sealed && (await provider.getBlock(previous.block))?.hash === previous.hash)
    return previous.catalog;
  const c = new Contract(config.controller, (config.version===16||config.version===17||config.version===18)?v16Abi:controllerAbi, provider), seasons: CatalogSeason[] = [];
  // Bounded batches avoid flooding public RPC providers for a 216-collection catalog.
  for (let offset = 0; offset < count; offset += 8) {
    const batch = await Promise.all(Array.from({ length: Math.min(8, count - offset) }, (_, i) => (config.version===16||config.version===17||config.version===18)?c.collection(offset+i+1,{blockTag:state.block}):c.collectionPlan(offset + i, { blockTag: state.block })));
    for (const p of batch) {
      let season = seasons.at(-1);
      if (season?.seasonId !== p.seasonId) { season = { seasonId: p.seasonId, name: p.seasonName, collections: [] }; seasons.push(season); }
      season!.collections.push({ name: p.name, symbol: p.symbol??'TINCTA', color: p.color, textColor: p.textColor });
    }
  }
  const catalog = { chainId: config.chainId, seasons }, block = await provider.getBlock(state.block);
  if (!block?.hash) throw new Error('The catalog block is unavailable. Retry the network read.');
  if (state.sealed) cache.set(key, { block: state.block, hash: block.hash, catalog });
  return catalog;
}

export const phaseLabel = ['Voting', 'Minting', 'Draw request needed', 'Waiting for randomness', 'Draw ready', 'Prizes available', 'Prizes claimed', 'Refunds available'];
