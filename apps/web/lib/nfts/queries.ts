/** Only canonical snapshots approved for their exact contract version are portfolio sources. */
const TRUSTED_COLLECTIONS = `
  trusted AS (
    SELECT c.*, n.name AS network_name, d.contract_address, d.factory_address,
      s.phase, s.block_number, s.block_hash, s.synced_at, s.total_minted,
      s.winning_token_id, s.prize_paid, s.prize_recipient, w.winning_holder
    FROM manekineko_collections c
    JOIN manekineko_networks n ON n.chain_id = c.chain_id
    JOIN manekineko_deployments d ON d.collection_id = c.id AND d.chain_id = c.chain_id
    JOIN manekineko_collection_state s ON s.collection_id = c.id
    JOIN manekineko_indexer_checkpoints cp ON cp.collection_id = c.id
    LEFT JOIN manekineko_history_winners w ON w.collection_id = c.id
    WHERE ((c.contract_version = 'affiliate-v5' AND c.algorithm_version = 'unique-rank-v2')
        OR (c.contract_version = 'affiliate-v6' AND c.algorithm_version = 'unique-rank-v3')
        OR (c.contract_version = 'affiliate-v7' AND c.algorithm_version = 'unique-rank-v4') OR (c.contract_version IN ('affiliate-v8','affiliate-v9') AND c.algorithm_version = 'unique-rank-v5') OR (c.contract_version='affiliate-v10' AND c.algorithm_version='unique-rank-v6'))
      AND d.status = 'deployed' AND d.contract_address IS NOT NULL
      AND cp.trust_fingerprint IS NOT NULL AND cp.block_number >= s.block_number
      AND (cp.block_number <> s.block_number OR cp.block_hash = s.block_hash)
      AND ($1::bigint IS NULL OR c.chain_id = $1)
      AND EXISTS (
        SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS approved(chain_id bigint, factory text, contract_version text)
        WHERE approved.chain_id = c.chain_id AND approved.factory = d.factory_address
          AND approved.contract_version = c.contract_version
      )
  )`;

// Events never extend beyond the associated state snapshot. The indexer replaces
// orphan logs and state atomically; each query sees a complete MVCC snapshot.
const TOKEN_PROJECTION = `
  tokens AS (
    SELECT c.id AS "collectionId", c.name, c.symbol, c.round_id::text AS "roundId",
      to_jsonb(c)->>'season_id' AS "seasonId", to_jsonb(c)->>'season_name' AS "seasonName",
      to_jsonb(c)->>'collection_color' AS "collectionColor", to_jsonb(c)->>'text_color' AS "textColor",
      c.chain_id::integer AS "chainId", c.network_name AS "networkName",
      c.contract_address AS "contractAddress", candidate.token_id::text AS "tokenId",
      c.phase, mint.block_timestamp AS "mintedAt", mint.transaction_hash AS "mintTransactionHash",
      lower(mint.arguments->>'payer') AS "mintedBy", lower(mint.arguments->>'recipient') AS "mintedTo",
      NULLIF(lower(ownership.arguments->>'to'), '0x0000000000000000000000000000000000000000') AS "currentOwner",
      EXISTS (
        SELECT 1 FROM manekineko_chain_events refund
        WHERE refund.collection_id = c.id AND refund.event_name = 'Refunded'
          AND refund.arguments->>'tokenId' = candidate.token_id::text
          AND refund.block_number <= c.block_number
      ) AS refunded,
      (c.winning_token_id IS NOT NULL) AS revealed,
      COALESCE(award.token_id IS NOT NULL OR c.winning_token_id = candidate.token_id, false) AS "winningToken",
      award.rank AS "awardRank",award.amount_wei::text AS "awardAmountWei",
      CASE WHEN c.contract_version IN ('affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10') THEN COALESCE(award.claimed,false) ELSE c.prize_paid END AS "prizePaid",
      COALESCE(award.winning_holder,c.winning_holder) AS "winningHolder", COALESCE(award.recipient,c.prize_recipient) AS "prizeRecipient",
      c.block_number::text AS "confirmedBlock", c.block_hash AS "blockHash",
      c.factory_address AS "factoryAddress", c.max_supply AS "maxSupply",
      c.contract_version AS "contractVersion", c.algorithm_version AS "algorithmVersion", c.synced_at AS "updatedAt"
    FROM candidates candidate
    JOIN trusted c ON c.id = candidate.collection_id AND candidate.token_id BETWEEN 1 AND c.total_minted
    LEFT JOIN manekineko_collection_awards award ON award.collection_id=c.id AND award.token_id=candidate.token_id AND award.block_number=c.block_number AND award.block_hash=c.block_hash
    JOIN LATERAL (
      SELECT event.arguments, event.block_timestamp, event.transaction_hash
      FROM manekineko_chain_events event
      WHERE event.collection_id = c.id AND event.event_name = 'Minted' AND event.block_number <= c.block_number
        AND candidate.token_id >= (event.arguments->>'firstTokenId')::integer
        AND candidate.token_id < (event.arguments->>'firstTokenId')::integer + (event.arguments->>'quantity')::integer
      ORDER BY event.block_number, event.transaction_index, event.log_index LIMIT 1
    ) mint ON true
    JOIN LATERAL (
      SELECT event.arguments
      FROM manekineko_chain_events event
      WHERE event.collection_id = c.id AND event.event_name = 'Transfer'
        AND event.arguments->>'tokenId' = candidate.token_id::text AND event.block_number <= c.block_number
      ORDER BY event.block_number DESC, event.transaction_index DESC, event.log_index DESC LIMIT 1
    ) ownership ON true
  )`;

/** Parameters: chain, trusted factories JSON, wallet, view, status, page size, offset. */
export const NFT_GALLERY_QUERY = `WITH ${TRUSTED_COLLECTIONS},
  candidates AS (
    SELECT c.id AS collection_id, expanded.token_id
    FROM trusted c JOIN manekineko_chain_events event ON event.collection_id = c.id
    CROSS JOIN LATERAL generate_series(
      (event.arguments->>'firstTokenId')::integer,
      (event.arguments->>'firstTokenId')::integer + LEAST((event.arguments->>'quantity')::integer, 20) - 1
    ) AS expanded(token_id)
    WHERE event.event_name = 'Minted' AND event.block_number <= c.block_number
      AND (lower(event.arguments->>'payer') = $3 OR lower(event.arguments->>'recipient') = $3)
    UNION
    SELECT c.id, (event.arguments->>'tokenId')::integer
    FROM trusted c JOIN manekineko_chain_events event ON event.collection_id = c.id
    WHERE event.event_name = 'Transfer' AND event.block_number <= c.block_number
      AND lower(event.arguments->>'to') = $3
  ), ${TOKEN_PROJECTION},
  wallet_tokens AS (
    SELECT *, ("mintedBy" = $3 OR "mintedTo" = $3) AS minted,
      COALESCE("currentOwner" = $3, false) AS held FROM tokens
  ),
  selected AS (
    SELECT * FROM wallet_tokens WHERE CASE WHEN $4 = 'held' THEN held ELSE minted END
  ),
  filtered AS (
    SELECT * FROM selected WHERE $5 = 'all'
      OR ($5 = 'ongoing' AND phase NOT IN ('complete', 'refundable'))
      OR ($5 = 'completed' AND phase = 'complete') OR ($5 = 'refundable' AND phase = 'refundable')
  ),
  paged AS (
    SELECT * FROM filtered ORDER BY "mintedAt" DESC, "collectionId", "tokenId"::integer DESC LIMIT $6 OFFSET $7
  )
  SELECT (SELECT count(*)::integer FROM filtered) AS total,
    (SELECT count(*)::integer FROM wallet_tokens WHERE minted) AS minted,
    (SELECT count(*)::integer FROM wallet_tokens WHERE held) AS held,
    (SELECT count(*)::integer FROM selected WHERE phase NOT IN ('complete','refundable')) AS ongoing,
    (SELECT count(*)::integer FROM selected WHERE phase = 'complete') AS completed,
    (SELECT max("updatedAt") FROM wallet_tokens) AS "updatedAt",
    COALESCE((SELECT jsonb_agg(to_jsonb(paged) ORDER BY "mintedAt" DESC, "collectionId", "tokenId"::integer DESC) FROM paged), '[]'::jsonb) AS items`;

/** Parameters: chain, trusted factories JSON, collection UUID, numeric token ID. */
export const INDEXED_NFT_QUERY = `WITH ${TRUSTED_COLLECTIONS},
  candidates AS (SELECT $3::uuid AS collection_id, $4::integer AS token_id), ${TOKEN_PROJECTION}
  SELECT * FROM tokens`;
