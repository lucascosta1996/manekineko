import { NFT_PAGE_SIZE, type MirrorPin, type GalleryCollection, type CollectionDirectory, type CollectionGallery } from './model.ts';
type Query = (sql: string, values: unknown[]) => Promise<{rows: Record<string, any>[]} >;
const pinsJson = (pins: MirrorPin[]) => JSON.stringify(pins.map(p=>({chain_id:p.chainId,controller:p.controller.toLowerCase(),code_hash:p.codeHash.toLowerCase(),version:p.version})));
const trusted = `WITH trusted AS (
  SELECT s.* FROM manekineko_nft_mirror_sources s JOIN jsonb_to_recordset($1::jsonb)
  AS p(chain_id integer,controller text,code_hash text,version integer)
  USING (chain_id,controller,code_hash,version) WHERE s.verified
)`;
export async function queryMintActivity(query: Query, pins: MirrorPin[]) {
  if (!pins.length) return { events: [] };
  const { rows } = await query(`${trusted}, recent AS (
    SELECT c.chain_id,c.address,c.name,c.kind,t.token_id,t.mint_transaction,t.mint_block
    FROM manekineko_nft_mirror_collections c JOIN trusted s USING (chain_id,controller)
    CROSS JOIN LATERAL (
      SELECT token_id,mint_transaction,mint_block,burned FROM manekineko_nft_mirror_tokens t
      WHERE t.chain_id=c.chain_id AND t.collection_address=c.address
      ORDER BY token_id DESC LIMIT 20
    ) t
    WHERE s.verified_at >= now()-interval '3 minutes'
      AND NOT t.burned AND t.mint_block BETWEEN s.anchor_block-50 AND LEAST(s.anchor_block,c.cursor_block)
  ), transactions AS (
    SELECT chain_id,address,name,kind,mint_transaction,max(token_id) AS token_id,max(mint_block) AS mint_block
    FROM recent GROUP BY chain_id,address,name,kind,mint_transaction
  ), ranked AS (
    SELECT *,row_number() OVER (PARTITION BY chain_id ORDER BY mint_block DESC,address,token_id DESC) AS position
    FROM transactions
  ) SELECT chain_id AS "chainId",address AS collection,name,kind,token_id AS "tokenId",mint_transaction AS transaction
    FROM ranked WHERE position<=20 ORDER BY position,chain_id`, [pinsJson(pins)]);
  return { events: rows };
}
const summary = `SELECT count(*)::integer AS minted,count(*) FILTER (WHERE metadata IS NOT NULL)::integer AS ready
  FROM manekineko_nft_mirror_tokens t WHERE t.chain_id=c.chain_id AND t.collection_address=c.address`;
function collection(row: Record<string, any>): GalleryCollection {
  return {kind:row.kind,chainId:row.chain_id,address:row.address,name:row.name,seasonName:row.season_name,color:row.color,textColor:row.text_color,
    minted:Number(row.minted),ready:Number(row.ready),cover:row.cover ?? null,
    syncedAt:row.synced_at ? new Date(row.synced_at).toISOString() : null,
    blockNumber:row.cursor_block === null ? null : Number(row.cursor_block),catchingUp:row.catching_up};
}
function offset(page: number) {
  if (!Number.isSafeInteger(page) || page<1 || page>Math.ceil(65536/NFT_PAGE_SIZE)) throw new Error('Invalid page.');
  return (page-1)*NFT_PAGE_SIZE;
}
export async function queryDirectory(query: Query, pins: MirrorPin[], page: number): Promise<CollectionDirectory> {
  const start = offset(page);
  if (!pins.length) return {configured:false,page,total:0,collections:[]};
  const {rows} = await query(`${trusted}, selected AS (
    SELECT c.*,s.anchor_block FROM manekineko_nft_mirror_collections c JOIN trusted s USING (chain_id,controller) WHERE c.kind='paid'
  ), paged AS (
    SELECT c.*,stats.*,cover.image AS cover,(c.cursor_block IS NULL OR c.cursor_block<c.anchor_block) AS catching_up
    FROM (SELECT * FROM selected ORDER BY chain_id,controller,round_id LIMIT $2 OFFSET $3) c
    CROSS JOIN LATERAL (${summary}) stats
    LEFT JOIN LATERAL (SELECT metadata->>'image' AS image FROM manekineko_nft_mirror_tokens t
      WHERE t.chain_id=c.chain_id AND t.collection_address=c.address AND metadata IS NOT NULL ORDER BY token_id LIMIT 1) cover ON true
  ) SELECT (SELECT count(*)::integer FROM selected) AS total,
    coalesce((SELECT jsonb_agg(paged ORDER BY chain_id,controller,round_id) FROM paged),'[]'::jsonb) AS items`,[pinsJson(pins),NFT_PAGE_SIZE,start]);
  const genesis = await query(`${trusted}
    SELECT c.*,stats.*,cover.image AS cover,(c.cursor_block IS NULL OR c.cursor_block<s.anchor_block) AS catching_up
    FROM manekineko_nft_mirror_collections c JOIN trusted s USING (chain_id,controller)
    CROSS JOIN LATERAL (${summary}) stats
    LEFT JOIN LATERAL (SELECT metadata->>'image' AS image FROM manekineko_nft_mirror_tokens t
      WHERE t.chain_id=c.chain_id AND t.collection_address=c.address AND metadata IS NOT NULL ORDER BY token_id LIMIT 1) cover ON true
    WHERE c.kind='genesis' ORDER BY c.chain_id,c.controller LIMIT 4`,[pinsJson(pins)]);
  return {configured:true,page,total:rows[0].total,collections:rows[0].items.map(collection),genesis:genesis.rows.map(collection)};
}
export async function queryGallery(query: Query, pins: MirrorPin[], chainId: number, address: string, page: number): Promise<CollectionGallery | null> {
  const start = offset(page);
  if (!pins.length) return null;
  const {rows} = await query(`${trusted}
    SELECT c.*,stats.*,(c.cursor_block IS NULL OR c.cursor_block<s.anchor_block) AS catching_up,
      coalesce(nfts.items,'[]'::jsonb) AS items
    FROM manekineko_nft_mirror_collections c JOIN trusted s USING (chain_id,controller)
    CROSS JOIN LATERAL (${summary}) stats
    LEFT JOIN LATERAL (SELECT jsonb_agg(nft ORDER BY nft."tokenId") AS items FROM (
      SELECT t.token_id AS "tokenId",t.metadata->>'name' AS name,t.metadata->>'image' AS image,t.numbers,t.burned
      FROM manekineko_nft_mirror_tokens t WHERE t.chain_id=c.chain_id AND t.collection_address=c.address AND t.metadata IS NOT NULL
      ORDER BY t.token_id LIMIT $4 OFFSET $5) nft) nfts ON true
    WHERE c.chain_id=$2 AND c.address=$3`,[pinsJson(pins),chainId,address,NFT_PAGE_SIZE,start]);
  return rows[0] ? {page,collection:collection(rows[0]),tokens:rows[0].items} : null;
}
