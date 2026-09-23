import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import pg from "pg";
import { inspectStagingDatabase, loadStagingDatabaseConfig, rolePasswordMaterial } from "./staging-database.mjs";

const root = new URL("../", import.meta.url);
const migrationName = "028_landing_newsletter.sql";
export const NEWSLETTER_ROLE = "manekineko_staging_newsletter";
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const rolePurpose = (config) => `Tincta newsletter runtime for staging instance ${config.id}`;
class NewsletterSetupError extends Error {}
const fail = (message) => { throw new NewsletterSetupError(message); };
const clientFor = (connectionString) => new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 30_000, application_name: "tincta-newsletter-setup" });

export function validateNewsletterUrl(value, config) {
  try {
    const url = new URL(value), admin = new URL(config.admin.connectionString);
    const parameters = [...url.searchParams.keys()];
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== config.host
      || (url.port || "5432") !== (admin.port || "5432") || decodeURIComponent(url.pathname.slice(1)) !== config.database
      || decodeURIComponent(url.username) !== NEWSLETTER_ROLE || !/^[\x21-\x7e]{24,}$/.test(decodeURIComponent(url.password)) || url.hash
      || url.searchParams.get("sslmode") !== "verify-full" || new Set(parameters).size !== parameters.length
      || parameters.some((key) => !["sslmode", "channel_binding"].includes(key))
      || (url.searchParams.has("channel_binding") && url.searchParams.get("channel_binding") !== "require")) throw new Error();
    url.password = encodeURIComponent(decodeURIComponent(url.password));
    return url;
  } catch { fail("Existing NEWSLETTER_DATABASE_URL does not match the dedicated staging role and pinned endpoint. It was not overwritten."); }
}

async function privateEnvironment(path) {
  const stat = await lstat(path).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (stat && (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077))) fail("Landing .env.local must be a regular private file with mode 0600.");
  const text = stat ? await readFile(path, "utf8") : "";
  for (const key of ["NEWSLETTER_DATABASE_URL", "NEWSLETTER_IP_HASH_SECRET", "NEWSLETTER_PUBLIC_ORIGIN"]) {
    if ([...text.matchAll(new RegExp(`^[ \\t]*(?:export\\s+)?${key}\\s*=`, "gm"))].length > 1) fail("Duplicate newsletter environment keys must be resolved before setup. The file was not changed.");
  }
  const env = parseEnv(text);
  if (env.NEWSLETTER_PUBLIC_ORIGIN?.trim()) fail("Clear NEWSLETTER_PUBLIC_ORIGIN in the local Landing environment so development can infer localhost. No configuration was overwritten.");
  if (env.NEWSLETTER_IP_HASH_SECRET && env.NEWSLETTER_IP_HASH_SECRET.length < 32) fail("The existing newsletter IP hash secret is too short. No configuration was overwritten.");
  return { text, env };
}

export async function verifyNewsletterLedger(client) {
  const files = (await readdir(new URL("database/migrations/", root))).filter((name) => /^\d{3}_.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 28).sort();
  if (files.length !== 28 || files.some((name, index) => Number(name.slice(0, 3)) !== index + 1) || files.at(-1) !== migrationName) fail("Expected the unchanged local migration history 001 through 028.");
  const migrations = await Promise.all(files.map(async (name) => {
    const sql = await readFile(new URL(`database/migrations/${name}`, root), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
  const applied = (await client.query("SELECT name,checksum FROM public.manekineko_schema_migrations ORDER BY name")).rows;
  if (![27, 28].includes(applied.length) || applied.some((entry, index) => entry.name !== migrations[index].name || entry.checksum !== migrations[index].checksum)) {
    fail("The staging migration ledger must match local 001–027 exactly, with only an optional matching 028.");
  }
  return { migration: migrations.at(-1), applied: applied.length === 28 };
}

async function inspectRole(client, config) {
  const role = (await client.query(`SELECT oid,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,shobj_description(oid,'pg_authid') AS purpose
    FROM pg_roles WHERE rolname=$1`, [NEWSLETTER_ROLE])).rows[0];
  if (!role) return false;
  if (role.purpose !== rolePurpose(config)) fail("The existing newsletter role does not belong to this setup and staging instance. It was not adopted or changed.");
  if (!role.rolcanlogin || role.rolinherit || role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls) fail("The existing newsletter role is not a restricted login. It was not changed.");
  // PostgreSQL grants the creating CREATEROLE administrator ADMIN on its new role.
  // That inward administrative membership does not grant authority to this runtime.
  const ownership = await client.query(`SELECT 1 FROM pg_auth_members WHERE member=$1
    OR (roleid=$1 AND NOT(member=(SELECT oid FROM pg_roles WHERE rolname=$2) AND admin_option))
    UNION ALL SELECT 1 FROM pg_database WHERE datdba=$1 UNION ALL SELECT 1 FROM pg_namespace WHERE nspowner=$1
    UNION ALL SELECT 1 FROM pg_class WHERE relowner=$1 UNION ALL SELECT 1 FROM pg_proc WHERE proowner=$1 LIMIT 1`, [role.oid, config.admin.username]);
  if (ownership.rowCount) fail("The existing newsletter role owns database objects or has role memberships. It was not changed.");
  return true;
}

async function verifyLogin(url, connect, checkPrivileges = false) {
  const runtime = connect(url.href);
  try {
    await runtime.connect();
    const identity = (await runtime.query("SELECT current_user AS role,current_database() AS database")).rows[0];
    if (identity.role !== NEWSLETTER_ROLE || identity.database !== decodeURIComponent(url.pathname.slice(1))) fail("Newsletter login identity did not match the expected dedicated runtime.");
    if (checkPrivileges) {
      const permissions = (await runtime.query(`SELECT
        has_database_privilege(current_database(),'CONNECT') AND has_schema_privilege('public','USAGE') AS connection,
        has_column_privilege('public.manekineko_newsletter_subscribers','email','INSERT') AS subscription,
        NOT has_table_privilege('public.manekineko_newsletter_subscribers','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.manekineko_newsletter_subscribers'::regclass AND attnum>0 AND NOT attisdropped
            AND (has_column_privilege(attrelid,attnum,'SELECT,UPDATE,REFERENCES') OR (attname<>'email' AND has_column_privilege(attrelid,attnum,'INSERT')))) AS subscriber_privacy,
        has_table_privilege('public.manekineko_newsletter_rate_limits','SELECT') AND has_table_privilege('public.manekineko_newsletter_rate_limits','INSERT')
          AND has_table_privilege('public.manekineko_newsletter_rate_limits','UPDATE') AND has_table_privilege('public.manekineko_newsletter_rate_limits','DELETE') AS quotas,
        NOT has_any_column_privilege('public.manekineko_collections','SELECT') AND NOT has_any_column_privilege('public.manekineko_launch_users','SELECT')
          AND NOT has_schema_privilege('public','CREATE') AND NOT has_database_privilege(current_database(),'CREATE,TEMP') AS isolation`)).rows[0];
      if (!permissions || Object.values(permissions).some((allowed) => allowed !== true)) fail("The newsletter runtime does not have the exact required private-data and isolation permissions.");
    }
  } finally { await runtime.end(); }
}

async function persistEnvironment(path, original, url, secret) {
  // Refuse a concurrent edit; do not replace an unrelated environment file.
  const current = await privateEnvironment(path);
  if (current.text !== original.text) fail("Landing .env.local changed during setup. No credentials were overwritten.");
  let text = original.text;
  for (const [key, value] of Object.entries({ NEWSLETTER_DATABASE_URL: url.href, NEWSLETTER_IP_HASH_SECRET: secret })) {
    const line = `${key}=${JSON.stringify(value)}`;
    const expression = new RegExp(`^[ \\t]*(?:export\\s+)?${key}\\s*=.*$`, "m");
    text = expression.test(text) ? text.replace(expression, () => line) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  }
  const temporary = new URL(`.env.newsletter-${randomBytes(8).toString("hex")}.tmp`, path);
  await writeFile(temporary, text, { mode: 0o600, flag: "wx" });
  await rename(temporary, path);
}

export async function setupLandingNewsletter(config, { apply = false, envPath = new URL("apps/landing-page/.env.local", root), log = console.log, connect = clientFor } = {}) {
  const original = await privateEnvironment(envPath);
  let url = original.env.NEWSLETTER_DATABASE_URL ? validateNewsletterUrl(original.env.NEWSLETTER_DATABASE_URL, config) : null;
  const admin = connect(config.admin.connectionString);
  try {
    await admin.connect();
    if (apply) await admin.query("SELECT pg_advisory_lock(1835101797,2026)");
    else await admin.query("BEGIN READ ONLY");
    if (!(await inspectStagingDatabase(admin, config)).initialized) fail("This command requires an already initialized, pinned staging database.");
    const ledger = await verifyNewsletterLedger(admin);
    const exists = await inspectRole(admin, config);
    if (exists && !url) fail("The newsletter role already exists, but its matching private Landing credentials are unavailable. No password was rotated.");
    if (exists) await verifyLogin(url, connect, !apply && ledger.applied);
    if (!apply) {
      await admin.query("COMMIT");
      log(`Read-only staging check passed. Migration 028 is ${ledger.applied ? "already verified" : "pending"}; dedicated newsletter role is ${exists ? "verified" : "pending"}. Use --apply to persist setup.`);
      return { applied: ledger.applied, roleExists: exists };
    }
    if (!url) {
      url = new URL(config.admin.connectionString);
      url.username = NEWSLETTER_ROLE;
      url.password = randomBytes(36).toString("base64url");
    }
    // Save generated credentials first. A failed DB transaction can retry them safely.
    await persistEnvironment(envPath, original, url, original.env.NEWSLETTER_IP_HASH_SECRET || randomBytes(36).toString("base64url"));
    await admin.query("BEGIN");
    try {
      const role = quote(NEWSLETTER_ROLE);
      if (!exists) {
        await admin.query(`CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10 PASSWORD ${admin.escapeLiteral(rolePasswordMaterial(config, decodeURIComponent(url.password)))}`);
        await admin.query(`COMMENT ON ROLE ${role} IS ${admin.escapeLiteral(rolePurpose(config))}`);
      }
      if (!ledger.applied) {
        if (!/^BEGIN;\s*$/m.test(ledger.migration.sql) || !/COMMIT;\s*$/.test(ledger.migration.sql)) fail("Migration 028 must own a plain BEGIN/COMMIT transaction.");
        await admin.query(ledger.migration.sql.replace(/^BEGIN;\s*$/m, "").replace(/COMMIT;\s*$/, ""));
        await admin.query("INSERT INTO public.manekineko_schema_migrations(name,checksum) VALUES($1,$2)", [migrationName, ledger.migration.checksum]);
      }
      await admin.query(`REVOKE ALL ON DATABASE ${quote(config.database)} FROM ${role}; GRANT CONNECT ON DATABASE ${quote(config.database)} TO ${role}; REVOKE ALL ON SCHEMA public FROM ${role}; GRANT USAGE ON SCHEMA public TO ${role}`);
      await admin.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}; REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role}; REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${role}`);
      const columns = (await admin.query(`SELECT c.relname,array_agg(a.attname::text ORDER BY a.attnum) AS columns FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname`)).rows;
      for (const entry of columns) await admin.query(`REVOKE ALL(${entry.columns.map(quote).join(",")}) ON public.${quote(entry.relname)} FROM ${role}`);
      await admin.query(`GRANT INSERT(email) ON public.manekineko_newsletter_subscribers TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON public.manekineko_newsletter_rate_limits TO ${role}; ALTER ROLE ${role} IN DATABASE ${quote(config.database)} SET search_path TO public`);
      await admin.query("COMMIT");
    } catch (error) { await admin.query("ROLLBACK"); throw error; }
    await verifyLogin(url, connect, true);
    await verifyNewsletterLedger(admin);
    log("Newsletter migration, dedicated login and private local configuration verified. Existing app roles were unchanged. No email registrations were inserted.");
    return { applied: true, roleExists: true };
  } finally { await admin.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== "--apply")) fail("Usage: node scripts/setup-landing-newsletter.mjs [--apply]");
    await setupLandingNewsletter(await loadStagingDatabaseConfig(), { apply: process.argv[2] === "--apply" });
  } catch (error) {
    console.error(error instanceof NewsletterSetupError ? error.message : "Newsletter setup failed. Check the pinned staging configuration, owner privileges and saved runtime login. Provider details were withheld to protect credentials.");
    process.exitCode = 1;
  }
}
