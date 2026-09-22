import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

// Opt-in example (never load an application's remote staging environment):
// TEST_AFFILIATE_ELIGIBILITY_DATABASE=1 node --env-file=.vercel/test-v6/local-db.env \
//   --test scripts/affiliate-eligibility-database.test.mjs
const enabled = process.env.TEST_AFFILIATE_ELIGIBILITY_DATABASE === '1';
const zero = `0x${'0'.repeat(40)}`;
const source = `0x${'ab'.repeat(20)}`;
const otherSource = `0x${'cd'.repeat(20)}`;
const wallet = `0x${'11'.repeat(20)}`;
const signer = `0x${'22'.repeat(20)}`;
const uint256Max = (2n ** 256n - 1n).toString();
const migrationDirectory = new URL('../database/migrations/', import.meta.url);

function localConnection() {
  let url;
  try { url = new URL(process.env.DATABASE_URL); }
  catch { throw new Error('Set DATABASE_URL explicitly to a local PostgreSQL database.'); }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'A PostgreSQL URL is required.');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Eligibility database regressions refuse remote databases.');
  // pg accepts connection overrides in query parameters. Do not allow an apparently
  // local URL to redirect the test, or inject a different search_path.
  assert.equal(url.search, '', 'Local database test URLs must not contain connection overrides.');
  assert.equal(url.hash, '', 'Local database test URLs must not contain fragments.');
  assert.ok(url.pathname.length > 1 && url.username, 'Explicit database and database user are required.');
  return {
    host: url.hostname === '[::1]' ? '::1' : url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: false,
    connectionTimeoutMillis: 5000,
    application_name: 'manekineko-eligibility-migration-regression',
  };
}

test('migration 017 preserves historical challenges and enforces immutable V6 eligibility evidence', {
  skip: !enabled && 'Set TEST_AFFILIATE_ELIGIBILITY_DATABASE=1 with an explicit local DATABASE_URL.',
  timeout: 30_000,
}, async (t) => {
  const client = new pg.Client(localConnection());
  const schema = `manekineko_eligibility_test_${randomUUID().replaceAll('-', '')}`;
  let connected = false;
  let created = false;
  const versions = new Map();
  const insert = async (version, proof, beforeMigration = false) => {
    const fixture = versions.get(version);
    const id = randomUUID();
    const columns = beforeMigration ? '' : ',eligibility_source_address,eligibility_token_id';
    const parameters = beforeMigration ? '' : ',$9,$10';
    const values = [id, fixture.id, wallet, fixture.address, `0x${randomBytes(32).toString('hex')}`, 'a'.repeat(64), version, 1000];
    if (!beforeMigration) values.push(proof?.source ?? null, proof?.token ?? null);
    await client.query(`INSERT INTO manekineko_affiliate_challenges
      (id,collection_id,wallet,chain_id,contract_address,origin,nonce,ip_digest,expires_at,contract_version,affiliate_id,commission_bps${columns})
      VALUES($1,$2,$3,11155111,$4,'https://eligibility.example.com',$5,$6,now()+interval '5 minutes',$7,1,$8${parameters})`, values);
    return id;
  };
  const proofFor = async (id) => (await client.query(`SELECT eligibility_source_address AS source,
    eligibility_token_id::text AS token FROM manekineko_affiliate_challenges WHERE id=$1`, [id])).rows[0];

  try {
    await client.connect();
    connected = true;
    await client.query(`CREATE SCHEMA ${schema}`);
    created = true;
    // No public fallback: every table/function touched by these unqualified
    // migrations must belong to this newly created disposable schema.
    await client.query(`SET search_path TO ${schema}`);
    assert.equal((await client.query('SELECT current_schema() AS schema')).rows[0].schema, schema);
    const migrations = (await readdir(migrationDirectory)).filter(name => /^\d{3}_.+\.sql$/.test(name)).sort();
    const target = '017_affiliate_holder_eligibility.sql';
    assert.ok(migrations.includes(target), 'The exact eligibility migration must exist.');
    for (const name of migrations.filter(name => name < target)) {
      await client.query(await readFile(new URL(name, migrationDirectory), 'utf8'));
    }
    const seriesId = randomUUID();
    await client.query(`INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url)
      VALUES(11155111,'Ethereum Sepolia','ETH',18,'https://sepolia.etherscan.io')`);
    await client.query("INSERT INTO manekineko_series(id,name) VALUES($1,'Eligibility regression')", [seriesId]);
    for (const [index, version] of ['affiliate-v5', 'affiliate-v6'].entries()) {
      const fixture = { id: randomUUID(), address: `0x${String(index + 3).repeat(40)}` };
      versions.set(version, fixture);
      await client.query(`INSERT INTO manekineko_collections
        (id,series_id,chain_id,round_id,slug,name,symbol,max_supply,mint_price_wei,mint_duration_seconds,reveal_delay_blocks,
         algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps)
        VALUES($1,$2,11155111,$3,$4,'Eligibility fixture','TEST',20,10000,86400,NULL,$5,'chainlink-vrf-v2.5',$6,5000,1000)`,
      [fixture.id, seriesId, index + 1, `eligibility-${version}`, version === 'affiliate-v6' ? 'unique-rank-v3' : 'unique-rank-v2', version]);
      await client.query(`INSERT INTO manekineko_deployments
        (collection_id,chain_id,status,contract_address,factory_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
        VALUES($1,11155111,'deployed',$2,$2,$3,$4,1,now()+interval '1 day',now())`,
      [fixture.id, fixture.address, wallet, `0x${randomBytes(32).toString('hex')}`]);
      await client.query(`INSERT INTO manekineko_affiliate_programs
        (collection_id,mode,max_slots,enrollment_enabled,enrollment_signer,contract_version,affiliate_rates_bps)
        VALUES($1,'live',10,true,$2,$3,ARRAY[]::integer[])`, [fixture.id, signer, version]);
    }
    const historical = [await insert('affiliate-v5', null, true), await insert('affiliate-v6', null, true)];
    const unconsumedHistorical = await insert('affiliate-v6', null, true);
    await client.query(await readFile(new URL(target, migrationDirectory), 'utf8'));

    await t.test('all preceding migrations accept migration 017 with historical null-proof rows intact', async () => {
      for (const id of historical) {
        assert.deepEqual(await proofFor(id), { source: null, token: null });
        await client.query('UPDATE manekineko_affiliate_challenges SET consumed_at=now() WHERE id=$1', [id]);
        assert.deepEqual(await proofFor(id), { source: null, token: null });
      }
      assert.deepEqual(await proofFor(unconsumedHistorical), { source: null, token: null });
      const columns = await client.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema=$1 AND table_name='manekineko_affiliate_challenges'
        AND column_name IN ('eligibility_source_address','eligibility_token_id')`, [schema]);
      assert.equal(columns.rowCount, 2);
    });

    await t.test('new V6 challenges reject absent or half-specified evidence', async () => {
      for (const proof of [null, { source }, { token: '1' }, { source: zero }]) {
        await assert.rejects(() => insert('affiliate-v6', proof), /New V6 challenges require their signed holder eligibility proof/);
      }
    });

    await t.test('bootstrap accepts only the explicit zero-address and zero-token pair', async () => {
      const id = await insert('affiliate-v6', { source: zero, token: '0' });
      assert.deepEqual(await proofFor(id), { source: zero, token: '0' });
      for (const token of ['1', '-1', uint256Max]) {
        await assert.rejects(() => insert('affiliate-v6', { source: zero, token }), error => error.constraint === 'manekineko_affiliate_eligibility_proof_check');
      }
    });

    await t.test('ordinary proof pairs require canonical nonzero addresses and uint256 token IDs', async () => {
      for (const token of ['1', uint256Max]) {
        const id = await insert('affiliate-v6', { source, token });
        assert.deepEqual(await proofFor(id), { source, token });
      }
      for (const proof of [
        { source, token: '0' }, { source, token: '-1' },
        { source, token: (BigInt(uint256Max) + 1n).toString() }, { source, token: 'NaN' },
        { source: `0x${'AB'.repeat(20)}`, token: '1' }, { source: '0x1234', token: '1' },
      ]) await assert.rejects(() => insert('affiliate-v6', proof), error => error.constraint === 'manekineko_affiliate_eligibility_proof_check');
    });

    await t.test('V5 stays compatible with null proofs and cannot acquire V6-only proof fields', async () => {
      const id = await insert('affiliate-v5', null);
      assert.deepEqual(await proofFor(id), { source: null, token: null });
      for (const proof of [{ source, token: '1' }, { source: zero, token: '0' }, { source }, { token: '1' }]) {
        await assert.rejects(() => insert('affiliate-v5', proof), error => error.constraint === 'manekineko_affiliate_eligibility_proof_check');
      }
    });

    await t.test('issued proof fields cannot change, disappear or be substituted for bootstrap', async () => {
      const id = await insert('affiliate-v6', { source, token: '7' });
      for (const [address, token] of [[otherSource, '7'], [source, '8'], [zero, '0'], [null, null], [source, null]]) {
        await assert.rejects(() => client.query(`UPDATE manekineko_affiliate_challenges
          SET eligibility_source_address=$2,eligibility_token_id=$3 WHERE id=$1`, [id, address, token]), /Affiliate eligibility proof is immutable/);
        assert.deepEqual(await proofFor(id), { source, token: '7' });
      }
      await client.query(`UPDATE manekineko_affiliate_challenges SET consumed_at=now(),
        eligibility_source_address=$2,eligibility_token_id=$3 WHERE id=$1`, [id, source, '7']);
      assert.deepEqual(await proofFor(id), { source, token: '7' });
      await assert.rejects(() => client.query('UPDATE manekineko_affiliate_challenges SET consumed_at=now() WHERE id=$1', [id]), /immutable and single use/);
    });

    await t.test('historical V6 rows cannot be retroactively assigned newly signed evidence', async () => {
      // Use an unconsumed historical row so the old single-use guard cannot
      // hide a failure in the new eligibility-proof immutability trigger.
      const id = unconsumedHistorical;
      await assert.rejects(() => client.query(`UPDATE manekineko_affiliate_challenges
        SET eligibility_source_address=$2,eligibility_token_id=1 WHERE id=$1`, [id, source]), /Affiliate eligibility proof is immutable/);
      assert.deepEqual(await proofFor(id), { source: null, token: null });
    });
  } finally {
    try {
      if (connected) {
        await client.query('ROLLBACK');
        if (created) {
          await client.query(`DROP SCHEMA ${schema} CASCADE`);
          assert.equal((await client.query('SELECT count(*)::integer AS count FROM pg_namespace WHERE nspname=$1', [schema])).rows[0].count, 0);
        }
      }
    } finally { await client.end(); }
  }
});
