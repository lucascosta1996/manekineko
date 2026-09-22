import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeMetadata, metadataHash, processMetadataJob, type JobUpdate, type MetadataJob, type MetadataStore } from '../lib/metadata-refresh.ts';

const metadata = { image: 'data:image/svg+xml;base64,PHN2Zy8+', attributes: [{ trait_type: 'Score', value: 81 }] };
const stale = { ...metadata, attributes: [{ trait_type: 'Status', value: 'Sealed' }] };
const job = { collection: { contractVersion: 'affiliate-v8', id: 'collection', chainId: 11155111, address: `0x${'a'.repeat(40)}` }, tokenId: 81,
  generation: `${'a'.repeat(64)}:0`, owner: 'lease', refreshAttempts: 0, lastRefreshAt: null } as MetadataJob;
function fixture() {
  const calls: string[] = [], updates: JobUpdate[] = [], stops: unknown[] = [];
  let reservation: 'reserved' | 'blocked' | 'cooldown' = 'reserved';
  const store: MetadataStore = {
    finish: async (_job, update) => { updates.push(update); },
    reserveRefresh: async () => { calls.push('persist'); return reservation; },
    stopProvider: async (...args) => { stops.push(args); },
  };
  return { calls, updates, stops, store, cooldown: () => { reservation = 'cooldown'; },
    read: async () => ({ metadata, assertCanonical: async () => { calls.push('canonical'); } }) };
}

test('V10 permanent metadata never enters the historical revealed-Score decoder or explorer refresh', async () => {
  const f=fixture();
  const result=await processMetadataJob({...job,collection:{...job.collection,contractVersion:'affiliate-v10'}},{...f,
    read:async()=>{throw new Error('V10 must not be read by this worker');},
    fetch:async()=>{throw new Error('V10 must not trigger explorer HTTP');}});
  assert.equal(result.error,'metadata_refresh_not_applicable');assert.equal(result.status,'blocked');assert.deepEqual(f.calls,[]);
});

test('matches the complete JSON, including artwork, without refreshing already correct NFTs', async () => {
  const f = fixture();
  const result = await processMetadataJob(job, { ...f, fetch: async (_url, init) => {
    assert.equal(init?.method,'GET'); return Response.json({ metadata });
  } });
  assert.equal(result.status,'verified'); assert.equal(result.hash,metadataHash(metadata));
  assert(!f.calls.includes('persist'));
  assert.equal(metadataHash({ b: 2, a: 1 }),metadataHash({ a: 1, b: 2 }));
  assert.notEqual(metadataHash(metadata),metadataHash({ ...metadata,image: 'old' }));
});

test('delayed refresh is only verified on a later run; acknowledgement never marks success', async () => {
  const f = fixture();
  const result = await processMetadataJob(job, { ...f, fetch: async (_url, init) => {
    f.calls.push(String(init?.method)); return Response.json(init?.method === 'PATCH' ? { message: 'OK' } : { metadata: stale });
  } });
  assert.equal(result.status,'verifying'); assert.equal(result.delaySeconds,120);
  assert(f.calls.indexOf('persist') < f.calls.indexOf('PATCH'));
  const persisted = { ...job, refreshAttempts: 1,lastRefreshAt: 100000 };
  const waiting = await processMetadataJob(persisted, { ...f, now: () => 200000, fetch: async (_url,init) => {
    assert.equal(init?.method,'GET'); return Response.json({ metadata: stale });
  } });
  assert.equal(waiting.status,'verifying');
  const later = await processMetadataJob(persisted, { ...fixture(), now: () => 400000, fetch: async (_url,init) => {
    assert.equal(init?.method,'GET'); return Response.json({ metadata });
  } });
  assert.equal(later.status,'verified');
});

test('uncertain PATCH does not get resent on restart; retry needs a fresh stale GET and 15 minutes', async () => {
  const f = fixture();
  const first = await processMetadataJob(job, { ...f, fetch: async (_url,init) => {
    if (init?.method === 'PATCH') throw new Error('https://secret.rpc/private');
    return Response.json({ metadata: stale });
  } });
  assert.equal(first.status,'verifying'); assert.equal(first.delaySeconds,900);
  assert(!JSON.stringify(first).includes('private'));
  const saved = { ...job,refreshAttempts: 1,lastRefreshAt: 100000 };
  let patches = 0;
  const fetcher: typeof fetch = async (_url,init) => {
    if (init?.method === 'PATCH') { patches++; return Response.json({ message: 'OK' }); }
    return Response.json({ metadata: stale });
  };
  await processMetadataJob(saved,{ ...fixture(),now: () => 200000,fetch: fetcher }); assert.equal(patches,0);
  await processMetadataJob(saved,{ ...fixture(),now: () => 1100000,fetch: fetcher }); assert.equal(patches,1);
});

test('quota reservation prevents duplicate requests across workers and retry exhaustion remains visible', async () => {
  const f = fixture(); f.cooldown();
  const fetcher: typeof fetch = async (_url,init) => { assert.equal(init?.method,'GET'); return Response.json({ metadata: stale }); };
  assert.equal((await processMetadataJob(job,{ ...f,fetch: fetcher })).status,'pending');
  const result = await processMetadataJob({ ...job,refreshAttempts: 5 },{ ...fixture(),fetch: fetcher });
  assert.equal(result.status,'blocked'); assert.equal(result.error,'explorer_refresh_not_confirmed');
});

test('429 respects Retry-After; auth and challenge responses stop automatic refreshes', async () => {
  for (const status of [429,401,403,200]) {
    const f = fixture();
    const result = await processMetadataJob(job,{ ...f,fetch: async () => new Response('challenge',{
      status,headers: { 'Content-Type': 'text/html','Retry-After': '7200' },
    }) });
    assert.equal(f.stops.length,1); assert(!f.calls.includes('persist'));
    if (status === 429) assert.deepEqual(f.stops[0],['explorer_rate_limited',7200,false]);
    else assert.equal(result.status,'blocked');
  }
});

test('unconfirmed/reorganized chain data cannot cause a refresh or mark metadata verified', async () => {
  for (const stage of ['read','canonical']) {
    const f = fixture(); let patches = 0;
    const result = await processMetadataJob(job,{ ...f,read: async () => {
      if (stage === 'read') throw new Error('not revealed');
      return { metadata,assertCanonical: async () => { throw new Error('reorg'); } };
    },fetch: async (_url,init) => { if (init?.method === 'PATCH') patches++; return Response.json({ metadata }); } });
    assert.equal(patches,0); assert.notEqual(result.status,'verified');
  }
});

test('decoder refuses sealed metadata and does not fetch off-chain URIs', () => {
  const encode = (value: unknown) => `data:application/json;base64,${Buffer.from(JSON.stringify(value)).toString('base64')}`;
  assert.deepEqual(decodeMetadata(encode(metadata)),metadata);
  assert.throws(() => decodeMetadata(encode(stale)));
  assert.throws(() => decodeMetadata('https://example.com/metadata'));
});
