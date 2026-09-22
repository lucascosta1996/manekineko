import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

// Disposable local database, never a runtime or hosted database.
const url = new URL(process.env.DATABASE_URL ?? 'postgresql://manekineko:manekineko-local-only@127.0.0.1:54329/manekineko');
assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
const name = `tincta_v9_test_${randomUUID().replaceAll('-','')}`;
const admin = new pg.Client({ connectionString: url.href });
let db, created=false;
try {
 await admin.connect(); await admin.query(`CREATE DATABASE ${name}`);created=true;
 url.pathname=`/${name}`;db=new pg.Client({ connectionString:url.href });await db.connect();
 for(const file of (await readdir(new URL('../database/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()) {
  await db.query(await readFile(new URL(`../database/migrations/${file}`,import.meta.url),'utf8'));
 }
 const terms={algorithmVersion:'unique-rank-v5',maxMintsPerWallet:'20',winnerCount:'6',maxSupply:'1000',prizeBps:'6000',affiliatePoolBps:'2000',minAffiliateReferrals:'100',affiliatePayoutCapBps:'3000',saleStartAt:'2000000000'};
 const version=async c=>(await db.query('SELECT manekineko_launch_payload_version($1::jsonb) AS version',[{contract:c}])).rows[0].version;
 assert.equal(await version(terms),'affiliate-v9');const old={...terms};delete old.maxMintsPerWallet;assert.equal(await version(old),'affiliate-v8');
 for(const limit of ['19','21','020',20,null])assert.equal(await version({...terms,maxMintsPerWallet:limit}),null);
 assert.equal(await version({...terms,algorithmVersion:'unique-rank-v4'}),null);
 const series=randomUUID();await db.query('INSERT INTO manekineko_series(id,name) VALUES($1,$2)',[series,'V9 test']);
 await db.query("INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url) VALUES(11155111,'Sepolia','ETH',18,'https://sepolia.etherscan.io') ON CONFLICT DO NOTHING");
 const insert=async (id,v,winners='6',algorithm='unique-rank-v5')=>db.query(`INSERT INTO manekineko_collections
 (id,series_id,chain_id,round_id,slug,name,symbol,max_supply,mint_price_wei,mint_duration_seconds,reveal_delay_blocks,
 contract_version,algorithm_version,randomness_provider,prize_bps,affiliate_pool_bps,winner_count,min_affiliate_referrals,affiliate_payout_cap_bps,sale_start_at,season_id,season_name,collection_color,text_color)
 VALUES($1,$2,11155111,$3,$4,'Capped collection','QA',1000,10000000000000000,86400,NULL,$5,$6,'chainlink-vrf-v2.5',6000,2000,$7,100,3000,'2030-01-01', $8,'QA Season','#330000','#FFFFFF')`,[id,series,v==='affiliate-v8'?1:2,`qa-${id}`,v,algorithm,winners,`0x${'12'.repeat(32)}`]);
 await insert(randomUUID(),'affiliate-v8');const id=randomUUID();await insert(id,'affiliate-v9');
 for(const [winners,algorithm] of [[null,'unique-rank-v5'],['6','unique-rank-v4'],['7','unique-rank-v5']]) {
  await assert.rejects(()=>insert(randomUUID(),'affiliate-v9',winners,algorithm),e=>e.code==='23514');
 }
 await db.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
 VALUES($1,11155111,'deployed',$2,$3,$4,1,'2030-01-02','2030-01-01')`,[id,`0x${'11'.repeat(20)}`,`0x${'22'.repeat(20)}`,`0x${'33'.repeat(32)}`]);
 await db.query(`INSERT INTO manekineko_collection_state(collection_id,phase,total_minted,total_mint_revenue_wei,block_number,block_hash,award_count,all_prizes_paid,randomness_state)
 VALUES($1,'pending_activation',0,0,1,$2,6,false,'not_requested')`,[id,`0x${'34'.repeat(32)}`]);
 await assert.rejects(()=>db.query('UPDATE manekineko_collection_state SET award_count=2 WHERE collection_id=$1',[id]));
 const award=rank=>db.query(`INSERT INTO manekineko_collection_awards(collection_id,rank,token_id,score,amount_wei,numbers,combination_code,combination_key,current_holder,determined_at,determined_transaction,claimed,block_number,block_hash)
 VALUES($1,$2,$3,$4,1000000000000000000,ARRAY[1,1,1,1],0,$5,$6,'2030-01-01',$5,false,1,$5)`,[id,rank,36+rank,1001-rank,`0x${'34'.repeat(32)}`,`0x${'11'.repeat(20)}`]);
 await award(6);await assert.rejects(()=>award(7),e=>e.message==='Award does not match versioned collection terms');
 console.log('V9 migration passed: all migrations, historical V8, strict cap manifest, ranked collection state and award invariants.');
} finally {
 await db?.end();if(created)await admin.query(`DROP DATABASE ${name}`);await admin.end();
}
