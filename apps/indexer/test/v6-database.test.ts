import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { encodeScrambledRank } from '@manekineko/contract-abi/scrambled-rank';
import { PostgresIndexerStore } from '../lib/store.ts';
import type { IndexerConfig, RegisteredCollection, CollectionSnapshot } from '../lib/types.ts';
import { createLaunchConfiguration, finalizeLaunchConfiguration, exportLaunchConfiguration } from '../../launch/lib/launch-config-store.ts';
import { createLaunchAutomation, prepareLaunchAutomation, exportLaunchAutomation } from '../../launch/lib/launch-automation-store.ts';
import { addSeasonAppearance, TEST_SEASON_ID } from '../../launch/test/launch-season.fixture.ts';
import { launchFixture } from '../../launch/test/launch-config.fixture.ts';
import { automationFixture, AUTOMATION_NOW } from '../../launch/test/launch-automation.fixture.ts';

const key='0x7fe7c3d8b5fe2a4a1b90463986ed0d1378bf9a137a8bd17c4fd1860f628507cb';
const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}`;
test('V6 additive migration preserves V5 exports and indexes versioned scrambled winners', {
  skip:process.env.TEST_INDEXER_DATABASE !== '1' ? 'Set TEST_INDEXER_DATABASE=1 and a local DATABASE_URL.' : false,
},async t=>{
  const connectionString=process.env.DATABASE_URL;assert.ok(connectionString);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname));
  const schema=`manekineko_v6_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Client({connectionString});let pool:pg.Pool|undefined;
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool=new pg.Pool({connectionString,max:3,options:`-c search_path=${schema},public`});const db=pool;
    const migrations=new URL('../../../database/migrations/',import.meta.url);
    for(const name of (await readdir(migrations)).filter(n=>/^0(0[1-9]|1[0-5])_/.test(n)).sort())await db.query(await readFile(new URL(name,migrations),'utf8'));
    const actor={userId:randomUUID()};
    await db.query('INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,$2,$3)',[actor.userId,'operator',`scrypt$131072$8$1$${'A'.repeat(22)}$${'A'.repeat(86)}`]);
    const payload=launchFixture();payload.contract.affiliatePoolBps='1000';payload.contract.affiliateRatesBps=[];
    const old=await createLaunchConfiguration(db,actor,{label:'Existing V5',payload});
    await finalizeLaunchConfiguration(db,actor,old.id,old.revision);const oldExport=await exportLaunchConfiguration(db,old.id);
    const plan=automationFixture();for(const step of plan.steps){step.payload.contract.affiliatePoolBps='1000';step.payload.contract.affiliateRatesBps=[];}
    const oldPlan=await createLaunchAutomation(db,actor,{plan});await prepareLaunchAutomation(db,actor,oldPlan.id,oldPlan.revision,AUTOMATION_NOW);
    const oldPlanExport=await exportLaunchAutomation(db,oldPlan.id);
    await db.query(await readFile(new URL('016_scrambled_rank_v6.sql',migrations),'utf8'));
    await t.test('existing immutable V5 configuration and automation hashes survive migration',async()=>{
      assert.deepEqual(await exportLaunchConfiguration(db,old.id),oldExport);
      assert.deepEqual(await exportLaunchAutomation(db,oldPlan.id),oldPlanExport);
      assert.equal(oldExport.artifact.contractVersion,'affiliate-v5');
      await assert.rejects(()=>db.query('UPDATE manekineko_launch_configurations SET revision=revision+1 WHERE id=$1',[old.id]),/immutable/);
    });
    await t.test('new immutable V6 artifacts bind the explicit algorithm without changing economics',async()=>{
      const next=addSeasonAppearance(structuredClone(payload));next.operations.winnerCreditsAddress='0x4444444444444444444444444444444444444444';next.operations.winnerCreditSponsorshipWei=next.contract.mintPriceWei;next.operations.affiliateEligibilityAddress='0x5555555555555555555555555555555555555555';
      const draft=await createLaunchConfiguration(db,actor,{label:'New V6',payload:next});await finalizeLaunchConfiguration(db,actor,draft.id,draft.revision);
      const artifact=(await exportLaunchConfiguration(db,draft.id)).artifact;
      assert.equal(artifact.contractVersion,'affiliate-v6');assert.equal(artifact.contract.affiliatePoolBps,'1000');
      const nextPlan=structuredClone(plan);nextPlan.name='Moonlight season';nextPlan.seasonId=TEST_SEASON_ID;for(const step of nextPlan.steps){addSeasonAppearance(step.payload);step.payload.operations={...step.payload.operations,winnerCreditsAddress:next.operations.winnerCreditsAddress,winnerCreditSponsorshipWei:next.contract.mintPriceWei,affiliateEligibilityAddress:next.operations.affiliateEligibilityAddress};}
      const created=await createLaunchAutomation(db,actor,{plan:nextPlan});await prepareLaunchAutomation(db,actor,created.id,created.revision,AUTOMATION_NOW);
      assert.equal((await exportLaunchAutomation(db,created.id)).artifact.contractVersion,'affiliate-v6');
    });
    await db.query("INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url) VALUES(11155111,'Sepolia','ETH',18,'https://sepolia.etherscan.io')");
    const seriesId=randomUUID();await db.query('INSERT INTO manekineko_series(id,name) VALUES($1,$2)',[seriesId,'Versioned test']);
    const c:RegisteredCollection={id:randomUUID(),seriesId,chainId:11155111,roundId:'1',name:'V6 winner',symbol:'V6',maxSupply:20,mintPrice:'10000',prizeBps:5000,affiliatePoolBps:1000,
      address:`0x${'1'.repeat(40)}`,factory:`0x${'6'.repeat(40)}`,deploymentTransaction:hash(1),deploymentBlock:10,deployedAt:'2026-01-01T00:00:00.000Z',mintDeadline:1767312000,maxAffiliateSlots:10,enrollmentSigner:`0x${'3'.repeat(40)}`,contractVersion:'affiliate-v6',algorithmVersion:'unique-rank-v3'};
    const register=async(id:string,version:string,algorithm:string,round=1)=>db.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,max_supply,mint_price_wei,mint_duration_seconds,reveal_delay_blocks,algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps)
      VALUES($1,$2,11155111,$3,$4,'V6 winner','V6',20,10000,86400,NULL,$5,'chainlink-vrf-v2.5',$6,5000,1000)`,[id,seriesId,round,id,algorithm,version]);
    await t.test('wrong contract-algorithm pairs are rejected, including a V5 factory program on V6',async()=>{
      await assert.rejects(()=>register(randomUUID(),'affiliate-v6','unique-rank-v2'),/financial_version/);
      await assert.rejects(()=>register(randomUUID(),'affiliate-v5','unique-rank-v3'),/financial_version/);
      await register(c.id,'affiliate-v6','unique-rank-v3');
      await assert.rejects(()=>db.query(`INSERT INTO manekineko_affiliate_programs(collection_id,mode,contract_version,max_slots,commission_bps,affiliate_rates_bps,enrollment_signer) VALUES($1,'live','affiliate-v5',10,NULL,'{}',$2)`,[c.id,c.enrollmentSigner]),/matching pool collection/);
      await db.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,factory_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
        VALUES($1,11155111,'deployed',$2,$3,$4,$5,10,to_timestamp($6),$7)`,[c.id,c.address,c.factory,c.enrollmentSigner,c.deploymentTransaction,c.mintDeadline,c.deployedAt]);
      await db.query(`INSERT INTO manekineko_affiliate_programs(collection_id,mode,contract_version,max_slots,commission_bps,affiliate_rates_bps,enrollment_signer) VALUES($1,'live','affiliate-v6',10,NULL,'{}',$2)`,[c.id,c.enrollmentSigner]);
      await assert.rejects(()=>db.query("UPDATE manekineko_collections SET algorithm_version='unique-rank-v2',contract_version='affiliate-v5' WHERE id=$1",[c.id]),/immutable/);
    });
    const config:IndexerConfig={databaseUrl:connectionString,rpcUrl:'https://rpc.example',chainId:11155111,factory:c.factory,factoryCodeHash:hash(6),contractVersion:'affiliate-v6',confirmations:2,blockRange:500,maxBatches:8,maxCollections:10,timeBudgetMs:45000,reconcileSeconds:900,leaseSeconds:300};
    const store=new PostgresIndexerStore(db);
    await t.test('V6 enrollment challenges bind the pool and exact deployed contract version',async()=>{
      await db.query('UPDATE manekineko_affiliate_programs SET enrollment_enabled=true WHERE collection_id=$1',[c.id]);
      const challenge=async(version:string,amount:number)=>db.query(`INSERT INTO manekineko_affiliate_challenges(id,collection_id,wallet,chain_id,contract_address,origin,nonce,ip_digest,expires_at,contract_version,affiliate_id,commission_bps)
        VALUES($1,$2,$3,11155111,$3,'https://local-test.example',$4,$5,now()+interval '5 minutes',$6,1,$7)`,[randomUUID(),c.id,c.address,hash(Math.floor(Math.random()*1000000)+200),'a'.repeat(64),version,amount]);
      await assert.rejects(()=>challenge('affiliate-v5',1000),/exact offered/);
      await assert.rejects(()=>challenge('affiliate-v6',999),/exact offered/);
      await challenge('affiliate-v6',1000);
    });
    for (const name of ['017_affiliate_holder_eligibility.sql','018_collection_seasons.sql','019_multi_awards_v7.sql']) await db.query(await readFile(new URL(name,migrations),'utf8'));
    await t.test('collection discovery is scoped to the exact version and factory',async()=>{
      assert.equal((await store.collections(config)).length,1);
      assert.equal((await store.collections({...config,contractVersion:'affiliate-v5'})).length,0);
      assert.equal((await store.collections({...config,factory:`0x${'5'.repeat(40)}`})).length,0);
    });
    await t.test('a pinned complete snapshot archives the scrambled combination and public key atomically',async()=>{
      const owner=randomUUID(),previous=await store.acquire(c,owner,300);assert.ok(previous);
      const combination=encodeScrambledRank(20,key);
      const snapshot:CollectionSnapshot={phase:'complete',totalMinted:20,totalMintRevenueWei:'200000',settledCount:20,refundedCount:0,totalRefundedWei:'0',winningTokenId:7,highestScore:'20',randomnessState:'fulfilled',randomnessRequestId:'0',randomnessWord:'123',prizePaid:true,prizeRecipient:c.address,prizePaidWei:'100000',winningCombination:{numbers:combination.numbers,code:combination.combinationCode,score:combination.score,key}};
      const batch={collection:c,owner,previous,block:{number:20,hash:hash(20),timestamp:1767225660},reset:false,fingerprint:'a'.repeat(64),snapshot,
        events:[{blockNumber:19,blockHash:hash(19),transactionHash:hash(101),transactionIndex:0,logIndex:0,name:'PrizeDelivered',args:{tokenId:'7',holder:c.address,recipient:c.address,amount:'100000'},topics:[],data:'0x',timestamp:1767225650}],beforeCommit:async()=>{}};
      const incorrect=structuredClone(snapshot);incorrect.winningCombination!.key=hash(999);
      await assert.rejects(()=>store.commit({...batch,snapshot:incorrect}),/winner_accounting_mismatch/);
      assert.equal((await db.query('SELECT count(*)::integer AS count FROM manekineko_chain_events WHERE collection_id=$1',[c.id])).rows[0].count,0);
      await store.commit(batch);
      const winner=(await db.query('SELECT * FROM manekineko_history_winners WHERE collection_id=$1',[c.id])).rows[0];
      assert.equal(winner.algorithm_version,'unique-rank-v3');assert.equal(winner.combination_key,key);assert.equal(winner.score,'20');assert.equal(winner.combination_code,'40582');
      const archive=(await db.query('SELECT contract_version,algorithm_version FROM manekineko_collection_history WHERE id=$1',[c.id])).rows[0];
      assert.deepEqual(archive,{contract_version:'affiliate-v6',algorithm_version:'unique-rank-v3'});
      await assert.rejects(()=>db.query('UPDATE manekineko_history_winners SET combination_key=NULL WHERE collection_id=$1',[c.id]),/winner_score_check/);
      await assert.rejects(()=>db.query('UPDATE manekineko_history_winners SET score=19 WHERE collection_id=$1',[c.id]),/winning rank/);
    });
  }finally{await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
