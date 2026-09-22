import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import pg from "pg";
import { loadStagingDatabaseConfig, inspectStagingDatabase, migrateStagingDatabase, stagingDatabaseErrorMessage } from "./staging-database.mjs";
import { createSepoliaMockSeasons } from "../apps/launch/lib/sepolia-mock-seasons.ts";

const apply = process.argv.includes("--apply");
assert(process.argv.slice(2).every(arg => arg === "--apply"), "Use --apply or no arguments for a read-only preview.");
const config = await loadStagingDatabaseConfig();
const pool = new pg.Pool({ connectionString: config.admin.connectionString, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
const db = await pool.connect();
try {
  await inspectStagingDatabase(db, config);
  const records = (await db.query("SELECT * FROM manekineko_launch_automations ORDER BY id")).rows;
  const finalized = (await db.query("SELECT * FROM manekineko_launch_configurations WHERE status='finalized' ORDER BY id")).rows;
  const profiles = (await db.query("SELECT chain_id,revision FROM manekineko_season_runtime_profiles ORDER BY chain_id")).rows;
  const users = (await db.query("SELECT id FROM manekineko_launch_users WHERE disabled_at IS NULL ORDER BY created_at LIMIT 2")).rows;
  assert.equal(users.length, 1, "This script requires exactly one active Launch operator; otherwise use the authenticated console.");
  const sources = records.filter(record => record.plan.chainId === "1");
  const expected = sources.filter(source => !records.some(record => record.mock_source_id === source.id));
  const preview = { mainnetSeasons: sources.length, mainnetCollections: sources.reduce((sum, row) => sum + row.plan.steps.length, 0), missingSepoliaSeasons: expected.length, xConfigured: profiles.some(profile => profile.chain_id === "11155111") };
  if (!apply) console.log(JSON.stringify({ mode: "dry run", ...preview }));
  else {
    const applied = new Set((await db.query("SELECT name FROM manekineko_schema_migrations")).rows.map(row => row.name));
    const pending = (await readdir(new URL("../database/migrations/", import.meta.url))).filter(name => name.endsWith(".sql") && !applied.has(name));
    assert(pending.every(name => name === "027_sepolia_mock_seasons.sql"), "Apply and verify prerequisite migrations first.");
    const backup = JSON.stringify({ records, finalized }, null, 2);
    const dir = new URL("../.vercel/sepolia-mocks/", import.meta.url); await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(new URL(`before-${createHash("sha256").update(backup).digest("hex")}.json`, dir), backup, { mode: 0o600, flag: "w" });
    await migrateStagingDatabase(db, () => {});
    const result = await createSepoliaMockSeasons(pool, { userId: users[0].id });
    const after = (await db.query("SELECT * FROM manekineko_launch_automations ORDER BY id")).rows;
    for (const before of records) {
      const saved = after.find(row => row.id === before.id);
      assert(saved);
      for (const key of Object.keys(before)) assert.deepEqual(saved[key], before[key], `Existing season changed: ${key}`);
    }
    assert.deepEqual((await db.query("SELECT * FROM manekineko_launch_configurations WHERE status='finalized' ORDER BY id")).rows, finalized);
    assert.deepEqual((await db.query("SELECT chain_id,revision FROM manekineko_season_runtime_profiles ORDER BY chain_id")).rows, profiles);
    assert.equal(after.filter(row => row.mock_source_id).length, sources.length);
    console.log(JSON.stringify({ mode: "applied", ...preview, ...result, existingSnapshotsPreserved: true, blockchainTransactions: 0, xPosts: 0 }));
  }
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : stagingDatabaseErrorMessage(error)); process.exitCode = 1;
} finally { db.release(); await pool.end(); }
