import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { Provider } from 'ethers';
import { deliveryCycle, senderRetry, type CycleDependencies } from '../lib/social-sender.ts';
import { claimSender, saveSender, finishSender, assertSenderLease, senderHealth, SenderError, type Sender } from '../lib/social-sender-store.ts';
import { confirmedAnchor, assertCanonical } from '../lib/social-sender-chain.ts';
import { senderAuthorized } from '../lib/social-sender-auth.ts';
import { AmbiguousDelivery, XApiError } from '../../../packages/contracts/src/x-transport.ts';

const config={version:17 as const,chainId:11155111,controller:'0x'+'1'.repeat(40),controllerCodeHash:'0x'+'2'.repeat(64),xAccountId:'12345',appUrl:'https://app.tincta.xyz'};
const event={key:`11155111:${config.controller}:1:opening`,text:'Minting opened',block:12,blockHash:'0x'+'3'.repeat(64)};
function setup() {
  const s:Sender={id:'test',config,entries:[],lease_token:randomUUID(),failures:0};
  let disk=structuredClone(s),writes=0;
  const d:CycleDependencies={observe:async()=>[event],save:async()=>{disk=structuredClone(s);},assertCurrent:async()=>{},prepare:async e=>{e.mediaId='987';return true;},
    publish:async(_e,guard)=>{await guard();assert.equal(disk.entries[0].status,'intent');writes++;return '765';},
    reconcile:async()=>undefined,audit:async()=>{},now:()=>1000};
  return {s,d,disk:()=>disk,writes:()=>writes};
}
test('durable intent precedes POST; restart with sent history does not duplicate',async()=>{
  const f=setup();await deliveryCycle(f.s,f.d);assert.equal(f.writes(),1);assert.equal(f.disk().entries[0].postId,'765');
  await deliveryCycle(f.s,f.d);assert.equal(f.writes(),1);
});
test('lost POST acknowledgement reconciles automatically without a second POST',async()=>{
  const f=setup();let writes=0;
  f.d.publish=async(_e,guard)=>{await guard();writes++;throw new AmbiguousDelivery();};
  await assert.rejects(deliveryCycle(f.s,f.d),AmbiguousDelivery);
  assert.equal(f.disk().entries[0].status,'uncertain');
  f.d.reconcile=async()=> '765';await deliveryCycle(f.s,f.d);
  assert.equal(writes,1);assert.equal(f.disk().entries[0].status,'sent');
});
test('process death after intent is recovered; absent evidence never permits another POST',async()=>{
  const f=setup();f.s.entries=[{...event,status:'intent',mediaId:'987'}];
  await assert.rejects(deliveryCycle(f.s,f.d),/delivery_needs_reconciliation/);assert.equal(f.writes(),0);
  f.d.reconcile=async()=> '765';await deliveryCycle(f.s,f.d);assert.equal(f.writes(),0);
});
test('explicit rejection retries from pending; media survives and Retry-After wins',async()=>{
  const f=setup();f.d.publish=async(_e,guard)=>{await guard();throw new XApiError('Rate limited',429,900);};
  await assert.rejects(deliveryCycle(f.s,f.d),XApiError);
  assert.equal(f.disk().entries[0].status,'pending');assert.equal(f.disk().entries[0].mediaId,'987');
  assert.deepEqual(senderRetry(new XApiError('secret',429,900),0),{code:'x_429',seconds:900});
  assert.deepEqual(senderRetry(new Error('secret'),20),{code:'sender_unavailable',seconds:300});
});
test('failed persistence after accepted POST cannot become a blind retry',async()=>{
  const f=setup(),save=f.d.save;let fail=true;
  f.d.save=async()=>{if(f.s.entries[0]?.status==='sent'&&fail){fail=false;throw new Error('database gone');}await save();};
  await assert.rejects(deliveryCycle(f.s,f.d),/database gone/);
  assert.equal(f.disk().entries[0].status,'uncertain');assert.equal(f.writes(),1);
  f.d.reconcile=async()=> '765';await deliveryCycle(f.s,f.d);assert.equal(f.writes(),1);
});
test('changed observation or account revision prevents a public write',async()=>{
  const f=setup();let reads=0;
  f.d.observe=async()=>++reads===1?[event]:[];
  await assert.rejects(deliveryCycle(f.s,f.d),/observation_changed/);assert.equal(f.writes(),0);
  const g=setup();let checks=0;g.d.assertCurrent=async()=>{if(++checks>2)throw new SenderError('profile_changed');};
  await assert.rejects(deliveryCycle(g.s,g.d),/profile_changed/);assert.equal(g.writes(),0);
});
test('recovered backlog preserves mint/sellout/results order and sent evidence',async()=>{
  const f=setup();f.d.observe=async()=>['revealed','soldout','opening'].map(stage=>({...event,key:`11155111:${config.controller}:1:${stage}`,text:stage}));
  const writes:string[]=[];f.d.publish=async(e,guard)=>{await guard();writes.push(e.text);return String(765+writes.length);};
  await deliveryCycle(f.s,f.d);assert.deepEqual(writes,['opening','soldout','revealed']);
});
test('obsolete unsent observations disappear, but sent history remains',async()=>{
  const f=setup();f.s.entries=[{...event,status:'pending'},{...event,key:'old:paid',status:'sent',postId:'999',finalized:true}];f.d.observe=async()=>[];
  await deliveryCycle(f.s,f.d);assert.equal(f.s.entries.length,1);assert.equal(f.s.entries[0].postId,'999');
});
test('cron authentication fails closed and requires the exact bearer secret',()=>{
  const secret='s'.repeat(32);
  assert.equal(senderAuthorized(new Request('https://test'),secret),false);
  assert.equal(senderAuthorized(new Request('https://test',{headers:{authorization:`Bearer ${secret}`}}),secret),true);
  assert.equal(senderAuthorized(new Request('https://test',{headers:{authorization:'Bearer '+ 'x'.repeat(32)}}),secret),false);
  assert.equal(senderAuthorized(new Request('https://test'),''),false);
});
function provider(hash='hash',timestamp=100,chain=11155111n):Provider {
  return {getNetwork:async()=>({chainId:chain}),getBlock:async(tag:string|number)=>({number:typeof tag==='number'?tag:20,hash,timestamp})} as unknown as Provider;
}
test('fast observation requires two matching fresh Sepolia blocks two deep',async()=>{
  assert.deepEqual(await confirmedAnchor([provider(),provider()],100000),{number:18,hash:'hash',timestamp:100});
  await assert.rejects(confirmedAnchor([provider(),provider('other')],100000),/rpc_disagreement/);
  await assert.rejects(confirmedAnchor([provider(),provider('hash',100,1n)],100000),/network_mismatch/);
  await assert.rejects(confirmedAnchor([provider(),provider()],500000),/rpc_stale/);
  await assert.rejects(assertCanonical([provider(),provider('other')],{block:18,blockHash:'hash'}),/chain_reorganized/);
});

test('PostgreSQL migration, concurrent leases, crash recovery, fencing and health', {skip:process.env.TEST_SOCIAL_DATABASE!=='1'},async()=>{
  const url=process.env.DATABASE_URL!;
  assert.ok(url && ['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'Fixtures require local PostgreSQL');
  const schema='social_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:url}),db=new pg.Pool({connectionString:url,max:8,options:`-c search_path=${schema},public`});
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await db.query(await readFile(new URL('../../../database/migrations/039_social_sender.sql',import.meta.url),'utf8'));
    await db.query('INSERT INTO manekineko_social_senders(id,config,enabled) VALUES($1,$2,true)',['test',JSON.stringify(config)]);
    const claims=await Promise.all(Array.from({length:8},()=>claimSender(db)));
    assert.equal(claims.filter(Boolean).length,1);const first=claims.find(Boolean)!;
    first.entries=[{...event,status:'intent',mediaId:'987',queuedAt:Date.now()-240000}];await saveSender(db,first);
    await db.query("UPDATE manekineko_social_senders SET lease_until=now()-interval '1 second'");
    const recovered=(await claimSender(db))!;assert.notEqual(first.lease_token,recovered.lease_token);assert.equal(recovered.entries[0].status,'intent');
    await assert.rejects(saveSender(db,first),/lease_lost/);await assert.rejects(assertSenderLease(db,first),/lease_lost/);
    await finishSender(db,first,{observed:true,delivered:true});await assertSenderLease(db,recovered);
    let health=await senderHealth(db);assert.equal(health.healthy,false);assert.equal(health.sources[0].uncertain,1);assert.ok(health.sources[0].oldestPendingSeconds>=240);
    recovered.entries[0].status='sent';recovered.entries[0].postId='765';await saveSender(db,recovered);
    await finishSender(db,recovered,{observed:true,delivered:true});health=await senderHealth(db);assert.equal(health.healthy,true);
    const next=(await claimSender(db))!;await finishSender(db,next,{error:'x_429',retrySeconds:300,observed:false,delivered:false});assert.equal(await claimSender(db),undefined);
    await db.query('UPDATE manekineko_social_senders SET enabled=false');assert.equal(await claimSender(db),undefined);
  } finally {await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
