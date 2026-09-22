import test from 'node:test';
import assert from 'node:assert/strict';
import { executeIndexerCycle, trustFingerprint } from '../lib/indexer.ts';
import { readIndexerConfig } from '../lib/config.ts';
import { assertCollectionVersion, RpcChainReader, snapshotFromValues } from '../lib/chain.ts';
import type { JsonRpcProvider } from 'ethers';
import { IndexerError, type ChainReader, type Checkpoint, type CommitBatch, type IndexerConfig, type IndexerStore, type RegisteredCollection, type CollectionSnapshot } from '../lib/types.ts';

const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const c: RegisteredCollection = {contractVersion:"affiliate-v5",algorithmVersion:"unique-rank-v2", id:'123e4567-e89b-42d3-a456-426614174000',seriesId:'123e4567-e89b-42d3-a456-426614174001',chainId:11155111,roundId:'1',
  name:'Test',symbol:'TEST',maxSupply:20,mintPrice:'10000',prizeBps:5000,affiliatePoolBps:1000,address:`0x${'1'.repeat(40)}`,factory:`0x${'2'.repeat(40)}`,
  deploymentTransaction:hash(1),deploymentBlock:10,deployedAt:'2026-01-01T00:00:00.000Z',mintDeadline:100000,maxAffiliateSlots:20,enrollmentSigner:`0x${'3'.repeat(40)}` };
const config: IndexerConfig = {contractVersion:"affiliate-v5", databaseUrl:'postgres://localhost/test',rpcUrl:'https://rpc.example',chainId:11155111,factory:c.factory,factoryCodeHash:hash(9),confirmations:2,
  blockRange:5,maxBatches:8,maxCollections:10,timeBudgetMs:45000,reconcileSeconds:900,leaseSeconds:300 };
const values = { phase:1n,totalMinted:0n,totalMintRevenue:0n,refundedCount:0n,totalRefunded:0n,randomnessRequested:false,randomnessReceived:false,requestId:0n,randomWord:0n,
  revealed:false,winningTokenId:0n,highestScore:0n,prizePaid:false,prizeRecipient:c.address,prizePaidAmount:0n };
const initial = (): Checkpoint => ({ blockNumber:null,blockHash:null,trustFingerprint:null,lastReconciledAt:null,snapshotBlock:null,snapshotHash:null,phase:null });

class MemoryStore implements IndexerStore {
  checkpoint = initial(); snapshots: CollectionSnapshot[] = []; batches: CommitBatch[] = []; errors: (string|undefined)[] = []; resetCount = 0;
  leased = false; quarantined = false;
  async collections() { return [c]; }
  async acquire() { return this.leased ? null : structuredClone(this.checkpoint); }
  async release(_id: string, _owner: string, error?: string) { this.errors.push(error); }
  async quarantine() { this.quarantined = true; }
  async commit(batch: CommitBatch) {
    // Mirror the store's transaction boundary: nothing changes until canonicality succeeds.
    await batch.beforeCommit();
    this.batches.push(batch);
    if (batch.reset) { this.snapshots = []; this.resetCount++; }
    if (batch.snapshot) this.snapshots.push(batch.snapshot);
    this.checkpoint = { ...this.checkpoint,blockNumber:batch.block.number,blockHash:batch.block.hash,trustFingerprint:batch.fingerprint,
      lastReconciledAt:batch.snapshot ? 1000 : this.checkpoint.lastReconciledAt,
      snapshotBlock:batch.snapshot ? batch.block.number : this.checkpoint.snapshotBlock,snapshotHash:batch.snapshot ? batch.block.hash : this.checkpoint.snapshotHash,
      phase:batch.snapshot?.phase ?? this.checkpoint.phase };
  }
}
function fixture(overrides: Partial<ChainReader> = {}) {
  const ranges: number[][] = [], snapshotBlocks: number[] = [], verified: number[] = [];
  const chain: ChainReader = {
    head:async()=>({number:25,hash:hash(25),timestamp:1000}),block:async(number)=>({number,hash:hash(number),timestamp:1000}),
    verifyFactory:async()=>{},verifyCollection:async(_c,block)=>{verified.push(block.number);},
    logs:async(_c,from,to)=>{ranges.push([from,to]);return[];},
    snapshot:async(_c,block)=>{snapshotBlocks.push(block.number);return snapshotFromValues(values,c);}, ...overrides,
  };
  return { chain,store:new MemoryStore(),ranges,snapshotBlocks,verified };
}

test('backfill starts at deployment and commits bounded contiguous ranges through the confirmed head',async()=>{
  const f=fixture();const result=await executeIndexerCycle({...f,config,now:()=>1000});
  assert.equal(result.confirmedBlock,23);assert.equal(result.ok,true);assert.deepEqual(f.ranges,[[10,14],[15,19],[20,23]]);
  assert.equal(f.store.checkpoint.blockNumber,23);assert.deepEqual(f.verified,[23]);
});
test('batch budget persists progress and next invocation resumes without gaps or duplicate event ranges',async()=>{
  const f=fixture();const limited={...config,maxBatches:1};
  const first=await executeIndexerCycle({...f,config:limited,now:()=>1000});assert.equal(first.results[0].status,'behind');
  await executeIndexerCycle({...f,config:limited,now:()=>2000});assert.deepEqual(f.ranges,[[10,14],[15,19]]);
});
test('a busy range shrinks without skipping blocks or advancing a failed query',async()=>{
  const ranges:number[][]=[];const f=fixture({logs:async(_c,from,to)=>{ranges.push([from,to]);if(to-from>1)throw new IndexerError('event_batch_too_large');return[];}});
  await executeIndexerCycle({...f,config,now:()=>1000});assert.deepEqual(ranges.slice(0,3),[[10,14],[10,11],[12,13]]);
  assert.equal(f.store.checkpoint.blockNumber,23);
});
test('collections skipped because of the cycle budget remain explicitly behind',async()=>{
  const f=fixture();f.store.collections=async()=>[c,{...c,id:'123e4567-e89b-42d3-a456-426614174099'}];
  const result=await executeIndexerCycle({...f,config:{...config,maxBatches:1},now:()=>1000});
  assert.equal(result.results.length,2);assert.equal(result.results[1].status,'behind');
});
test('idle confirmed blocks advance logs without expensive contract snapshot calls',async()=>{
  const f=fixture(); f.store.checkpoint={blockNumber:20,blockHash:hash(20),trustFingerprint:trustFingerprint(c,config),lastReconciledAt:1000,snapshotBlock:20,snapshotHash:hash(20),phase:'minting'};
  await executeIndexerCycle({...f,config,now:()=>2000});assert.deepEqual(f.snapshotBlocks,[]);assert.deepEqual(f.verified,[]);assert.equal(f.store.checkpoint.blockNumber,23);
});
test('an external Minted event forces a pinned snapshot without a frontend callback',async()=>{
  const f=fixture({logs:async()=>[{blockNumber:22,blockHash:hash(22),transactionHash:hash(101),transactionIndex:0,logIndex:0,name:'Minted',args:{quantity:'3'},topics:[],data:'0x',timestamp:1000}],
    snapshot:async()=>snapshotFromValues({...values,totalMinted:3n,totalMintRevenue:30000n},c)});
  f.store.checkpoint={blockNumber:20,blockHash:hash(20),trustFingerprint:trustFingerprint(c,config),lastReconciledAt:1000,snapshotBlock:20,snapshotHash:hash(20),phase:'minting'};
  const result=await executeIndexerCycle({...f,config,now:()=>2000});assert.equal(result.results[0].events,1);assert.equal(f.store.snapshots[0].totalMinted,3);
});
test('a canonical checkpoint change rebuilds derived state starting at deployment',async()=>{
  const f=fixture(); f.store.checkpoint={blockNumber:20,blockHash:hash(999),trustFingerprint:trustFingerprint(c,config),lastReconciledAt:1000,snapshotBlock:20,snapshotHash:hash(999),phase:'complete'};
  const result=await executeIndexerCycle({...f,config,now:()=>2000});assert.equal(result.results[0].reorg,true);assert.equal(f.store.resetCount,1);assert.deepEqual(f.ranges[0],[10,14]);
});
test('a missing historical RPC header preserves projections instead of treating an outage as a reorg',async()=>{
  const f=fixture({block:async(number)=>number===20?null:{number,hash:hash(number),timestamp:1000}});
  f.store.checkpoint={...initial(),blockNumber:20,blockHash:hash(20)};
  const result=await executeIndexerCycle({...f,config,now:()=>1000});assert.equal(result.results[0].error,'canonical_block_unavailable');assert.equal(f.store.batches.length,0);assert.equal(f.store.quarantined,false);
});
test('mid-batch reorg is rejected before committing events or advancing a checkpoint',async()=>{
  let changed=false; const f=fixture({logs:async()=>{changed=true;return[];},block:async(number)=>({number,hash:hash(changed&&number===14?999:number),timestamp:1000})});
  const result=await executeIndexerCycle({...f,config,now:()=>1000});assert.equal(result.results[0].error,'canonical_block_changed');assert.equal(f.store.checkpoint.blockNumber,null);assert.equal(f.store.batches.length,0);
});
test('deadline transitions reconcile even when no transaction emits a log',async()=>{
  const expiring={...c,mintDeadline:900};const f=fixture();f.store.collections=async()=>[expiring];
  f.store.checkpoint={blockNumber:20,blockHash:hash(20),trustFingerprint:trustFingerprint(expiring,config),lastReconciledAt:1000,snapshotBlock:20,snapshotHash:hash(20),phase:'minting'};
  await executeIndexerCycle({...f,config,now:()=>2000});assert.deepEqual(f.snapshotBlocks,[23]);
});
test('another lease owner prevents duplicate work',async()=>{
  const f=fixture();f.store.leased=true;const result=await executeIndexerCycle({...f,config,now:()=>1000});assert.equal(result.results[0].status,'leased');assert.equal(f.ranges.length,0);
});
test('verified terms failures quarantine derived projections, while generic errors are sanitized',async()=>{
  for(const error of [new IndexerError('immutable_terms_mismatch'),new Error('https://secret-rpc-token')]){
    const f=fixture({verifyCollection:async()=>{throw error;}});const result=await executeIndexerCycle({...f,config,now:()=>1000});
    assert.equal(f.store.quarantined,error instanceof IndexerError);assert.ok(!JSON.stringify(result).includes('secret-rpc-token'));
  }
});
test('initial event backfill does not roll a newer trusted snapshot backward',async()=>{
  const f=fixture();f.store.checkpoint={...initial(),snapshotBlock:21,snapshotHash:hash(21),phase:'minting'};
  await executeIndexerCycle({...f,config,now:()=>1000});assert.deepEqual(f.snapshotBlocks,[23]);
});
test('configuration refuses unsupported chains and preserves mainnet confirmations',()=>{
  const env={DATABASE_URL:'postgres://localhost/test',INDEXER_RPC_URL:'https://rpc.example',INDEXER_TRUSTED_FACTORY:c.factory,INDEXER_TRUSTED_FACTORY_CODEHASH:hash(1),MANEKINEKO_CHAIN_ID:'1'};
  assert.equal(readIndexerConfig(env).confirmations,12);assert.throws(()=>readIndexerConfig({...env,MANEKINEKO_CHAIN_ID:'10'}));
  assert.throws(()=>readIndexerConfig({...env,INDEXER_CONFIRMATIONS:'0'}));assert.throws(()=>readIndexerConfig({...env,INDEXER_BLOCK_RANGE:'1000000'}));
});
test('zero VRF IDs remain valid while corrupt mint and winner accounting is rejected',()=>{
  const snapshot=snapshotFromValues({...values,phase:4n,totalMinted:20n,totalMintRevenue:200000n,randomnessRequested:true,randomnessReceived:true},c);
  assert.equal(snapshot.randomnessRequestId,'0');assert.equal(snapshot.randomnessWord,'0');
  assert.throws(()=>snapshotFromValues({...values,totalMinted:3n},c));assert.throws(()=>snapshotFromValues({...values,revealed:true,winningTokenId:1n,highestScore:19n},c));
});

test('V6 requires separate versioned factory trust and never inherits V5 pins',()=>{
  const env={DATABASE_URL:'postgres://localhost/test',INDEXER_RPC_URL:'https://rpc.example',INDEXER_TRUSTED_FACTORY:c.factory,INDEXER_TRUSTED_FACTORY_CODEHASH:hash(1)};
  assert.equal(readIndexerConfig(env).contractVersion,'affiliate-v5');
  assert.throws(()=>readIndexerConfig({...env,INDEXER_CONTRACT_VERSION:'affiliate-v6'}));
  const v6=readIndexerConfig({...env,INDEXER_CONTRACT_VERSION:'affiliate-v6',INDEXER_V6_TRUSTED_FACTORY:`0x${'6'.repeat(40)}`,INDEXER_V6_TRUSTED_FACTORY_CODEHASH:hash(6)});
  assert.equal(v6.contractVersion,'affiliate-v6');assert.equal(v6.factory,`0x${'6'.repeat(40)}`);assert.equal(v6.factoryCodeHash,hash(6));
  assert.throws(()=>readIndexerConfig({...env,INDEXER_CONTRACT_VERSION:'affiliate-v99'}));
});
test('V9 never inherits V8 factory trust',()=>{
  const env={DATABASE_URL:'postgres://localhost/test',INDEXER_RPC_URL:'https://rpc.example',INDEXER_CONTRACT_VERSION:'affiliate-v9',INDEXER_V8_TRUSTED_FACTORY:c.factory,INDEXER_V8_TRUSTED_FACTORY_CODEHASH:hash(8)};
  assert.throws(()=>readIndexerConfig(env));
  const actual=readIndexerConfig({...env,INDEXER_V9_TRUSTED_FACTORY:`0x${'9'.repeat(40)}`,INDEXER_V9_TRUSTED_FACTORY_CODEHASH:hash(9)});
  assert.equal(actual.contractVersion,'affiliate-v9');assert.equal(actual.factory,`0x${'9'.repeat(40)}`);assert.equal(actual.factoryCodeHash,hash(9));
});
test('indexer rejects mismatched algorithms and factories before making contract calls',async()=>{
  assert.doesNotThrow(()=>assertCollectionVersion(c));
  assert.doesNotThrow(()=>assertCollectionVersion({...c,contractVersion:'affiliate-v6',algorithmVersion:'unique-rank-v3'}));
  assert.throws(()=>assertCollectionVersion({...c,contractVersion:'affiliate-v6'}),/collection_trust_mismatch/);
  assert.throws(()=>assertCollectionVersion({...c,algorithmVersion:'unique-rank-v3'}),/collection_trust_mismatch/);
  const reader=new RpcChainReader({} as JsonRpcProvider,config);
  await assert.rejects(reader.verifyCollection({...c,contractVersion:'affiliate-v6',algorithmVersion:'unique-rank-v3'},{number:20,hash:hash(20),timestamp:1000}),/collection_trust_mismatch/);
});
