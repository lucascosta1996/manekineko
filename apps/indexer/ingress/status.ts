import { readIndexerConfig } from "../lib/config.ts";
import { getIndexerPool } from "../lib/database.ts";
import { PostgresMetadataStore } from "../lib/metadata-store.ts";

export async function readIndexerStatus(): Promise<unknown> {
  const config = readIndexerConfig();
  const pool = getIndexerPool();
  const { rows } = await pool.query(`
    SELECT d.collection_id, d.contract_address, cp.block_number, cp.last_success_at, cp.last_attempt_at,
      cp.last_error_code, cp.failure_count, cp.reorg_count,
      CASE WHEN cp.last_success_at IS NULL THEN NULL
        ELSE GREATEST(0, floor(extract(epoch FROM now() - cp.last_success_at))) END AS seconds_since_success
    FROM manekineko_deployments d
    LEFT JOIN manekineko_indexer_checkpoints cp ON cp.collection_id = d.collection_id
    WHERE d.chain_id = $1 AND d.status = 'deployed'
    ORDER BY d.deployed_at DESC LIMIT 100`, [config.chainId]);
  return { ok: true, chainId: config.chainId, confirmations: config.confirmations, webhookConfigured: Boolean(process.env.QUICKNODE_WEBHOOK_SECRET), collections: rows,
    metadata: config.chainId === 11155111 ? await new PostgresMetadataStore(pool).status(config.chainId) : { supported: false } };
}
