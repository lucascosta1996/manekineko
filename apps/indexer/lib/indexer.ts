import { createHash, randomUUID } from 'node:crypto';
import { createRpcProvider, RpcChainReader } from './chain.ts';
import { readIndexerConfigs } from './config.ts';
import { PostgresIndexerStore } from './store.ts';
import { ensure, errorCode, type ChainReader, type CollectionResult, type CycleResult, type IndexerConfig, type IndexerStore, type RegisteredCollection } from './types.ts';

export { errorCode } from './types.ts';

export function trustFingerprint(c: RegisteredCollection, config: IndexerConfig): string {
  return createHash('sha256').update(JSON.stringify([c, config.factory, config.factoryCodeHash, config.contractVersion])).digest('hex');
}

export async function executeIndexerCycle({ chain, store, config, now = Date.now }: {
  chain: ChainReader; store: IndexerStore; config: IndexerConfig; now?: () => number;
}): Promise<CycleResult> {
  const start = now(), stop = start + config.timeBudgetMs;
  const head = await chain.head();
  const confirmed = await chain.block(head.number - config.confirmations);
  ensure(confirmed && confirmed.number >= 0, 'confirmed_block_unavailable');
  await chain.verifyFactory(confirmed);
  const collections = await store.collections(config), results: CollectionResult[] = [];
  let batchBudget = config.maxBatches;
  for (let collectionIndex = 0; collectionIndex < collections.length; collectionIndex++) {
    const collection = collections[collectionIndex];
    if (now() + 3000 >= stop || batchBudget <= 0) {
      results.push(...collections.slice(collectionIndex).map(c => ({ collectionId: c.id, status: 'behind' as const })));
      break;
    }
    const owner = randomUUID();
    const checkpoint = await store.acquire(collection, owner, config.leaseSeconds);
    if (!checkpoint) { results.push({ collectionId: collection.id, status: 'leased' }); continue; }
    const result: CollectionResult = { collectionId: collection.id, status: 'caught_up', events: 0, batches: 0 };
    try {
      let previous = checkpoint;
      const fingerprint = trustFingerprint(collection, config);
      let reset = false;
      if (checkpoint.blockNumber !== null) {
        const canonical = await chain.block(checkpoint.blockNumber);
        // An unavailable historical header is an RPC outage, not evidence of a reorganization.
        ensure(canonical, 'canonical_block_unavailable');
        reset = canonical.hash !== checkpoint.blockHash;
      }
      if (checkpoint.snapshotBlock !== null && (checkpoint.blockNumber === null || checkpoint.snapshotBlock > checkpoint.blockNumber)) {
        const initial = await chain.block(checkpoint.snapshotBlock);
        ensure(initial, 'canonical_block_unavailable');
        reset ||= initial.hash !== checkpoint.snapshotHash;
      }
      const termsChanged = checkpoint.trustFingerprint !== null && checkpoint.trustFingerprint !== fingerprint;
      const reconcile = checkpoint.lastReconciledAt === null || now() - checkpoint.lastReconciledAt >= config.reconcileSeconds * 1000;
      if (reset || termsChanged || checkpoint.trustFingerprint === null || reconcile) {
        await chain.verifyCollection(collection, confirmed);
      }
      reset ||= termsChanged;
      let nextBlock = reset || previous.blockNumber === null ? collection.deploymentBlock : previous.blockNumber + 1;
      let blockRange = config.blockRange;
      result.reorg = reset;
      // Each batch covers a contiguous bounded interval. A failed batch cannot advance its cursor.
      while (nextBlock <= confirmed.number && batchBudget > 0 && now() + 3000 < stop) {
        const end = Math.min(confirmed.number, nextBlock + blockRange - 1);
        const block = await chain.block(end);
        ensure(block, 'canonical_block_unavailable');
        let events;
        try { events = await chain.logs(collection, nextBlock, end); }
        catch (error) {
          if (end > nextBlock && ['event_batch_too_large', 'provider_range_limit'].includes(errorCode(error))) {
            blockRange = Math.max(1, Math.floor((end - nextBlock + 1) / 2));
            continue;
          }
          throw error;
        }
        const deadlineChanged = block.timestamp >= collection.mintDeadline && ['pending_activation', 'minting'].includes(previous.phase ?? '');
        // During an initial backfill, preserve the already verified newer catalog snapshot until caught up.
        const canPublish = reset || previous.snapshotBlock === null || block.number >= previous.snapshotBlock;
        const needsSnapshot = canPublish && (reset || previous.snapshotBlock === null || events.length > 0 || deadlineChanged || reconcile || end === confirmed.number && previous.trustFingerprint === null);
        const snapshot = needsSnapshot ? await chain.snapshot(collection, block) : null;
        await store.commit({ collection, owner, previous, block, events, snapshot, reset, fingerprint,
          beforeCommit: async () => {
            ensure((await chain.block(block.number))?.hash === block.hash, 'canonical_block_changed');
            // Checking both ends rejects a branch change during a long log query, even before its final block.
            if (!reset && previous.blockNumber !== null) ensure((await chain.block(previous.blockNumber))?.hash === previous.blockHash, 'canonical_block_changed');
          } });
        previous = { blockNumber: block.number, blockHash: block.hash, trustFingerprint: fingerprint,
          lastReconciledAt: snapshot ? now() : previous.lastReconciledAt,
          snapshotBlock: snapshot ? block.number : previous.snapshotBlock, snapshotHash: snapshot ? block.hash : previous.snapshotHash,
          phase: snapshot?.phase ?? previous.phase };
        nextBlock = block.number + 1; reset = false; batchBudget--;
        result.events! += events.length; result.batches!++; result.blockNumber = block.number;
        if (snapshot) result.status = 'updated';
      }
      if (nextBlock <= confirmed.number) result.status = 'behind';
      result.blockNumber ??= previous.blockNumber ?? undefined;
      await store.release(collection.id, owner);
    } catch (error) {
      result.status = 'failed'; result.error = errorCode(error);
      // An authoritative trust failure hides stale derived state; ordinary network failures preserve it.
      if (['collection_trust_mismatch', 'immutable_terms_mismatch', 'deployment_provenance_mismatch'].includes(result.error)) {
        await store.quarantine(collection.id, owner).catch(() => {});
      }
      await store.release(collection.id, owner, result.error).catch(() => {});
    }
    results.push(result);
  }
  return { ok: !results.some(result => result.status === 'failed'), chainId: config.chainId, confirmedBlock: confirmed.number, results, elapsedMs: now() - start };
}

export async function runIndexerCycle(): Promise<CycleResult> {
  const configs = readIndexerConfigs(), start = Date.now();
  const { getIndexerPool } = await import('./database.ts');
  // Separate trust/readers per factory; one version must never borrow another factory's trust pin.
  // Concurrent bounded cycles preserve the shared wall-clock budget and prevent a busy new factory starving old claims.
  const settled = await Promise.allSettled(configs.map(async config => {
    const provider = createRpcProvider(config);
    try { return await executeIndexerCycle({ config, chain: new RpcChainReader(provider, config), store: new PostgresIndexerStore(getIndexerPool()) }); }
    finally { provider.destroy(); }
  }));
  const cycles = settled.filter((item): item is PromiseFulfilledResult<CycleResult> => item.status === 'fulfilled').map(item => item.value);
  const rejected = settled.find(item => item.status === 'rejected');
  // Other independently trusted factories have still caught up before surfacing a failed profile to monitoring.
  if (rejected?.status === 'rejected') throw rejected.reason;
  return { ok: cycles.every(cycle => cycle.ok), chainId: configs[0].chainId,
    confirmedBlock: Math.min(...cycles.map(cycle => cycle.confirmedBlock)), results: cycles.flatMap(cycle => cycle.results), elapsedMs: Date.now() - start };
}
