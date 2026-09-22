/** Discovery only: every row must subsequently pass the pinned gate's canonical
 * source registration, completion, ownerOf and destination reuse checks. Do not
 * apply current-factory pins here; prior official factories remain eligible. */
export const AFFILIATE_NFT_CANDIDATES_QUERY = `WITH sources AS (
  SELECT c.id,c.name,d.contract_address,s.block_number,s.total_minted
  FROM manekineko_collections c
  JOIN manekineko_deployments d ON d.collection_id=c.id AND d.chain_id=c.chain_id
  JOIN manekineko_collection_state s ON s.collection_id=c.id
  JOIN manekineko_indexer_checkpoints cp ON cp.collection_id=c.id
  WHERE c.chain_id=$1 AND c.id<>$2::uuid AND d.status='deployed'
    AND d.contract_address ~ '^0x[0-9a-f]{40}$'
    AND d.contract_address<>'0x0000000000000000000000000000000000000000'
    AND ((c.contract_version='affiliate-v5' AND c.algorithm_version='unique-rank-v2')
      OR (c.contract_version='affiliate-v6' AND c.algorithm_version='unique-rank-v3')
      OR (c.contract_version='affiliate-v7' AND c.algorithm_version='unique-rank-v4') OR (c.contract_version IN ('affiliate-v8','affiliate-v9') AND c.algorithm_version='unique-rank-v5') OR (c.contract_version='affiliate-v10' AND c.algorithm_version='unique-rank-v6'))
    AND ((s.phase='complete' AND s.prize_paid) OR (c.contract_version IN ('affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10') AND s.phase='awaiting_prize')) AND cp.trust_fingerprint IS NOT NULL
    AND cp.block_number>=s.block_number AND (cp.block_number<>s.block_number OR cp.block_hash=s.block_hash)
), candidates AS (
  SELECT DISTINCT c.id,c.name,c.contract_address,c.block_number,e.arguments->>'tokenId' AS token_id
  FROM sources c JOIN manekineko_chain_events e ON e.collection_id=c.id
  WHERE e.event_name='Transfer' AND e.block_number<=c.block_number
    AND lower(e.arguments->>'to')=$3 AND e.arguments->>'tokenId' ~ '^[1-9][0-9]{0,4}$'
    AND (e.arguments->>'tokenId')::numeric<=c.total_minted
), held AS (
  SELECT c.id AS "collectionId",c.name AS "collectionName",c.contract_address AS "sourceCollection",c.token_id AS "sourceTokenId"
  FROM candidates c JOIN LATERAL (
    SELECT e.arguments->>'to' AS owner FROM manekineko_chain_events e
    WHERE e.collection_id=c.id AND e.event_name='Transfer' AND e.arguments->>'tokenId'=c.token_id AND e.block_number<=c.block_number
    ORDER BY e.block_number DESC,e.transaction_index DESC,e.log_index DESC LIMIT 1
  ) latest ON lower(latest.owner)=$3
), paged AS (
  SELECT * FROM held ORDER BY "collectionId","sourceTokenId"::integer LIMIT 12 OFFSET $4
)
SELECT (SELECT count(*)::integer FROM held) AS total,
  COALESCE((SELECT jsonb_agg(to_jsonb(paged) ORDER BY "collectionId","sourceTokenId"::integer) FROM paged),'[]'::jsonb) AS items`;
