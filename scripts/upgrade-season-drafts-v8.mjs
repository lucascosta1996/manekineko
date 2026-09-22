import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { updateLaunchAutomation } from '../apps/launch/lib/launch-automation-store.ts';
import { parseAutomationDraft } from '../apps/launch/lib/launch-automation-validation.ts';

// Only the user's imported, editable local seasons. No deployment or scheduling.
const target = new URL(process.env.DATABASE_URL);
assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.port, '54329'); assert.equal(target.pathname, '/manekineko');
const seasons = JSON.parse(await readFile(new URL('../seasons.json', import.meta.url), 'utf8'));
const imported = JSON.parse(await readFile(new URL('../.vercel/season-import-result.json', import.meta.url), 'utf8'));
assert.equal(seasons.length, imported.records.length);
const apply = process.argv.includes('--apply'), db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const snapshots = [], updates = [];
let collections = 0;
try {
  await db.connect(); await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('manekineko:season-drafts:v8',0))");
  const actor = (await db.query("SELECT id FROM manekineko_launch_users WHERE username='operator' AND disabled_at IS NULL FOR SHARE")).rows;
  assert.equal(actor.length, 1);
  for (const [index, source] of seasons.entries()) {
    const record = imported.records[index]; assert.equal(source.theme, record.name);
    const saved = (await db.query('SELECT id,plan,status,revision FROM manekineko_launch_automations WHERE id=$1 FOR UPDATE', [record.id])).rows[0];
    assert(saved && saved.status === 'draft', 'Only imported editable drafts may be converted.');
    assert.equal(saved.plan.name, source.theme); assert.equal(saved.plan.steps.length, source.collections.length);
    assert.deepEqual(saved.plan.steps.map(step => step.payload.contract.collectionColor), source.collections);
    // Already converted drafts may have been tuned by the operator; never reset them.
    if (saved.plan.steps.every(step => step.payload.contract.algorithmVersion === 'unique-rank-v5')) continue;
    assert(saved.plan.steps.every(step => step.payload.contract.algorithmVersion === 'unique-rank-v4'), 'Mixed/unknown versions require explicit review.');
    const plan = structuredClone(saved.plan);
    for (const step of plan.steps) {
      const c = step.payload.contract;
      assert.equal(c.maxSupply, '1000'); assert.equal(c.mintPriceWei, '10000000000000000'); assert.equal(c.prizeBps, '6000');
      c.algorithmVersion = 'unique-rank-v5'; c.winnerCount = '6'; delete c.secondPrizeBps;
      Object.assign(step.payload.operations, { factoryMode: 'new', factoryAddress: '', affiliateEligibilityAddress: '', winnerCreditsAddress: '', winnerCreditSponsorshipWei: '' });
      collections++;
    }
    parseAutomationDraft(plan);
    // Timing, identity, colors, referrals and operator economics must be identical.
    const preserved = structuredClone(plan);
    preserved.steps.forEach((step, i) => {
      step.payload.contract.algorithmVersion = saved.plan.steps[i].payload.contract.algorithmVersion;
      delete step.payload.contract.winnerCount;
      step.payload.contract.secondPrizeBps = saved.plan.steps[i].payload.contract.secondPrizeBps;
      step.payload.operations = saved.plan.steps[i].payload.operations;
    });
    assert.deepEqual(preserved, saved.plan);
    snapshots.push(saved); updates.push({ saved, plan });
  }
  if (apply && updates.length) {
    const dir = new URL('../.vercel/season-v8/', import.meta.url); await mkdir(dir, { recursive: true });
    const content = JSON.stringify(snapshots, null, 2) + '\n';
    const hash = createHash('sha256').update(content).digest('hex');
    await writeFile(new URL(`before-${hash}.json`, dir), content, { mode: 0o600, flag: 'wx' });
    for (const { saved, plan } of updates) await updateLaunchAutomation(db, { userId: actor[0].id }, saved.id, { plan, revision: saved.revision });
  }
  await db.query(apply ? 'COMMIT' : 'ROLLBACK');
  console.log(JSON.stringify({ mode: apply ? 'applied to local drafts' : 'dry run', changedSeasons: updates.length, changedCollections: collections, winners: 6, prizeEachEth: '1', prizeTotalEth: '6', timingAndAffiliateTermsPreserved: true, blockchainTransactions: 0 }, null, 2));
} catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
finally { await db.end(); }
