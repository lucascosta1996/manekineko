import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

// Disposable local database, never a runtime or hosted database.
assert(process.env.V10_TEST_DATABASE_URL, 'Set V10_TEST_DATABASE_URL to an explicitly isolated local PostgreSQL database.');
const url = new URL(process.env.V10_TEST_DATABASE_URL);
assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
const name = `tincta_v10_test_${randomUUID().replaceAll('-','')}`;
const admin = new pg.Client({ connectionString: url.href });
let db, created=false;
const terms={algorithmVersion:'unique-rank-v6',maxMintsPerWallet:'20',winnerCount:'6',maxSupply:'1000',prizeBps:'6000',affiliatePoolBps:'2000',minAffiliateReferrals:'100',affiliatePayoutCapBps:'3000',saleStartAt:'2000000000'};
const actor=randomUUID(), seasonId=`0x${'45'.repeat(32)}`;
const payload=(version,chainId='11155111')=>{
 const contract={...terms,algorithmVersion:version==='affiliate-v10'?'unique-rank-v6':'unique-rank-v5',chainId,seasonId,seasonName:'Preserved season',collectionColor:'#330000',textColor:'#FFFFFF'};
 if(version==='affiliate-v8')delete contract.maxMintsPerWallet;
 return {contract,operations:{}};
};
const plan=(version,chainId='11155111')=>({name:'Preserved season',seasonId,chainId,startAt:'2030-01-01T00:00:00.000Z',intervalSeconds:'0',failurePolicy:'pause',
 timing:{version:1,anchor:'previous_sellout',nextLaunchDelaySeconds:'3600',nextAnnouncementDelaySeconds:'1800',winnerAnnouncement:'after_verified_draw',missedLaunchPolicy:'pause'},
 steps:[{id:randomUUID(),label:'Exact collection',payload:payload(version,chainId)}]});
async function finalizedConfiguration(version){
 const id=randomUUID(),p=payload(version);
 await db.query("INSERT INTO manekineko_launch_configurations(id,label,payload,created_by,updated_by) VALUES($1,'Exact export',$2,$3,$3)",[id,p,actor]);
 await db.query("UPDATE manekineko_launch_configurations SET status='finalized',revision=2,finalized_by=$2,finalized_artifact=$3,content_hash=$4 WHERE id=$1",[id,actor,{schemaVersion:1,contractVersion:version,...p},'a'.repeat(64)]);
 return id;
}
async function savedPlan(version,chain='11155111',prepare=true){
 const id=randomUUID(),p=plan(version,chain);
 await db.query('INSERT INTO manekineko_launch_automations(id,plan,created_by,updated_by) VALUES($1,$2,$3,$3)',[id,p,actor]);
 if(prepare)await db.query("UPDATE manekineko_launch_automations SET status='prepared',revision=2,prepared_by=$2,prepared_artifact=$3,content_hash=$4 WHERE id=$1",[id,actor,{...p,schemaVersion:1,kind:'launch-automation',contractVersion:version},'b'.repeat(64)]);
 return {id,plan:p};
}
try {
 await admin.connect(); await admin.query(`CREATE DATABASE ${name}`);created=true;
 url.pathname=`/${name}`;db=new pg.Client({ connectionString:url.href });await db.connect();
 for(const file of (await readdir(new URL('../database/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&!f.startsWith('026')).sort()) {
  await db.query(await readFile(new URL(`../database/migrations/${file}`,import.meta.url),'utf8'));
 }
 await db.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,'v10_test_operator',$2)",[actor,`scrypt$131072$8$1$${'A'.repeat(22)}$${'A'.repeat(86)}`]);
 await db.query("ALTER TABLE manekineko_launch_automations ADD CONSTRAINT manekineko_launch_automations_staging_chain CHECK ((plan->>'chainId'='11155111' OR (plan->>'chainId'='1' AND status='draft')) AND NOT jsonb_path_exists(plan, '$.steps[*].payload.contract.chainId ? (@ != $chain)', jsonb_build_object('chain',plan->>'chainId')))");
 await finalizedConfiguration('affiliate-v8');await finalizedConfiguration('affiliate-v9');
 const oldSeason=await savedPlan('affiliate-v9'),mainnetDraft=await savedPlan('affiliate-v9','1',false);
 const frozen=async()=>({configs:(await db.query('SELECT * FROM manekineko_launch_configurations ORDER BY id')).rows,plans:(await db.query('SELECT * FROM manekineko_launch_automations ORDER BY id')).rows});
 const before=await frozen();
 await db.query(await readFile(new URL('../database/migrations/026_permanent_combinations_v10.sql',import.meta.url),'utf8'));
 assert.deepEqual(await frozen(),before,'Migration must not rewrite V8/V9 finalized exports, plans, hashes, or catalog identity');
 const newConfig=await finalizedConfiguration('affiliate-v10'),newSeason=await savedPlan('affiliate-v10');
 await assert.rejects(()=>db.query('UPDATE manekineko_launch_configurations SET revision=revision+1 WHERE id=$1',[newConfig]),/immutable/);
 const mixed=plan('affiliate-v10');mixed.steps.push({...mixed.steps[0],id:randomUUID(),payload:payload('affiliate-v9')});
 assert.equal((await db.query('SELECT manekineko_launch_plan_version($1::jsonb) AS version',[mixed])).rows[0].version,null);
 await assert.rejects(()=>db.query("UPDATE manekineko_launch_automations SET status='prepared',revision=2,prepared_by=$2,prepared_artifact=$3,content_hash=$4 WHERE id=$1",[mainnetDraft.id,actor,{...mainnetDraft.plan,schemaVersion:1,kind:'launch-automation',contractVersion:'affiliate-v9'},'b'.repeat(64)]),e=>e.code==='23514');
 await db.query("INSERT INTO manekineko_season_runtime_profiles(chain_id,handle,expected_account_id,public_base_url,encrypted_credentials,updated_by) VALUES('11155111','v10_test','123','https://example.test',$1,$2)",['fictional encrypted profile'.repeat(3),actor]);
 const start=(id,revision=2,hash='b'.repeat(64))=>db.query("INSERT INTO manekineko_season_runtime_runs(id,automation_id,automation_revision,prepared_hash,chain_id,profile_revision,created_by,updated_by) VALUES($1,$2,$3,$4,'11155111',1,$5,$5)",[randomUUID(),id,revision,hash,actor]);
 await assert.rejects(()=>start(newSeason.id,1),/exact prepared/);await assert.rejects(()=>start(newSeason.id,2,'c'.repeat(64)),/exact prepared/);
 await start(oldSeason.id);await start(newSeason.id);
 await assert.rejects(()=>db.query("UPDATE manekineko_season_runtime_runs SET prepared_hash=$1 WHERE automation_id=$2",['c'.repeat(64),newSeason.id]),/immutable/);
 const version=async c=>(await db.query('SELECT manekineko_launch_payload_version($1::jsonb) AS version',[{contract:c}])).rows[0].version;
 assert.equal(await version(terms),'affiliate-v10');
 assert.equal(await version({...terms,algorithmVersion:'unique-rank-v5'}),'affiliate-v9');
 const old={...terms,algorithmVersion:'unique-rank-v5'};delete old.maxMintsPerWallet;assert.equal(await version(old),'affiliate-v8');
 const missing={...terms};delete missing.maxMintsPerWallet;assert.equal(await version(missing),null);
 for(const limit of ['19','21','020',20,null])assert.equal(await version({...terms,maxMintsPerWallet:limit}),null);
 assert.equal(await version({...terms,algorithmVersion:'unique-rank-v4'}),null);
 const series=randomUUID();await db.query('INSERT INTO manekineko_series(id,name) VALUES($1,$2)',[series,'V10 test']);
 await db.query("INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url) VALUES(11155111,'Sepolia','ETH',18,'https://sepolia.etherscan.io') ON CONFLICT DO NOTHING");
 const insert=async (id,v,winners='6',algorithm='unique-rank-v6')=>db.query(`INSERT INTO manekineko_collections
 (id,series_id,chain_id,round_id,slug,name,symbol,max_supply,mint_price_wei,mint_duration_seconds,reveal_delay_blocks,
 contract_version,algorithm_version,randomness_provider,prize_bps,affiliate_pool_bps,winner_count,min_affiliate_referrals,affiliate_payout_cap_bps,sale_start_at,season_id,season_name,collection_color,text_color)
 VALUES($1,$2,11155111,$3,$4,'Capped collection','QA',1000,10000000000000000,86400,NULL,$5,$6,'chainlink-vrf-v2.5',6000,2000,$7,100,3000,'2030-01-01', $8,'QA Season','#330000','#FFFFFF')`,[id,series,v==='affiliate-v8'?1:v==='affiliate-v9'?2:3,`qa-${id}`,v,algorithm,winners,`0x${'12'.repeat(32)}`]);
 await insert(randomUUID(),'affiliate-v8','6','unique-rank-v5');await insert(randomUUID(),'affiliate-v9','6','unique-rank-v5');const id=randomUUID();await insert(id,'affiliate-v10');
 for(const [winners,algorithm] of [[null,'unique-rank-v6'],['6','unique-rank-v5'],['7','unique-rank-v6']]) {
  await assert.rejects(()=>insert(randomUUID(),'affiliate-v10',winners,algorithm),e=>e.code==='23514');
 }
 await db.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
 VALUES($1,11155111,'deployed',$2,$3,$4,1,'2030-01-02','2030-01-01')`,[id,`0x${'11'.repeat(20)}`,`0x${'22'.repeat(20)}`,`0x${'33'.repeat(32)}`]);
 await db.query(`INSERT INTO manekineko_collection_state(collection_id,phase,total_minted,total_mint_revenue_wei,block_number,block_hash,award_count,all_prizes_paid,randomness_state)
 VALUES($1,'pending_activation',0,0,1,$2,6,false,'not_requested')`,[id,`0x${'34'.repeat(32)}`]);
 await assert.rejects(()=>db.query('UPDATE manekineko_collection_state SET award_count=2 WHERE collection_id=$1',[id]));
 const award=rank=>db.query(`INSERT INTO manekineko_collection_awards(collection_id,rank,token_id,score,amount_wei,numbers,combination_code,combination_key,current_holder,determined_at,determined_transaction,claimed,block_number,block_hash)
 VALUES($1,$2,$3,$4,1000000000000000000,ARRAY[1,1,1,1],0,$5,$6,'2030-01-01',$5,false,1,$5)`,[id,rank,36+rank,1001-rank,`0x${'34'.repeat(32)}`,`0x${'11'.repeat(20)}`]);
 await award(6);await assert.rejects(()=>award(7),e=>e.message==='Award does not match versioned collection terms');
 await assert.rejects(()=>db.query("UPDATE manekineko_collections SET contract_version='affiliate-v9',algorithm_version='unique-rank-v5' WHERE id=$1",[id]),/immutable/);
 await db.query(`INSERT INTO manekineko_affiliate_programs(collection_id,mode,contract_version,max_slots,commission_bps,affiliate_rates_bps,enrollment_signer) VALUES($1,'live','affiliate-v10',10,NULL,'{}',$2)`,[id,`0x${'22'.repeat(20)}`]);
 console.log('V10 migration passed: full chain, unchanged V8/V9 exports and catalog plans, strict V10 manifests, homogeneous V9/V10 runtime binding, staging Mainnet restriction, immutable version pair, affiliate admission, ranked state and award invariants.');
} finally {
 await db?.end();if(created)await admin.query(`DROP DATABASE ${name}`);await admin.end();
}
