import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { grantIndexerPrivileges, indexerCredentials, verifyIndexerPrivileges } from '../../../scripts/setup-indexer-staging.mjs';

const adminUrl='postgresql://admin:admin-password@ep-staging.us-east-1.neon.tech/staging?sslmode=verify-full';
const fixture={admin:{connectionString:adminUrl,password:'admin-password'},web:{password:'web-password'},launch:{password:'launch-password'}};
test('indexer credentials are generated once and bind to the exact dedicated staging endpoint',()=>{
  const first=indexerCredentials({},fixture);
  assert.equal(first.created,true);assert.equal(new URL(first.connectionString).username,'manekineko_staging_indexer');
  assert.equal(first.password.length,48);
  const second=indexerCredentials({INDEXER_DATABASE_URL:first.connectionString},fixture);
  assert.equal(second.created,false);assert.equal(second.connectionString,first.connectionString);
  for(const mutate of [(u:URL)=>u.hostname='unrelated.example',(u:URL)=>u.username='admin',(u:URL)=>u.search='?sslmode=disable',(u:URL)=>u.pathname='/other']){
    const url=new URL(first.connectionString);mutate(url);assert.throws(()=>indexerCredentials({INDEXER_DATABASE_URL:url.href},fixture));
  }
});

test('restricted indexer role can write verified snapshots but cannot read auth or modify deployment terms',{
  skip:process.env.TEST_INDEXER_DATABASE!=='1'?'Set TEST_INDEXER_DATABASE=1 and a local DATABASE_URL.':false,
},async()=>{
  const connectionString=process.env.DATABASE_URL;assert.ok(connectionString);
  const local=new URL(connectionString);assert.ok(['localhost','127.0.0.1','[::1]'].includes(local.hostname));
  const suffix=randomUUID().replaceAll('-',''),database=`manekineko_idx_test_${suffix}`,role=`manekineko_idx_role_${suffix}`;
  const admin=new pg.Client({connectionString});let target:pg.Client|undefined;let databaseCreated=false,roleCreated=false;
  await admin.connect();
  try{
    await admin.query(`CREATE DATABASE "${database}"`);databaseCreated=true;
    local.pathname=`/${database}`;target=new pg.Client({connectionString:local.href});await target.connect();
    const migrations=new URL('../../../database/migrations/',import.meta.url);
    for(const name of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort())await target.query(await readFile(new URL(name,migrations),'utf8'));
    await target.query('CREATE TABLE manekineko_staging_environment(singleton boolean)');
    await target.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC');
    await target.query('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC');
    await target.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await admin.query(`CREATE ROLE "${role}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);roleCreated=true;
    await grantIndexerPrivileges(target,database,role);
    const id=randomUUID(),series=randomUUID(),address=`0x${'1'.repeat(40)}`,hash=`0x${'1'.repeat(64)}`;
    await target.query("INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url) VALUES(11155111,'Sepolia','ETH',18,'https://sepolia.etherscan.io')");
    await target.query('INSERT INTO manekineko_series(id,name) VALUES($1,\'Role test\')',[series]);
    await target.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,max_supply,mint_price_wei,mint_duration_seconds,
      reveal_delay_blocks,algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps)
      VALUES($1,$2,11155111,1,'role-test','Role test','ROLE',20,10000,86400,NULL,'unique-rank-v2','chainlink-vrf-v2.5','affiliate-v5',5000,1000)`,[id,series]);
    await target.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,factory_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
      VALUES($1,11155111,'deployed',$2,$2,$2,$3,10,now()+interval '1 day',now())`,[id,address,hash]);
    await target.query(`SET ROLE "${role}"`);
    await verifyIndexerPrivileges(target,database,role);
    await target.query(`INSERT INTO manekineko_collection_state(collection_id,phase,total_minted,total_mint_revenue_wei,randomness_state,block_number,block_hash)
      VALUES($1,'minting',3,30000,'not_requested',20,$2)`,[id,hash]);
    assert.equal((await target.query('SELECT total_minted FROM manekineko_collection_state')).rows[0].total_minted,3);
    await assert.rejects(target.query('SELECT * FROM manekineko_launch_users'),{code:'42501'});
    await assert.rejects(target.query('UPDATE manekineko_collections SET mint_price_wei=20000'),{code:'42501'});
    await assert.rejects(target.query('UPDATE manekineko_deployments SET contract_address=$1',[address]),{code:'42501'});
    await target.query('RESET ROLE');
  }finally{
    await target?.end().catch(()=>{});
    if(databaseCreated)await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    if(roleCreated)await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  }
});
