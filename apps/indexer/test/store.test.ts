import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresIndexerStore } from '../lib/store.ts';
import { snapshotFromValues } from '../lib/chain.ts';
import { IndexerError, type RegisteredCollection, type CommitBatch } from '../lib/types.ts';

test('PostgreSQL leases and canonicality failures cannot leave partial cursors, events, or snapshots', {
  skip: process.env.TEST_INDEXER_DATABASE !== '1' ? 'Set TEST_INDEXER_DATABASE=1 and a local DATABASE_URL.' : false,
}, async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname));
  const schema = `manekineko_store_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString }); let pool: pg.Pool | undefined;
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString, max: 8, options: `-c search_path=${schema},public` });
    const migrations = new URL('../../../database/migrations/', import.meta.url);
    const client = await pool.connect();
    try {
      for (const name of (await readdir(migrations)).filter(name => /^0(0[1-9]|1[0-9])_/.test(name)).sort()) {
        await client.query(await readFile(new URL(name, migrations), 'utf8'));
      }
    } finally { client.release(); }
    const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
    const c: RegisteredCollection = {contractVersion:"affiliate-v5",algorithmVersion:"unique-rank-v2",id:randomUUID(),seriesId:randomUUID(),chainId:11155111,roundId:'1',name:'Store test',symbol:'STORE',maxSupply:20,
      mintPrice:'10000',prizeBps:5000,affiliatePoolBps:1000,address:`0x${'1'.repeat(40)}`,factory:`0x${'2'.repeat(40)}`,deploymentTransaction:hash(1),
      deploymentBlock:10,deployedAt:'2026-01-01T00:00:00.000Z',mintDeadline:1767312000,maxAffiliateSlots:20,enrollmentSigner:`0x${'3'.repeat(40)}`};
    await pool.query("INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url) VALUES(11155111,'Sepolia','ETH',18,'https://sepolia.etherscan.io')");
    await pool.query('INSERT INTO manekineko_series(id,name) VALUES($1,$2)',[c.seriesId,c.name]);
    await pool.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,max_supply,mint_price_wei,mint_duration_seconds,
      reveal_delay_blocks,algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps)
      VALUES($1,$2,11155111,1,'store-test',$3,$4,20,10000,86400,NULL,'unique-rank-v2','chainlink-vrf-v2.5','affiliate-v5',5000,1000)`,[c.id,c.seriesId,c.name,c.symbol]);
    await pool.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,factory_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
      VALUES($1,11155111,'deployed',$2,$3,$4,$5,10,to_timestamp($6),$7)`,[c.id,c.address,c.factory,c.enrollmentSigner,c.deploymentTransaction,c.mintDeadline,c.deployedAt]);
    const store = new PostgresIndexerStore(pool), owners = Array.from({length:8},()=>randomUUID());
    const claims = await Promise.all(owners.map(owner=>store.acquire(c,owner,300)));
    assert.equal(claims.filter(Boolean).length,1);
    const winner = claims.findIndex(Boolean), owner = owners[winner], previous = claims[winner]!;
    const values = {phase:1n,totalMinted:3n,totalMintRevenue:30000n,refundedCount:0n,totalRefunded:0n,randomnessRequested:false,randomnessReceived:false,
      requestId:0n,randomWord:0n,revealed:false,winningTokenId:0n,highestScore:0n,prizePaid:false,prizeRecipient:c.address,prizePaidAmount:0n};
    const batch: CommitBatch = {collection:c,owner,previous,block:{number:20,hash:hash(20),timestamp:1767225660},reset:false,fingerprint:'a'.repeat(64),
      snapshot:snapshotFromValues(values,c),events:[{blockNumber:19,blockHash:hash(19),transactionHash:hash(101),transactionIndex:0,logIndex:0,name:'Minted',
        args:{quantity:'3'},topics:[],data:'0x',timestamp:1767225650}],beforeCommit:async()=>{throw new IndexerError('canonical_block_changed');}};
    await assert.rejects(store.commit(batch),/canonical_block_changed/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM manekineko_chain_events')).rows[0].count,0);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM manekineko_collection_state')).rows[0].count,0);
    assert.equal((await pool.query('SELECT block_number FROM manekineko_indexer_checkpoints')).rows[0].block_number,null);
    await store.commit({...batch,beforeCommit:async()=>{}});
    assert.equal((await pool.query('SELECT total_minted FROM manekineko_collection_state')).rows[0].total_minted,3);
    assert.equal((await pool.query('SELECT block_number FROM manekineko_indexer_checkpoints')).rows[0].block_number,'20');
    await assert.rejects(store.commit({...batch,beforeCommit:async()=>{}}),/lease_expired/,'A stale cursor cannot replay a different batch.');
    await pool.query("UPDATE manekineko_indexer_checkpoints SET lease_expires_at=clock_timestamp()-interval '1 second'");
    const replacementOwner=randomUUID(), replacement=await store.acquire(c,replacementOwner,300);
    assert.ok(replacement);
    await assert.rejects(store.commit({...batch,previous:replacement,block:{...batch.block,number:21},beforeCommit:async()=>{}}),/lease_expired/,'An expired worker cannot write after another worker acquires the lease.');
    await store.release(c.id,owner);
    assert.equal((await pool.query('SELECT lease_owner FROM manekineko_indexer_checkpoints')).rows[0].lease_owner,replacementOwner);
  } finally {
    await pool?.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  }
});
