import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { updateLaunchAutomation } from '../apps/launch/lib/launch-automation-store.ts';
import { parseAutomationDraft } from '../apps/launch/lib/launch-automation-validation.ts';
import { defaultSeasonTiming, defaultSeasonSocial } from '../apps/launch/lib/season-timeline.ts';

// Explicitly scoped to the previously imported local drafts; never changes live contracts or prepared plans.
const target = new URL(process.env.DATABASE_URL);
assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.port, '54329'); assert.equal(target.pathname, '/manekineko');
const seasons = JSON.parse(await readFile(new URL('../seasons.json', import.meta.url), 'utf8'));
const imported = JSON.parse(await readFile(new URL('../.vercel/season-import-result.json', import.meta.url), 'utf8'));
assert.equal(seasons.length, imported.records.length);
const apply = process.argv.includes('--apply'), db = new pg.Client({ connectionString: process.env.DATABASE_URL });
let changes = 0, growth = 0, standard = 0;
const snapshots = [];
try {
  await db.connect(); await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('manekineko:season-drafts:v7',0))");
  const actor = (await db.query("SELECT id FROM manekineko_launch_users WHERE username='operator' AND disabled_at IS NULL FOR SHARE")).rows;
  assert.equal(actor.length, 1);
  for (let index=0; index<seasons.length; index++) {
    const source = seasons[index], record = imported.records[index]; assert.equal(source.theme, record.name);
    const saved = (await db.query('SELECT id,plan,status,revision FROM manekineko_launch_automations WHERE id=$1 FOR UPDATE', [record.id])).rows[0];
    assert(saved && saved.status==='draft', 'Only the imported editable season drafts may be converted.');
    assert.equal(saved.plan.name, source.theme); assert.equal(saved.plan.steps.length, source.collections.length);
    snapshots.push(saved);
    const plan = structuredClone(saved.plan);
    // Treat a previously upgraded season as user-owned; do not reset subsequent tuning.
    if (plan.steps.every(s=>s.payload.contract.algorithmVersion==='unique-rank-v4')) continue;
    assert(plan.steps.every(s=>s.payload.contract.algorithmVersion==='unique-rank-v3'), 'Mixed/unknown version requires manual review.');
    plan.timing=defaultSeasonTiming(); plan.social=defaultSeasonSocial(); plan.intervalSeconds='0'; plan.startAt=null;
    plan.steps.forEach((step, position) => {
      assert.equal(step.payload.contract.collectionColor, source.collections[position]);
      const isGrowth = index<4 || position<2; isGrowth ? growth++ : standard++;
      Object.assign(step.payload.contract, { algorithmVersion:'unique-rank-v4',maxSupply:'1000',mintPriceWei:'10000000000000000',prizeBps:'6000',secondPrizeBps:'2000',affiliatePoolBps:isGrowth?'2000':'1000',minAffiliateReferrals:'100',affiliatePayoutCapBps:'3000',saleStartAt:'0',maxAffiliateSlots:'10',affiliateRatesBps:[] });
      Object.assign(step.payload.operations, { factoryMode:'new',factoryAddress:'',affiliateEligibilityAddress:'',winnerCreditsAddress:'',winnerCreditSponsorshipWei:'',enrollmentWindowSeconds:'900' });
    });
    parseAutomationDraft(plan);
    changes++;
    if (apply) await updateLaunchAutomation(db, {userId:actor[0].id}, saved.id, {plan,revision:saved.revision});
  }
  if (apply && changes) {
    await mkdir(new URL('../.vercel/season-v7/',import.meta.url),{recursive:true});
    const content=JSON.stringify(snapshots,null,2)+'\n';
    const hash=createHash('sha256').update(content).digest('hex');
    await writeFile(new URL(`../.vercel/season-v7/before-${hash}.json`,import.meta.url),content,{mode:0o600});
  }
  await db.query(apply?'COMMIT':'ROLLBACK');
  console.log(JSON.stringify({mode:apply?'applied to local drafts':'dry run',changedSeasons:changes,growthCollections:growth,standardCollections:standard,firstLaunch:'not scheduled',socialPublishing:false,blockchainTransactions:0},null,2));
} catch(error) { await db.query('ROLLBACK').catch(()=>{}); throw error; }
finally { await db.end(); }
