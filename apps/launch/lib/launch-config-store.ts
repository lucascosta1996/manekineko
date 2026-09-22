import { launchContractVersion } from "./launch-config.ts";
import { configuredLaunchChain, requireLaunchChain } from "./chain-policy.ts";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { LaunchConfigurationError, type LaunchArtifact, type LaunchConfiguration } from "./launch-config.ts";
import { parseLaunchDraft, parseLaunchId, parseLaunchLabel, parseLaunchRevision, requireValidLaunchPayload } from "./launch-config-validation.ts";
import { launchArtifactHash } from "./launch-config-artifact.ts";

type LaunchDatabase = Pick<Pool, "query">;
export type LaunchActor = { userId: string };
type Row = {
  id: string; label: string; payload: LaunchConfiguration["payload"]; status: LaunchConfiguration["status"]; revision: number;
  content_hash: string | null; created_at: Date; updated_at: Date; finalized_at: Date | null;
  created_by: string; updated_by: string; finalized_by: string | null; finalized_artifact: LaunchArtifact | null;
};

async function mutateLaunchConfiguration(db: LaunchDatabase, sql: string, values: unknown[]) {
  try { return await db.query<Row>(sql, values); }
  catch (error) {
    const failure = error as { code?: string; message?: string } | null;
    if (failure?.code === "42501" && failure.message === "Launch actor is inactive") {
      throw new LaunchConfigurationError("inactive_actor", "This launch account is inactive. Sign in with an active operator account.", 403);
    }
    throw error;
  }
}

function configuration(row: Row): LaunchConfiguration {
  return {
    id: row.id, label: row.label, payload: row.payload, status: row.status, revision: row.revision, contentHash: row.content_hash,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), finalizedAt: row.finalized_at?.toISOString() ?? null,
    createdBy: row.created_by, updatedBy: row.updated_by, finalizedBy: row.finalized_by,
  };
}

async function findRow(db: LaunchDatabase, id: string): Promise<Row> {
  const result = await db.query<Row>("SELECT * FROM manekineko_launch_configurations WHERE id=$1", [parseLaunchId(id)]);
  if (!result.rows[0]) throw new LaunchConfigurationError("not_found", "Launch configuration not found.", 404);
  requireLaunchChain(result.rows[0].payload.contract.chainId);
  return result.rows[0];
}

function assertEditable(row: Row, revision: number): void {
  if (row.status === "finalized") throw new LaunchConfigurationError("already_finalized", "This configuration is finalized. Create a new draft to change its terms.", 409);
  if (row.revision !== revision) throw new LaunchConfigurationError("revision_conflict", "This configuration changed in another session. Reload it before continuing.", 409);
}

export async function listLaunchConfigurations(db: LaunchDatabase): Promise<LaunchConfiguration[]> {
  const result = await db.query<Row>("SELECT * FROM manekineko_launch_configurations WHERE ($1::text IS NULL OR payload->'contract'->>'chainId' = $1) ORDER BY updated_at DESC,id LIMIT 100", [configuredLaunchChain()]);
  return result.rows.map(configuration);
}

export async function getLaunchConfiguration(db: LaunchDatabase, id: string): Promise<LaunchConfiguration> {
  return configuration(await findRow(db, id));
}

export async function createLaunchConfiguration(db: LaunchDatabase, actor: LaunchActor, input: { label: unknown; payload: unknown }): Promise<LaunchConfiguration> {
  const label = parseLaunchLabel(input.label), payload = parseLaunchDraft(input.payload);
  const result = await mutateLaunchConfiguration(db, `INSERT INTO manekineko_launch_configurations(id,label,payload,created_by,updated_by)
    VALUES($1,$2,$3::jsonb,$4,$4) RETURNING *`, [randomUUID(), label, JSON.stringify(payload), actor.userId]);
  return configuration(result.rows[0]);
}

export async function updateLaunchConfiguration(db: LaunchDatabase, actor: LaunchActor, id: string, input: { label: unknown; payload: unknown; revision: unknown }): Promise<LaunchConfiguration> {
  const revision = parseLaunchRevision(input.revision), label = parseLaunchLabel(input.label), payload = parseLaunchDraft(input.payload);
  const result = await mutateLaunchConfiguration(db, `UPDATE manekineko_launch_configurations SET label=$2,payload=$3::jsonb,revision=revision+1,updated_by=$4
    WHERE id=$1 AND revision=$5 AND status='draft' RETURNING *`, [parseLaunchId(id), label, JSON.stringify(payload), actor.userId, revision]);
  if (!result.rows[0]) {
    assertEditable(await findRow(db, id), revision);
    throw new LaunchConfigurationError("revision_conflict", "This configuration changed. Reload it before continuing.", 409);
  }
  return configuration(result.rows[0]);
}

/** Freeze a saved revision. Automation should consume its artifact rather than reconstructing form data. */
export async function finalizeLaunchConfiguration(db: LaunchDatabase, actor: LaunchActor, id: string, rawRevision: unknown): Promise<LaunchConfiguration> {
  const revision = parseLaunchRevision(rawRevision);
  const row = await findRow(db, id);
  assertEditable(row, revision);
  const payload = requireValidLaunchPayload(row.payload, { requireWinnerCredits: true, requireAffiliateEligibility: true, requireSeasonAppearance: true });
  const artifact: LaunchArtifact = { schemaVersion: 1, contractVersion: launchContractVersion(payload), ...payload };
  const contentHash = launchArtifactHash(artifact);
  const result = await mutateLaunchConfiguration(db, `UPDATE manekineko_launch_configurations SET payload=$2::jsonb,status='finalized',revision=revision+1,
    finalized_artifact=$3::jsonb,content_hash=$4,updated_by=$5,finalized_by=$5,finalized_at=now()
    WHERE id=$1 AND revision=$6 AND status='draft' RETURNING *`, [id, JSON.stringify(payload), JSON.stringify(artifact), contentHash, actor.userId, revision]);
  if (!result.rows[0]) {
    assertEditable(await findRow(db, id), revision);
    throw new LaunchConfigurationError("revision_conflict", "This configuration changed. Reload it before continuing.", 409);
  }
  return configuration(result.rows[0]);
}

export async function exportLaunchConfiguration(db: LaunchDatabase, id: string): Promise<{ artifact: LaunchArtifact & { contentHash: string }; filename: string }> {
  const row = await findRow(db, id);
  if (row.status !== "finalized" || !row.finalized_artifact || !row.content_hash) throw new LaunchConfigurationError("not_finalized", "Finalize the configuration before exporting it.", 409);
  requireLaunchChain(row.finalized_artifact.contract.chainId);
  if (launchArtifactHash(row.finalized_artifact) !== row.content_hash) throw new LaunchConfigurationError("artifact_integrity", "The saved artifact failed its integrity check. Export has been stopped.", 500);
  return { artifact: { ...row.finalized_artifact, contentHash: row.content_hash }, filename: `manekineko-v4-${row.id}-r${row.revision}.json` };
}
