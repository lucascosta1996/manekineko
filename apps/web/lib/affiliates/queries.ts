/** Shared by the live repository and concurrency regressions against PostgreSQL. */
export const AFFILIATE_RATE_SQL = `INSERT INTO manekineko_affiliate_rate_limits(collection_id,scope,subject_hash,window_start,attempts)
  VALUES($1::uuid,$2,$3,date_bin(interval '10 minutes',now(),timestamptz '2000-01-01'),1)
  ON CONFLICT(collection_id,scope,subject_hash,window_start) DO UPDATE SET attempts=manekineko_affiliate_rate_limits.attempts+1
  WHERE manekineko_affiliate_rate_limits.attempts < $4 RETURNING attempts`;
export const AFFILIATE_CONSUME_SQL = `UPDATE manekineko_affiliate_challenges SET consumed_at=clock_timestamp()
  WHERE id=$1::uuid AND collection_id=$2::uuid AND wallet=$3 AND consumed_at IS NULL AND expires_at > clock_timestamp()`;

/** Public schedule chain IDs are text; indexed collection chain IDs are bigint. */
export const AFFILIATE_PROGRAM_SQL = `SELECT p.collection_id AS "collectionId",c.name AS "collectionName",c.chain_id::integer AS "chainId",c.round_id::text AS "roundId",
    c.min_affiliate_referrals AS "minAffiliateReferrals",c.affiliate_payout_cap_bps AS "affiliatePayoutCapBps",c.winner_count AS "winnerCount",c.second_prize_bps AS "secondPrizeBps",c.sale_start_at AS "saleStartAt",
    (SELECT item->>'enrollmentOpensAt' FROM manekineko_season_runtime_public r,
      LATERAL jsonb_array_elements(r.payload->'collections') item
      WHERE r.chain_id=c.chain_id::text AND item->>'id'=c.id::text ORDER BY r.updated_at DESC LIMIT 1) AS "enrollmentOpensAt",
    p.mode,p.contract_version AS "contractVersion",c.contract_version AS "collectionContractVersion",c.prize_bps AS "prizeBps",c.affiliate_pool_bps AS "affiliatePoolBps",p.affiliate_rates_bps AS "affiliateRatesBps",p.max_slots AS "maxSlots",p.enrollment_enabled AS "enrollmentEnabled",p.enrollment_signer AS "enrollmentSigner",
    d.contract_address AS "contractAddress",d.factory_address AS "factoryAddress",d.status AS "deploymentStatus",
    c.mint_price_wei::text AS "mintPriceWei",c.max_supply AS "maxSupply",c.algorithm_version AS "algorithmVersion",d.mint_deadline AS "mintDeadline"
    FROM manekineko_affiliate_programs p JOIN manekineko_collections c ON c.id=p.collection_id
    LEFT JOIN manekineko_deployments d ON d.collection_id=p.collection_id WHERE p.collection_id=$1::uuid`;
