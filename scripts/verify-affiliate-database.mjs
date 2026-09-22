import { createLaunchConfiguration, finalizeLaunchConfiguration, exportLaunchConfiguration } from "../apps/launch/lib/launch-config-store.ts";
import { createLaunchAutomation, prepareLaunchAutomation, exportLaunchAutomation } from "../apps/launch/lib/launch-automation-store.ts";
import { launchFixture } from "../apps/launch/test/launch-config.fixture.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { AFFILIATE_CONSUME_SQL, AFFILIATE_RATE_SQL } from "../apps/web/lib/affiliates/queries.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!["localhost","127.0.0.1","[::1]"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Affiliate database regressions run only against a local PostgreSQL instance.");
const schema=`manekineko_affiliate_test_${randomUUID().replaceAll("-","")}`;
const admin=new pg.Client({connectionString:process.env.DATABASE_URL,application_name:"manekineko-affiliate-regression"});
let pool;
let connected=false;
let created=false;
let checks=0;
async function pass(name,operation) { await operation(); checks++; console.log(`PASS ${name}`); }
async function rejected(sql,values,pattern) { await assert.rejects(()=>pool.query(sql,values),pattern); }
try {
  await admin.connect();
  connected=true;
  await admin.query(`CREATE SCHEMA ${schema}`);
  created=true;
  pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:12,options:`-c search_path=${schema},public`,application_name:"manekineko-affiliate-regression"});
  // Exercise the actual migrations and triggers in an isolated disposable schema.
  const databaseRoot=new URL("../database/",import.meta.url);
  const setup=await pool.connect();
  try {
    for(const name of (await readdir(new URL("migrations/",databaseRoot))).filter(name=>name.endsWith(".sql")).sort()) await setup.query(await readFile(new URL(`migrations/${name}`,databaseRoot),"utf8"));
    for(const name of (await readdir(new URL("seeds/",databaseRoot))).filter(name=>name.endsWith(".sql")).sort()) await setup.query(await readFile(new URL(`seeds/${name}`,databaseRoot),"utf8"));
  } finally { setup.release(); }
  const demo="8fa5f8c0-6ef4-47f6-9af3-60b8101c9321";
  await pass("six database-backed states preserve per-position rates and independent referral counts",async()=>{
    const rows=(await pool.query("SELECT scenario,accrued_wei::text,claimed_wei::text FROM manekineko_affiliate_demo_accounts WHERE collection_id=$1 ORDER BY scenario",[demo])).rows;
    assert.equal(rows.length,6); assert.equal(rows.find(row=>row.scenario==="no_referrals").accrued_wei,"0");
    assert.equal(rows.find(row=>row.scenario==="paid").claimed_wei,"1800000000000000");
    const zero=(await pool.query("SELECT referred_mints,accrued_wei::text FROM manekineko_affiliate_demo_accounts WHERE collection_id=$1 AND scenario='no_commission'",[demo])).rows[0];
    assert.equal(zero.referred_mints,12); assert.equal(zero.accrued_wei,"0");
  });
  await pass("program terms cannot change cap, commission, mode or beneficiary signer",async()=>{
    await rejected("UPDATE manekineko_affiliate_programs SET max_slots=11 WHERE collection_id=$1",[demo],/immutable/);
    await rejected("UPDATE manekineko_affiliate_programs SET affiliate_rates_bps[3]=200 WHERE collection_id=$1",[demo],/immutable/);
    await rejected("UPDATE manekineko_affiliate_programs SET enrollment_enabled=true WHERE collection_id=$1",[demo],/check constraint/);
  });
  await pass("fictional sold-out/refund/commission states cannot contradict their labels or slots",async()=>{
    await rejected("UPDATE manekineko_affiliate_demo_accounts SET claimed_wei=1 WHERE collection_id=$1 AND scenario='pending_sellout'",[demo],/check constraint/);
    await rejected("UPDATE manekineko_affiliate_demo_accounts SET sold_out=true WHERE collection_id=$1 AND scenario='refunded'",[demo],/check constraint/);
    await rejected("UPDATE manekineko_affiliate_demo_accounts SET enrolled_slots=11 WHERE collection_id=$1",[demo],/Invalid fictional/);
  });
  const live=randomUUID(),contract="0x1111111111111111111111111111111111111111",wallet="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",nonce="0x"+"ab".repeat(32),challengeId=randomUUID();
  await pool.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,description,max_supply,mint_price_wei,mint_duration_seconds,reveal_delay_blocks,algorithm_version,randomness_provider,contract_version)
    SELECT $1,series_id,11155111,100,'affiliate-test-round','Affiliate test','TEST','Isolated test fixture',1000,10000,3600,NULL,'unique-rank-v2','chainlink-vrf-v2.5','affiliate-v3' FROM manekineko_collections WHERE id=$2`,[live,demo]);
  await pool.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,factory_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
    VALUES($1,11155111,'deployed',$2,$2,$3,$4,1,now()+interval '1 hour',now())`,[live,contract,wallet,"0x"+"cd".repeat(32)]);
  await pool.query("INSERT INTO manekineko_affiliate_programs(collection_id,mode,max_slots,enrollment_enabled,enrollment_signer) VALUES($1,'live',10,true,$2)",[live,wallet]);
  const insertChallenge=`INSERT INTO manekineko_affiliate_challenges(id,collection_id,wallet,chain_id,contract_address,origin,nonce,ip_digest,expires_at) VALUES($1,$2,$3,11155111,$4,'https://nft.example.com',$5,$6,now()+interval '5 minutes')`;
  await pass("a demo program cannot issue a genuine enrollment challenge",()=>rejected(insertChallenge,[randomUUID(),demo,wallet,contract,"0x"+"12".repeat(32),"a".repeat(64)],/enabled deployed program/));
  await pool.query(insertChallenge,[challengeId,live,wallet,contract,nonce,"a".repeat(64)]);
  await pass("unique nonces and immutable wallet/collection/origin prevent proof substitution",async()=>{
    await rejected(insertChallenge,[randomUUID(),live,wallet,contract,nonce,"b".repeat(64)],/unique constraint/);
    await rejected("UPDATE manekineko_affiliate_challenges SET wallet=$2 WHERE id=$1",[challengeId,"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],/immutable/);
    await rejected("UPDATE manekineko_affiliate_challenges SET origin='https://attacker.example' WHERE id=$1",[challengeId],/immutable/);
  });
  await pass("twelve concurrent permit requests consume the PostgreSQL nonce exactly once",async()=>{
    const results=await Promise.all(Array.from({length:12},()=>pool.query(AFFILIATE_CONSUME_SQL,[challengeId,live,wallet])));
    assert.equal(results.reduce((sum,result)=>sum+result.rowCount,0),1);
    await rejected("UPDATE manekineko_affiliate_challenges SET consumed_at=NULL WHERE id=$1",[challengeId],/single use/);
  });
  await pass("expired challenges and another applicant cannot consume a nonce",async()=>{
    const expiredId=randomUUID();
    await pool.query(`INSERT INTO manekineko_affiliate_challenges(id,collection_id,wallet,chain_id,contract_address,origin,nonce,ip_digest,created_at,expires_at)
      VALUES($1,$2,$3,11155111,$4,'https://nft.example.com',$5,$6,now()-interval '10 minutes',now()-interval '5 minutes')`,[expiredId,live,wallet,contract,"0x"+"ef".repeat(32),"a".repeat(64)]);
    assert.equal((await pool.query(AFFILIATE_CONSUME_SQL,[expiredId,live,wallet])).rowCount,0);
    assert.equal((await pool.query(AFFILIATE_CONSUME_SQL,[expiredId,live,"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"])).rowCount,0);
  });
  await pass("durable network quotas cap parallel requests atomically without permanently owning an IP",async()=>{
    const subject="c".repeat(64);
    const results=await Promise.all(Array.from({length:30},()=>pool.query(AFFILIATE_RATE_SQL,[live,"permit_ip",subject,3])));
    assert.equal(results.reduce((sum,result)=>sum+result.rowCount,0),3);
    const record=(await pool.query("SELECT attempts FROM manekineko_affiliate_rate_limits WHERE collection_id=$1 AND scope='permit_ip' AND subject_hash=$2",[live,subject])).rows[0];
    assert.equal(record.attempts,3);
    await pool.query("DELETE FROM manekineko_affiliate_rate_limits WHERE collection_id=$1 AND subject_hash=$2",[live,subject]);
    await pool.query("INSERT INTO manekineko_affiliate_rate_limits(collection_id,scope,subject_hash,window_start,attempts) VALUES($1,'permit_ip',$2,now()-interval '1 day',3)",[live,subject]);
    assert.equal((await pool.query(AFFILIATE_RATE_SQL,[live,"permit_ip",subject,3])).rowCount,1);
  });
  const v4=randomUUID(),v4Contract="0x2222222222222222222222222222222222222222";
  await pool.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,description,max_supply,mint_price_wei,mint_duration_seconds,reveal_delay_blocks,algorithm_version,randomness_provider,contract_version,prize_bps)
    SELECT $1,series_id,11155111,101,'affiliate-v4-test','V4 test','TEST','Isolated V4 fixture',1000,10000,3600,NULL,'unique-rank-v2','chainlink-vrf-v2.5','affiliate-v4',6500 FROM manekineko_collections WHERE id=$2`,[v4,demo]);
  await pool.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,factory_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
    VALUES($1,11155111,'deployed',$2,$2,$3,$4,1,now()+interval '1 hour',now())`,[v4,v4Contract,wallet,"0x"+"ac".repeat(32)]);
  await pass("V4 requires an explicit solvent schedule and preserves collection financial versions",async()=>{
    await rejected("INSERT INTO manekineko_affiliate_programs(collection_id,mode,max_slots,enrollment_signer,contract_version) VALUES($1,'live',3,$2,'affiliate-v4')",[v4,wallet],/explicit/);
    await rejected("INSERT INTO manekineko_affiliate_programs(collection_id,mode,max_slots,enrollment_signer,contract_version,affiliate_rates_bps) VALUES($1,'live',3,$2,'affiliate-v4',ARRAY[100,4000,0])",[v4,wallet],/exceed/);
    await rejected("INSERT INTO manekineko_affiliate_programs(collection_id,mode,max_slots,enrollment_signer,contract_version,affiliate_rates_bps) VALUES($1,'live',3,$2,'affiliate-v4',ARRAY[100,200])",[v4,wallet],/check constraint/);
    await rejected("UPDATE manekineko_collections SET prize_bps=5000 WHERE id=$1",[v4],/immutable/);
    await rejected("UPDATE manekineko_collections SET contract_version='affiliate-v4' WHERE id=$1",[live],/immutable/);
    await pool.query("INSERT INTO manekineko_affiliate_programs(collection_id,mode,max_slots,enrollment_enabled,enrollment_signer,contract_version,affiliate_rates_bps) VALUES($1,'live',3,true,$2,'affiliate-v4',ARRAY[100,200,0])",[v4,wallet]);
  });
  const v4Nonce="0x"+"98".repeat(32),v4Challenge=randomUUID();
  const insertV4Challenge=`INSERT INTO manekineko_affiliate_challenges(id,collection_id,wallet,chain_id,contract_address,origin,nonce,ip_digest,expires_at,contract_version,affiliate_id,commission_bps)
    VALUES($1,$2,$3,11155111,$4,'https://nft.example.com',$5,$6,now()+interval '5 minutes','affiliate-v4',$7,$8)`;
  await pass("V4 admission binds the exact immutable position and rate in PostgreSQL",async()=>{
    await rejected(insertV4Challenge,[randomUUID(),v4,wallet,v4Contract,v4Nonce,"a".repeat(64),2,100],/exact offered rate/);
    await rejected(insertV4Challenge,[randomUUID(),v4,wallet,v4Contract,v4Nonce,"a".repeat(64),null,null],/exact offered rate|check constraint/);
    await pool.query(insertV4Challenge,[v4Challenge,v4,wallet,v4Contract,v4Nonce,"a".repeat(64),2,200]);
    await rejected("UPDATE manekineko_affiliate_challenges SET affiliate_id=1,commission_bps=100 WHERE id=$1",[v4Challenge],/immutable/);
    const results=await Promise.all(Array.from({length:12},()=>pool.query(AFFILIATE_CONSUME_SQL,[v4Challenge,v4,wallet])));
    assert.equal(results.reduce((sum,result)=>sum+result.rowCount,0),1);
  });
  await pass("V4 snapshot payouts use the configured prize rather than a fixed half",async()=>{
    await pool.query(`INSERT INTO manekineko_collection_state(collection_id,phase,total_minted,total_mint_revenue_wei,settled_count,winning_token_id,highest_score,block_number,block_hash,randomness_request_id,randomness_state,randomness_word,prize_paid,prize_recipient,prize_paid_wei,prize_transaction_hash)
      VALUES($1,'complete',1000,10000000,1000,42,1000,10,$2,0,'fulfilled',0,true,$3,6500000,$4)`,[v4,"0x"+"bb".repeat(32),wallet,"0x"+"dd".repeat(32)]);
    await rejected("UPDATE manekineko_collection_state SET prize_paid_wei=5000000 WHERE collection_id=$1",[v4],/immutable collection percentage/);
  });
  for(const bps of [0,6500,10000]) await pass(`V4 archive preserves the ${bps} bps prize and rejects contradictory payouts`,async()=>{
    const id=randomUUID(),client=await pool.connect(),source="ad348b5a-8ad4-4719-82c4-0e2d58002008";
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO manekineko_collection_history(id,series_id,chain_id,round_id,name,symbol,max_supply,total_minted,mint_price_wei,total_refunded_wei,status,opened_at,closed_at,is_mock,algorithm_version,randomness_provider,contract_version,prize_bps)
        SELECT $1,series_id,1,$3,'V4 archive test',symbol,1000,1000,10000,0,status,opened_at,closed_at,true,'unique-rank-v2','chainlink-vrf-v2.5','affiliate-v4',$4
        FROM manekineko_collection_history WHERE id=$2`,[id,source,20000+bps,bps]);
      await client.query(`INSERT INTO manekineko_history_winners(collection_id,algorithm_version,token_id,number_a,number_b,number_c,number_d,combination_code,score,winning_holder,prize_recipient,prize_paid_wei,paid_at)
        SELECT $1,'unique-rank-v2',42,1,4,15,8,999,1000,prize_recipient,prize_recipient,$3,paid_at FROM manekineko_history_winners WHERE collection_id=$2`,[id,source,bps*1000]);
      await client.query("COMMIT");
    } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    await rejected("UPDATE manekineko_history_winners SET prize_paid_wei=prize_paid_wei+1 WHERE collection_id=$1",[id],/configured prize percentage/);
    await rejected("UPDATE manekineko_collection_history SET prize_bps=$2 WHERE id=$1",[id,(bps+1)%10001],/immutable/);
  });
  await pass("repeatable seeds retain configured V4 rates and legacy demo economics",async()=>{
    for(const name of (await readdir(new URL("seeds/",databaseRoot))).filter(name=>name.endsWith(".sql")).sort()) await pool.query(await readFile(new URL(`seeds/${name}`,databaseRoot),"utf8"));
    const row=(await pool.query("SELECT p.affiliate_rates_bps,c.contract_version,c.prize_bps FROM manekineko_affiliate_programs p JOIN manekineko_collections c ON c.id=p.collection_id WHERE c.id=$1",[demo])).rows[0];
    assert.equal(row.affiliate_rates_bps[2],150); assert.equal(row.contract_version,"legacy"); assert.equal(row.prize_bps,5000);
  });
  const v5=randomUUID(),v5Contract="0x5555555555555555555555555555555555555555";
  await pass("V5 persists a solvent collection pool and rejects per-position rates", async()=>{
    await pool.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,description,max_supply,mint_price_wei,mint_duration_seconds,reveal_delay_blocks,algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps)
      SELECT $1,series_id,11155111,102,'affiliate-v5-test','V5 pool','POOL','Isolated pool fixture',1000,10000,3600,NULL,'unique-rank-v2','chainlink-vrf-v2.5','affiliate-v5',5000,1000 FROM manekineko_collections WHERE id=$2`,[v5,demo]);
    await pool.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,factory_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
      VALUES($1,11155111,'deployed',$2,$2,$3,$4,1,now()+interval '1 hour',now())`,[v5,v5Contract,wallet,"0x"+"55".repeat(32)]);
    await rejected("INSERT INTO manekineko_affiliate_programs(collection_id,mode,max_slots,enrollment_enabled,enrollment_signer,contract_version,affiliate_rates_bps) VALUES($1,'live',20,true,$2,'affiliate-v5',ARRAY[100])",[v5,wallet],/no individual rates/);
    await pool.query("INSERT INTO manekineko_affiliate_programs(collection_id,mode,max_slots,enrollment_enabled,enrollment_signer,contract_version,affiliate_rates_bps) VALUES($1,'live',20,true,$2,'affiliate-v5',ARRAY[]::integer[])",[v5,wallet]);
    await rejected("UPDATE manekineko_collections SET affiliate_pool_bps=2000 WHERE id=$1",[v5],/immutable/);
  });
  await pass("V5 admission binds the shared pool rather than a personal commission",async()=>{
    const sql=insertV4Challenge.replace("'affiliate-v4'","'affiliate-v5'");
    await rejected(sql,[randomUUID(),v5,wallet,v5Contract,"0x"+"66".repeat(32),"a".repeat(64),20,100],/exact offered/);
    const id=randomUUID();await pool.query(sql,[id,v5,wallet,v5Contract,"0x"+"66".repeat(32),"a".repeat(64),20,1000]);
    const results=await Promise.all(Array.from({length:12},()=>pool.query(AFFILIATE_CONSUME_SQL,[id,v5,wallet])));
    assert.equal(results.reduce((sum,result)=>sum+result.rowCount,0),1);
  });
  await pass("V5 launch configuration and automation snapshots preserve the pool and version",async()=>{
    const actor={userId:randomUUID()},hash=`scrypt$131072$8$1$${"A".repeat(22)}$${"A".repeat(86)}`;
    await pool.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,'pool-operator',$2)",[actor.userId,hash]);
    const payload=launchFixture();payload.contract.affiliateRatesBps=[];payload.contract.affiliatePoolBps="2000";
    const draft=await createLaunchConfiguration(pool,actor,{label:"Shared pool",payload});
    const fixed=await finalizeLaunchConfiguration(pool,actor,draft.id,1);
    assert.equal(fixed.payload.contract.affiliatePoolBps,"2000");
    assert.equal((await exportLaunchConfiguration(pool,draft.id)).artifact.contractVersion,"affiliate-v5");
    const plan={name:"V5 series",chainId:"11155111",startAt:null,intervalSeconds:"0",failurePolicy:"pause",steps:[{id:randomUUID(),label:"First",payload,deadline:{mode:"duration",at:null}}]};
    const automation=await createLaunchAutomation(pool,actor,{plan});await prepareLaunchAutomation(pool,actor,automation.id,1);
    assert.equal((await exportLaunchAutomation(pool,automation.id)).artifact.contractVersion,"affiliate-v5");
    await rejected("UPDATE manekineko_launch_configurations SET revision=revision+1,payload=jsonb_set(payload,'{contract,affiliatePoolBps}','\"1000\"') WHERE id=$1",[draft.id],/immutable/);
  });
  console.log(`Affiliate PostgreSQL checks passed: ${checks}. Production data was not changed.`);
} catch(error) {
  console.error(error instanceof Error?error.message:"Affiliate database verification failed.");process.exitCode=1;
} finally {
  if(pool) await pool.end();
  try { if(connected&&created) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await admin.end(); }
}
