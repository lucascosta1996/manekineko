import { Interface } from 'ethers';
import { createRpcProvider, RpcChainReader } from './chain.ts';
import { readIndexerConfigs } from './config.ts';
import { getIndexerPool } from './database.ts';
import { trustFingerprint } from './indexer.ts';
import { decodeMetadata, needsMetadataRefresh, processMetadataJob, type JobUpdate, type MetadataJob, type MetadataRead } from './metadata-refresh.ts';
import { PostgresMetadataStore } from './metadata-store.ts';
import { ensure, type ChainBlock, type ChainReader, type IndexerConfig } from './types.ts';

const abi = new Interface(['function tokenURI(uint256) view returns(string)', 'function revealed() view returns(bool)', 'function randomWord() view returns(uint256)']);

export function createMetadataReader(config: IndexerConfig, dependencies: {
  provider?: ReturnType<typeof createRpcProvider>; chain?: ChainReader;
} = {}) {
  const provider = dependencies.provider ?? createRpcProvider(config), chain = dependencies.chain ?? new RpcChainReader(provider, config);
  // One immutable block per invocation. Reuse expensive provenance reads, but
  // recheck canonicality before every explorer effect and verification result.
  let confirmed: Promise<ChainBlock> | undefined;
  const verified = new Map<string, Promise<string>>();
  const blockForCycle = () => confirmed ??= (async () => {
    const head = await chain.head(), block = await chain.block(head.number - config.confirmations);
    ensure(block, 'confirmed_block_unavailable');
    await chain.verifyFactory(block);
    return block;
  })();
  return {
    close: () => provider.destroy(),
    async read(job: MetadataJob): Promise<MetadataRead> {
      ensure(needsMetadataRefresh(job.collection.contractVersion), 'metadata_refresh_not_applicable');
      const block = await blockForCycle();
      const read = async (name: string, args: unknown[] = []) => abi.decodeFunctionResult(name, await provider.send('eth_call', [
        { to: job.collection.address, data: abi.encodeFunctionData(name,args) }, { blockHash: block.hash, requireCanonical: true },
      ]))[0];
      const fingerprint = trustFingerprint(job.collection,config);
      if (!verified.has(fingerprint)) verified.set(fingerprint, (async () => {
        await chain.verifyCollection(job.collection, block);
        ensure(await read('revealed'), 'metadata_not_revealed');
        return `${fingerprint}:${await read('randomWord')}`;
      })());
      ensure(job.generation === await verified.get(fingerprint), 'metadata_generation_changed');
      const metadata = decodeMetadata(await read('tokenURI',[job.tokenId]));
      const assertCanonical = async () => ensure((await chain.block(block.number))?.hash === block.hash, 'canonical_block_changed');
      await assertCanonical();
      return { metadata, assertCanonical };
    },
  };
}

/** Separate cron: explorer failures never delay chain indexing, prize claims or the next draw. */
export async function runMetadataCycle() {
  const allConfigs = readIndexerConfigs(), configs = allConfigs.filter(config => needsMetadataRefresh(config.contractVersion));
  if (!configs.length) return { ok: true, supported: false, reason: 'permanent_metadata_requires_no_draw_refresh' };
  const store = new PostgresMetadataStore(getIndexerPool());
  if (configs[0].chainId !== 11155111) return { ok: true, supported: false, reason: 'no_explorer_refresh_adapter_for_chain' };
  const deadline = Date.now() + 40000;
  const results: (JobUpdate & { collectionId: string; tokenId: number })[] = [];
  for (const config of configs) await store.discover(config);
  if (!await store.available()) return { ok: false, supported: true, results, queue: await store.status(configs[0].chainId) };
  // Rotate profiles fairly by minute; claims themselves use durable per-token due times.
  const start = Math.floor(Date.now()/60000) % configs.length;
  const readers = new Map<IndexerConfig, ReturnType<typeof createMetadataReader>>();
  try {
    for (let i=0; i<6 && Date.now()+12000<deadline; i++) {
      const config = configs[(start+i)%configs.length], job = await store.claim(config);
      if (!job) continue;
      if (!readers.has(config)) readers.set(config, createMetadataReader(config));
      const update = await processMetadataJob(job, { store, read: readers.get(config)!.read });
      results.push({ collectionId: job.collection.id, tokenId: job.tokenId, ...update });
      if (['metadata_verification_unavailable','explorer_rate_limited','explorer_authorization_required','explorer_challenge_required'].includes(update.error ?? '')) break;
    }
  } finally { for (const reader of readers.values()) reader.close(); }
  const queue = await store.status(configs[0].chainId);
  return { ok: !queue.provider?.blocked && !queue.jobs.some(row => row.status === 'blocked')
      && !results.some(result => result.status === 'blocked' || result.error && result.error !== 'explorer_refresh_pending'),
    supported: true, results, queue };
}
