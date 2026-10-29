import {getAddress} from 'ethers';
import {WALLET_PAGE_SIZE,type WalletProfile} from './model.ts';
import type {MirrorPin} from '../nft-mirror/model.ts';
type Query=(sql:string,values:unknown[])=>Promise<{rows:Record<string,any>[]} >;
/** One statement keeps totals, ownership and history on the same confirmed cursor. */
export async function queryWalletProfile(query:Query,pin:MirrorPin,wallet:string,nftPage=1,activityPage=1):Promise<WalletProfile>{
  if(![16,17].includes(pin.version)||pin.chainId!==11155111||![nftPage,activityPage].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=9999))throw new Error('Invalid wallet profile request.');
  const address=getAddress(wallet).toLowerCase(),contract=getAddress(pin.controller).toLowerCase();
  const {rows}=await query(`WITH source AS (
    SELECT * FROM manekineko_nft_mirror_sources WHERE chain_id=$1 AND controller=$2 AND code_hash=$3 AND version=$4
  ), payments AS (
    SELECT a.* FROM manekineko_wallet_activity a JOIN source s USING(chain_id,controller)
    WHERE s.verified AND s.wallet_synced_at IS NOT NULL AND a.block_number<=s.wallet_cursor_block
      AND a.event_type='payment' AND a.recipient=$5
  ), candidates AS (
    SELECT DISTINCT a.token_id FROM manekineko_wallet_activity a JOIN source s USING(chain_id,controller)
    WHERE s.verified AND s.wallet_synced_at IS NOT NULL AND a.block_number<=s.wallet_cursor_block
      AND a.event_type='transfer' AND a.recipient=$5
  ), owned AS (
    SELECT current_owner.* FROM candidates t CROSS JOIN LATERAL (
      SELECT a.token_id,a.collection_id,a.recipient FROM manekineko_wallet_activity a JOIN source s USING(chain_id,controller)
      WHERE a.chain_id=$1 AND a.controller=$2 AND a.token_id=t.token_id AND a.event_type='transfer' AND a.block_number<=s.wallet_cursor_block
      ORDER BY a.block_number DESC,a.log_index DESC LIMIT 1
    ) current_owner WHERE current_owner.recipient=$5
  ), nfts AS (
    SELECT o.token_id AS "tokenId",o.collection_id AS "collectionId",(o.token_id & 131071) AS serial,
      coalesce(t.metadata->>'name',coalesce(c.name,'Collection '||o.collection_id)||' #'||(o.token_id & 131071)) AS name,
      coalesce(c.name,'Collection '||o.collection_id) AS "collectionName",t.metadata->>'image' AS image,coalesce(t.numbers,'{}'::integer[]) AS numbers
    FROM owned o LEFT JOIN manekineko_nft_mirror_v16_collections c ON c.chain_id=$1 AND c.address=$2 AND c.round_id=o.collection_id
    LEFT JOIN manekineko_nft_mirror_v16_tokens t ON t.chain_id=$1 AND t.collection_address=$2 AND t.round_id=o.collection_id AND t.token_id=(o.token_id & 131071)
    ORDER BY o.token_id LIMIT $6 OFFSET $7
  ), history AS (
    SELECT p.transaction_hash AS transaction,p.log_index AS "logIndex",p.block_number::integer AS block,p.collection_id AS "collectionId",
      coalesce(c.name,'Collection '||p.collection_id) AS "collectionName",p.token_id AS "tokenId",p.payment_kind AS kind,p.amount_wei::text AS "amountWei"
    FROM payments p LEFT JOIN manekineko_nft_mirror_v16_collections c ON c.chain_id=$1 AND c.address=$2 AND c.round_id=p.collection_id
    ORDER BY p.block_number DESC,p.log_index DESC LIMIT $6 OFFSET $8
  ), totals AS (SELECT payment_kind AS kind,count(*)::integer AS count,sum(amount_wei)::text AS "amountWei" FROM payments GROUP BY payment_kind)
  SELECT (SELECT row_to_json(s) FROM source s) AS source,
    (SELECT count(*)::integer FROM owned) AS owned,(SELECT count(*)::integer FROM payments) AS "paymentsTotal",
    coalesce((SELECT jsonb_agg(nfts ORDER BY "tokenId") FROM nfts),'[]'::jsonb) AS nfts,
    coalesce((SELECT jsonb_agg(history ORDER BY block DESC,"logIndex" DESC) FROM history),'[]'::jsonb) AS payments,
    coalesce((SELECT jsonb_agg(totals ORDER BY kind) FROM totals),'[]'::jsonb) AS totals`,[pin.chainId,contract,pin.codeHash.toLowerCase(),pin.version,address,WALLET_PAGE_SIZE,(nftPage-1)*WALLET_PAGE_SIZE,(activityPage-1)*WALLET_PAGE_SIZE]);
  const row=rows[0],source=row.source;
  const status=!source||!source.verified?'unavailable':!source.wallet_synced_at?'syncing':'ready';
  return{status,wallet:getAddress(wallet),chainId:pin.chainId,contract,block:source?.wallet_cursor_block==null?null:Number(source.wallet_cursor_block),syncedAt:source?.wallet_synced_at?new Date(source.wallet_synced_at).toISOString():null,catchingUp:!source||source.wallet_cursor_block===null||Number(source.wallet_cursor_block)<Number(source.anchor_block),stale:!source?.verified_at||Date.now()-new Date(source.verified_at).getTime()>180000,totals:status==='ready'?row.totals:[],owned:status==='ready'?row.owned:0,nftPage,activityPage,paymentsTotal:status==='ready'?row.paymentsTotal:0,nfts:status==='ready'?row.nfts:[],payments:status==='ready'?row.payments:[]};
}
