import { randomBytes } from 'node:crypto';
import { lstat, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { loadStagingDatabaseConfig, inspectStagingDatabase, migrateStagingDatabase, rolePasswordMaterial } from './staging-database.mjs';

export const INDEXER_ROLE = 'manekineko_staging_indexer';
export const INDEXER_READ_TABLES = ['manekineko_networks','manekineko_series','manekineko_collections','manekineko_deployments','manekineko_affiliate_programs'];
export const INDEXER_WRITE_TABLES = ['manekineko_collection_awards','manekineko_collection_state','manekineko_collection_history','manekineko_history_winners','manekineko_indexer_checkpoints','manekineko_chain_events','manekineko_nft_metadata_jobs','manekineko_nft_metadata_providers'];
const root = new URL('../', import.meta.url);
const envPath = new URL('.env.staging.local', root);
const quote = value => `"${value.replaceAll('"','""')}"`;
const table = name => `public.${quote(name)}`;
class ProvisionError extends Error {}
const ensure = (condition,message) => { if (!condition) throw new ProvisionError(message); };

export function indexerCredentials(env, config) {
  if (!env.INDEXER_DATABASE_URL) {
    const endpoint = new URL(config.admin.connectionString);
    endpoint.username = INDEXER_ROLE;
    endpoint.password = randomBytes(36).toString('base64url');
    return { connectionString:endpoint.href, password:decodeURIComponent(endpoint.password), created:true };
  }
  const endpoint = new URL(env.INDEXER_DATABASE_URL), expected = new URL(config.admin.connectionString);
  const password = decodeURIComponent(endpoint.password);
  ensure(endpoint.protocol === expected.protocol && endpoint.hostname === expected.hostname && endpoint.port === expected.port
    && endpoint.pathname === expected.pathname && endpoint.search === expected.search && !endpoint.hash
    && decodeURIComponent(endpoint.username) === INDEXER_ROLE && /^[\x21-\x7e]{32,}$/.test(password),
  'INDEXER_DATABASE_URL must use its restricted role on the exact pinned staging endpoint with verified TLS.');
  ensure(![config.admin,config.web,config.launch].some(entry=>entry.password===password), 'Indexer database credentials must be distinct from other roles.');
  return { connectionString:endpoint.href,password,created:false };
}

async function saveCredentials(original, value) {
  const stat = await lstat(envPath);
  ensure(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077), 'The staging environment must remain a private regular file.');
  ensure(await readFile(envPath,'utf8') === original, 'Staging environment changed during setup; rerun before saving credentials.');
  const temporary = new URL(`.env.staging.indexer-${process.pid}-${randomBytes(6).toString('hex')}.tmp`,root);
  const handle = await open(temporary,'wx',0o600);
  try {
    await handle.writeFile(`${original.replace(/\n?$/,'\n')}INDEXER_DATABASE_URL=${value}\n`);
    await handle.sync(); await handle.close();
    await rename(temporary,envPath);
  } catch(error) { await handle.close().catch(()=>{}); await unlink(temporary).catch(()=>{}); throw error; }
}

export async function grantIndexerPrivileges(client, database, role = INDEXER_ROLE) {
  const principal=quote(role);
  await client.query(`REVOKE ALL ON DATABASE ${quote(database)} FROM ${principal}`);
  await client.query(`GRANT CONNECT ON DATABASE ${quote(database)} TO ${principal}`);
  await client.query(`REVOKE ALL ON SCHEMA public FROM ${principal}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${principal}`);
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${principal}`);
  const columns=(await client.query(`SELECT c.relname,array_agg(a.attname::text ORDER BY a.attnum) AS columns FROM pg_class c
    JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')
    AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname`)).rows;
  for(const entry of columns) await client.query(`REVOKE ALL(${entry.columns.map(quote).join(',')}) ON ${table(entry.relname)} FROM ${principal}`);
  await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${principal}`);
  await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${principal}`);
  await client.query(`GRANT SELECT ON ${INDEXER_READ_TABLES.map(table).join(',')} TO ${principal}`);
  await client.query(`GRANT UPDATE(updated_at) ON public.manekineko_collections,public.manekineko_deployments TO ${principal}`);
  await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${INDEXER_WRITE_TABLES.map(table).join(',')} TO ${principal}`);
  await client.query(`GRANT SELECT,INSERT,UPDATE ON public.manekineko_indexer_webhook_deliveries TO ${principal}`);
  await client.query(`ALTER ROLE ${principal} IN DATABASE ${quote(database)} SET search_path TO public`);
}

export async function verifyIndexerPrivileges(client, database, role = INDEXER_ROLE) {
  const identity=(await client.query('SELECT current_user AS role,current_database() AS database')).rows[0];
  ensure(identity.role===role && identity.database===database,'Indexer runtime identity does not match its restricted staging role.');
  for(const name of [...INDEXER_READ_TABLES,...INDEXER_WRITE_TABLES,'manekineko_indexer_webhook_deliveries']) {
    await client.query(`SELECT 1 FROM ${table(name)} LIMIT 1`);
  }
  for(const name of ['manekineko_launch_users','manekineko_launch_sessions','manekineko_launch_configurations','manekineko_affiliate_challenges','manekineko_affiliate_rate_limits','manekineko_staging_environment']) {
    const access=(await client.query("SELECT has_table_privilege(current_user,$1,'SELECT,INSERT,UPDATE,DELETE') AS allowed",[`public.${name}`])).rows[0].allowed;
    ensure(!access,'Indexer role has unexpected access to an administrative or authentication table.');
  }
  for(const [name,column] of [['manekineko_collections','mint_price_wei'],['manekineko_deployments','contract_address'],['manekineko_affiliate_programs','enrollment_signer']]) {
    const access=(await client.query("SELECT has_column_privilege(current_user,$1,$2,'UPDATE') AS allowed",[`public.${name}`,column])).rows[0].allowed;
    ensure(!access,'Indexer role can unexpectedly change immutable launch or enrollment terms.');
  }
  const ddl=(await client.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS schema_create,has_database_privilege(current_user,current_database(),'CREATE') AS database_create")).rows[0];
  ensure(!ddl.schema_create && !ddl.database_create,'Indexer role unexpectedly has schema creation privileges.');
}

export async function setupIndexerStaging({ apply=false, log=console.log }={}) {
  const config=await loadStagingDatabaseConfig();
  ensure(!config.host.includes('-pooler.'),'Use the pinned direct staging database endpoint for schema migration.');
  const original=await readFile(envPath,'utf8'), env=parseEnv(original), credentials=indexerCredentials(env,config);
  const client=new pg.Client({connectionString:config.admin.connectionString,connectionTimeoutMillis:10000,statement_timeout:30000,application_name:'manekineko-indexer-provision'});
  let locked=false;
  try {
    await client.connect();
    ensure((await inspectStagingDatabase(client,config)).initialized,'Initialize the existing dedicated Sepolia staging database first.');
    await client.query("SELECT pg_advisory_lock(hashtextextended('manekineko-staging-indexer-setup',0))");locked=true;
    const applied=new Set((await client.query('SELECT name FROM public.manekineko_schema_migrations')).rows.map(row=>row.name));
    const expected=['014_chain_indexer.sql','015_indexer_webhook_deliveries.sql','025_nft_metadata_refresh.sql'];
    const available=(await readdir(new URL('database/migrations/',root))).filter(name=>name.endsWith('.sql')).sort();
    ensure(available.filter(name=>!applied.has(name)).every(name=>expected.includes(name)),
      'Only reviewed indexer migrations 014, 015 and 025 may be applied by this setup; provision earlier prerequisites separately.');
    const existing=(await client.query(`SELECT r.*,shobj_description(r.oid,'pg_authid') AS purpose FROM pg_roles r WHERE rolname=$1`,[INDEXER_ROLE])).rows[0];
    const purpose=`manekineko staging indexer ${config.id}`;
    if(existing) {
      ensure(!credentials.created && existing.purpose===purpose && existing.rolcanlogin && !existing.rolsuper && !existing.rolcreatedb && !existing.rolcreaterole
        && !existing.rolreplication && !existing.rolbypassrls && !existing.rolinherit,'Existing indexer role is not the restricted role bound to this staging instance.');
      ensure(!(await client.query('SELECT 1 FROM pg_auth_members WHERE member=$1',[existing.oid])).rowCount,'Indexer role has unexpected role memberships.');
    }
    if(!apply) return {mode:'check',roleExists:Boolean(existing),pendingMigrations:expected.filter(name=>!applied.has(name)),credentialsConfigured:!credentials.created};
    // Save before role creation so an interrupted provisioning can resume with the same secret.
    if(credentials.created) await saveCredentials(original,credentials.connectionString);
    await migrateStagingDatabase(client,log);
    await client.query('BEGIN');
    try {
      if(!existing) {
        await client.query(`CREATE ROLE ${quote(INDEXER_ROLE)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 12 PASSWORD ${client.escapeLiteral(rolePasswordMaterial(config,credentials.password))}`);
        await client.query(`COMMENT ON ROLE ${quote(INDEXER_ROLE)} IS ${client.escapeLiteral(purpose)}`);
      }
      await grantIndexerPrivileges(client,config.database);
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK');throw error;}
    const runtime=new pg.Client({connectionString:credentials.connectionString,connectionTimeoutMillis:10000,statement_timeout:15000});
    try {await runtime.connect();await verifyIndexerPrivileges(runtime,config.database);}finally{await runtime.end().catch(()=>{});}
    return {mode:'applied',role:INDEXER_ROLE,migrations:expected,runtimeAccessVerified:true,credentialsFile:'.env.staging.local'};
  } finally {
    if(locked) await client.query("SELECT pg_advisory_unlock(hashtextextended('manekineko-staging-indexer-setup',0))").catch(()=>{});
    await client.end().catch(()=>{});
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);
  if(args.length>1 || args.length===1 && args[0]!=='--apply') {console.error('Use setup-indexer-staging.mjs [--apply].');process.exitCode=1;}
  else setupIndexerStaging({apply:args[0]==='--apply'}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
    console.error(error instanceof ProvisionError ? error.message : 'Indexer staging provisioning failed. Provider and SQL details were withheld to protect credentials.');process.exitCode=1;
  });
}
