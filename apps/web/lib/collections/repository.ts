import "server-only";
import { AWARDS_SELECT } from "./awards";
import type { PoolClient } from "pg";

import { database } from "../database";
import { configuredChainId } from "../chain-policy";
import { isCollectionId, scoreFormulaFor, type CollectionPublic } from "./model";
import { collectionSource } from "./source-policy";
import { validateCollection } from "./validation";

export { DEFAULT_COLLECTION_ID } from "./model";

type DatabaseCollection = Omit<
  CollectionPublic,
  | "nativeCurrency"
  | "source"
  | "mode"
  | "maxMintBatch"
  | "scoreFormula"
  | "mintDeadline"
  | "updatedAt"
> & {
  currencySymbol: string;
  currencyDecimals: number;
  mintDeadline: Date | null;
  updatedAt: Date;
  snapshotBlock: string | null;
};

const COLLECTION_QUERY = `
  SELECT c.id, c.slug, c.name, c.symbol, c.description,
    to_jsonb(c)->>'season_id' AS "seasonId", to_jsonb(c)->>'season_name' AS "seasonName",
    to_jsonb(c)->>'collection_color' AS "collectionColor", to_jsonb(c)->>'text_color' AS "textColor",
    c.winner_count AS "winnerCount",c.second_prize_bps AS "secondPrizeBps", c.min_affiliate_referrals AS "minAffiliateReferrals", c.affiliate_payout_cap_bps AS "affiliatePayoutCapBps",
    c.sale_start_at::text AS "saleStartAt",s.sold_out_at::text AS "soldOutAt",s.revealed_at::text AS "revealedAt",s.all_prizes_paid AS "allPrizesPaid",
    ${AWARDS_SELECT} AS awards,
    COALESCE(s.refunded_count,0) AS "refundedCount",COALESCE(s.total_refunded_wei,0)::text AS "totalRefundedWei",
    CASE WHEN c.contract_version IN ('affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10') AND s.phase='refundable' AND s.total_minted>0 AND s.refunded_count=s.total_minted
      THEN (SELECT max(e.block_timestamp)::text FROM manekineko_chain_events e WHERE e.collection_id=c.id AND e.event_name='Refunded') ELSE NULL END AS "refundedAt",
    COALESCE((SELECT SUM((e.arguments->>'amount')::numeric) FROM manekineko_chain_events e
      WHERE e.collection_id=c.id AND e.event_name='AffiliateCommissionClaimed'),0)::text AS "totalAffiliatePaidWei",
    c.contract_version AS "contractVersion", c.prize_bps AS "prizeBps", c.affiliate_pool_bps AS "affiliatePoolBps",
    c.algorithm_version AS "algorithmVersion", c.randomness_provider AS "randomnessProvider",
    s.randomness_request_id::text AS "randomnessRequestId",
    CASE WHEN c.algorithm_version IN ('unique-rank-v2','unique-rank-v3','unique-rank-v4','unique-rank-v5','unique-rank-v6') THEN COALESCE(s.randomness_state, 'not_requested') ELSE NULL END AS "randomnessState",
    c.series_id AS "seriesId", c.round_id::text AS "roundId",
    n.chain_id::text AS "chainId", n.name AS "networkName",
    n.currency_symbol AS "currencySymbol", n.currency_decimals AS "currencyDecimals",
    n.explorer_url AS "explorerUrl",
    COALESCE(d.status, 'undeployed') AS "contractStatus",
    d.contract_address AS "contractAddress",
    c.max_supply AS "maxSupply", c.mint_price_wei::text AS "mintPriceWei",
    c.mint_duration_seconds::text AS "mintDurationSeconds",
    d.mint_deadline AS "mintDeadline", c.reveal_delay_blocks AS "revealDelayBlocks",
    COALESCE(s.total_minted, 0) AS "totalMinted",
    COALESCE(s.total_mint_revenue_wei, 0)::text AS "totalMintRevenueWei",
    s.phase, COALESCE(s.prize_paid, false) AS "prizePaid",
    s.block_number::text AS "snapshotBlock",
    GREATEST(c.updated_at, d.updated_at, s.updated_at) AS "updatedAt"
  FROM manekineko_collections c
  JOIN manekineko_networks n ON n.chain_id = c.chain_id
  LEFT JOIN manekineko_deployments d ON d.collection_id = c.id
  LEFT JOIN manekineko_collection_state s ON s.collection_id = c.id
`;

function publicCollection(row: DatabaseCollection): CollectionPublic {
  if (row.contractStatus === "deployed" && row.snapshotBlock === null) {
    throw new Error(
      "Deployed collection is awaiting its first verified chain snapshot"
    );
  }
  const {
    currencySymbol,
    currencyDecimals,
    snapshotBlock: _snapshotBlock,
    ...record
  } = row;
  return validateCollection({
    ...record,
    chainId: Number(row.chainId),
    mintDurationSeconds: Number(row.mintDurationSeconds),
    nativeCurrency: { symbol: currencySymbol, decimals: currencyDecimals },
    source: "postgres",
    mode: row.contractStatus === "deployed" ? "live" : "demo",
    maxMintBatch: 20,
    scoreFormula: scoreFormulaFor(row.algorithmVersion),
    mintDeadline: row.mintDeadline?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** No implicit fallback: configured database outages must remain visible as errors. */
export async function listCollections(client?: Pick<PoolClient, "query">): Promise<CollectionPublic[]> {
  collectionSource();
  const chain = configuredChainId();
  const result = await (client ?? database()).query<DatabaseCollection>(
    `${COLLECTION_QUERY} WHERE d.status = 'deployed' AND s.block_number IS NOT NULL
      AND ($1::bigint IS NULL OR c.chain_id = $1) ORDER BY c.series_id, c.round_id`, [chain]
  );
  return result.rows.map(publicCollection);
}

export async function getCollection(
  id: string
): Promise<CollectionPublic | null> {
  if (!isCollectionId(id)) return null;
  collectionSource();
  const normalizedId = id.toLowerCase();
  const chain = configuredChainId();
  const result = await database().query<DatabaseCollection>(
    `${COLLECTION_QUERY} WHERE c.id = $1::uuid AND d.status = 'deployed'
      AND s.block_number IS NOT NULL AND ($2::bigint IS NULL OR c.chain_id = $2)`,
    [normalizedId, chain]
  );
  return result.rows.length === 0 ? null : publicCollection(result.rows[0]);
}
