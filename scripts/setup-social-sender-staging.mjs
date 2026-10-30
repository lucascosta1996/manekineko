import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { loadStagingDatabaseConfig, inspectStagingDatabase, LAUNCH_ROLE, WEB_ROLE } from './staging-database.mjs';

const args=process.argv.slice(2);
let admin,runtime;
try {
  if (args.length!==1 || args[0]!=='--apply') throw new Error('Use --apply to install the reviewed migration.');
  const config=await loadStagingDatabaseConfig();
  admin=new pg.Client({connectionString:config.admin.connectionString,connectionTimeoutMillis:10_000,statement_timeout:15_000});
  await admin.connect();
  if (!(await inspectStagingDatabase(admin,config)).initialized) throw new Error('Staging not initialized.');
  const existing=await admin.query("SELECT to_regclass('public.manekineko_social_senders') AS name");
  if (!existing.rows[0].name) await admin.query(await readFile(new URL('../database/migrations/039_social_sender.sql',import.meta.url),'utf8'));
  await admin.query(`GRANT SELECT,INSERT,UPDATE ON public.manekineko_social_senders TO "${LAUNCH_ROLE}"`);
  const {rows:[access]}=await admin.query("SELECT has_table_privilege($1,'public.manekineko_social_senders','SELECT,INSERT,UPDATE,DELETE') AS public_access",[WEB_ROLE]);
  if (access.public_access) throw new Error('Unexpected public web access.');
  runtime=new pg.Client({connectionString:config.launch.connectionString,connectionTimeoutMillis:10_000});
  await runtime.connect();await runtime.query('SELECT id FROM manekineko_social_senders LIMIT 1');
  console.log('Migration 039 installed; restricted Launch access verified; public Web has no access. No source enabled.');
} catch {
  console.error('Social sender staging setup failed. Provider details withheld.');process.exitCode=1;
} finally {await runtime?.end().catch(()=>{});await admin?.end().catch(()=>{});}
