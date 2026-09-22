import { launchContractVersion } from "./launch-config.ts";
import { configuredLaunchChain, requireLaunchChain, requireSeasonPlanningChain } from "./chain-policy.ts";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { LaunchActor } from "./launch-config-store.ts";
import { parseLaunchRevision } from "./launch-config-validation.ts";
import { AutomationError, type AutomationArtifact, type AutomationPlan, type AutomationSummary, type AutomationValidation } from "./launch-automation.ts";
import { parseAutomationDraft, requireValidAutomationPayload, validateAutomationPayload } from "./launch-automation-validation.ts";
import { automationArtifactHash } from "./launch-automation-artifact.ts";
import { catalogSeasonOrder, catalogSeasonOrders } from "./season-catalog-order.ts";

type AutomationDatabase = Pick<Pool, "query">;
type Row = {
  id: string; plan: AutomationPlan["plan"]; status: AutomationPlan["status"]; revision: number;
  content_hash: string | null; created_at: Date; updated_at: Date; prepared_at: Date | null;
  created_by: string; updated_by: string; prepared_by: string | null; prepared_artifact: AutomationArtifact | null;
  mock_catalog_order?: number | null;
};

function automationId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new AutomationError("not_found", "Launch automation not found.", 404);
  return value;
}

async function mutateAutomation(db: AutomationDatabase, sql: string, values: unknown[]) {
  try { return await db.query<Row>(sql, values); }
  catch (error) {
    const failure = error as { code?: string; message?: string } | null;
    if (failure?.code === "42501" && failure.message === "Launch actor is inactive") {
      throw new AutomationError("inactive_actor", "This launch account is inactive. Sign in with an active operator account.", 403);
    }
    throw error;
  }
}

function automation(row: Row): AutomationPlan {
  return {
    id: row.id, seasonOrder: row.mock_catalog_order ?? catalogSeasonOrder(row.plan.seasonId), plan: row.plan, status: row.status, revision: row.revision, contentHash: row.content_hash,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), preparedAt: row.prepared_at?.toISOString() ?? null,
    createdBy: row.created_by, updatedBy: row.updated_by, preparedBy: row.prepared_by,
  };
}

async function findRow(db: AutomationDatabase, id: string): Promise<Row> {
  const result = await db.query<Row>("SELECT * FROM manekineko_launch_automations WHERE id=$1", [automationId(id)]);
  if (!result.rows[0]) throw new AutomationError("not_found", "Launch automation not found.", 404);
  requireSeasonPlanningChain(result.rows[0].plan.chainId);
  for (const step of result.rows[0].plan.steps) requireSeasonPlanningChain(step.payload.contract.chainId);
  return result.rows[0];
}

function assertRevision(row: Row, revision: number): void {
  if (row.revision !== revision) throw new AutomationError("revision_conflict", "This automation changed in another session. Reload it before continuing.", 409);
}

function assertEditable(row: Row, revision: number): void {
  if (row.status === "prepared") throw new AutomationError("already_prepared", "This automation is prepared. Create a new draft to change its settings.", 409);
  assertRevision(row, revision);
}

type SummaryRow = Omit<Row, "plan" | "prepared_artifact" | "created_by" | "updated_by" | "prepared_by"> & {
  name: string; chain_id: AutomationSummary["chainId"]; collection_count: number; cursor_time: string; season_order: number; current_model: boolean;
};

const UNLISTED_SEASON_ORDER = 2147483647;

function parseCursor(value?: string | null): { updatedAt: string; id: string; seasonOrder: number } | null {
  if (value === undefined || value === null) return null;
  try {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new Error();
    const cursor: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) throw new Error();
    const fields = cursor as Record<string, unknown>;
    if (Object.keys(fields).length !== 3 || typeof fields.seasonOrder !== "number" || !Number.isInteger(fields.seasonOrder) || fields.seasonOrder < 1 || fields.seasonOrder > UNLISTED_SEASON_ORDER || typeof fields.updatedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(fields.updatedAt) || fields.updatedAt.startsWith("0000-") || !Number.isFinite(Date.parse(fields.updatedAt)) || typeof fields.id !== "string") throw new Error();
    if (new Date(fields.updatedAt).toISOString() !== `${fields.updatedAt.slice(0, 23)}Z`) throw new Error();
    return { updatedAt: fields.updatedAt, id: automationId(fields.id), seasonOrder: fields.seasonOrder };
  } catch { throw new AutomationError("invalid_cursor", "The automation list cursor is invalid. Reload the list."); }
}

/** Return only bounded summaries; collection payloads are loaded one plan at a time. */
export async function listLaunchAutomations(db: AutomationDatabase, rawCursor?: string | null, chainId: string | null = configuredLaunchChain()): Promise<{ automations: AutomationSummary[]; nextCursor: string | null }> {
  if (chainId !== null) requireSeasonPlanningChain(chainId);
  const cursor = parseCursor(rawCursor);
  const result = await db.query<SummaryRow>(`WITH ordered_seasons AS (
    SELECT *,COALESCE(mock_catalog_order,($4::jsonb->>lower(plan->>'seasonId'))::integer,${UNLISTED_SEASON_ORDER}) AS season_order
    FROM manekineko_launch_automations
    WHERE ($3::text IS NULL OR plan->>'chainId' = $3)
  ) SELECT id,plan->>'name' AS name,plan->>'chainId' AS chain_id,season_order,
    jsonb_array_length(plan->'steps') AS collection_count,status,revision,content_hash,created_at,updated_at,prepared_at,
    (plan ? 'seasonId' AND plan ? 'timing' AND jsonb_array_length(plan->'steps') > 0 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(plan->'steps') AS entry
      WHERE COALESCE(entry->'payload'->'contract'->>'algorithmVersion', '') NOT IN ('unique-rank-v5', 'unique-rank-v6')
    )) AS current_model,
    to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
    FROM ordered_seasons
    WHERE ($1::timestamptz IS NULL OR season_order > $5::integer
      OR (season_order = $5::integer AND (updated_at,id) < ($1::timestamptz,$2::uuid)))
    ORDER BY season_order ASC,updated_at DESC,id DESC LIMIT 101`, [cursor?.updatedAt ?? null, cursor?.id ?? null, chainId, JSON.stringify(catalogSeasonOrders), cursor?.seasonOrder ?? null]);
  const rows = result.rows.slice(0, 100), last = rows.at(-1);
  return {
    automations: rows.map(row => ({
      id: row.id, currentModel: row.current_model, seasonOrder: row.season_order === UNLISTED_SEASON_ORDER ? null : row.season_order, name: row.name, chainId: row.chain_id, status: row.status, revision: row.revision, collectionCount: row.collection_count,
      contentHash: row.content_hash, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), preparedAt: row.prepared_at?.toISOString() ?? null,
    })),
    nextCursor: result.rows.length > 100 && last ? Buffer.from(JSON.stringify({ updatedAt: last.cursor_time, id: last.id, seasonOrder: last.season_order })).toString("base64url") : null,
  };
}

export async function getLaunchAutomation(db: AutomationDatabase, id: string): Promise<AutomationPlan> {
  return automation(await findRow(db, id));
}

export async function createLaunchAutomation(db: AutomationDatabase, actor: LaunchActor, input: { plan: unknown }): Promise<AutomationPlan> {
  const plan = parseAutomationDraft(input.plan);
  const result = await mutateAutomation(db, `INSERT INTO manekineko_launch_automations(id,plan,created_by,updated_by)
    VALUES($1,$2::jsonb,$3,$3) RETURNING *`, [randomUUID(), JSON.stringify(plan), actor.userId]);
  return automation(result.rows[0]);
}

export async function updateLaunchAutomation(db: AutomationDatabase, actor: LaunchActor, id: string, input: { plan: unknown; revision: unknown }): Promise<AutomationPlan> {
  const revision = parseLaunchRevision(input.revision), plan = parseAutomationDraft(input.plan);
  const result = await mutateAutomation(db, `UPDATE manekineko_launch_automations SET plan=$2::jsonb,revision=revision+1,updated_by=$3
    WHERE id=$1 AND revision=$4 AND status='draft' RETURNING *`, [automationId(id), JSON.stringify(plan), actor.userId, revision]);
  if (!result.rows[0]) {
    assertEditable(await findRow(db, id), revision);
    throw new AutomationError("revision_conflict", "This automation changed. Reload it before continuing.", 409);
  }
  return automation(result.rows[0]);
}

/** Validation refers to the saved revision, never to an unsaved browser copy. */
export async function validateLaunchAutomation(db: AutomationDatabase, id: string, rawRevision: unknown, now = new Date()): Promise<AutomationValidation> {
  const revision = parseLaunchRevision(rawRevision), row = await findRow(db, id);
  assertRevision(row, revision);
  return validateAutomationPayload(row.plan, now, { requireWinnerCredits: row.status === "draft", requireAffiliateEligibility: row.status === "draft", requireSeasonAppearance: row.status === "draft" });
}

/** Preparation freezes instructions only. A future worker must recheck chain state and schedules before execution. */
export async function prepareLaunchAutomation(db: AutomationDatabase, actor: LaunchActor, id: string, rawRevision: unknown, now = new Date()): Promise<AutomationPlan> {
  const revision = parseLaunchRevision(rawRevision), row = await findRow(db, id);
  requireLaunchChain(row.plan.chainId);
  for (const step of row.plan.steps) requireLaunchChain(step.payload.contract.chainId);
  assertEditable(row, revision);
  const plan = requireValidAutomationPayload(row.plan, now, { requireWinnerCredits: true, requireAffiliateEligibility: true, requireSeasonAppearance: true });
  const artifact: AutomationArtifact = { schemaVersion: 1, kind: "launch-automation", contractVersion: launchContractVersion(plan.steps[0].payload), ...plan };
  const contentHash = automationArtifactHash(artifact);
  const result = await mutateAutomation(db, `UPDATE manekineko_launch_automations SET plan=$2::jsonb,status='prepared',revision=revision+1,
    prepared_artifact=$3::jsonb,content_hash=$4,updated_by=$5,prepared_by=$5,prepared_at=now()
    WHERE id=$1 AND revision=$6 AND status='draft' RETURNING *`, [id, JSON.stringify(plan), JSON.stringify(artifact), contentHash, actor.userId, revision]);
  if (!result.rows[0]) {
    assertEditable(await findRow(db, id), revision);
    throw new AutomationError("revision_conflict", "This automation changed. Reload it before continuing.", 409);
  }
  return automation(result.rows[0]);
}

export async function exportLaunchAutomation(db: AutomationDatabase, id: string): Promise<{ artifact: AutomationArtifact & { contentHash: string }; filename: string }> {
  const row = await findRow(db, id);
  if (row.status !== "prepared" || !row.prepared_artifact || !row.content_hash) throw new AutomationError("not_prepared", "Prepare the automation before exporting it.", 409);
  requireLaunchChain(row.prepared_artifact.chainId);
  for (const step of row.prepared_artifact.steps) requireLaunchChain(step.payload.contract.chainId);
  if (automationArtifactHash(row.prepared_artifact) !== row.content_hash) throw new AutomationError("artifact_integrity", "The saved automation failed its integrity check. Export has been stopped.", 500);
  return { artifact: { ...row.prepared_artifact, contentHash: row.content_hash }, filename: `manekineko-automation-${row.id}-r${row.revision}.json` };
}
