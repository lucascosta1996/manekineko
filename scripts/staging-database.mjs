import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import pg from "pg";

const root = new URL("../", import.meta.url);
const markerTable = "manekineko_staging_environment";
export const WEB_ROLE = "manekineko_staging_web";
export const LAUNCH_ROLE = "manekineko_staging_launch";
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const publicTable = (name) => `public.${quote(name)}`;

class SetupError extends Error {}
function requireValue(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new SetupError(`Set ${name} in .env.staging.local.`);
  return value;
}

/** Parse only the dedicated staging file: never inherit a production DATABASE_URL. */
export async function loadStagingDatabaseConfig() {
  const path = new URL(".env.staging.local", root);
  const stat = await lstat(path).catch(() => { throw new SetupError("Create the private .env.staging.local staging configuration first."); });
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) {
    throw new SetupError(".env.staging.local must be a regular private file with mode 0600.");
  }
  return parseStagingDatabaseConfig(parseEnv(await readFile(path, "utf8")));
}

export function parseStagingDatabaseConfig(env) {
  const host = requireValue(env, "STAGING_DATABASE_EXPECTED_HOST").toLowerCase();
  const database = requireValue(env, "STAGING_DATABASE_EXPECTED_NAME");
  const id = requireValue(env, "STAGING_DATABASE_ID");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new SetupError("STAGING_DATABASE_ID must be a UUID generated for this staging database.");
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(database) || ["postgres", "template0", "template1"].includes(database)) {
    throw new SetupError("Choose a dedicated database, not a default administrative database.");
  }
  if (/localhost|\.local$|\.internal$|^\[|^[\d.]+$/.test(host) || !host.includes(".")) {
    throw new SetupError("Staging requires a remote PostgreSQL DNS hostname.");
  }
  const urls = {};
  for (const key of ["DATABASE_ADMIN_URL", "WEB_DATABASE_URL", "LAUNCH_DATABASE_URL"]) {
    let url;
    try { url = new URL(requireValue(env, key)); } catch { throw new SetupError(`Set a valid PostgreSQL URL for ${key}.`); }
    let username, password, targetDatabase;
    try {
      username = decodeURIComponent(url.username);
      password = decodeURIComponent(url.password);
      targetDatabase = decodeURIComponent(url.pathname.slice(1));
    } catch { throw new SetupError(`${key} contains invalid URL encoding.`); }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !username || !password || url.hash || url.hostname.toLowerCase() !== host || targetDatabase !== database) {
      throw new SetupError(`${key} must target the explicitly pinned staging host and database with credentials.`);
    }
    // Avoid options/search_path overrides, credential aliases and TLS downgrades.
    const parameterNames = [...url.searchParams.keys()];
    if (new Set(parameterNames).size !== parameterNames.length) {
      throw new SetupError(`${key} must not repeat URL query parameters.`);
    }
    if (url.searchParams.get("sslmode") !== "verify-full" || parameterNames.some((name) => !["sslmode", "channel_binding"].includes(name))) {
      throw new SetupError(`${key} requires sslmode=verify-full and may only add channel_binding=require.`);
    }
    if (url.searchParams.has("channel_binding") && url.searchParams.get("channel_binding") !== "require") {
      throw new SetupError(`${key} has an unsupported channel_binding value.`);
    }
    urls[key] = { connectionString: url.href, username, password, port: url.port || "5432" };
  }
  if (new Set(Object.values(urls).map((entry) => entry.port)).size !== 1) throw new SetupError("All staging database URLs must use the same endpoint port.");
  if (urls.WEB_DATABASE_URL.username !== WEB_ROLE || urls.LAUNCH_DATABASE_URL.username !== LAUNCH_ROLE || [WEB_ROLE, LAUNCH_ROLE].includes(urls.DATABASE_ADMIN_URL.username)) {
    throw new SetupError(`Use separate runtime roles ${WEB_ROLE} and ${LAUNCH_ROLE}, distinct from the database owner.`);
  }
  if ([urls.WEB_DATABASE_URL, urls.LAUNCH_DATABASE_URL].some(({ password }) => !/^[\x21-\x7e]{24,}$/.test(password)) || new Set(Object.values(urls).map(({ password }) => password)).size !== 3) {
    throw new SetupError("Use distinct database passwords, with at least 24 printable ASCII characters for each runtime role.");
  }
  return { id, host, database, admin: urls.DATABASE_ADMIN_URL, web: urls.WEB_DATABASE_URL, launch: urls.LAUNCH_DATABASE_URL };
}

function clientFor(entry) {
  return new pg.Client({ connectionString: entry.connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 30_000, application_name: "manekineko-staging-setup" });
}

/** Ordinary PostgreSQL accepts a verifier without receiving the role password. */
function passwordVerifier(password) {
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
  const client = createHmac("sha256", salted).update("Client Key").digest();
  const stored = createHash("sha256").update(client).digest("base64");
  const server = createHmac("sha256", salted).update("Server Key").digest("base64");
  return `SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored}:${server}`;
}

export function rolePasswordMaterial(config, password) {
  const endpoint = new URL(config.admin.connectionString);
  const hostname = endpoint.hostname.toLowerCase();
  // Neon's role provisioning hook requires the original password. Match DNS
  // labels and the final suffix, never arbitrary substrings or userinfo.
  const neon = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+neon\.tech$/.test(hostname);
  if (!neon) return passwordVerifier(password);
  const parameters = [...endpoint.searchParams.keys()];
  if (hostname !== config.host || endpoint.searchParams.getAll("sslmode").length !== 1 || endpoint.searchParams.get("sslmode") !== "verify-full" || new Set(parameters).size !== parameters.length || parameters.some((name) => !["sslmode", "channel_binding"].includes(name))) {
    throw new SetupError("Neon role creation requires the pinned endpoint and verified TLS without URL overrides.");
  }
  return password;
}

export function stagingDatabaseErrorMessage(error) {
  // Raw provider errors can embed SQL/passwords. Never serialize or log them.
  return error instanceof SetupError ? error.message : "Staging database setup failed. Check dedicated endpoint credentials, database ownership and CREATE ROLE privileges. Provider error details were withheld to protect secrets.";
}

export async function inspectStagingDatabase(client, config) {
  const identity = (await client.query(`SELECT current_database() AS database, current_user AS role,
    pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()`)).rows[0];
  if (identity?.database !== config.database || identity.role !== config.admin.username || identity.owner !== identity.role) {
    throw new SetupError("Connected identity does not own the pinned staging database. No changes were made.");
  }
  const marker = (await client.query("SELECT to_regclass('public.manekineko_staging_environment') AS marker")).rows[0].marker;
  if (!marker) {
    const objects = await client.query(`SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','public')
      UNION ALL SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace
      UNION ALL SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace
      UNION ALL SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace`);
    if (objects.rowCount) throw new SetupError("Refusing to adopt a nonempty database without its matching staging marker. Use a new isolated database.");
    const roles = await client.query("SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])", [[WEB_ROLE, LAUNCH_ROLE]]);
    if (roles.rowCount) throw new SetupError("Runtime role names already exist outside this staging marker. Use an isolated PostgreSQL project.");
    return { initialized: false };
  }
  const owner = (await client.query("SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='public.manekineko_staging_environment'::regclass")).rows[0]?.owner;
  const rows = (await client.query(`SELECT * FROM ${publicTable(markerTable)}`)).rows;
  const current = rows[0];
  if (owner !== config.admin.username || rows.length !== 1 || current.instance_id !== config.id || current.chain_id !== "11155111" || current.database_name !== config.database || current.expected_host !== config.host || current.admin_role !== config.admin.username || current.web_role !== WEB_ROLE || current.launch_role !== LAUNCH_ROLE) {
    throw new SetupError("Staging marker does not match this exact instance, database owner, endpoint and chain. No changes were made.");
  }
  const unrelated = await client.query(`SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p','v','m','f')
    AND relname NOT LIKE 'manekineko\\_%' ESCAPE '\\'`);
  if (unrelated.rowCount) throw new SetupError("Unrelated application tables are present. Refusing to provision a shared database.");
  for (const table of ["manekineko_collections", "manekineko_collection_history", "manekineko_deployments"]) {
    if ((await client.query("SELECT to_regclass($1) AS table_name", [`public.${table}`])).rows[0].table_name) {
      if ((await client.query(`SELECT 1 FROM ${publicTable(table)} WHERE chain_id<>11155111 LIMIT 1`)).rowCount) {
        throw new SetupError("Non-Sepolia records are present. Refusing to provision this database.");
      }
    }
  }
  if ((await client.query("SELECT to_regclass('public.manekineko_networks') AS table_name")).rows[0].table_name) {
    const unexpected = await client.query(`SELECT 1 FROM public.manekineko_networks WHERE chain_id<>11155111
      AND NOT(chain_id=1 AND name='Ethereum Mainnet' AND currency_symbol='ETH' AND currency_decimals=18 AND explorer_url='https://etherscan.io') LIMIT 1`);
    if (unexpected.rowCount) throw new SetupError("Unexpected network metadata is present. Refusing to provision this database.");
  }
  const roles = (await client.query(`SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit
    FROM pg_roles WHERE rolname=ANY($1::text[])`, [[WEB_ROLE, LAUNCH_ROLE]])).rows;
  if (roles.length !== 2 || roles.some((r) => r.rolsuper || r.rolcreatedb || r.rolcreaterole || r.rolreplication || r.rolbypassrls || r.rolinherit)) {
    throw new SetupError("Staging runtime role attributes do not match the restricted roles created by this setup.");
  }
  const memberships = await client.query(`SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=ANY($1::text[])`, [[WEB_ROLE, LAUNCH_ROLE]]);
  if (memberships.rowCount) throw new SetupError("Staging runtime roles have unexpected role memberships.");
  return { initialized: true };
}

async function establishMarker(client, config) {
  await client.query("BEGIN");
  try {
    for (const entry of [config.web, config.launch]) {
      await client.query(`CREATE ROLE ${quote(entry.username)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20 PASSWORD ${client.escapeLiteral(rolePasswordMaterial(config, entry.password))}`);
    }
    await client.query(`CREATE TABLE ${publicTable(markerTable)} (
      singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), instance_id uuid NOT NULL,
      chain_id bigint NOT NULL CHECK(chain_id=11155111), database_name text NOT NULL, expected_host text NOT NULL,
      admin_role text NOT NULL, web_role text NOT NULL, launch_role text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await client.query(`INSERT INTO ${publicTable(markerTable)}(instance_id,chain_id,database_name,expected_host,admin_role,web_role,launch_role)
      VALUES($1,11155111,$2,$3,$4,$5,$6)`, [config.id, config.database, config.host, config.admin.username, WEB_ROLE, LAUNCH_ROLE]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function migrate(client, log) {
  await client.query(`CREATE TABLE IF NOT EXISTS public.manekineko_schema_migrations (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Map((await client.query("SELECT name,checksum FROM public.manekineko_schema_migrations")).rows.map((r) => [r.name, r.checksum]));
  for (const name of (await readdir(new URL("database/migrations/", root))).filter((n) => n.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(`database/migrations/${name}`, root), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (applied.has(name)) {
      if (applied.get(name) !== checksum) throw new SetupError(`Applied migration changed: ${name}. Add a new migration instead.`);
      continue;
    }
    if (!/^BEGIN;\s*$/m.test(sql) || !/COMMIT;\s*$/.test(sql)) throw new SetupError(`Migration transaction boundary is missing: ${name}.`);
    await client.query(sql.replace(/COMMIT;\s*$/, `INSERT INTO public.manekineko_schema_migrations(name,checksum) VALUES(${client.escapeLiteral(name)},${client.escapeLiteral(checksum)});\nCOMMIT;`));
    log(`Applied migration ${name}.`);
  }
}

export { migrate as migrateStagingDatabase };

export const WEB_READ_TABLES = [
  "manekineko_networks", "manekineko_series", "manekineko_collections", "manekineko_deployments",
  "manekineko_collection_state", "manekineko_collection_history", "manekineko_history_winners", "manekineko_collection_awards", "manekineko_affiliate_programs",
  "manekineko_chain_events", "manekineko_indexer_checkpoints",
];

export async function grantStagingPrivileges(client, config) {
  const web = quote(WEB_ROLE), launch = quote(LAUNCH_ROLE);
  await client.query(`REVOKE ALL ON DATABASE ${quote(config.database)} FROM PUBLIC, ${web}, ${launch}`);
  await client.query(`GRANT CONNECT ON DATABASE ${quote(config.database)} TO ${web}, ${launch}`);
  await client.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC, ${web}, ${launch}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${web}, ${launch}`);
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, ${web}, ${launch}`);
  // Table-level REVOKE does not remove separate column-level grants.
  const columns = (await client.query(`SELECT c.relname, array_agg(a.attname::text ORDER BY a.attnum) AS columns
    FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname`)).rows;
  for (const entry of columns) await client.query(`REVOKE ALL(${entry.columns.map(quote).join(",")}) ON ${publicTable(entry.relname)} FROM PUBLIC, ${web}, ${launch}`);
  await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, ${web}, ${launch}`);
  await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, ${web}, ${launch}`);
  // New migrations do not accidentally expose new objects to either runtime.
  await client.query("ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC");
  await client.query("ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC");
  await client.query("ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC");
  await client.query(`GRANT SELECT ON ${WEB_READ_TABLES.map(publicTable).join(",")} TO ${web}`);
  await client.query(`GRANT SELECT,INSERT,DELETE ON public.manekineko_affiliate_challenges TO ${web}`);
  await client.query(`GRANT UPDATE(consumed_at) ON public.manekineko_affiliate_challenges TO ${web}`);
  await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.manekineko_affiliate_rate_limits TO ${web}`);
  await client.query(`GRANT SELECT ON public.manekineko_launch_users TO ${launch}`);
  // PostgreSQL row locks need UPDATE on at least one column, even without a write.
  await client.query(`GRANT UPDATE(updated_at) ON public.manekineko_launch_users TO ${launch}`);
  await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.manekineko_launch_sessions,public.manekineko_launch_login_limits TO ${launch}`);
  await client.query(`GRANT SELECT,INSERT,UPDATE ON public.manekineko_launch_configurations,public.manekineko_launch_automations TO ${launch}`);
  await client.query(`GRANT INSERT ON public.manekineko_launch_configuration_events,public.manekineko_launch_automation_events TO ${launch}`);
  await client.query(`GRANT USAGE ON SEQUENCE public.manekineko_launch_configuration_events_id_seq,public.manekineko_launch_automation_events_id_seq TO ${launch}`);
  await client.query(`GRANT EXECUTE ON FUNCTION public.manekineko_launch_plan_version(jsonb), public.manekineko_launch_payload_version(jsonb),
    public.manekineko_valid_equal_prizes(jsonb), public.manekineko_valid_launch_season(jsonb), public.manekineko_valid_season_timing(jsonb) TO ${launch}`);
  for (const entry of [config.web, config.launch]) {
    await client.query(`ALTER ROLE ${quote(entry.username)} IN DATABASE ${quote(config.database)} SET search_path TO public`);
  }
}

async function enforceSepoliaConstraints(client) {
  const constraints = [
    ["manekineko_networks", "chain_id=11155111"],
    ["manekineko_launch_configurations", "COALESCE(payload->'contract'->>'chainId','')='11155111'"],
    ["manekineko_launch_automations", "(COALESCE(plan->>'chainId','')='11155111' OR (COALESCE(plan->>'chainId','')='1' AND status='draft')) AND NOT jsonb_path_exists(plan, '$.steps[*].payload.contract.chainId ? (@ != $chain)', jsonb_build_object('chain',plan->>'chainId'))"],
  ];
  for (const [table, expression] of constraints) {
    const name = `${table}_staging_chain`;
    if (!(await client.query("SELECT 1 FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2", [`public.${table}`, name])).rowCount) {
      await client.query(`ALTER TABLE ${publicTable(table)} ADD CONSTRAINT ${quote(name)} CHECK(${expression})`);
    }
  }
}

async function verifyRuntimeAccess(config, connect) {
  for (const [entry, ownTable, forbiddenTable] of [
    [config.web, "manekineko_collections", "manekineko_launch_users"],
    [config.launch, "manekineko_launch_users", "manekineko_affiliate_challenges"],
  ]) {
    const client = connect(entry);
    try {
      await client.connect();
      const identity = (await client.query("SELECT current_user AS role,current_database() AS database")).rows[0];
      if (identity.role !== entry.username || identity.database !== config.database) throw new SetupError("Runtime database identity does not match the pinned staging role.");
      await client.query(`SELECT 1 FROM ${publicTable(ownTable)} LIMIT 1`);
      const privileges = (await client.query(`SELECT
        has_table_privilege(current_user,$1,'SELECT') AS cross_access,
        has_table_privilege(current_user,'public.manekineko_staging_environment','UPDATE') AS marker_write,
        has_schema_privilege(current_user,'public','CREATE') AS schema_create,
        has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
        has_any_column_privilege(current_user,'public.manekineko_launch_users','UPDATE') AS any_user_update,
        has_column_privilege(current_user,'public.manekineko_launch_users','password_hash','UPDATE') AS password_write`, [`public.${forbiddenTable}`])).rows[0];
      if (privileges.cross_access || privileges.marker_write || privileges.schema_create || privileges.database_create || privileges.password_write || (entry.username === WEB_ROLE && privileges.any_user_update)) {
        throw new SetupError("Runtime privileges exceed their staging application boundary.");
      }
    } finally { await client.end(); }
  }
}

/** Connectors are injectable only for isolated tests; the CLI always validates the remote config. */
export async function provisionStagingDatabase(config, { mode = "check", log = console.log, connect = clientFor } = {}) {
  if (!["check", "provision"].includes(mode)) throw new SetupError("Use staging-database.mjs check|provision.");
  const client = connect(config.admin);
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(1835101797, 2026)");
    await client.query("SET search_path TO public");
    const state = await inspectStagingDatabase(client, config);
    if (mode === "check") {
      if (state.initialized) await verifyRuntimeAccess(config, connect);
      log(state.initialized ? "Staging database identity and Sepolia isolation verified (read only)." : "Empty isolated staging database verified; provisioning has not run.");
      return state;
    }
    if (!state.initialized) await establishMarker(client, config);
    await migrate(client, log);
    await client.query("BEGIN");
    try {
      // Migration 004 registers Mainnet metadata. Remove that unused lookup row in
      // this isolated database before enforcing Sepolia-only catalog references.
      await client.query("DELETE FROM public.manekineko_networks WHERE chain_id=1");
      await client.query(`INSERT INTO public.manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url)
        VALUES(11155111,'Ethereum Sepolia','ETH',18,'https://sepolia.etherscan.io') ON CONFLICT(chain_id) DO NOTHING`);
      await enforceSepoliaConstraints(client);
      await grantStagingPrivileges(client, config);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    await verifyRuntimeAccess(config, connect);
    log("Staging schema and restricted web/launch roles provisioned. Sepolia metadata registered; no demo collections or operator accounts were seeded.");
    return { initialized: true };
  } finally { await client.end(); }
}

async function main() {
  try {
    if (process.argv.length !== 3 || !["check", "provision"].includes(process.argv[2])) throw new SetupError("Usage: node scripts/staging-database.mjs check|provision");
    await provisionStagingDatabase(await loadStagingDatabaseConfig(), { mode: process.argv[2] });
  } catch (error) {
    // Never print raw driver errors: providers may include URLs, SQL or credentials.
    console.error(stagingDatabaseErrorMessage(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
