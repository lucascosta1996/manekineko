import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import { grantRuntimeRoles, runtimeProvisionConnection } from "./provision.ts";

test("role provisioning pins the exact administrative database and verifies remote TLS", () => {
  const env = { SEASON_RUNNER_DATABASE_ADMIN_URL: "postgresql://admin:fictional@db.tincta.xyz/tincta?sslmode=verify-full", SEASON_RUNNER_EXPECTED_DATABASE_HOST: "db.tincta.xyz", SEASON_RUNNER_EXPECTED_DATABASE_NAME: "tincta" };
  assert.equal(runtimeProvisionConnection(env), env.SEASON_RUNNER_DATABASE_ADMIN_URL);
  assert.throws(() => runtimeProvisionConnection({ ...env, SEASON_RUNNER_EXPECTED_DATABASE_NAME: "other" }), /pinned/);
  assert.throws(() => runtimeProvisionConnection({ ...env, SEASON_RUNNER_DATABASE_ADMIN_URL: env.SEASON_RUNNER_DATABASE_ADMIN_URL.replace("verify-full", "require") }), /verify-full/);
  assert.throws(() => runtimeProvisionConnection({ ...env, SEASON_RUNNER_DATABASE_ADMIN_URL: `${env.SEASON_RUNNER_DATABASE_ADMIN_URL}&sslmode=disable` }), /verify-full/);
});
const connection = process.env.SEASON_RUNTIME_TEST_DATABASE_URL;
test("runtime privileges expose only public schedules to Web and no authentication credentials to the worker", { skip: !connection }, async () => {
  const url = new URL(connection!); assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const suffix = randomUUID().replaceAll("-", ""), name = `tincta_grants_test_${suffix}`;
  const roles = { launchRole: `tincta_launch_${suffix}`, webRole: `tincta_web_${suffix}`, workerRole: `tincta_worker_${suffix}` };
  const admin = new pg.Client({ connectionString: url.href }), createdRoles: string[] = []; let pool: pg.Pool | undefined, created = false;
  try {
    await admin.connect(); await admin.query(`CREATE DATABASE ${name}`); created = true;
    for (const role of Object.values(roles)) { await admin.query(`CREATE ROLE "${role}" NOLOGIN`); createdRoles.push(role); }
    url.pathname = `/${name}`; pool = new pg.Pool({ connectionString: url.href });
    const migrations = new URL("../../database/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort()) await pool.query(await readFile(new URL(file, migrations), "utf8"));
    await grantRuntimeRoles(pool, roles); await grantRuntimeRoles(pool, roles);
    const client = await pool.connect();
    try {
      await client.query(`SET ROLE "${roles.webRole}"`);
      await client.query("SELECT payload FROM manekineko_season_runtime_public");
      await assert.rejects(() => client.query("SELECT encrypted_credentials FROM manekineko_season_runtime_profiles"), error => (error as { code?: string }).code === "42501");
      await assert.rejects(() => client.query("SELECT state FROM manekineko_season_runtime_runs"), error => (error as { code?: string }).code === "42501");
      await client.query("RESET ROLE"); await client.query(`SET ROLE "${roles.launchRole}"`);
      await client.query("SELECT id,run_id,result FROM manekineko_season_runtime_actions");
      await assert.rejects(() => client.query("SELECT encrypted_raw_transaction FROM manekineko_season_runtime_actions"), error => (error as { code?: string }).code === "42501");
      await client.query("RESET ROLE"); await client.query(`SET ROLE "${roles.workerRole}"`);
      await client.query("SELECT encrypted_credentials FROM manekineko_season_runtime_profiles");
      await client.query("SELECT * FROM manekineko_chain_events");
      await client.query("SELECT * FROM manekineko_collections FOR UPDATE");
      await client.query("SELECT * FROM manekineko_deployments FOR UPDATE");
      await client.query("SELECT * FROM manekineko_affiliate_programs FOR UPDATE");
      await assert.rejects(() => client.query("SELECT password_hash FROM manekineko_launch_users"), error => (error as { code?: string }).code === "42501");
      const terms = (await client.query("SELECT has_column_privilege(current_user,'manekineko_collections','mint_price_wei','UPDATE') AS allowed")).rows[0];
      assert.equal(terms.allowed, false);
      await client.query("RESET ROLE");
    } finally { client.release(); }
  } finally {
    await pool?.end(); if (created) await admin.query(`DROP DATABASE ${name}`);
    for (const role of createdRoles) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  }
});
