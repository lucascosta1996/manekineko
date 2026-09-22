import pg from "pg";
import { loadStagingDatabaseConfig, inspectStagingDatabase, WEB_ROLE } from "./staging-database.mjs";

// Add only the two read permissions the gallery needs. Existing admission and
// indexer permissions are deliberately left untouched. Never use a production URL.
const tables = ["manekineko_chain_events", "manekineko_indexer_checkpoints"];
const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => arg !== "--apply")) {
  console.error("Usage: node scripts/setup-nft-gallery-staging.mjs [--apply]");
  process.exitCode = 1;
} else {
  let client, runtime;
  try {
    const config = await loadStagingDatabaseConfig();
    client = new pg.Client({ connectionString: config.admin.connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
    await client.connect();
    if (!(await inspectStagingDatabase(client, config)).initialized) throw new Error("Staging is not initialized.");
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL lock_timeout = '5s'");
      if (args.includes("--apply")) {
        await client.query(`GRANT SELECT ON public.manekineko_chain_events, public.manekineko_indexer_checkpoints TO "${WEB_ROLE}"`);
      }
      for (const table of tables) {
        const { rows: [access] } = await client.query(`SELECT has_table_privilege($1,$2,'SELECT') AS readable,
          has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS writable,
          has_any_column_privilege($1,$2,'INSERT,UPDATE,REFERENCES') AS column_writable`, [WEB_ROLE, `public.${table}`]);
        if (access.writable || access.column_writable) throw new Error("Unexpected write access.");
        console.log(`${table}: SELECT ${access.readable ? "enabled" : "missing"}; writes disabled.`);
        if (!access.readable) process.exitCode = 1;
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    if (!process.exitCode) {
      runtime = new pg.Client({ connectionString: config.web.connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
      await runtime.connect();
      for (const table of tables) await runtime.query(`SELECT 1 FROM public.${table} LIMIT 1`);
      console.log("Gallery reads verified using the restricted staging web role.");
    }
  } catch {
    console.error("NFT gallery staging permissions could not be verified. Provider details withheld to protect credentials.");
    process.exitCode = 1;
  } finally {
    await runtime?.end().catch(() => {});
    await client?.end().catch(() => {});
  }
}
