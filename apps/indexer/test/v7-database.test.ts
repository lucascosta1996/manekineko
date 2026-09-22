import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { encodeScrambledRank } from '@manekineko/contract-abi/scrambled-rank';
import { PostgresIndexerStore } from '../lib/store.ts';
import type { RegisteredCollection, CollectionSnapshot, ChainEvent, AwardSnapshot } from '../lib/types.ts';
const hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),wallet='0x'+'1'.repeat(40),factory='0x'+'7'.repeat(40),key=hash(42);
test('V7 canonical indexer stores two awards, independent claims and removes orphan awards on reorganization',{
 skip:process.env.TEST_INDEXER_DATABASE!=='1'?'Set TEST_INDEXER_DATABASE=1 and a local DATABASE_URL.':false,
},async()=>{
 const connectionString=process.env.DATABASE_URL!;assert.ok(['localhost','127.0.0.1'].includes(new URL(connectionString).hostname));
 const schema='manekineko_v7_indexer_'+randomUUID().replaceAll('-','');const admin=new pg.Client({connectionString});await admin.connect();let pool:pg.Pool|undefined;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString,options:`-c search_path=${schema},public`});
  const folder=new URL('../../../database/migrations/',import.meta.url);
  for(const name of (await readdir(folder)).filter(n=>/^0(0[1-9]|1[0-9]|2[01])_/.test(n)).sort())await pool.query(await readFile(new URL(name,folder),'utf8'));
  const c:RegisteredCollection={id:randomUUID(),seriesId:randomUUID(),chainId:1,roundId:'1',name:'V7',symbol:'V7',maxSupply:1000,mintPrice:'10000000000000000',prizeBps:6000,secondPrizeBps:2000,affiliatePoolBps:2000,minAffiliateReferrals:100,affiliatePayoutCapBps:3000,saleStartAt:1800350000,address:wallet,factory,deploymentTransaction:hash(1),deploymentBlock:10,deployedAt:new Date(1800349900*1000).toISOString(),mintDeadline:1800436400,maxAffiliateSlots:10,enrollmentSigner:wallet,contractVersion:'affiliate-v7',algorithmVersion:'unique-rank-v4'};
  await pool.query('INSERT INTO manekineko_series(id,name) VALUES($1,$2)',[c.seriesId,'Test']);
  await pool.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,max_supply,mint_price_wei,mint_duration_seconds,reveal_delay_blocks,algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps,second_prize_bps,min_affiliate_referrals,affiliate_payout_cap_bps,sale_start_at)
   VALUES($1::uuid,$2,1,1,$1::text,'V7','V7',1000,10000000000000000,86400,NULL,'unique-rank-v4','chainlink-vrf-v2.5','affiliate-v7',6000,2000,2000,100,3000,to_timestamp($3))`,[c.id,c.seriesId,c.saleStartAt]);
  await pool.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,factory_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at) VALUES($1,1,'deployed',$2,$3,$2,$4,10,to_timestamp($5),$6)`,[c.id,wallet,factory,c.deploymentTransaction,c.mintDeadline,c.deployedAt]);
  await pool.query(`INSERT INTO manekineko_affiliate_programs(collection_id,mode,contract_version,max_slots,commission_bps,affiliate_rates_bps,enrollment_signer) VALUES($1,'live','affiliate-v7',10,NULL,'{}',$2)`,[c.id,wallet]);
  const store=new PostgresIndexerStore(pool),owner=randomUUID();let previous=(await store.acquire(c,owner,300))!;
  const makeAward=(rank:number,claimed=false):AwardSnapshot=>{const combination=encodeScrambledRank(1001-rank,key);return{rank,tokenId:rank===1?321:872,score:combination.score,amountWei:rank===1?'4000000000000000000':'2000000000000000000',claimed,holder:wallet,winningHolder:claimed?wallet:null,paidAt:claimed?1800350300+rank:null,numbers:combination.numbers,code:combination.combinationCode,key};};
  const snapshot:CollectionSnapshot={phase:'awaiting_prize',totalMinted:1000,totalMintRevenueWei:'10000000000000000000',settledCount:1000,refundedCount:0,totalRefundedWei:'0',winningTokenId:321,highestScore:'1000',randomnessState:'fulfilled',randomnessRequestId:'1',randomnessWord:'1',prizePaid:false,prizeRecipient:null,prizePaidWei:'0',winningCombination:null,soldOutAt:1800350100,awards:[makeAward(1),makeAward(2)]};
  function event(name:string,rank:number,block:number):ChainEvent{return{blockNumber:block,blockHash:hash(block),transactionHash:hash(block+100),transactionIndex:0,logIndex:rank,name,args:name==='AwardDetermined'?{rank:String(rank),tokenId:String(makeAward(rank).tokenId),score:String(1001-rank),amount:makeAward(rank).amountWei}:{rank:String(rank),tokenId:String(makeAward(rank).tokenId),holder:wallet,recipient:wallet,amount:makeAward(rank).amountWei},topics:[],data:'0x',timestamp:name==='AwardDetermined'?1800350200:1800350300+rank};}
  async function commit(block:number,state:CollectionSnapshot,events:ChainEvent[],reset=false){await store.commit({collection:c,owner,previous,block:{number:block,hash:hash(block),timestamp:1800350400+block},snapshot:state,events,reset,fingerprint:'a'.repeat(64),beforeCommit:async()=>{}});previous={...previous,blockNumber:block,blockHash:hash(block),trustFingerprint:'a'.repeat(64),snapshotBlock:block,snapshotHash:hash(block),phase:state.phase};}
  await commit(20,snapshot,[event('AwardDetermined',1,19),event('AwardDetermined',2,19)]);
  assert.equal((await pool.query('SELECT count(*)::integer n FROM manekineko_collection_awards')).rows[0].n,2);
  await commit(21,{...snapshot,awards:[makeAward(1),makeAward(2,true)],prizePaidWei:'2000000000000000000'},[event('AwardClaimed',2,21)]);
  assert.equal((await pool.query('SELECT count(*)::integer n FROM manekineko_collection_awards WHERE claimed')).rows[0].n,1);
  assert.equal((await pool.query('SELECT all_prizes_paid FROM manekineko_collection_state')).rows[0].all_prizes_paid,false);
  await commit(22,{...snapshot,phase:'complete',awards:[makeAward(1,true),makeAward(2,true)],prizePaid:true,prizePaidWei:'6000000000000000000'},[event('AwardClaimed',1,22)]);
  assert.equal((await pool.query('SELECT all_prizes_paid FROM manekineko_collection_state')).rows[0].all_prizes_paid,true);
  await commit(23,{...snapshot,awards:[],phase:'minting',totalMinted:0,totalMintRevenueWei:'0',settledCount:0,winningTokenId:null,highestScore:null,randomnessState:'not_requested',randomnessRequestId:null,randomnessWord:null,soldOutAt:null},[],true);
  assert.equal((await pool.query('SELECT count(*)::integer n FROM manekineko_collection_awards')).rows[0].n,0);
  assert.equal((await pool.query('SELECT count(*)::integer n FROM manekineko_chain_events')).rows[0].n,0);
  const refunded:CollectionSnapshot={...snapshot,awards:[],phase:'refundable',totalMinted:2,totalMintRevenueWei:'20000000000000000',settledCount:0,refundedCount:2,totalRefundedWei:'20000000000000000',winningTokenId:null,highestScore:null,randomnessState:'not_requested',randomnessRequestId:null,randomnessWord:null,soldOutAt:null};
  await assert.rejects(commit(24,refunded,[]),/refund_event_mismatch/);
  const refunds=[1,2].map(tokenId=>({...event('Refunded',tokenId,24),args:{tokenId:String(tokenId),holder:wallet,recipient:wallet,amount:c.mintPrice}}));
  await commit(24,refunded,refunds);
  assert.equal((await pool.query('SELECT refunded_count FROM manekineko_collection_state')).rows[0].refunded_count,2);
  assert.equal((await pool.query('SELECT count(*)::integer n FROM manekineko_collection_history')).rows[0].n,0);
 }finally{await pool?.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
