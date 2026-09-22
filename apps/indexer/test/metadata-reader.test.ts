import assert from 'node:assert/strict';
import test from 'node:test';
import { Interface } from 'ethers';
import { createMetadataReader } from '../lib/metadata-worker.ts';
import { trustFingerprint } from '../lib/indexer.ts';
import type { MetadataJob } from '../lib/metadata-refresh.ts';
import type { ChainReader, IndexerConfig } from '../lib/types.ts';

const abi = new Interface(['function tokenURI(uint256) view returns(string)', 'function revealed() view returns(bool)', 'function randomWord() view returns(uint256)']);
function fixture() {
  const config = { confirmations: 2, factory: 'factory', factoryCodeHash: 'hash', contractVersion: 'affiliate-v8' } as IndexerConfig;
  const collection = { id: 'collection', contractVersion: 'affiliate-v8', address: 'address' } as MetadataJob['collection'];
  const job = { collection, tokenId: 1, generation: `${trustFingerprint(collection, config)}:123` } as MetadataJob;
  const calls: string[] = [];
  let canonical = true;
  const block = { number: 100, hash: 'canonical', timestamp: 1 };
  const chain = {
    head: async () => { calls.push('head'); return { ...block, number: 102 }; },
    block: async (number: number) => { assert.equal(number,100); calls.push('block'); return { ...block, hash: canonical ? block.hash : 'reorg' }; },
    verifyFactory: async () => { calls.push('factory'); },
    verifyCollection: async () => { calls.push('collection'); },
  } as unknown as ChainReader;
  const provider = {
    destroy: () => { calls.push('close'); },
    send: async (method: string, params: any[]) => {
      assert.equal(method,'eth_call'); assert.deepEqual(params[1],{ blockHash: 'canonical', requireCanonical: true });
      const parsed = abi.parseTransaction({ data: params[0].data })!;
      calls.push(parsed.name);
      const metadata = { image: `token-${parsed.args.length ? parsed.args[0] : 0}`, attributes: [{ trait_type: 'Score', value: 1 }] };
      return abi.encodeFunctionResult(parsed.name,[parsed.name === 'revealed' ? true : parsed.name === 'randomWord' ? 123n
        : `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`]);
    },
  } as unknown as NonNullable<Parameters<typeof createMetadataReader>[1]>['provider'];
  return { config, job, calls, reader: createMetadataReader(config,{ provider, chain }), reorg: () => { canonical = false; } };
}

test('metadata cycle reuses immutable verification and reads each token at the same canonical block', async () => {
  const f=fixture();
  try {
    const first=await f.reader.read(f.job), second=await f.reader.read({ ...f.job,tokenId: 2 });
    assert.equal(first.metadata.image,'token-1'); assert.equal(second.metadata.image,'token-2');
    for (const name of ['head','factory','collection','revealed','randomWord']) assert.equal(f.calls.filter(x=>x===name).length,1,name);
    assert.equal(f.calls.filter(x=>x==='tokenURI').length,2);
    f.reorg();
    await assert.rejects(second.assertCanonical(), /canonical_block_changed/);
    await assert.rejects(f.reader.read({ ...f.job,tokenId: 3 }), /canonical_block_changed/);
  } finally { f.reader.close(); }
});

test('cached provenance cannot bypass generation or changed immutable registration checks', async () => {
  const f=fixture();
  try {
    await f.reader.read(f.job);
    await assert.rejects(f.reader.read({ ...f.job,generation: 'wrong' }), /metadata_generation_changed/);
    await assert.rejects(f.reader.read({ ...f.job,collection: { ...f.job.collection,name: 'changed' } }), /metadata_generation_changed/);
    assert.equal(f.calls.filter(x=>x==='collection').length,2);
  } finally { f.reader.close(); }
});
