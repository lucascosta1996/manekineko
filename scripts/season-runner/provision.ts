import { pathToFileURL } from "node:url";
import pg from "pg";
import type { Pool } from "pg";

export type RuntimeRoles = { launchRole: string; webRole: string; workerRole: string };
const runtimeTables = ["profiles", "runs", "actions", "events", "public"].map(name => `manekineko_season_runtime_${name}`);
const indexedTables = ["manekineko_indexer_checkpoints", "manekineko_chain_events", "manekineko_collection_state", "manekineko_collection_awards", "manekineko_collection_history", "manekineko_history_winners"];
function roleName(value: string): string {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(value) || value.startsWith("pg_") || value === "public") throw new Error("Use explicit existing application role names, without PostgreSQL reserved roles.");
  return `"${value}"`;
}
const table = (value: string) => `public."${value}"`;

/** Add runtime access to existing Web/Launch roles and reset a dedicated worker
 * role to its execution/indexer privileges. Does not create users or passwords. */
export async function grantRuntimeRoles(pool: Pool, roles: RuntimeRoles): Promise<void> {
  const names = [roles.launchRole, roles.webRole, roles.workerRole], [launch, web, worker] = names.map(roleName);
  if (new Set(names).size !== 3) throw new Error("Launch, Web and worker must use three different roles.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = (await client.query("SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[])", [names])).rows;
    if (existing.length !== 3 || existing.some(role => role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolbypassrls)) throw new Error("Provision existing restricted application roles only; elevated or missing roles are rejected.");
    const owner = (await client.query("SELECT current_user AS role,current_database() AS database")).rows[0];
    if (names.includes(owner.role)) throw new Error("Use an administrative connection separate from all runtime roles.");
    for (const name of runtimeTables) {
      const found = (await client.query("SELECT to_regclass($1) AS relation", [`public.${name}`])).rows[0];
      if (!found.relation) throw new Error("Apply migration 024 before provisioning runtime roles.");
    }
    await client.query(`GRANT CONNECT ON DATABASE "${owner.database.replaceAll('"', '""')}" TO ${launch},${web},${worker}`);
    await client.query(`REVOKE ALL ON SCHEMA public FROM ${worker}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${launch},${web},${worker}`);
    // The dedicated worker cannot inherit unrelated credentials via old direct grants.
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${worker}`);
    await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${worker}`);
    const columns = (await client.query("SELECT c.relname,array_agg(a.attname::text ORDER BY a.attnum) AS columns FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname")).rows;
    for (const entry of columns) await client.query(`REVOKE ALL(${entry.columns.map((name: string) => `"${name.replaceAll('"', '""')}"`).join(",")}) ON ${table(entry.relname)} FROM ${worker}${runtimeTables.includes(entry.relname) ? `,${web}` : ""}`);
    await client.query(`REVOKE ALL ON ${runtimeTables.map(table).join(",")} FROM ${web}`);
    await client.query(`GRANT SELECT ON public.manekineko_season_runtime_public TO ${web}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE ON public.manekineko_season_runtime_profiles TO ${launch}`);
    await client.query(`GRANT SELECT,INSERT ON public.manekineko_season_runtime_runs TO ${launch}`);
    await client.query(`GRANT UPDATE(status,desired_state,profile_revision,revision,updated_by,last_error) ON public.manekineko_season_runtime_runs TO ${launch}`);
    await client.query(`GRANT SELECT(id,run_id,action_key,kind,status,tx_hash,result,last_error,created_at,updated_at) ON public.manekineko_season_runtime_actions TO ${launch}`);
    await client.query(`GRANT SELECT,INSERT ON public.manekineko_season_runtime_events TO ${launch}`);
    await client.query(`GRANT SELECT,UPDATE(payload) ON public.manekineko_season_runtime_public TO ${launch}`);
    await client.query(`GRANT USAGE ON SEQUENCE public.manekineko_season_runtime_events_id_seq TO ${launch},${worker}`);
    await client.query(`GRANT SELECT ON public.manekineko_launch_automations,public.manekineko_season_runtime_profiles TO ${worker}`);
    await client.query(`GRANT SELECT,UPDATE ON public.manekineko_season_runtime_runs TO ${worker}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE ON public.manekineko_season_runtime_actions,public.manekineko_season_runtime_public TO ${worker}`);
    await client.query(`GRANT SELECT,INSERT ON public.manekineko_season_runtime_events TO ${worker}`);
    await client.query(`GRANT SELECT,INSERT ON public.manekineko_networks,public.manekineko_series,public.manekineko_collections,public.manekineko_deployments,public.manekineko_affiliate_programs TO ${worker}`);
    await client.query(`GRANT UPDATE(updated_at) ON public.manekineko_collections,public.manekineko_deployments TO ${worker}`);
    await client.query(`GRANT UPDATE(enrollment_enabled) ON public.manekineko_affiliate_programs TO ${worker}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${indexedTables.map(table).join(",")} TO ${worker}`);
    await client.query(`GRANT EXECUTE ON FUNCTION public.manekineko_launch_payload_version(jsonb) TO ${launch}`);
    // Membership/ownership grants must not defeat the intended boundary.
    for (const name of runtimeTables.filter(name => !name.endsWith("_public"))) {
      const inherited = (await client.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE') AS allowed", [roles.webRole, `public.${name}`])).rows[0];
      if (inherited.allowed) throw new Error("Web still inherits private runtime access. Remove the role membership before provisioning.");
    }
    for (const name of ["manekineko_launch_users", "manekineko_launch_sessions"]) {
      const inherited = (await client.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE') AS allowed", [roles.workerRole, `public.${name}`])).rows[0];
      if (inherited.allowed) throw new Error("The worker still inherits authentication access. Remove the role membership before provisioning.");
    }
    for (const [name, column] of [["manekineko_collections", "mint_price_wei"], ["manekineko_deployments", "contract_address"], ["manekineko_affiliate_programs", "enrollment_signer"]]) {
      const inherited = (await client.query("SELECT has_column_privilege($1,$2,$3,'UPDATE') AS allowed", [roles.workerRole, `public.${name}`, column])).rows[0];
      if (inherited.allowed) throw new Error("The worker still inherits permission to change immutable contract terms. Remove that membership before provisioning.");
    }
    const ddl = (await client.query("SELECT has_schema_privilege($1,'public','CREATE') OR has_database_privilege($1,current_database(),'CREATE') AS allowed", [roles.workerRole])).rows[0];
    if (ddl.allowed) throw new Error("The worker must not own the database or inherit schema creation privileges.");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export function runtimeProvisionConnection(env: Record<string, string | undefined>): string {
  const raw = env.SEASON_RUNNER_DATABASE_ADMIN_URL;
  if (!raw || !env.SEASON_RUNNER_EXPECTED_DATABASE_HOST || !env.SEASON_RUNNER_EXPECTED_DATABASE_NAME) throw new Error("Set SEASON_RUNNER_DATABASE_ADMIN_URL and the explicit expected database host/name before provisioning.");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Invalid administrative database configuration."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== env.SEASON_RUNNER_EXPECTED_DATABASE_HOST || decodeURIComponent(url.pathname.slice(1)) !== env.SEASON_RUNNER_EXPECTED_DATABASE_NAME) throw new Error("The administrative database does not match its pinned host/name.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && (url.searchParams.getAll("sslmode").length !== 1 || url.searchParams.get("sslmode") !== "verify-full")) throw new Error("Remote administrative connections require sslmode=verify-full.");
  return raw;
}

async function main() {
  const args = process.argv.slice(2), options = new Map<string, string>();
  const execute = args.includes("--execute");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--execute") continue;
    if (!["--launch-role", "--web-role", "--worker-role"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw new Error("Usage: provision.ts --launch-role NAME --web-role NAME --worker-role NAME [--execute]");
    options.set(args[i], args[++i]);
  }
  const roles = { launchRole: options.get("--launch-role") ?? "", webRole: options.get("--web-role") ?? "", workerRole: options.get("--worker-role") ?? "" };
  Object.values(roles).forEach(roleName); runtimeProvisionConnection(process.env);
  if (!execute) { console.log("Runtime role configuration validated. No database changes. Add --execute to grant access to these existing roles."); return; }
  const pool = new pg.Pool({ connectionString: runtimeProvisionConnection(process.env), max: 1 });
  try { await grantRuntimeRoles(pool, roles); console.log("Runtime role grants applied: public-only Web reads, authenticated Launch controls, dedicated worker/indexer access."); }
  finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error("Runtime role provisioning failed. Check the pinned database, migration 024, existing restricted roles and administrative permissions. Provider diagnostics are withheld to protect credentials."); process.exitCode = 1; });
