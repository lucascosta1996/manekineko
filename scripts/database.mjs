import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const mode = process.argv[2];
if (!["migrate", "seed", "setup"].includes(mode)) {
  throw new Error("Usage: node scripts/database.mjs migrate|seed|setup");
}
if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL or copy apps/web/.env.example to apps/web/.env.local first.");
}
const root = new URL("../database/", import.meta.url);
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  application_name: "manekineko-database-setup",
});

try {
  await client.connect();
  // Serialize setup runs, including repeatable seeds, without locking app reads.
  await client.query("SELECT pg_advisory_lock(1835101797, 2026)");
  if (mode !== "seed") {
    await client.query(`CREATE TABLE IF NOT EXISTS manekineko_schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = new Map((await client.query("SELECT name, checksum FROM manekineko_schema_migrations")).rows.map((r) => [r.name, r.checksum]));
    const migrations = (await readdir(new URL("migrations/", root))).filter((name) => name.endsWith(".sql")).sort();
    for (const name of migrations) {
      const sql = await readFile(new URL(`migrations/${name}`, root), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) throw new Error(`Applied migration changed: ${name}. Add a new migration instead.`);
        console.log(`Already applied: ${name}`);
        continue;
      }
      // Include the ledger entry inside the migration's final commit, so an
      // interrupted setup cannot apply a migration without recording its checksum.
      if (!/^BEGIN;\s*$/m.test(sql) || !/COMMIT;\s*$/.test(sql)) {
        throw new Error(`Migration must own a BEGIN/COMMIT transaction: ${name}`);
      }
      const trackedSql = sql.replace(/COMMIT;\s*$/, `INSERT INTO manekineko_schema_migrations (name, checksum) VALUES (${client.escapeLiteral(name)}, ${client.escapeLiteral(checksum)});\nCOMMIT;\n`);
      await client.query(trackedSql);
      console.log(`Applied: ${name}`);
    }
  }
  if (mode !== "migrate") {
    const seeds = (await readdir(new URL("seeds/", root))).filter((name) => name.endsWith(".sql")).sort();
    for (const name of seeds) {
      await client.query(await readFile(new URL(`seeds/${name}`, root), "utf8"));
      console.log(`Seeded: ${name}`);
    }
  }
  console.log(`Database ${mode} complete (${fileURLToPath(root)}).`);
} catch (error) {
  // Avoid logging connection URLs, credentials, or full database row contents.
  console.error(error instanceof Error ? error.message : "Database setup failed.");
  process.exitCode = 1;
} finally {
  await client.end();
}
