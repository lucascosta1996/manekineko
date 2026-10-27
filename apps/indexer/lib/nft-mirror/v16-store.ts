/** V16 uses (network, contract, collection ID) keys. Historical projections stay separate. */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { ensure } from '../types.ts';
import { fingerprint, type MirrorConfig } from './config.ts';
import type { Anchor, CachedNft, MirrorCollection, MirrorSource, MintEvent } from './types.ts';

type Row = Record<string, any>;
function collection(row: Row): MirrorCollection {
  return {kind:row.kind,chainId:row.chain_id,address:row.address,controller:row.controller,roundId:row.round_id,
    name:row.name,seasonName:row.season_name,seasonId:row.season_id,color:row.color,textColor:row.text_color,
    renderer:row.renderer,deploymentBlock:Number(row.deployment_block),
    cursor:row.cursor_block === null ? null : {number:Number(row.cursor_block),hash:row.cursor_hash}};
}
export class V16MirrorStore {
  readonly owner = randomUUID();
  private pool: pg.Pool;
  readonly config: MirrorConfig;
  constructor(pool: pg.Pool, config: MirrorConfig) { this.pool=pool; this.config=config; }
  private get key() { return [this.config.chainId,this.config.controller]; }
  async claim(): Promise<MirrorSource | null> {
    const c = this.config;
    await this.pool.query(`INSERT INTO manekineko_nft_mirror_sources
      (chain_id,controller,fingerprint,code_hash,version,from_block) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [...this.key,fingerprint(c),c.codeHash,c.version,c.fromBlock]);
    const {rows} = await this.pool.query(`UPDATE manekineko_nft_mirror_sources SET lease_owner=$3,lease_until=now()+interval '150 seconds'
      WHERE chain_id=$1 AND controller=$2 AND (lease_until IS NULL OR lease_until<now()) RETURNING *`,[...this.key,this.owner]);
    const row = rows[0];
    return row ? {fingerprint:row.fingerprint,cursor:row.cursor_block === null ? null : {number:Number(row.cursor_block),hash:row.cursor_hash},
      anchor:row.anchor_block === null ? null : {number:Number(row.anchor_block),hash:row.anchor_hash}} : null;
  }
  async release(): Promise<void> {
    await this.pool.query(`UPDATE manekineko_nft_mirror_sources SET lease_owner=NULL,lease_until=NULL
      WHERE chain_id=$1 AND controller=$2 AND lease_owner=$3`,[...this.key,this.owner]);
  }
  private async transaction<T>(work: (client: pg.PoolClient)=>Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const lease = await client.query(`SELECT 1 FROM manekineko_nft_mirror_sources
        WHERE chain_id=$1 AND controller=$2 AND lease_owner=$3 AND lease_until>now() FOR UPDATE`,[...this.key,this.owner]);
      ensure(lease.rowCount === 1,'indexer_lease_expired');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async resetSource(): Promise<void> {
    await this.transaction(async client => {
      await client.query('DELETE FROM manekineko_nft_mirror_v16_collections WHERE chain_id=$1 AND controller=$2',this.key);
      await client.query(`UPDATE manekineko_nft_mirror_sources SET cursor_block=NULL,cursor_hash=NULL,anchor_block=NULL,anchor_hash=NULL,verified=false,
        verified_at=NULL,fingerprint=$3,code_hash=$4,version=$5,from_block=$6 WHERE chain_id=$1 AND controller=$2`,
        [...this.key,fingerprint(this.config),this.config.codeHash,this.config.version,this.config.fromBlock]);
    });
  }
  async verified(value: boolean, anchor?: Anchor): Promise<void> {
    await this.transaction(async client => { await client.query(`UPDATE manekineko_nft_mirror_sources SET verified=$3,
      verified_at=CASE WHEN $3 THEN now() ELSE verified_at END,anchor_block=coalesce($4,anchor_block),anchor_hash=coalesce($5,anchor_hash)
      WHERE chain_id=$1 AND controller=$2`,[...this.key,value,anchor?.number,anchor?.hash]); });
  }
  async discover(items: MirrorCollection[], to: Anchor, check: ()=>Promise<void>): Promise<void> {
    await this.transaction(async client => {
      for (const item of items) await client.query(`INSERT INTO manekineko_nft_mirror_v16_collections
        (chain_id,address,controller,round_id,name,season_name,season_id,color,text_color,renderer,deployment_block,kind)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (chain_id,address,round_id) DO NOTHING`,
        [item.chainId,item.address,item.controller,item.roundId,item.name,item.seasonName,item.seasonId,item.color,item.textColor,item.renderer,item.deploymentBlock,item.kind ?? 'paid']);
      await check();
      await client.query('UPDATE manekineko_nft_mirror_sources SET cursor_block=$3,cursor_hash=$4 WHERE chain_id=$1 AND controller=$2',
        [...this.key,to.number,to.hash]);
    });
  }
  async nextCollection(preferLatest = false): Promise<MirrorCollection | null> {
    const {rows} = await this.pool.query(`SELECT * FROM manekineko_nft_mirror_v16_collections WHERE chain_id=$1 AND controller=$2
      ORDER BY CASE WHEN $3 THEN round_id END DESC,checked_at,round_id LIMIT 1`,[...this.key,preferLatest]);
    return rows[0] ? collection(rows[0]) : null;
  }
  async resetCollection(address: string, roundId?: number): Promise<void> {
    await this.transaction(async client => {
      await client.query('DELETE FROM manekineko_nft_mirror_v16_tokens WHERE chain_id=$1 AND collection_address=$2 AND round_id=$3',[this.config.chainId,address,roundId]);
      await client.query(`UPDATE manekineko_nft_mirror_v16_collections SET cursor_block=NULL,cursor_hash=NULL,synced_at=NULL
        WHERE chain_id=$1 AND address=$2 AND controller=$3 AND round_id=$4`,[this.config.chainId,address,this.config.controller,roundId]);
    });
  }
  async events(item: MirrorCollection, events: MintEvent[], to: Anchor, caughtUp: boolean, check: ()=>Promise<void>): Promise<void> {
    await this.transaction(async client => {
      // Two bulk operations keep a sold-out collection from generating thousands of SQL round trips.
      const mints = events.filter(event=>!event.burned), burns = events.filter(event=>event.burned).map(event=>event.tokenId);
      if (mints.length) {
        const inserted = await client.query(`INSERT INTO manekineko_nft_mirror_v16_tokens
          (chain_id,collection_address,token_id,mint_block,mint_block_hash,mint_transaction,kind,round_id)
          SELECT $1,$2,e."tokenId",e.block,e."blockHash",e.transaction,$4,$5
          FROM jsonb_to_recordset($3::jsonb) AS e("tokenId" integer,block bigint,"blockHash" text,transaction text)
          ON CONFLICT (chain_id,collection_address,round_id,token_id) DO UPDATE SET token_id=excluded.token_id
          WHERE manekineko_nft_mirror_v16_tokens.mint_block_hash=excluded.mint_block_hash
            AND manekineko_nft_mirror_v16_tokens.mint_transaction=excluded.mint_transaction RETURNING token_id`,
          [item.chainId,item.address,JSON.stringify(mints),item.kind ?? 'paid',item.roundId]);
        ensure(inserted.rowCount === mints.length,'canonical_block_changed');
      }
      if (burns.length) {
        const updated = await client.query(`UPDATE manekineko_nft_mirror_v16_tokens SET burned=true
          WHERE chain_id=$1 AND collection_address=$2 AND token_id=ANY($3::integer[]) AND round_id=$4`,[item.chainId,item.address,burns,item.roundId]);
        ensure(updated.rowCount === new Set(burns).size,'mint_accounting_mismatch');
      }
      await check();
      await client.query(`UPDATE manekineko_nft_mirror_v16_collections SET cursor_block=$3,cursor_hash=$4,checked_at=clock_timestamp(),
        synced_at=CASE WHEN $5 THEN now() ELSE synced_at END WHERE chain_id=$1 AND address=$2 AND round_id=$6`,[item.chainId,item.address,to.number,to.hash,caughtUp,item.roundId]);
    });
  }
  async pending(): Promise<{collection: MirrorCollection; tokenId: number; mintHash: string; mintBlock: number} | null> {
    const {rows} = await this.pool.query(`SELECT c.*,t.token_id,t.mint_block_hash,t.mint_block FROM manekineko_nft_mirror_v16_tokens t
      JOIN manekineko_nft_mirror_v16_collections c ON c.chain_id=t.chain_id AND c.address=t.collection_address AND c.round_id=t.round_id
      WHERE c.chain_id=$1 AND c.controller=$2 AND t.metadata IS NULL AND t.retry_after<=now()
      ORDER BY t.retry_after,c.round_id,t.token_id LIMIT 1`,this.key);
    return rows[0] ? {collection:collection(rows[0]),tokenId:rows[0].token_id,mintHash:rows[0].mint_block_hash,mintBlock:Number(rows[0].mint_block)} : null;
  }
  async cache(item: MirrorCollection, tokenId: number, mintHash: string, data: CachedNft, check: ()=>Promise<void>): Promise<void> {
    await this.transaction(async client => {
      await check();
      const result = await client.query(`UPDATE manekineko_nft_mirror_v16_tokens SET metadata=$5::jsonb,numbers=$6,combination_code=$7,cached_at=now()
        WHERE chain_id=$1 AND collection_address=$2 AND token_id=$3 AND mint_block_hash=$4 AND metadata IS NULL AND round_id=$8`,
        [item.chainId,item.address,tokenId,mintHash,JSON.stringify(data.metadata),data.numbers,data.code,item.roundId]);
      ensure(result.rowCount === 1,'canonical_block_changed');
    });
  }
  async retry(item: MirrorCollection, tokenId: number): Promise<void> {
    await this.transaction(async client => { await client.query(`UPDATE manekineko_nft_mirror_v16_tokens SET attempts=attempts+1,
      retry_after=now()+least(600,30*(attempts+1))*interval '1 second' WHERE chain_id=$1 AND collection_address=$2 AND token_id=$3 AND round_id=$4`,
      [item.chainId,item.address,tokenId,item.roundId]); });
  }
  async caughtUp(head: number): Promise<boolean> {
    const {rows} = await this.pool.query(`SELECT NOT EXISTS (SELECT 1 FROM manekineko_nft_mirror_v16_collections
      WHERE chain_id=$1 AND controller=$2 AND (cursor_block IS NULL OR cursor_block<$3))
      AND NOT EXISTS (SELECT 1 FROM manekineko_nft_mirror_v16_tokens t JOIN manekineko_nft_mirror_v16_collections c
      ON c.chain_id=t.chain_id AND c.address=t.collection_address AND c.round_id=t.round_id WHERE c.chain_id=$1 AND c.controller=$2 AND t.metadata IS NULL) AS ready`,[...this.key,head]);
    return rows[0].ready;
  }
}
