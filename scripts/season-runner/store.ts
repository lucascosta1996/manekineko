import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { automationArtifactHash } from "../../apps/launch/lib/launch-automation-artifact.ts";
import { assertRuntimeArtifact } from "../../apps/launch/lib/season-runtime.ts";
import { decryptRuntimeSecret, encryptRuntimeSecret } from "../../apps/launch/lib/season-runtime-crypto.ts";
import type { AutomationArtifact } from "../../apps/launch/lib/launch-automation.ts";
import type { RuntimeRunRow } from "../../apps/launch/lib/season-runtime-store.ts";

export class RunnerStop extends Error { constructor(public code: string) { super(code); this.name = "RunnerStop"; } }
export function ensure(value: unknown, code: string): asserts value { if (!value) throw new RunnerStop(code); }
export type Action = { id: string; action_key: string; kind: string; status: string; payload: Record<string, any>; result: Record<string, any>; last_error: string | null };

/** A dedicated direct PostgreSQL session owns the chain lock for the worker's
 * entire lifetime. A lost session invalidates the worker, never silently reconnects. */
export async function openRunStore(pool: Pool, runId: string, chainId: 1 | 11155111, execute: boolean) {
  const db = await pool.connect(), owner = randomUUID(); let lost = false;
  db.on("error", () => { lost = true; });
  try {
    const locked = await db.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [`tincta-season-chain:${chainId}`]);
    ensure(locked.rows[0].locked, "another_worker_owns_this_network");
    const query = async (sql: string, values?: any[]) => { ensure(!lost, "database_lock_lost"); return db.query(sql, values); };
    const row = (await query("SELECT * FROM manekineko_season_runtime_runs WHERE id=$1 AND chain_id=$2", [runId, String(chainId)])).rows[0] as RuntimeRunRow | undefined;
    ensure(row, "run_not_found_on_selected_network");
    const saved = (await query("SELECT revision,status,prepared_artifact,content_hash,mock_catalog_order FROM manekineko_launch_automations WHERE id=$1", [row.automation_id])).rows[0];
    ensure(saved?.status === "prepared" && saved.revision === row.automation_revision && saved.content_hash === row.prepared_hash && automationArtifactHash(saved.prepared_artifact) === row.prepared_hash, "prepared_artifact_changed");
    const artifact = saved.prepared_artifact as AutomationArtifact;
    assertRuntimeArtifact(artifact, new Date(), false);
    const decrypt = <T>(encrypted: string): T => JSON.parse(decryptRuntimeSecret(encrypted, `run-state:${runId}`));
    const state = row.state.encrypted ? decrypt<Record<string, any>>(String(row.state.encrypted)) : {};
    async function guard() {
      ensure(execute, "read_only_worker");
      const result = await query(`UPDATE manekineko_season_runtime_runs SET lease_owner=$2,lease_expires_at=now()+interval '90 seconds',heartbeat_at=now(),
        status=CASE WHEN status='queued' THEN 'running' ELSE status END
        WHERE id=$1 AND desired_state='running' AND status IN ('queued','running','completed') RETURNING profile_revision,status`, [runId, owner]);
      ensure(result.rowCount, "run_is_paused");
      const profile = (await query("SELECT enabled,revision FROM manekineko_season_runtime_profiles WHERE chain_id=$1", [String(chainId)])).rows[0];
      ensure(profile?.enabled && profile.revision === result.rows[0].profile_revision, "profile_changed_pause_and_resume");
      return result.rows[0] as { profile_revision: number; status: string };
    }
    async function save(next: unknown) {
      ensure(execute, "read_only_worker");
      await query("UPDATE manekineko_season_runtime_runs SET state=$2::jsonb,heartbeat_at=now() WHERE id=$1", [runId, JSON.stringify({ encrypted: encryptRuntimeSecret(JSON.stringify(next), `run-state:${runId}`) })]);
    }
    async function event(event: string, message: string) {
      ensure(execute, "read_only_worker");
      await query("INSERT INTO manekineko_season_runtime_events(run_id,event,message) VALUES($1,$2,$3)", [runId, event, message]);
    }
    async function pause(code: string) {
      if (!execute || lost) return;
      const result = await query("UPDATE manekineko_season_runtime_runs SET desired_state='paused',status=CASE WHEN status='completed' THEN 'completed' ELSE 'paused' END,last_error=$2,revision=revision+1 WHERE id=$1 AND (desired_state<>'paused' OR last_error IS DISTINCT FROM $2)", [runId, code]);
      await query("UPDATE manekineko_season_runtime_public SET payload=jsonb_set(payload,'{status}','\"paused\"'::jsonb) WHERE run_id=$1 AND payload->>'status'<>'completed'", [runId]);
      if (result.rowCount) await event("paused", code);
    }
    async function action(key: string): Promise<Action | undefined> { return (await query("SELECT * FROM manekineko_season_runtime_actions WHERE run_id=$1 AND action_key=$2", [runId, key])).rows[0]; }
    async function putAction(key: string, kind: string, payload: Record<string, any>) {
      await guard();
      await query("INSERT INTO manekineko_season_runtime_actions(id,run_id,action_key,kind,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(run_id,action_key) DO NOTHING", [randomUUID(), runId, key, kind, JSON.stringify(payload)]);
      return (await action(key))!;
    }
    async function updateAction(key: string, status: string, result: Record<string, any>, error: string | null = null) {
      ensure(execute, "read_only_worker");
      await query("UPDATE manekineko_season_runtime_actions SET status=$3,result=$4::jsonb,last_error=$5,updated_at=now() WHERE run_id=$1 AND action_key=$2", [runId, key, status, JSON.stringify(result), error]);
    }
    async function replacePendingAction(key: string, payload: Record<string, any>) {
      await guard();
      const replaced = await query(`UPDATE manekineko_season_runtime_actions SET payload=$3::jsonb,result='{}'::jsonb,status='pending',last_error=NULL,updated_at=now()
        WHERE run_id=$1 AND action_key=$2 AND status IN ('pending','failed') AND payload->>'accountId'=$4 RETURNING *`, [runId, key, JSON.stringify(payload), payload.accountId]);
      ensure(replaced.rowCount === 1, "post_refresh_requires_known_unsent_action");
      return replaced.rows[0] as Action;
    }
    async function publish(payload: Record<string, any>) {
      await guard(); ensure(payload.announcedAt && payload.version === 1, "first_announcement_not_confirmed");
      ensure(typeof payload.updatedAt === "string" && Number.isFinite(Date.parse(payload.updatedAt)), "projection_needs_observation_time");
      await query(`INSERT INTO manekineko_season_runtime_public(run_id,chain_id,season_id,payload,updated_at) VALUES($1,$2,$3,$4::jsonb,$5::timestamptz)
        ON CONFLICT(run_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`, [runId, String(chainId), artifact.seasonId, JSON.stringify(payload), payload.updatedAt]);
    }
    return { db, query, row, artifact, seasonOrder: (saved.mock_catalog_order ?? null) as number | null, state, guard, save, event, pause, action, putAction, updateAction, replacePendingAction, publish,
      async complete() { await guard(); const r = await query("UPDATE manekineko_season_runtime_runs SET status='completed',revision=revision+1 WHERE id=$1 AND status<>'completed'", [runId]); if (r.rowCount) await event("completed", "The season reached its terminal outcome. Confirmed claim monitoring continues."); },
      async close() { try { if (!lost) { if (execute) await query("UPDATE manekineko_season_runtime_runs SET lease_owner=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_owner=$2", [runId, owner]); await query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [`tincta-season-chain:${chainId}`]); } } finally { db.release(lost); } },
    };
  } catch (error) { db.release(true); throw error; }
}
export type RunStore = Awaited<ReturnType<typeof openRunStore>>;
