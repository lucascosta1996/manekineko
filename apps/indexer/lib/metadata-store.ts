import { needsMetadataRefresh } from './metadata-refresh.ts';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { collection } from './store.ts';
import { ensure, type IndexerConfig } from './types.ts';
import type { JobUpdate, MetadataJob, MetadataStore } from './metadata-refresh.ts';

const generation = "cp.trust_fingerprint || ':' || s.randomness_word::text";
const eligible = `d.chain_id=$1 AND d.factory_address=$2 AND c.contract_version=$3
  AND c.contract_version IN ('affiliate-v5','affiliate-v6','affiliate-v7','affiliate-v8','affiliate-v9')
  AND d.status='deployed' AND p.mode='live' AND p.contract_version=c.contract_version
  AND s.phase IN ('awaiting_prize','complete') AND s.randomness_state='fulfilled'
  AND s.total_minted=c.max_supply AND s.randomness_word IS NOT NULL
  AND cp.trust_fingerprint IS NOT NULL AND cp.block_number>=s.block_number`;
const joins = `JOIN manekineko_collections c ON c.id=d.collection_id
  JOIN manekineko_affiliate_programs p ON p.collection_id=c.id
  JOIN manekineko_collection_state s ON s.collection_id=c.id
  JOIN manekineko_indexer_checkpoints cp ON cp.collection_id=c.id`;
const params = (config: IndexerConfig) => [config.chainId, config.factory, config.contractVersion];

export class PostgresMetadataStore implements MetadataStore {
  private readonly pool: pg.Pool;
  constructor(pool: pg.Pool) { this.pool = pool; }

  async discover(config: IndexerConfig): Promise<void> {
    if (!needsMetadataRefresh(config.contractVersion)) return;
    ensure(config.chainId === 11155111, 'unsupported_explorer');
    // Backfills already revealed V8 collections too. Fulfillment without finalization is not eligible.
    // Each collection inserts atomically; token 1 is the completion marker for this generation.
    await this.pool.query(`INSERT INTO manekineko_nft_metadata_jobs(collection_id,token_id,generation)
      SELECT c.id,token_id,${generation} FROM manekineko_deployments d ${joins}
      CROSS JOIN LATERAL generate_series(1,s.total_minted::integer) AS token_id
      WHERE ${eligible} AND NOT EXISTS (SELECT 1 FROM manekineko_nft_metadata_jobs j
        WHERE j.collection_id=c.id AND j.token_id=1 AND j.generation=${generation})
      ON CONFLICT(collection_id,token_id) DO UPDATE SET generation=excluded.generation,status='pending',
        next_attempt_at=now(),refresh_attempts=0,last_refresh_at=NULL,expected_hash=NULL,verified_at=NULL,
        last_error=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=now()
      WHERE manekineko_nft_metadata_jobs.generation<>excluded.generation`, params(config));
  }

  async claim(config: IndexerConfig): Promise<MetadataJob | null> {
    if (!needsMetadataRefresh(config.contractVersion)) return null;
    const owner = randomUUID();
    const result = await this.pool.query(`WITH due AS (
      SELECT j.collection_id,j.token_id FROM manekineko_nft_metadata_jobs j
      JOIN manekineko_deployments d ON d.collection_id=j.collection_id ${joins}
      WHERE ${eligible} AND j.generation=${generation} AND j.status<>'verified'
        AND j.next_attempt_at<=now() AND (j.lease_owner IS NULL OR j.lease_expires_at<=now())
      ORDER BY (j.status='verifying') DESC,j.next_attempt_at,j.created_at,j.collection_id,j.token_id FOR UPDATE OF j SKIP LOCKED LIMIT 1
    ), claimed AS (
      UPDATE manekineko_nft_metadata_jobs j SET lease_owner=$4,lease_expires_at=now()+interval '2 minutes',updated_at=now()
      FROM due WHERE j.collection_id=due.collection_id AND j.token_id=due.token_id RETURNING j.*
    ) SELECT claimed.*,c.*,d.contract_address,d.factory_address,d.transaction_hash,d.deployment_block,
      d.deployed_at,d.mint_deadline,p.max_slots,p.enrollment_signer
      FROM claimed JOIN manekineko_collections c ON c.id=claimed.collection_id
      JOIN manekineko_deployments d ON d.collection_id=c.id
      JOIN manekineko_affiliate_programs p ON p.collection_id=c.id`, [...params(config), owner]);
    const row = result.rows[0];
    return row ? { collection: collection(row), tokenId: row.token_id, generation: row.generation, owner,
      refreshAttempts: row.refresh_attempts, lastRefreshAt: row.last_refresh_at ? new Date(row.last_refresh_at).getTime() : null } : null;
  }

  async finish(job: MetadataJob, update: JobUpdate): Promise<void> {
    const result = await this.pool.query(`UPDATE manekineko_nft_metadata_jobs SET status=$5,
      next_attempt_at=clock_timestamp()+make_interval(secs=>$6),last_error=$7,
      expected_hash=COALESCE($8,expected_hash),verified_at=CASE WHEN $5='verified' THEN clock_timestamp() ELSE NULL END,
      lease_owner=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
      WHERE collection_id=$1 AND token_id=$2 AND generation=$3 AND lease_owner=$4 AND lease_expires_at>clock_timestamp()`,
    [job.collection.id,job.tokenId,job.generation,job.owner,update.status,update.delaySeconds,update.error ?? null,update.hash ?? null]);
    ensure(result.rowCount === 1, 'metadata_lease_expired');
  }

  async reserveRefresh(job: MetadataJob, hash: string): Promise<'reserved' | 'cooldown' | 'blocked'> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const active = await db.query(`SELECT 1 FROM manekineko_nft_metadata_jobs WHERE collection_id=$1 AND token_id=$2
        AND generation=$3 AND lease_owner=$4 AND lease_expires_at>clock_timestamp() FOR UPDATE`,
      [job.collection.id,job.tokenId,job.generation,job.owner]);
      ensure(active.rowCount === 1, 'metadata_lease_expired');
      const provider = (await db.query(`SELECT blocked,next_refresh_at>clock_timestamp() AS cooling
        FROM manekineko_nft_metadata_providers WHERE provider='blockscout_sepolia' FOR UPDATE`)).rows[0];
      ensure(provider, 'metadata_provider_missing');
      if (provider.blocked || provider.cooling) { await db.query('COMMIT'); return provider.blocked ? 'blocked' : 'cooldown'; }
      // <=40 attempts/hour, shared across processes and factories; no burst after a restart.
      await db.query(`UPDATE manekineko_nft_metadata_providers SET next_refresh_at=clock_timestamp()+interval '90 seconds',
        last_error=NULL,updated_at=clock_timestamp() WHERE provider='blockscout_sepolia'`);
      await db.query(`UPDATE manekineko_nft_metadata_jobs SET status='verifying',refresh_attempts=refresh_attempts+1,
        last_refresh_at=clock_timestamp(),next_attempt_at=clock_timestamp()+interval '15 minutes',expected_hash=$5
        WHERE collection_id=$1 AND token_id=$2 AND generation=$3 AND lease_owner=$4`,
      [job.collection.id,job.tokenId,job.generation,job.owner,hash]);
      await db.query('COMMIT'); return 'reserved';
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }

  async stopProvider(error: string, delaySeconds: number, blocked: boolean): Promise<void> {
    await this.pool.query(`UPDATE manekineko_nft_metadata_providers SET blocked=blocked OR $3,last_error=$1,
      next_refresh_at=GREATEST(next_refresh_at,clock_timestamp()+make_interval(secs=>$2)),
      retry_after=GREATEST(retry_after,clock_timestamp()+make_interval(secs=>$2)),updated_at=clock_timestamp()
      WHERE provider='blockscout_sepolia'`, [error,delaySeconds,blocked]);
  }

  async available(): Promise<boolean> {
    return (await this.pool.query(`SELECT NOT blocked AND retry_after<=clock_timestamp() AS available
      FROM manekineko_nft_metadata_providers WHERE provider='blockscout_sepolia'`)).rows[0]?.available === true;
  }

  async status(chainId: number) {
    const jobs = await this.pool.query(`SELECT j.status,count(*)::integer AS count,min(j.created_at) AS oldest_created_at,
      max(j.verified_at) AS last_verified_at FROM manekineko_nft_metadata_jobs j
      JOIN manekineko_deployments d ON d.collection_id=j.collection_id WHERE d.chain_id=$1 GROUP BY j.status`, [chainId]);
    const errors = await this.pool.query(`SELECT j.collection_id,j.token_id,j.status,j.last_error,j.refresh_attempts,j.next_attempt_at
      FROM manekineko_nft_metadata_jobs j JOIN manekineko_deployments d ON d.collection_id=j.collection_id
      WHERE d.chain_id=$1 AND j.last_error IS NOT NULL ORDER BY j.updated_at DESC LIMIT 20`, [chainId]);
    const provider = await this.pool.query("SELECT * FROM manekineko_nft_metadata_providers WHERE provider='blockscout_sepolia'");
    return { provider: provider.rows[0], jobs: jobs.rows, errors: errors.rows };
  }
}
