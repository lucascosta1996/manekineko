import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { grantIndexerPrivileges } from '../../../scripts/setup-indexer-staging.mjs';
import { PostgresMetadataStore } from '../lib/metadata-store.ts';
import type { IndexerConfig } from '../lib/types.ts';

test('V10 metadata discovery and claiming skip the historical queue before any database access', async () => {
  const store=new PostgresMetadataStore({query:async()=>{throw new Error('Permanent metadata must not enter the refresh queue');}} as unknown as pg.Pool);
  const config={chainId:11155111,contractVersion:'affiliate-v10'} as IndexerConfig;
  await store.discover(config);assert.equal(await store.claim(config),null);
});

test('durable metadata discovery, concurrent leases, shared quota, crash recovery and reorg generations under restricted grants', {
  skip: process.env.TEST_INDEXER_DATABASE !== '1' ? 'Set TEST_INDEXER_DATABASE=1 and a local DATABASE_URL.' : false,
}, async () => {
  const connectionString = process.env.DATABASE_URL!;
  const url = new URL(connectionString);
  assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
  const suffix = randomUUID().replaceAll('-',''), database = `tincta_metadata_${suffix}`, role = `tincta_metadata_role_${suffix}`;
  const admin = new pg.Client({ connectionString });
  let pool: pg.Pool | undefined, worker: pg.Pool | undefined, created = false, roleCreated = false;
  try {
    await admin.connect(); await admin.query(`CREATE DATABASE "${database}"`); created = true;
    url.pathname = `/${database}`; pool = new pg.Pool({ connectionString: url.href });
    pool.on('error', () => {}); // Cleanup of this disposable database can close idle clients.
    const folder = new URL('../../../database/migrations/',import.meta.url);
    for (const name of (await readdir(folder)).filter(name => name.endsWith('.sql')).sort()) await pool.query(await readFile(new URL(name,folder),'utf8'));
    await admin.query(`CREATE ROLE "${role}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`); roleCreated = true;
    const db = await pool.connect();
    try { await grantIndexerPrivileges(db,database,role); } finally { db.release(); }
    worker = new pg.Pool({ connectionString: url.href,options: `-c role=${role}`,max: 8 });
    worker.on('error', () => {});
    const id = randomUUID(), series = randomUUID(), address = `0x${'1'.repeat(40)}`, hash = `0x${'1'.repeat(64)}`;
    await pool.query("INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url) VALUES(11155111,'Sepolia','ETH',18,'https://sepolia.etherscan.io')");
    await pool.query("INSERT INTO manekineko_series(id,name) VALUES($1,'Metadata test')",[series]);
    await pool.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,max_supply,mint_price_wei,mint_duration_seconds,
      reveal_delay_blocks,algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps)
      VALUES($1,$2,11155111,1,'metadata-test','Metadata test','META',20,10000,86400,NULL,'unique-rank-v2','chainlink-vrf-v2.5','affiliate-v5',5000,1000)`,[id,series]);
    await pool.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,factory_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
      VALUES($1,11155111,'deployed',$2,$2,$2,$3,10,now()+interval '1 day',now())`,[id,address,hash]);
    await pool.query(`INSERT INTO manekineko_affiliate_programs(collection_id,mode,contract_version,max_slots,commission_bps,affiliate_rates_bps,enrollment_signer)
      VALUES($1,'live','affiliate-v5',10,NULL,'{}',$2)`,[id,address]);
    await pool.query(`INSERT INTO manekineko_collection_state(collection_id,phase,total_minted,total_mint_revenue_wei,randomness_state,randomness_request_id,randomness_word,block_number,block_hash)
      VALUES($1,'awaiting_finalization',20,200000,'fulfilled',1,0,20,$2)`,[id,hash]);
    await pool.query(`INSERT INTO manekineko_indexer_checkpoints(collection_id,block_number,block_hash,trust_fingerprint) VALUES($1,20,$2,$3)`,[id,hash,'a'.repeat(64)]);
    const config = { chainId: 11155111,factory: address,contractVersion: 'affiliate-v5' } as IndexerConfig;
    const store = new PostgresMetadataStore(worker);
    const rows = async () => (await pool!.query('SELECT * FROM manekineko_nft_metadata_jobs ORDER BY token_id')).rows;
    await store.discover(config); assert.equal((await rows()).length,0,'VRF fulfillment alone does not enqueue sealed NFTs');
    await pool.query("UPDATE manekineko_collection_state SET phase='awaiting_prize',winning_token_id=1,highest_score=20,settled_count=20");
    const discoveries = await Promise.allSettled([store.discover(config),store.discover(config)]);
    for (const result of discoveries) if (result.status === 'rejected') throw result.reason;
    assert.equal((await rows()).length,20);
    assert.equal(await store.claim({ ...config,factory: `0x${'2'.repeat(40)}` }),null);
    assert.equal(await store.claim({ ...config,contractVersion: 'affiliate-v9' }),null);
    const claimResults = await Promise.allSettled(Array.from({ length: 8 },() => store.claim(config)));
    const claims = claimResults.map(result => { if (result.status === 'rejected') throw result.reason; return result.value; });
    assert(claims.every(Boolean)); assert.equal(new Set(claims.map(job => job!.tokenId)).size,8);
    const reservationResults = await Promise.allSettled(claims.map(job => store.reserveRefresh(job!,'b'.repeat(64))));
    const reservations = reservationResults.map(result => { if (result.status === 'rejected') throw result.reason; return result.value; });
    assert.equal(reservations.filter(result => result === 'reserved').length,1);
    const reserved = claims[reservations.indexOf('reserved')]!;
    const saved = (await rows()).find(row => row.token_id === reserved.tokenId);
    assert.equal(saved.refresh_attempts,1); assert(saved.last_refresh_at); assert.equal(saved.status,'verifying');
    assert.equal(await store.available(),true,'normal PATCH pacing still permits verification GETs');
    await pool.query("UPDATE manekineko_nft_metadata_jobs SET lease_expires_at=now()-interval '1 second',next_attempt_at=now()-interval '1 second' WHERE token_id=$1",[reserved.tokenId]);
    await assert.rejects(store.finish(reserved,{ status: 'verified',delaySeconds: 0 }),/metadata_lease_expired/);
    const resumed = await new PostgresMetadataStore(worker).claim(config);
    assert.equal(resumed?.tokenId,reserved.tokenId); assert.equal(resumed?.refreshAttempts,1); assert(resumed?.lastRefreshAt);
    await store.finish(resumed!,{ status: 'verified',delaySeconds: 0,hash: 'b'.repeat(64) });
    await store.discover(config); assert.equal((await rows()).filter(row => row.status === 'verified').length,1);
    await store.stopProvider('explorer_rate_limited',7200,false); assert.equal(await store.available(),false);
    await pool.query("UPDATE manekineko_nft_metadata_providers SET retry_after=now()-interval '1 second'");
    await store.stopProvider('explorer_authorization_required',0,true); assert.equal(await store.available(),false);

    await pool.query("UPDATE manekineko_collection_state SET phase='awaiting_finalization',winning_token_id=NULL,highest_score=NULL,settled_count=0");
    assert.equal(await store.claim(config),null,'an orphan reveal cannot submit explorer refreshes');
    await pool.query("UPDATE manekineko_collection_state SET phase='awaiting_prize',randomness_word=1,winning_token_id=1,highest_score=20,settled_count=20");
    await store.discover(config);
    assert((await rows()).every(row => row.generation.endsWith(':1') && row.status === 'pending' && row.refresh_attempts === 0));
    await assert.rejects(store.finish(claims[1]!,{ status: 'verified',delaySeconds: 0 }),/metadata_lease_expired/);
    await assert.rejects(worker.query('UPDATE manekineko_collections SET mint_price_wei=20000'),{ code: '42501' });
  } finally {
    await worker?.end(); await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  }
});
