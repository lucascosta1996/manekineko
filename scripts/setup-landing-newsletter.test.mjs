import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { test } from "node:test";
import pg from "pg";
import { NEWSLETTER_ROLE, setupLandingNewsletter } from "./setup-landing-newsletter.mjs";
import { LAUNCH_ROLE, WEB_ROLE, parseStagingDatabaseConfig } from "./staging-database.mjs";

test("newsletter setup applies only 028 and preserves credentials, unrelated settings and roles", {
  skip: !process.env.NEWSLETTER_SETUP_TEST_URL && "Set NEWSLETTER_SETUP_TEST_URL to a fresh disposable local PostgreSQL cluster.",
}, async () => {
  const local = new URL(process.env.NEWSLETTER_SETUP_TEST_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(local.hostname), "Setup tests must stay local.");
  const suffix = randomUUID().replaceAll("-", "");
  const database = `newsletter_setup_${suffix}`;
  const owner = `newsletter_owner_${suffix}`;
  const fixturePassword = "isolated-newsletter-setup-fixture-only";
  const host = "newsletter-setup.example.test";
  const remoteUrl = (role) => `postgresql://${role}:${fixturePassword}@${host}/${database}?sslmode=verify-full`;
  const config = parseStagingDatabaseConfig({
    STAGING_DATABASE_EXPECTED_HOST: host, STAGING_DATABASE_EXPECTED_NAME: database, STAGING_DATABASE_ID: randomUUID(),
    DATABASE_ADMIN_URL: remoteUrl(owner), WEB_DATABASE_URL: remoteUrl(WEB_ROLE).replace(fixturePassword, "isolated-web-setup-fixture-password"),
    LAUNCH_DATABASE_URL: remoteUrl(LAUNCH_ROLE).replace(fixturePassword, "isolated-launch-setup-fixture-password"),
  });
  const connect = (connectionString) => {
    const target = new URL(connectionString);
    assert.equal(target.hostname, host, "The tested setup must retain its pinned hostname.");
    target.hostname = local.hostname; target.port = local.port; target.search = "";
    return new pg.Client({ connectionString: target.href });
  };
  const cluster = new pg.Client({ connectionString: local.href });
  const admin = connect(config.admin.connectionString);
  const folder = await mkdtemp(join(tmpdir(), "tincta-newsletter-setup-"));
  const envPath = pathToFileURL(join(folder, ".env.local"));
  const originalEnv = '# Existing landing setting\nNEXT_PUBLIC_WEB_URL="https://web.example.invalid"\nUNRELATED_VALUE="preserve me"\n';
  await writeFile(envPath, originalEnv, { mode: 0o600 });
  let createdOwner = false, createdDatabase = false, createdWeb = false, createdLaunch = false;
  const setup = (apply = false, path = envPath) => setupLandingNewsletter(config, { apply, envPath: path, log: () => {}, connect });
  try {
    await cluster.connect();
    assert.equal((await cluster.query("SELECT 1 FROM pg_roles WHERE rolname=ANY($1::text[])", [[NEWSLETTER_ROLE, WEB_ROLE, LAUNCH_ROLE]])).rowCount, 0, "Use a fresh cluster; existing app roles must not be touched.");
    await cluster.query(`CREATE ROLE "${owner}" LOGIN NOINHERIT NOSUPERUSER CREATEDB CREATEROLE PASSWORD ${cluster.escapeLiteral(fixturePassword)}`); createdOwner = true;
    await cluster.query(`CREATE DATABASE "${database}" OWNER "${owner}"`); createdDatabase = true;
    await admin.connect();
    for (const entry of [config.web, config.launch]) {
      await admin.query(`CREATE ROLE "${entry.username}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${admin.escapeLiteral(entry.password)}`);
      if (entry.username === WEB_ROLE) createdWeb = true; else createdLaunch = true;
    }
    await admin.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
    await admin.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    await admin.query(`CREATE TABLE public.manekineko_staging_environment(singleton boolean PRIMARY KEY DEFAULT true,instance_id uuid,chain_id bigint,database_name text,expected_host text,admin_role text,web_role text,launch_role text)`);
    await admin.query("INSERT INTO public.manekineko_staging_environment VALUES(true,$1,11155111,$2,$3,$4,$5,$6)", [config.id, database, host, owner, WEB_ROLE, LAUNCH_ROLE]);
    await admin.query("CREATE TABLE public.manekineko_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
    const files = (await readdir(new URL("../database/migrations/", import.meta.url))).filter((file) => /^\d{3}_.*\.sql$/.test(file) && Number(file.slice(0, 3)) <= 27).sort();
    assert.equal(files.length, 27);
    for (const name of files) {
      const sql = await readFile(new URL(`../database/migrations/${name}`, import.meta.url), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      await admin.query(sql.replace(/COMMIT;\s*$/, `INSERT INTO public.manekineko_schema_migrations(name,checksum) VALUES(${admin.escapeLiteral(name)},${admin.escapeLiteral(checksum)}); COMMIT;`));
    }
    const roleState = async () => (await cluster.query("SELECT rolname,rolpassword,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_authid WHERE rolname=ANY($1::text[]) ORDER BY rolname", [[WEB_ROLE, LAUNCH_ROLE]])).rows;
    const previousRoles = await roleState();
    assert.deepEqual(await setup(), { applied: false, roleExists: false });
    assert.equal(await readFile(envPath, "utf8"), originalEnv);
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM manekineko_schema_migrations")).rows[0].count, 27);
    assert.equal((await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [NEWSLETTER_ROLE])).rowCount, 0);

    const savedChecksum = (await admin.query("SELECT checksum FROM manekineko_schema_migrations WHERE name=$1", [files[0]])).rows[0].checksum;
    await admin.query("UPDATE manekineko_schema_migrations SET checksum='mismatched' WHERE name=$1", [files[0]]);
    await assert.rejects(setup(true), /ledger must match/);
    assert.equal(await readFile(envPath, "utf8"), originalEnv);
    await admin.query("UPDATE manekineko_schema_migrations SET checksum=$1 WHERE name=$2", [savedChecksum, files[0]]);

    assert.deepEqual(await setup(true), { applied: true, roleExists: true });
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM manekineko_schema_migrations")).rows[0].count, 28);
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM manekineko_newsletter_subscribers")).rows[0].count, 0);
    const configuredText = await readFile(envPath, "utf8");
    const configured = parseEnv(configuredText);
    assert.equal(configured.NEXT_PUBLIC_WEB_URL, "https://web.example.invalid");
    assert.equal(configured.UNRELATED_VALUE, "preserve me");
    assert.ok(configured.NEWSLETTER_IP_HASH_SECRET.length >= 32);
    assert.equal((await stat(envPath)).mode & 0o077, 0);
    const rolePassword = (await cluster.query("SELECT rolpassword FROM pg_authid WHERE rolname=$1", [NEWSLETTER_ROLE])).rows[0].rolpassword;
    assert.deepEqual(await setup(true), { applied: true, roleExists: true });
    assert.equal(await readFile(envPath, "utf8"), configuredText);
    assert.equal((await cluster.query("SELECT rolpassword FROM pg_authid WHERE rolname=$1", [NEWSLETTER_ROLE])).rows[0].rolpassword, rolePassword);
    assert.deepEqual(await roleState(), previousRoles);
    assert.deepEqual(await setup(), { applied: true, roleExists: true });

    const runtime = connect(configured.NEWSLETTER_DATABASE_URL);
    await runtime.connect();
    try {
      await assert.rejects(runtime.query("SELECT email FROM manekineko_newsletter_subscribers"), { code: "42501" });
      await assert.rejects(runtime.query("SELECT * FROM manekineko_launch_users"), { code: "42501" });
      await runtime.query("BEGIN");
      assert.equal((await runtime.query("INSERT INTO manekineko_newsletter_subscribers(email) VALUES($1) ON CONFLICT DO NOTHING", ["setup-test@example.invalid"])).rowCount, 1);
      assert.equal((await runtime.query("INSERT INTO manekineko_newsletter_subscribers(email) VALUES($1) ON CONFLICT DO NOTHING", ["setup-test@example.invalid"])).rowCount, 0);
      await runtime.query("ROLLBACK");
    } finally { await runtime.end(); }

    const missingPath = pathToFileURL(join(folder, ".env.missing-credentials"));
    await writeFile(missingPath, originalEnv, { mode: 0o600 });
    await assert.rejects(setup(true, missingPath), /matching private Landing credentials are unavailable/);
    assert.equal(await readFile(missingPath, "utf8"), originalEnv);
    const invalidPath = pathToFileURL(join(folder, ".env.wrong-target"));
    await writeFile(invalidPath, configuredText.replace(host, "wrong.example.test"), { mode: 0o600 });
    await assert.rejects(setup(true, invalidPath), /does not match the dedicated staging role/);
    await admin.query(`COMMENT ON ROLE "${NEWSLETTER_ROLE}" IS 'Unrelated existing role'`);
    await assert.rejects(setup(true), /does not belong to this setup/);
    assert.equal(await readFile(envPath, "utf8"), configuredText);
    assert.equal((await cluster.query("SELECT rolpassword FROM pg_authid WHERE rolname=$1", [NEWSLETTER_ROLE])).rows[0].rolpassword, rolePassword);
    assert.deepEqual(await roleState(), previousRoles);
  } finally {
    await admin.end().catch(() => {});
    if (createdDatabase) await cluster.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    if (createdOwner) {
      await cluster.query(`DROP ROLE IF EXISTS "${NEWSLETTER_ROLE}"`);
      if (createdWeb) await cluster.query(`DROP ROLE "${WEB_ROLE}"`);
      if (createdLaunch) await cluster.query(`DROP ROLE "${LAUNCH_ROLE}"`);
      await cluster.query(`DROP ROLE "${owner}"`);
    }
    await cluster.end().catch(() => {});
    await rm(folder, { recursive: true, force: true });
  }
});
