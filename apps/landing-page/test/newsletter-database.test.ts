import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { NEWSLETTER_INSERT_SQL, NEWSLETTER_RATE_LIMIT, NEWSLETTER_RATE_SQL } from "../lib/newsletter";

test("newsletter migration and restricted runtime preserve private subscriber data", {
  skip: !process.env.NEWSLETTER_DATABASE_TEST_URL && "Set NEWSLETTER_DATABASE_TEST_URL to a disposable local PostgreSQL cluster.",
}, async () => {
  const { migrateStagingDatabase } = await import("../../../scripts/staging-database.mjs");
  const supplied = new URL(process.env.NEWSLETTER_DATABASE_TEST_URL!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(supplied.hostname), "Database integration tests must stay local.");
  const database = `newsletter_test_${randomUUID().replaceAll("-", "")}`;
  const role = `newsletter_${randomUUID().replaceAll("-", "")}`;
  const cluster = new pg.Client({ connectionString: supplied.href });
  const adminUrl = new URL(supplied); adminUrl.pathname = `/${database}`;
  const runtimeUrl = new URL(adminUrl); runtimeUrl.username = role; runtimeUrl.password = "isolated-newsletter-runtime-only";
  const admin = new pg.Client({ connectionString: adminUrl.href });
  const runtime = new pg.Client({ connectionString: runtimeUrl.href });
  const concurrentRuntime = new pg.Pool({ connectionString: runtimeUrl.href, max: 6 });
  let createdDatabase = false;
  let createdRole = false;
  try {
    await cluster.connect();
    await cluster.query(`CREATE DATABASE "${database}"`); createdDatabase = true;
    await admin.connect();
    await migrateStagingDatabase(admin, () => {});
    const migration = "028_landing_newsletter.sql";
    const sql = await readFile(new URL(`../../../database/migrations/${migration}`, import.meta.url), "utf8");
    const expectedHash = createHash("sha256").update(sql).digest("hex");
    assert.equal((await admin.query("SELECT checksum FROM manekineko_schema_migrations WHERE name=$1", [migration])).rows[0].checksum, expectedHash);
    await migrateStagingDatabase(admin, () => {});
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM manekineko_schema_migrations WHERE name=$1", [migration])).rows[0].count, 1);

    await admin.query(`CREATE ROLE "${role}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'isolated-newsletter-runtime-only'`);
    createdRole = true;
    await admin.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
    await admin.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    await admin.query(`GRANT CONNECT ON DATABASE "${database}" TO "${role}"`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await admin.query(`GRANT INSERT(email) ON manekineko_newsletter_subscribers TO "${role}"`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON manekineko_newsletter_rate_limits TO "${role}"`);
    await runtime.connect();

    const email = "newsletter-test@example.invalid";
    assert.equal((await runtime.query(NEWSLETTER_INSERT_SQL, [email])).rowCount, 1);
    const original = (await admin.query("SELECT * FROM manekineko_newsletter_subscribers WHERE email=$1", [email])).rows[0];
    assert.equal((await runtime.query(NEWSLETTER_INSERT_SQL, [email])).rowCount, 0);
    const after = (await admin.query("SELECT * FROM manekineko_newsletter_subscribers WHERE email=$1", [email])).rows;
    assert.equal(after.length, 1);
    assert.deepEqual(after[0], original, "Duplicate registration must not rewrite consent or subscription time.");
    assert.equal(original.source, "landing");
    assert.equal(original.consent_version, "launch-updates-v1");
    await assert.rejects(runtime.query(NEWSLETTER_INSERT_SQL, ["Not-Normalized@example.invalid"]), { code: "23514" });

    for (const denied of [
      "SELECT email FROM manekineko_newsletter_subscribers",
      "UPDATE manekineko_newsletter_subscribers SET source='landing'",
      "DELETE FROM manekineko_newsletter_subscribers",
      "INSERT INTO manekineko_newsletter_subscribers(email,source) VALUES('other@example.invalid','landing')",
      "SELECT * FROM manekineko_launch_users",
      "SELECT * FROM manekineko_collections",
      "UPDATE manekineko_collection_state SET total_minted=0",
      "CREATE TABLE public.newsletter_forbidden(id integer)",
    ]) await assert.rejects(runtime.query(denied), { code: "42501" });

    const subjectHash = "a".repeat(64);
    const attempts = await Promise.all(Array.from({ length: 6 }, () => concurrentRuntime.query(NEWSLETTER_RATE_SQL, [subjectHash, NEWSLETTER_RATE_LIMIT])));
    assert.deepEqual(attempts.filter((result) => result.rowCount).map((result) => result.rows[0].attempts).sort(), [1, 2, 3, 4, 5]);
    assert.equal(attempts.filter((result) => result.rowCount === 0).length, 1);
    await admin.query("UPDATE manekineko_newsletter_rate_limits SET window_started_at=clock_timestamp()-interval '11 minutes' WHERE subject_hash=$1", [subjectHash]);
    assert.equal((await runtime.query(NEWSLETTER_RATE_SQL, [subjectHash, NEWSLETTER_RATE_LIMIT])).rows[0].attempts, 1);
    await runtime.query("DELETE FROM manekineko_newsletter_rate_limits WHERE subject_hash=$1", [subjectHash]);
  } finally {
    await concurrentRuntime.end().catch(() => {});
    await runtime.end().catch(() => {});
    await admin.end().catch(() => {});
    if (createdDatabase) await cluster.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    if (createdRole) await cluster.query(`DROP ROLE "${role}"`);
    await cluster.end().catch(() => {});
  }
});
