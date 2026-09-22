import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { persistCollection, inspectMockRemoval, removeMockRecords, stableSeriesId } from './sync-staging-collection.mjs';

// Opt-in integration regression creates and drops a private schema in LOCAL PostgreSQL only.
const source = process.env.COLLECTION_SYNC_TEST_ENV;
if (!source) throw new Error('Set COLLECTION_SYNC_TEST_ENV to a local-only dotenv file.');
const url = new URL(parseEnv(await readFile(source,'utf8')).DATABASE_URL);
assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only local PostgreSQL is allowed.');
const schema=`manekineko_sync_test_${randomUUID().replaceAll('-','')}`;
const admin=new pg.Client({connectionString:url.href});
let client,created=false;
const id='3342c115-3d41-4cb4-be45-fa103178f0ff';
const owner='0x1111111111111111111111111111111111111111';
const round='0x2222222222222222222222222222222222222222';
const hash=`0x${'ab'.repeat(32)}`;
const snapshot={collectionId:id,seriesId:stableSeriesId(owner),round,factory:owner,owner,
  contract:{roundId:'1',name:'Sepolia integration',symbol:'TEST',maxSupply:'20',mintPrice:'100000000000000',mintDeadline:'1900000000',prizeBps:'5000',affiliatePoolBps:'1000',maxAffiliateSlots:'20',enrollmentSigner:round},
  mintDurationSeconds:'86400',deploymentTransactionHash:hash,deploymentBlock:10,deployedAt:'2026-09-17T00:00:00.000Z',blockNumber:20,blockHash:hash,enrollmentEnabled:false,archive:null,
  state:{phase:'pending_activation',totalMinted:0,totalMintRevenueWei:'0',settledCount:0,refundedCount:0,totalRefundedWei:'0',winningTokenId:null,highestScore:null,randomnessState:'not_requested',randomnessRequestId:null,randomnessWord:null,prizePaid:false,prizeRecipient:null,prizePaidWei:'0',prizeTransactionHash:null}};
try{
  await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);created=true;
  client=new pg.Client({connectionString:url.href,options:`-c search_path=${schema},public`});await client.connect();
  const root=new URL('../database/',import.meta.url);
  for(const name of (await readdir(new URL('migrations/',root))).filter(n=>n.endsWith('.sql')).sort())await client.query(await readFile(new URL(`migrations/${name}`,root),'utf8'));
  for(const name of (await readdir(new URL('seeds/',root))).filter(n=>n.endsWith('.sql')).sort())await client.query(await readFile(new URL(`seeds/${name}`,root),'utf8'));
  const before=(await client.query('SELECT count(*)::int AS count FROM manekineko_collections')).rows[0].count;
  const preview=await persistCollection(client,snapshot,{removeMocks:true});assert.equal(preview.removeMocks.catalog.length,2);assert.equal(preview.removeMocks.history.length,8);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM manekineko_collections')).rows[0].count,before);
  console.log('PASS preview leaves catalog and eight mock archives unchanged');
  await persistCollection(client,snapshot,{write:true,removeMocks:true});
  assert.equal((await client.query('SELECT count(*)::int AS count FROM manekineko_collections')).rows[0].count,1);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM manekineko_collection_history')).rows[0].count,0);
  assert.equal((await client.query('SELECT phase FROM manekineko_collection_state WHERE collection_id=$1',[id])).rows[0].phase,'pending_activation');
  console.log('PASS registration and scoped mock cleanup preserve genuine pending state');
  await persistCollection(client,snapshot,{write:true});
  await client.query('UPDATE manekineko_affiliate_programs SET enrollment_enabled=true WHERE collection_id=$1',[id]);
  await persistCollection(client,{...snapshot,blockNumber:21},{write:true});
  assert.equal((await client.query('SELECT enrollment_enabled FROM manekineko_affiliate_programs WHERE collection_id=$1',[id])).rows[0].enrollment_enabled,true);
  console.log('PASS idempotent refresh keeps existing admission enabled');
  await assert.rejects(persistCollection(client,{...snapshot,blockNumber:21,round:owner},{write:true}),/differs/);
  await assert.rejects(persistCollection(client,{...snapshot,blockNumber:19},{write:true}),/newer/);
  await assert.rejects(persistCollection(client,{...snapshot,blockNumber:21,blockHash:`0x${'cd'.repeat(32)}`},{write:true}),/reorganized/);
  console.log('PASS conflicting deployment, stale block and same-height reorg roll back');
  const completed=structuredClone(snapshot);completed.blockNumber=22;completed.state={...completed.state,phase:'complete',totalMinted:20,totalMintRevenueWei:'2000000000000000',settledCount:20,winningTokenId:4,highestScore:'20',randomnessState:'fulfilled',randomnessRequestId:'0',randomnessWord:'0',prizePaid:true,prizeRecipient:owner,prizePaidWei:'1000000000000000',prizeTransactionHash:hash};
  completed.archive={status:'completed',closedAt:'2026-09-17T01:00:00.000Z',winner:{tokenId:4,holder:round,recipient:owner,amount:'1000000000000000',numbers:[1,1,2,4],code:'19',score:'20'}};
  await persistCollection(client,completed,{write:true});await persistCollection(client,completed,{write:true});
  const archive=(await client.query('SELECT h.is_mock,w.winning_holder,w.prize_recipient FROM manekineko_collection_history h JOIN manekineko_history_winners w ON w.collection_id=h.id WHERE h.id=$1',[id])).rows[0];
  assert.equal(archive.is_mock,false);assert.equal(archive.winning_holder,round);assert.equal(archive.prize_recipient,owner);
  console.log('PASS confirmed terminal snapshot and winner preserve distinct holder/recipient with idempotent archive');
  await client.query('BEGIN');const candidates=await inspectMockRemoval(client);assert.deepEqual(candidates,{catalog:[],history:[]});await removeMockRecords(client,candidates);await client.query('COMMIT');
  assert.equal((await client.query('SELECT count(*)::int AS count FROM manekineko_collection_history')).rows[0].count,1);
  console.log('PASS cleanup cannot delete real collection or winner history');
}finally{if(client)await client.end();if(created)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
