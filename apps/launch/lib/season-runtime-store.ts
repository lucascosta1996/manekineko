import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { AutomationError, type AutomationArtifact } from "./launch-automation.ts";
import { automationArtifactHash } from "./launch-automation-artifact.ts";
import { configuredLaunchChain, requireLaunchChain, requireSeasonPlanningChain } from "./chain-policy.ts";
import { encryptRuntimeSecret, decryptRuntimeSecret, runtimeEncryptionConfigured } from "./season-runtime-crypto.ts";
import { assertRuntimeArtifact, runtimeId, runtimeProfileInput, runtimeRevision, type RuntimeCredentials, type RuntimeProfile, type RuntimeRun, type RuntimeSnapshot, type RuntimeChainId } from "./season-runtime.ts";
import type { LaunchActor } from "./launch-config-store.ts";

type Query = Pick<Pool, "query">;
export type RuntimeProfileRow = { chain_id: RuntimeChainId; revision: number; enabled: boolean; handle: string; expected_account_id: string; public_base_url: string; encrypted_credentials: string; updated_at: Date };
export type RuntimeRunRow = { id: string; automation_id: string; automation_revision: number; prepared_hash: string; chain_id: RuntimeChainId; profile_revision: number; status: RuntimeRun["status"]; desired_state: RuntimeRun["desiredState"]; revision: number; state: Record<string, unknown>; last_error: string | null; heartbeat_at: Date | null; lease_owner: string | null; lease_expires_at: Date | null; created_at: Date; updated_at: Date };
const profileColumns = "chain_id,revision,enabled,handle,expected_account_id,public_base_url,updated_at";
const runColumns = "id,automation_id,automation_revision,prepared_hash,chain_id,profile_revision,status,desired_state,revision,last_error,heartbeat_at,created_at,updated_at";
function requireRuntimeChain(chainId: RuntimeChainId): void {
  if (!configuredLaunchChain()) throw new AutomationError("runtime_network", "Set MANEKINEKO_CHAIN_ID for this Launch execution environment before running seasons or saving credentials.", 503);
  requireLaunchChain(chainId);
}

export function runtimeProfile(row: Omit<RuntimeProfileRow, "encrypted_credentials">): RuntimeProfile {
  return { chainId: row.chain_id, revision: row.revision, enabled: row.enabled, handle: row.handle, expectedAccountId: row.expected_account_id, publicBaseUrl: row.public_base_url, credentialsConfigured: true, updatedAt: row.updated_at.toISOString() };
}
export function runtimeRun(row: Omit<RuntimeRunRow, "state" | "lease_owner" | "lease_expires_at">): RuntimeRun {
  return { id: row.id, automationId: row.automation_id, automationRevision: row.automation_revision, preparedHash: row.prepared_hash, chainId: row.chain_id, profileRevision: row.profile_revision, status: row.status, desiredState: row.desired_state, revision: row.revision, lastError: row.last_error, heartbeatAt: row.heartbeat_at?.toISOString() ?? null, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}
export async function withRuntimeTransaction<T>(db: Pick<Pool, "connect">, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
async function lockActor(client: Query, actor: LaunchActor): Promise<void> {
  const result = await client.query("SELECT id FROM manekineko_launch_users WHERE id=$1 AND disabled_at IS NULL FOR SHARE", [actor.userId]);
  if (!result.rowCount) throw new AutomationError("inactive_actor", "This launch account is inactive. Sign in again.", 403);
}
async function lockProfile(client: Query, chainId: RuntimeChainId): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`season-profile:${chainId}`]);
}
export async function getRuntimeProfile(db: Query, chainId: RuntimeChainId): Promise<RuntimeProfile | null> {
  const result = await db.query<RuntimeProfileRow>(`SELECT ${profileColumns} FROM manekineko_season_runtime_profiles WHERE chain_id=$1`, [chainId]);
  return result.rows[0] ? runtimeProfile(result.rows[0]) : null;
}
/** Worker-only: the public API must use getRuntimeProfile, never this function. */
export async function getRuntimeWorkerProfile(db: Query, chainId: RuntimeChainId, env: Record<string, string | undefined> = process.env): Promise<{ profile: RuntimeProfile; credentials: RuntimeCredentials }> {
  const result = await db.query<RuntimeProfileRow>("SELECT * FROM manekineko_season_runtime_profiles WHERE chain_id=$1", [chainId]);
  const row = result.rows[0];
  if (!row) throw new AutomationError("runtime_profile", "Configure the X account for this network first.", 409);
  const credentials = JSON.parse(decryptRuntimeSecret(row.encrypted_credentials, `x-profile:${chainId}:${row.expected_account_id}`, env)) as RuntimeCredentials;
  return { profile: runtimeProfile(row), credentials };
}
export async function saveRuntimeProfile(db: Pool, actor: LaunchActor, chainId: RuntimeChainId, input: Record<string, unknown>): Promise<RuntimeProfile> {
  requireRuntimeChain(chainId);
  const value = runtimeProfileInput(input);
  return withRuntimeTransaction(db, async client => {
    await lockActor(client, actor);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('season-profile-identity',0))");
    await lockProfile(client, chainId);
    const shared = await client.query("SELECT chain_id FROM manekineko_season_runtime_profiles WHERE chain_id<>$1 AND (expected_account_id=$2 OR public_base_url=$3) LIMIT 1", [chainId, value.expectedAccountId, value.publicBaseUrl]);
    if (shared.rowCount) throw new AutomationError("runtime_network_identity", "Use a separate Twitter / X account and website for each network.", 409);
    const active = await client.query("SELECT id FROM manekineko_season_runtime_runs WHERE chain_id=$1 AND (status NOT IN ('paused','completed') OR desired_state<>'paused' OR lease_expires_at>now()) LIMIT 1", [chainId]);
    if (active.rowCount) throw new AutomationError("runtime_active", "Pause this network’s seasons and wait for the worker to stop before changing the X account or credentials.", 409);
    const saved = (await client.query<RuntimeProfileRow>("SELECT * FROM manekineko_season_runtime_profiles WHERE chain_id=$1 FOR UPDATE", [chainId])).rows[0];
    if ((saved?.revision ?? 0) !== value.revision) throw new AutomationError("revision_conflict", "This X configuration changed in another session. Reload before saving.", 409);
    if (saved && (saved.expected_account_id !== value.expectedAccountId || saved.public_base_url !== value.publicBaseUrl)) {
      const posted = await client.query("SELECT r.id FROM manekineko_season_runtime_runs r JOIN manekineko_season_runtime_actions a ON a.run_id=r.id WHERE r.chain_id=$1 AND r.status<>'completed' AND (a.result ? 'postId' OR a.status IN ('sending','uncertain')) LIMIT 1", [chainId]);
      if (posted.rowCount) throw new AutomationError("runtime_account_bound", "A started season keeps its announced X account and public website. You can rotate credentials for that account while paused; use a new season after completion to change accounts.", 409);
    }
    if (!value.credentials && !saved) throw new AutomationError("invalid_credentials", "Enter all four OAuth credentials for the first configuration.");
    if (!value.credentials && saved?.expected_account_id !== value.expectedAccountId) throw new AutomationError("invalid_credentials", "Changing the X account requires all four credentials for the new account.");
    const encrypted = value.credentials ? encryptRuntimeSecret(JSON.stringify(value.credentials), `x-profile:${chainId}:${value.expectedAccountId}`) : saved!.encrypted_credentials;
    const result = await client.query<RuntimeProfileRow>(`INSERT INTO manekineko_season_runtime_profiles(chain_id,enabled,handle,expected_account_id,public_base_url,encrypted_credentials,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(chain_id) DO UPDATE SET enabled=EXCLUDED.enabled,handle=EXCLUDED.handle,
      expected_account_id=EXCLUDED.expected_account_id,public_base_url=EXCLUDED.public_base_url,encrypted_credentials=EXCLUDED.encrypted_credentials,
      revision=manekineko_season_runtime_profiles.revision+1,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING ${profileColumns}`,
    [chainId, value.enabled, value.handle, value.expectedAccountId, value.publicBaseUrl, encrypted, actor.userId]);
    return runtimeProfile(result.rows[0]);
  });
}
export async function getSeasonRuntime(db: Query, automationId: string, env: Record<string, string | undefined> = process.env): Promise<RuntimeSnapshot> {
  const saved = (await db.query<{ chain_id: RuntimeChainId }>("SELECT plan->>'chainId' AS chain_id FROM manekineko_launch_automations WHERE id=$1", [runtimeId(automationId)])).rows[0];
  if (!saved) throw new AutomationError("not_found", "Season not found.", 404);
  requireSeasonPlanningChain(saved.chain_id);
  const runRow = (await db.query<RuntimeRunRow>(`SELECT ${runColumns} FROM manekineko_season_runtime_runs WHERE automation_id=$1`, [automationId])).rows[0];
  const profile = await getRuntimeProfile(db, saved.chain_id);
  if (!runRow) return { profile, run: null, events: [], actions: [], encryptionConfigured: runtimeEncryptionConfigured(env) };
  const [events, actions] = await Promise.all([
    db.query<{ id: string; event: string; message: string; created_at: Date }>("SELECT id,event,message,created_at FROM manekineko_season_runtime_events WHERE run_id=$1 ORDER BY id DESC LIMIT 50", [runRow.id]),
    db.query<{ id: string; action_key: string; kind: string; status: string; tx_hash: string | null; post_id: string | null; last_error: string | null; created_at: Date; updated_at: Date }>("SELECT id,action_key,kind,status,tx_hash,CASE WHEN result->>'postId' ~ '^[0-9]{1,30}$' THEN result->>'postId' ELSE NULL END AS post_id,last_error,created_at,updated_at FROM manekineko_season_runtime_actions WHERE run_id=$1 ORDER BY created_at DESC LIMIT 100", [runRow.id]),
  ]);
  return { profile, run: runtimeRun(runRow), encryptionConfigured: runtimeEncryptionConfigured(env), events: events.rows.map(row => ({ id: row.id, event: row.event, message: row.message, createdAt: row.created_at.toISOString() })), actions: actions.rows.map(row => ({ id: row.id, actionKey: row.action_key, kind: row.kind, status: row.status, txHash: row.tx_hash, postId: row.post_id, lastError: row.last_error, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() })) };
}
export async function requestSeasonStart(db: Pool, actor: LaunchActor, automationId: string, input: Record<string, unknown>): Promise<RuntimeRun> {
  const revision = runtimeRevision(input.revision), profileRevision = runtimeRevision(input.profileRevision);
  if (typeof input.preparedHash !== "string" || !/^[a-f0-9]{64}$/.test(input.preparedHash)) throw new AutomationError("invalid_hash", "Reload the prepared season before starting.");
  return withRuntimeTransaction(db, async client => {
    await lockActor(client, actor);
    const saved = (await client.query<{ revision: number; status: string; content_hash: string | null; prepared_artifact: AutomationArtifact | null }>("SELECT revision,status,content_hash,prepared_artifact FROM manekineko_launch_automations WHERE id=$1 FOR SHARE", [runtimeId(automationId)])).rows[0];
    if (!saved || saved.status !== "prepared" || !saved.prepared_artifact || saved.revision !== revision || saved.content_hash !== input.preparedHash) throw new AutomationError("revision_conflict", "Start requires the exact saved prepared season revision and hash.", 409);
    const artifact = saved.prepared_artifact;
    requireRuntimeChain(artifact.chainId);
    if (automationArtifactHash(artifact) !== saved.content_hash) throw new AutomationError("artifact_integrity", "The saved season failed its integrity check.", 500);
    await lockProfile(client, artifact.chainId);
    const existing = (await client.query<RuntimeRunRow>(`SELECT ${runColumns} FROM manekineko_season_runtime_runs WHERE automation_id=$1`, [automationId])).rows[0];
    if (existing) return runtimeRun(existing);
    assertRuntimeArtifact(artifact);
    const profile = await getRuntimeProfile(client, artifact.chainId);
    if (!profile?.enabled || profile.revision !== profileRevision) throw new AutomationError("runtime_profile", "Save and enable the X account for this network, then reload the season.", 409);
    if (!runtimeEncryptionConfigured()) throw new AutomationError("runtime_encryption", "Configure the shared worker encryption key before starting.", 503);
    const run = (await client.query<RuntimeRunRow>(`INSERT INTO manekineko_season_runtime_runs(id,automation_id,automation_revision,prepared_hash,chain_id,profile_revision,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING ${runColumns}`, [randomUUID(), automationId, revision, saved.content_hash, artifact.chainId, profile.revision, actor.userId])).rows[0];
    await client.query("INSERT INTO manekineko_season_runtime_events(run_id,event,message) VALUES($1,'start_requested','Operator requested season execution. Waiting for the version-pinned worker preflight.')", [run.id]);
    return runtimeRun(run);
  });
}
export async function requestSeasonControl(db: Pool, actor: LaunchActor, automationId: string, input: Record<string, unknown>): Promise<RuntimeRun> {
  const revision = runtimeRevision(input.revision);
  if (input.action !== "pause" && input.action !== "resume") throw new AutomationError("invalid_action", "Choose pause or resume.");
  return withRuntimeTransaction(db, async client => {
    await lockActor(client, actor);
    // Same profile lock order as start/profile edits; the row lock protects control revisions.
    const found = (await client.query<{ chain_id: RuntimeChainId }>("SELECT chain_id FROM manekineko_season_runtime_runs WHERE automation_id=$1", [runtimeId(automationId)])).rows[0];
    if (!found) throw new AutomationError("not_found", "No season run exists yet.", 404);
    requireRuntimeChain(found.chain_id); await lockProfile(client, found.chain_id);
    const saved = (await client.query<RuntimeRunRow>("SELECT * FROM manekineko_season_runtime_runs WHERE automation_id=$1 FOR UPDATE", [automationId])).rows[0];
    if (saved.revision !== revision) throw new AutomationError("revision_conflict", "The run changed in another session. Reload before continuing.", 409);
    const profile = await getRuntimeProfile(client, found.chain_id);
    if (input.action === "resume" && (!profile?.enabled || input.profileRevision !== profile.revision)) throw new AutomationError("runtime_profile", "Reload and explicitly review the current X account before resuming.", 409);
    if (input.action === "resume" && saved.lease_expires_at && saved.lease_expires_at.getTime() > Date.now()) throw new AutomationError("runtime_busy", "Wait for the worker to finish pausing before resuming.", 409);
    const resumed = input.action === "resume";
    const result = await client.query<RuntimeRunRow>(`UPDATE manekineko_season_runtime_runs SET desired_state=$2,
      status=CASE WHEN status='completed' THEN 'completed' WHEN $2='running' THEN 'queued' WHEN lease_expires_at>now() THEN status ELSE 'paused' END,
      profile_revision=$3,revision=revision+1,updated_by=$4,last_error=CASE WHEN $2='running' THEN NULL ELSE last_error END
      WHERE id=$1 RETURNING ${runColumns}`, [saved.id, resumed ? "running" : "paused", resumed ? profile!.revision : saved.profile_revision, actor.userId]);
    await client.query("INSERT INTO manekineko_season_runtime_events(run_id,event,message) VALUES($1,$2,$3)", [saved.id, resumed ? "resume_requested" : "pause_requested", resumed ? `Operator requested resume with X profile revision ${profile!.revision}.` : "Operator requested pause. Already submitted transactions remain on chain."]);
    await client.query("UPDATE manekineko_season_runtime_public SET payload=jsonb_set(payload,'{status}', '\"paused\"'::jsonb) WHERE run_id=$1 AND payload->>'status'<>'completed'", [saved.id]);
    return runtimeRun(result.rows[0]);
  });
}
