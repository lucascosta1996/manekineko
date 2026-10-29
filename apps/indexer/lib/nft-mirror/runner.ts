import { createRpcProvider } from '../chain.ts';
import { getIndexerPool } from '../database.ts';
import { ensure, errorCode } from '../types.ts';
import { readMirrorConfigs, fingerprint, type MirrorConfig } from './config.ts';
import { RpcMirrorChain } from './chain.ts';
import { MirrorStore } from './store.ts';
import {V16MirrorChain} from './v16-chain.ts';
import {V16MirrorStore} from './v16-store.ts';
import type { Anchor, MirrorChain } from './types.ts';

export async function mirrorSource(config: MirrorConfig, chain: MirrorChain, store: Pick<MirrorStore,keyof MirrorStore>&Partial<Pick<V16MirrorStore,'walletEvents'>>, deadline: number, now = Date.now) {
  const source = await store.claim();
  if (!source) return {ok:false,status:'leased'};
  const same = async (anchor: Anchor) => (await chain.block(anchor.number)).hash === anchor.hash;
  const check = async (anchor: Anchor) => { ensure(await same(anchor),'canonical_block_changed'); };
  try {
    const head = await chain.head();
    await chain.verify(head);
    if (source.fingerprint !== fingerprint(config) || (source.anchor && !await same(source.anchor)) || (source.cursor && !await same(source.cursor)) || (source.walletCursor && !await same(source.walletCursor))) {
      await store.resetSource(); source.cursor = null; source.walletCursor=null;
    }
    ensure(!source.cursor || source.cursor.number<=head.number,'chain_head_stale');
    await store.verified(true,head);
    if (head.number < config.fromBlock) return {ok:false,status:'awaiting_confirmations'};
    // Alternate discovery, event ingestion and artwork so backfills cannot starve new jobs.
    for (let pass=0;pass<24 && now()<deadline;pass++) {
      if(chain.walletEvents&&store.walletEvents){
        ensure(!source.walletCursor||source.walletCursor.number<=head.number,'chain_head_stale');
        const start=source.walletCursor?source.walletCursor.number+1:config.fromBlock;
        if(start<=head.number){
          const to=await chain.block(Math.min(head.number,start+config.blockRange-1));
          await store.walletEvents(await chain.walletEvents(start,to),to,to.number===head.number,async()=>{await check(to);if(source.walletCursor)await check(source.walletCursor);});
          source.walletCursor=to;
        }
      }
      if(now()>=deadline)break;
      const from = source.cursor ? source.cursor.number+1 : config.fromBlock;
      if (from <= head.number) {
        const to = await chain.block(Math.min(head.number,from+config.blockRange-1));
        const discovered = await chain.discover(from,to);
        await store.discover(discovered,to,async()=>{ await check(to); if(source.cursor) await check(source.cursor); }); source.cursor=to;
      }
      if (now()>=deadline) break;
      // The newest prepared collection gets a turn every invocation; historical
      // burn/refund scans then rotate by age without delaying the active mint.
      const item = await store.nextCollection(pass===0);
      if (item) {
        if (item.cursor && !await same(item.cursor)) { await store.resetCollection(item.address,item.roundId); item.cursor=null; }
        ensure(!item.cursor || item.cursor.number<=head.number,'chain_head_stale');
        const start = item.cursor ? item.cursor.number+1 : item.deploymentBlock;
        const to = await chain.block(Math.min(head.number,start+config.blockRange-1));
        const events = start<=head.number ? await chain.events(item,start,to) : [];
        await store.events(item,events,to,to.number===head.number,async()=>{ await check(to); if(item.cursor) await check(item.cursor); });
      }
      for (let i=0;i<8 && now()<deadline;i++) {
        const job = await store.pending();
        if (!job) break;
        // A job may belong to a collection we have not scanned during this pass.
        // Recheck its cursor before trusting a queued mint from an earlier invocation.
        if (job.collection.cursor && !await same(job.collection.cursor)) {
          await store.resetCollection(job.collection.address,job.collection.roundId); continue;
        }
        try {
          if(job.mintBlock!==undefined)ensure((await chain.block(job.mintBlock)).hash===job.mintHash,'canonical_block_changed');
          const art = await chain.artwork(job.collection,job.tokenId,head,job.mintBlock);
          await store.cache(job.collection,job.tokenId,job.mintHash,art,async()=>{ await check(head); if(job.collection.cursor) await check(job.collection.cursor); });
        } catch (error) {
          if (['canonical_block_changed','collection_trust_mismatch'].includes(errorCode(error))) throw error;
          await store.retry(job.collection,job.tokenId);
        }
      }
      if (source.cursor?.number === head.number && (!chain.walletEvents||source.walletCursor?.number===head.number) && await store.caughtUp(head.number))
        return {ok:true,status:'caught_up',confirmedBlock:head.number};
    }
    return {ok:false,status:'catching_up',confirmedBlock:head.number};
  } catch (error) {
    if (['collection_trust_mismatch','canonical_block_changed'].includes(errorCode(error))) await store.verified(false);
    // Provider/database bodies and private RPC endpoints never enter responses or logs.
    return {ok:false,status:'temporarily_unavailable'};
  } finally { await store.release(); }
}

export async function runNftMirror() {
  const configs = readMirrorConfigs();
  if (!configs.length) return {ok:true,status:'not_configured',sources:[]};
  const sources = [];
  // Bound the complete invocation below the route's 120-second runtime limit.
  const slice = Math.floor(60000/configs.length);
  for (const config of configs) {
    const provider = createRpcProvider(config);
    try {
      const result = await mirrorSource(config,(config.version===16||config.version===17)?new V16MirrorChain(provider,config):new RpcMirrorChain(provider,config),(config.version===16||config.version===17)?new V16MirrorStore(getIndexerPool(),config):new MirrorStore(getIndexerPool(),config),Date.now()+slice);
      sources.push({chainId:config.chainId,controller:config.controller,...result});
    } finally { provider.destroy(); }
  }
  return {ok:sources.every(source=>source.ok),sources};
}
