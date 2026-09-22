import "server-only";
import { database } from "../database";
import { configuredChainId } from "../chain-policy";
import { parseAnnouncedSeason, type AnnouncedSeason } from "./schedule";

export async function listAnnouncedSeasons(): Promise<AnnouncedSeason[]> {
  try {
    const result = await database().query(`SELECT p.run_id,p.chain_id,p.season_id,p.payload,p.updated_at
      FROM manekineko_season_runtime_public p
      WHERE ($1::text IS NULL OR p.chain_id=$1) AND p.payload->>'announcedAt' IS NOT NULL
      ORDER BY p.updated_at DESC LIMIT 100`, [configuredChainId()]);
    return result.rows.map(row => parseAnnouncedSeason({ ...row.payload, runId: row.run_id, chainId: Number(row.chain_id), seasonId: row.season_id, updatedAt: row.updated_at.toISOString() }));
  } catch (error) {
    // Allows rolling out the read-only Web before the additive runtime migration.
    // Other failures remain failures, never a fabricated running schedule.
    if ((error as { code?: string }).code === "42P01") return [];
    throw error;
  }
}
