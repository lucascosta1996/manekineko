/** Read-only migration of saved identities. Never creates or overwrites a saved season. */
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadStagingDatabaseConfig, inspectStagingDatabase, stagingDatabaseErrorMessage } from '../staging-database.mjs';
import { loadNamedSeasonCatalog } from '../season-catalog.mjs';

const config = await loadStagingDatabaseConfig();
const db = new pg.Client({ connectionString: config.admin.connectionString, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
try {
  await db.connect();
  await db.query('BEGIN READ ONLY');
  assert((await inspectStagingDatabase(db, config)).initialized, 'The expected staging catalog is unavailable.');
  const rows = (await db.query('SELECT id, plan, mock_source_id FROM manekineko_launch_automations')).rows;
  const canonical = await loadNamedSeasonCatalog();
  const catalogs = { mainnet: [], sepolia: [] };
  const names = new Set(canonical.flatMap(s => [s.theme, ...s.namedCollections.map(c => c.name)]).map(s => s.toLowerCase()));
  for (const season of canonical) {
    const id = `0x${createHash('sha256').update(`manekineko:seasons.json:chain:1:season:${season.season}`).digest('hex')}`;
    const matches = rows.filter(r => r.plan.chainId === '1' && r.plan.seasonId === id);
    assert.equal(matches.length, 1, 'Each canonical season must have one saved source.');
    const source = matches[0];
    const copies = rows.filter(r => r.mock_source_id === source.id && r.plan.chainId === '11155111');
    assert.equal(copies.length, 1, 'Each source must have one existing Sepolia copy.');
    for (const [network, row] of [['mainnet', source], ['sepolia', copies[0]]]) {
      const p = row.plan;
      assert.equal(p.steps.length, season.namedCollections.length);
      assert.deepEqual(p.steps.map(s => s.payload.contract.collectionColor), season.collections);
      if (network === 'mainnet') {
        assert.equal(p.name, season.theme);
        assert.deepEqual(p.steps.map(s => s.payload.contract.name), season.namedCollections.map(c => c.name));
      } else {
        assert.notEqual(p.seasonId, source.plan.seasonId);
        for (const name of [p.name, ...p.steps.map(s => s.payload.contract.name)]) assert(!names.has(name.toLowerCase()));
      }
      catalogs[network].push({ seasonId: p.seasonId, name: p.name, collections: p.steps.map(s => ({
        id: s.id, name: s.payload.contract.name, symbol: s.payload.contract.symbol,
        color: s.payload.contract.collectionColor, textColor: s.payload.contract.textColor,
      })) });
    }
  }
  await db.query('ROLLBACK');
  for (const [network, seasons] of Object.entries(catalogs)) {
    const content = JSON.stringify({ chainId: network === 'mainnet' ? 1 : 11155111, seasons }, null, 2) + '\n';
    const file = new URL(`../../apps/launch/catalog/${network}.json`, import.meta.url);
    try { assert.equal(await readFile(file, 'utf8'), content, 'Existing exported identities differ; review before replacement.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; await writeFile(file, content, { flag: 'wx' }); }
  }
  console.log('Preserved 22 seasons / 216 collections per network; names, IDs, order and colors verified. Database writes: 0.');
} catch (e) {
  console.error({ kind: e.name, code: typeof e.code === 'string' && /^[A-Z0-9_]+$/.test(e.code) ? e.code : undefined });
  console.error(e instanceof assert.AssertionError ? e.message : e.code === '53000'
    ? 'The saved-catalog database rejected the read because a provider resource limit was reached. Restore provider capacity before retrying; existing identities were not replaced.'
    : stagingDatabaseErrorMessage(e)); process.exitCode = 1;
} finally { await db.end(); }
