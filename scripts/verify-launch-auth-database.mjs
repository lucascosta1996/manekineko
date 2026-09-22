import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { hashLaunchPassword, launchSessionDigest, newLaunchSessionToken } from "../apps/launch/lib/launch-auth-policy.ts";
import { authenticateLaunchUser, LAUNCH_LOGIN_LIMIT_SQL, lookupLaunchSession, revokeLaunchSession } from "../apps/launch/lib/launch-auth-store.ts";

if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname)) {
  throw new Error("Launch authentication database regressions require a local PostgreSQL instance.");
}
const schema = `manekineko_launch_auth_test_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "manekineko-launch-auth-regression" });
let pool;
let connected = false;
let created = false;
let checks = 0;
const env = { NODE_ENV: "test", LAUNCH_RATE_LIMIT_SECRET: "isolated-launch-auth-regression-secret" };
async function pass(name, callback) { await callback(); checks++; console.log(`PASS ${name}`); }
try {
  await admin.connect();
  connected = true;
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12, options: `-c search_path=${schema},public`, application_name: "manekineko-launch-auth-regression" });
  await pool.query(await readFile(new URL("../database/migrations/009_launch_auth.sql", import.meta.url), "utf8"));
  const userId = randomUUID(), password = "regression-account-password-that-is-never-production";
  await pool.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,'operator',$2)", [userId, await hashLaunchPassword(password)]);
  let login;
  await pass("a real password issues an opaque session and stores only its digest", async () => {
    login = await authenticateLaunchUser(pool, { username: "Operator", password }, "regression-network", undefined, env);
    assert.deepEqual(login.user, { userId, username: "operator" });
    assert.deepEqual(await lookupLaunchSession(pool, login.token), login.user);
    const stored = (await pool.query("SELECT token_hash FROM manekineko_launch_sessions")).rows[0];
    assert.equal(stored.token_hash, launchSessionDigest(login.token));
    assert.notEqual(stored.token_hash, login.token);
  });
  await pass("wrong passwords and unknown accounts return the same credentials error", async () => {
    for (const username of ["operator", "missing-account"]) {
      await assert.rejects(() => authenticateLaunchUser(pool, { username, password: "incorrect-password" }, "regression-network", undefined, env), error => error.code === "invalid_credentials" && error.status === 401);
    }
    assert.equal((await pool.query("SELECT count(*) FROM manekineko_launch_sessions")).rows[0].count, "1");
  });
  await pass("random, malformed and expired tokens cannot authenticate", async () => {
    assert.equal(await lookupLaunchSession(pool, "malformed"), null);
    assert.equal(await lookupLaunchSession(pool, newLaunchSessionToken()), null);
    await pool.query("UPDATE manekineko_launch_sessions SET created_at=now()-interval '9 hours',expires_at=now()-interval '1 hour' WHERE token_hash=$1", [launchSessionDigest(login.token)]);
    assert.equal(await lookupLaunchSession(pool, login.token), null);
  });
  await pass("idle sessions expire even before their absolute expiry", async () => {
    const token = newLaunchSessionToken();
    await pool.query("INSERT INTO manekineko_launch_sessions(token_hash,user_id,created_at,last_seen_at,expires_at) VALUES($1,$2,now()-interval '1 hour',now()-interval '31 minutes',now()+interval '1 hour')", [launchSessionDigest(token), userId]);
    assert.equal(await lookupLaunchSession(pool, token), null);
  });
  await pass("disabled operators lose active access immediately", async () => {
    const token = newLaunchSessionToken();
    await pool.query("INSERT INTO manekineko_launch_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [launchSessionDigest(token), userId]);
    await pool.query("UPDATE manekineko_launch_users SET disabled_at=now() WHERE id=$1", [userId]);
    assert.equal(await lookupLaunchSession(pool, token), null);
    await assert.rejects(() => authenticateLaunchUser(pool, { username: "operator", password }, "regression-network", undefined, env), error => error.code === "invalid_credentials");
    await pool.query("UPDATE manekineko_launch_users SET disabled_at=NULL WHERE id=$1", [userId]);
  });
  await pass("login rotates an existing browser session and logout revokes the replacement", async () => {
    const previous = newLaunchSessionToken();
    await pool.query("INSERT INTO manekineko_launch_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [launchSessionDigest(previous), userId]);
    const current = await authenticateLaunchUser(pool, { username: "operator", password }, "regression-network", previous, env);
    assert.equal(await lookupLaunchSession(pool, previous), null);
    assert.deepEqual(await lookupLaunchSession(pool, current.token), { userId, username: "operator" });
    await revokeLaunchSession(pool, current.token);
    assert.equal(await lookupLaunchSession(pool, current.token), null);
  });
  await pass("atomic quotas admit exactly the allowed number of concurrent attempts", async () => {
    const subject = "a".repeat(64);
    const results = await Promise.all(Array.from({ length: 30 }, () => pool.query(LAUNCH_LOGIN_LIMIT_SQL, ["account", subject, 3, 900])));
    assert.equal(results.reduce((count, result) => count + result.rowCount, 0), 3);
    assert.equal((await pool.query("SELECT attempts FROM manekineko_launch_login_limits WHERE scope='account' AND subject_hash=$1", [subject])).rows[0].attempts, 3);
    await pool.query("UPDATE manekineko_launch_login_limits SET window_started_at=now()-interval '16 minutes' WHERE scope='account' AND subject_hash=$1", [subject]);
    assert.equal((await pool.query(LAUNCH_LOGIN_LIMIT_SQL, ["account", subject, 3, 900])).rows[0].attempts, 1);
  });
  await pass("a throttled network fails before password verification and creates no session", async () => {
    const count = (await pool.query("SELECT count(*) FROM manekineko_launch_sessions")).rows[0].count;
    await pool.query("UPDATE manekineko_launch_login_limits SET attempts=15 WHERE scope='network'");
    await assert.rejects(() => authenticateLaunchUser(pool, { username: "operator", password }, "regression-network", undefined, env), error => error.code === "too_many_attempts" && error.status === 429);
    assert.equal((await pool.query("SELECT count(*) FROM manekineko_launch_sessions")).rows[0].count, count);
  });
  await pass("password reset transaction invalidates sessions and old passwords", async () => {
    const replacementPassword = "replacement-password-for-isolated-regression";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE manekineko_launch_users SET password_hash=$2,updated_at=now() WHERE id=$1", [userId, await hashLaunchPassword(replacementPassword)]);
      await client.query("DELETE FROM manekineko_launch_sessions WHERE user_id=$1", [userId]);
      await client.query("COMMIT");
    } finally { client.release(); }
    await pool.query("DELETE FROM manekineko_launch_login_limits");
    assert.equal(await lookupLaunchSession(pool, login.token), null);
    await assert.rejects(() => authenticateLaunchUser(pool, { username: "operator", password }, "regression-network", undefined, env), error => error.code === "invalid_credentials");
    assert.equal((await authenticateLaunchUser(pool, { username: "operator", password: replacementPassword }, "regression-network", undefined, env)).user.userId, userId);
  });
  console.log(`Launch authentication PostgreSQL checks passed: ${checks}. Application data was not changed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Launch authentication database checks failed.");
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
  try { if (connected && created) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
  finally { await admin.end(); }
}
