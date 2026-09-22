import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {loadStagingDatabaseConfig,inspectStagingDatabase,migrateStagingDatabase,stagingDatabaseErrorMessage} from './staging-database.mjs';
import {catalogSeasonOrder} from '../apps/launch/lib/season-catalog-order.ts';
import {organizeSeasonDraft} from './season-network-plans.mjs';
import {updateLaunchAutomation} from '../apps/launch/lib/launch-automation-store.ts';
import {updateLaunchConfiguration} from '../apps/launch/lib/launch-config-store.ts';

const apply=process.argv.includes('--apply');
const config=await loadStagingDatabaseConfig();
const db=new pg.Client({connectionString:config.admin.connectionString,connectionTimeoutMillis:10000,statement_timeout:30000});
try {
 await db.connect();await inspectStagingDatabase(db,config);
 if(apply) await migrateStagingDatabase(db,()=>{});
 await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtextextended('tincta:season-network-planning',0))");
 const records=(await db.query('SELECT * FROM manekineko_launch_automations ORDER BY created_at FOR UPDATE')).rows;
 const configs=(await db.query('SELECT * FROM manekineko_launch_configurations ORDER BY created_at FOR UPDATE')).rows;
 const catalogs=records.filter(r=>catalogSeasonOrder(r.plan.seasonId)!==null);
 const source=JSON.parse(await readFile(new URL('../seasons.json',import.meta.url),'utf8'));
 assert.equal(catalogs.length,source.length);assert.equal(source.length,22);
 for(const r of catalogs){const season=source[catalogSeasonOrder(r.plan.seasonId)-1];assert.equal(r.status,'draft');assert.deepEqual(r.plan.steps.map(s=>s.payload.contract.collectionColor),season.collections);}
 const users=(await db.query('SELECT id FROM manekineko_launch_users WHERE disabled_at IS NULL ORDER BY created_at LIMIT 1 FOR SHARE')).rows;assert.equal(users.length,1);
 const actor={userId:users[0].id};
 const changed=records.filter(r=>r.status==='draft').map(r=>({saved:r,plan:organizeSeasonDraft(r)})).filter(({saved,plan})=>!isDeepStrictEqual(saved.plan,plan));
 const changedConfigs=configs.filter(r=>r.status==='draft'&&['unique-rank-v4','unique-rank-v5'].includes(r.payload.contract.algorithmVersion)&&r.payload.contract.minAffiliateReferrals!=='1');
 if(apply && (changed.length||changedConfigs.length)) {
  const dir=new URL('../.vercel/season-networks/',import.meta.url);await mkdir(dir,{recursive:true});
  const backup=JSON.stringify({records,configs},null,2);const hash=createHash('sha256').update(backup).digest('hex');
  await writeFile(new URL(`before-${hash}.json`,dir),backup,{mode:0o600,flag:'wx'});
  for(const {saved,plan} of changed) await updateLaunchAutomation(db,actor,saved.id,{plan,revision:saved.revision});
  for(const r of changedConfigs){const payload=structuredClone(r.payload);payload.contract.minAffiliateReferrals='1';await updateLaunchConfiguration(db,actor,r.id,{label:r.label,payload,revision:r.revision});}
 }
 if(apply){
  const saved=(await db.query('SELECT id,plan,status FROM manekineko_launch_automations')).rows;
  for(const r of saved.filter(r=>catalogSeasonOrder(r.plan.seasonId)!==null)){assert.equal(r.plan.chainId,'1');assert(r.plan.steps.every(s=>s.payload.contract.chainId==='1'&&s.payload.contract.minAffiliateReferrals==='1'&&s.payload.contract.maxMintsPerWallet==='20'));}
  for(const r of configs.filter(r=>r.status==='finalized')){const after=(await db.query('SELECT * FROM manekineko_launch_configurations WHERE id=$1',[r.id])).rows[0];assert.deepEqual(after,r);}
 }
 await db.query(apply?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({mode:apply?'applied':'dry run',mainnetSeasons:catalogs.length,mainnetCollections:catalogs.reduce((n,r)=>n+r.plan.steps.length,0),changedSeasons:changed.length,changedStandaloneDrafts:changedConfigs.length,finalizedSnapshotsPreserved:configs.filter(r=>r.status==='finalized').length,blockchainTransactions:0}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error({message:e instanceof assert.AssertionError?e.message:stagingDatabaseErrorMessage(e),code:e.code});process.exitCode=1;}finally{await db.end();}
