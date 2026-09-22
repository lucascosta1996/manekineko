import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";
import { updateLaunchAutomation } from "../apps/launch/lib/launch-automation-store.ts";
import { loadNamedSeasonCatalog } from "./season-catalog.mjs";

// This task changes only the original, editable local launch catalog.
// Prepared instructions and deployed collection identities are never rewritten.
const target = new URL(process.env.DATABASE_URL);
assert.equal(target.hostname, "127.0.0.1");
assert.equal(target.port, "54329");
assert.equal(target.pathname, "/manekineko");
const apply = process.argv.includes("--apply");
const seasons = await loadNamedSeasonCatalog();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const updates = [];
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('manekineko:seasons.json:import',0))");
  const actors = (await db.query("SELECT id FROM manekineko_launch_users WHERE username='operator' AND disabled_at IS NULL FOR SHARE")).rows;
  assert.equal(actors.length, 1);
  for (const season of seasons) {
    const seasonId = `0x${createHash("sha256").update(`manekineko:seasons.json:chain:1:season:${season.season}`).digest("hex")}`;
    const rows = (await db.query("SELECT id,plan,status,revision FROM manekineko_launch_automations WHERE plan->>'seasonId'=$1 AND plan->>'chainId'='1' FOR UPDATE", [seasonId])).rows;
    assert.equal(rows.length, 1, `Expected one saved draft for season ${season.season}.`);
    const saved = rows[0];
    assert.equal(saved.status, "draft", "Prepared seasons cannot be renamed.");
    assert.equal(saved.plan.name, season.theme);
    assert.equal(saved.plan.steps.length, season.namedCollections.length);
    const plan = structuredClone(saved.plan);
    let changed = 0;
    plan.steps.forEach((step, index) => {
      const { color, name } = season.namedCollections[index];
      assert.equal(step.payload.contract.collectionColor, color);
      assert([color, name].includes(step.payload.contract.name), "A customized name needs review; refusing to overwrite it.");
      assert([color, name].includes(step.label), "A customized label needs review; refusing to overwrite it.");
      if (step.payload.contract.name !== name || step.label !== name) changed++;
      step.payload.contract.name = name;
      step.label = name;
    });
    const preserved = structuredClone(plan);
    preserved.steps.forEach((step, index) => {
      step.payload.contract.name = saved.plan.steps[index].payload.contract.name;
      step.label = saved.plan.steps[index].label;
    });
    assert.deepEqual(preserved, saved.plan, "Only names and collection labels may change.");
    if (changed) updates.push({ saved, plan, changed });
  }
  if (apply && updates.length) {
    const directory = new URL("../.vercel/collection-names/", import.meta.url);
    await mkdir(directory, { recursive: true });
    const snapshot = JSON.stringify(updates.map(item => item.saved), null, 2) + "\n";
    const hash = createHash("sha256").update(snapshot).digest("hex");
    await writeFile(new URL(`before-${hash}.json`, directory), snapshot, { mode: 0o600, flag: "wx" });
    for (const { saved, plan } of updates) {
      const result = await updateLaunchAutomation(db, { userId: actors[0].id }, saved.id, { plan, revision: saved.revision });
      assert.deepEqual(result.plan, plan);
      assert.equal(result.revision, saved.revision + 1);
    }
  }
  await db.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(JSON.stringify({ mode: apply ? "applied to local launch drafts" : "dry run", seasons: updates.length, collections: updates.reduce((sum, item) => sum + item.changed, 0), onlyNamesAndLabelsChanged: true }, null, 2));
} catch (error) {
  await db.query("ROLLBACK").catch(() => {});
  throw error;
} finally { await db.end(); }
