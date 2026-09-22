/** History discovers candidates only. The registry decides eligibility and redemption. */
export const WINNER_CREDIT_SOURCES = `
  WITH eligible_history AS (
    SELECT c.id AS "collectionId", c.name, c.chain_id::integer AS "chainId",
      c.round_id::text AS "roundId", d.contract_address AS "contractAddress",
      d.factory_address AS "factoryAddress", c.contract_version AS "contractVersion",
      w.winning_holder AS "winningHolder", w.token_id::text AS "tokenId", 1 AS "awardRank", w.paid_at
    FROM manekineko_collections c
    JOIN manekineko_deployments d ON d.collection_id = c.id AND d.chain_id = c.chain_id
    JOIN manekineko_collection_history h ON h.id = c.id AND h.status = 'completed' AND NOT h.is_mock
    JOIN manekineko_history_winners w ON w.collection_id = c.id
    JOIN manekineko_collection_state s ON s.collection_id = c.id AND s.prize_paid
    JOIN manekineko_indexer_checkpoints cp ON cp.collection_id = c.id
    WHERE w.winning_holder = $1 AND d.status = 'deployed'
      AND d.contract_address ~ '^0x[0-9a-f]{40}$' AND d.factory_address ~ '^0x[0-9a-f]{40}$'
      AND d.contract_address <> '0x0000000000000000000000000000000000000000'
      AND d.factory_address <> '0x0000000000000000000000000000000000000000'
      AND c.chain_id IN (1,11155111) AND s.winning_token_id = w.token_id
      AND ($2::bigint IS NULL OR c.chain_id = $2)
      AND ((c.contract_version = 'affiliate-v5' AND c.algorithm_version = 'unique-rank-v2')
        OR (c.contract_version = 'affiliate-v6' AND c.algorithm_version = 'unique-rank-v3'))
      AND cp.trust_fingerprint IS NOT NULL AND cp.block_number >= s.block_number
      AND (cp.block_number <> s.block_number OR cp.block_hash = s.block_hash)
    UNION ALL
    SELECT c.id AS "collectionId", c.name, c.chain_id::integer AS "chainId",
      c.round_id::text AS "roundId", d.contract_address AS "contractAddress",
      d.factory_address AS "factoryAddress", c.contract_version AS "contractVersion",
      a.winning_holder AS "winningHolder", a.token_id::text AS "tokenId", a.rank AS "awardRank", a.paid_at
    FROM manekineko_collections c
    JOIN manekineko_deployments d ON d.collection_id = c.id AND d.chain_id = c.chain_id
    JOIN manekineko_collection_awards a ON a.collection_id = c.id AND a.claimed
    JOIN manekineko_collection_state s ON s.collection_id = c.id
    JOIN manekineko_indexer_checkpoints cp ON cp.collection_id = c.id
    WHERE a.winning_holder = $1 AND a.paid_at IS NOT NULL AND a.rank BETWEEN 1 AND CASE WHEN c.contract_version IN ('affiliate-v8','affiliate-v9','affiliate-v10') THEN c.winner_count ELSE 2 END AND a.token_id > 0
      AND d.status = 'deployed' AND d.contract_address ~ '^0x[0-9a-f]{40}$' AND d.factory_address ~ '^0x[0-9a-f]{40}$'
      AND d.contract_address <> '0x0000000000000000000000000000000000000000'
      AND d.factory_address <> '0x0000000000000000000000000000000000000000'
      AND c.chain_id IN (1,11155111) AND ($2::bigint IS NULL OR c.chain_id = $2)
      AND ((c.contract_version = 'affiliate-v7' AND c.algorithm_version = 'unique-rank-v4')
        OR (c.contract_version IN ('affiliate-v8','affiliate-v9') AND c.algorithm_version = 'unique-rank-v5' AND c.winner_count BETWEEN 1 AND 10)
        OR (c.contract_version = 'affiliate-v10' AND c.algorithm_version = 'unique-rank-v6' AND c.winner_count BETWEEN 1 AND 10))
      AND cp.trust_fingerprint IS NOT NULL AND cp.block_number >= s.block_number AND cp.block_number >= a.block_number
      AND (cp.block_number <> s.block_number OR cp.block_hash = s.block_hash)
      AND (cp.block_number <> a.block_number OR cp.block_hash = a.block_hash)
  ), paged AS (
    SELECT * FROM eligible_history ORDER BY paid_at DESC, "collectionId", "awardRank" LIMIT $3 OFFSET $4
  ) SELECT (SELECT count(*)::integer FROM eligible_history) AS total,
    COALESCE((SELECT jsonb_agg(to_jsonb(paged) ORDER BY paid_at DESC, "collectionId", "awardRank") FROM paged), '[]'::jsonb) AS items`;

export const WINNER_CREDIT_TARGET = `
  SELECT c.id AS "collectionId", c.name, c.chain_id::integer AS "chainId", c.round_id::text AS "roundId",
    d.contract_address AS "contractAddress", d.factory_address AS "factoryAddress",
    c.contract_version AS "contractVersion", c.mint_price_wei::text AS "mintPriceWei"
  FROM manekineko_collections c JOIN manekineko_deployments d ON d.collection_id = c.id AND d.chain_id = c.chain_id
  WHERE c.id = $1::uuid AND d.status = 'deployed' AND d.contract_address IS NOT NULL
    AND (($2::bigint IS NULL) OR c.chain_id = $2)
    AND ((c.contract_version = 'affiliate-v5' AND c.algorithm_version = 'unique-rank-v2')
      OR (c.contract_version = 'affiliate-v6' AND c.algorithm_version = 'unique-rank-v3')
      OR (c.contract_version = 'affiliate-v7' AND c.algorithm_version = 'unique-rank-v4')
      OR (c.contract_version IN ('affiliate-v8','affiliate-v9') AND c.algorithm_version = 'unique-rank-v5' AND c.winner_count BETWEEN 1 AND 10)
        OR (c.contract_version = 'affiliate-v10' AND c.algorithm_version = 'unique-rank-v6' AND c.winner_count BETWEEN 1 AND 10))`;
