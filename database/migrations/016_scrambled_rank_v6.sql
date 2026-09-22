BEGIN;
-- V6 changes only the displayed combination encoding. Existing V4/V5 payloads,
-- hashes, financial terms and registered algorithms are never rewritten.
CREATE FUNCTION manekineko_launch_payload_version(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE
    WHEN p->'contract' ? 'algorithmVersion' THEN CASE
      WHEN p->'contract'->>'algorithmVersion'='unique-rank-v3' AND p->'contract' ? 'affiliatePoolBps' THEN 'affiliate-v6' ELSE NULL END
    WHEN p->'contract' ? 'affiliatePoolBps' THEN 'affiliate-v5' ELSE 'affiliate-v4' END;
$$;
ALTER TABLE manekineko_launch_configurations DROP CONSTRAINT manekineko_launch_configurations_check;
ALTER TABLE manekineko_launch_configurations ADD CONSTRAINT manekineko_launch_configurations_check CHECK (
  (status='draft' AND finalized_artifact IS NULL AND content_hash IS NULL AND finalized_by IS NULL AND finalized_at IS NULL)
  OR (status='finalized' AND finalized_artifact IS NOT NULL AND content_hash IS NOT NULL AND finalized_by IS NOT NULL AND finalized_at IS NOT NULL
    AND manekineko_launch_payload_version(payload) IS NOT NULL
    AND finalized_artifact=jsonb_build_object('schemaVersion',1,'contractVersion',manekineko_launch_payload_version(payload),'contract',payload->'contract','operations',payload->'operations'))
);
CREATE OR REPLACE FUNCTION manekineko_launch_plan_version(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN count(*)>0 AND bool_and(version IS NOT NULL) AND min(version)=max(version) THEN min(version) ELSE NULL END
  FROM (SELECT manekineko_launch_payload_version(step->'payload') AS version FROM jsonb_array_elements(p->'steps') step) versions;
$$;
-- Revalidate the unchanged prepared-artifact constraint against the expanded version resolver.
ALTER TABLE manekineko_launch_automations DROP CONSTRAINT manekineko_launch_automations_check;
ALTER TABLE manekineko_launch_automations ADD CONSTRAINT manekineko_launch_automations_check CHECK (
  (status='draft' AND prepared_artifact IS NULL AND content_hash IS NULL AND prepared_by IS NULL AND prepared_at IS NULL)
  OR (status='prepared' AND prepared_artifact IS NOT NULL AND content_hash IS NOT NULL AND prepared_by IS NOT NULL AND prepared_at IS NOT NULL
    AND manekineko_launch_plan_version(plan) IS NOT NULL
    AND prepared_artifact=plan || jsonb_build_object('schemaVersion',1,'kind','launch-automation','contractVersion',manekineko_launch_plan_version(plan)))
);
ALTER TABLE manekineko_collections DROP CONSTRAINT manekineko_collection_algorithm_check,
  ADD CONSTRAINT manekineko_collection_algorithm_check CHECK (
    (algorithm_version='feistel-v1' AND randomness_provider='future-blockhash' AND reveal_delay_blocks IS NOT NULL)
    OR (algorithm_version IN ('unique-rank-v2','unique-rank-v3') AND randomness_provider='chainlink-vrf-v2.5' AND chain_id IN (1,11155111) AND reveal_delay_blocks IS NULL)
  );
ALTER TABLE manekineko_collection_history DROP CONSTRAINT manekineko_history_algorithm_check,
  ADD CONSTRAINT manekineko_history_algorithm_check CHECK (
    (algorithm_version='feistel-v1' AND randomness_provider='future-blockhash')
    OR (algorithm_version IN ('unique-rank-v2','unique-rank-v3') AND randomness_provider='chainlink-vrf-v2.5' AND chain_id IN (1,11155111))
  );
ALTER TABLE manekineko_collections DROP CONSTRAINT manekineko_collections_contract_version_check,
  DROP CONSTRAINT manekineko_collection_financial_version_check,
  ADD CONSTRAINT manekineko_collections_contract_version_check CHECK (contract_version IN ('legacy','affiliate-v3','affiliate-v4','affiliate-v5','affiliate-v6')),
  ADD CONSTRAINT manekineko_collection_financial_version_check CHECK (
    (contract_version='legacy' AND algorithm_version IN ('feistel-v1','unique-rank-v2') AND prize_bps=5000 AND affiliate_pool_bps IS NULL)
    OR (contract_version='affiliate-v3' AND prize_bps=5000 AND affiliate_pool_bps IS NULL AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,100)=0)
    OR (contract_version='affiliate-v4' AND affiliate_pool_bps IS NULL AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,10000)=0)
    OR (contract_version='affiliate-v5' AND affiliate_pool_bps IS NOT NULL AND affiliate_pool_bps BETWEEN 0 AND 10000 AND prize_bps+affiliate_pool_bps<=10000 AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,10000)=0)
    OR (contract_version='affiliate-v6' AND affiliate_pool_bps IS NOT NULL AND affiliate_pool_bps BETWEEN 0 AND 10000 AND prize_bps+affiliate_pool_bps<=10000 AND algorithm_version='unique-rank-v3' AND mod(mint_price_wei,10000)=0)
  );
ALTER TABLE manekineko_collection_history DROP CONSTRAINT manekineko_collection_history_contract_version_check,
  DROP CONSTRAINT manekineko_history_financial_version_check,
  ADD CONSTRAINT manekineko_collection_history_contract_version_check CHECK (contract_version IN ('legacy','affiliate-v3','affiliate-v4','affiliate-v5','affiliate-v6')),
  ADD CONSTRAINT manekineko_history_financial_version_check CHECK (
    (contract_version='legacy' AND algorithm_version IN ('feistel-v1','unique-rank-v2') AND prize_bps=5000 AND affiliate_pool_bps IS NULL)
    OR (contract_version='affiliate-v3' AND prize_bps=5000 AND affiliate_pool_bps IS NULL AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,100)=0)
    OR (contract_version='affiliate-v4' AND affiliate_pool_bps IS NULL AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,10000)=0)
    OR (contract_version='affiliate-v5' AND affiliate_pool_bps IS NOT NULL AND affiliate_pool_bps BETWEEN 0 AND 10000 AND prize_bps+affiliate_pool_bps<=10000 AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,10000)=0)
    OR (contract_version='affiliate-v6' AND affiliate_pool_bps IS NOT NULL AND affiliate_pool_bps BETWEEN 0 AND 10000 AND prize_bps+affiliate_pool_bps<=10000 AND algorithm_version='unique-rank-v3' AND mod(mint_price_wei,10000)=0)
  );
ALTER TABLE manekineko_affiliate_programs DROP CONSTRAINT manekineko_affiliate_version_check,
  DROP CONSTRAINT manekineko_affiliate_rates_shape_check,
  ADD CONSTRAINT manekineko_affiliate_version_check CHECK (contract_version IN ('affiliate-v3','affiliate-v4','affiliate-v5','affiliate-v6')),
  ADD CONSTRAINT manekineko_affiliate_rates_shape_check CHECK (
    (contract_version IN ('affiliate-v5','affiliate-v6') AND cardinality(affiliate_rates_bps)=0 AND commission_bps IS NULL)
    OR (contract_version IN ('affiliate-v3','affiliate-v4') AND array_ndims(affiliate_rates_bps)=1 AND array_lower(affiliate_rates_bps,1)=1 AND cardinality(affiliate_rates_bps)=max_slots
      AND array_position(affiliate_rates_bps,NULL) IS NULL
      AND ((contract_version='affiliate-v3' AND commission_bps=100 AND affiliate_rates_bps=array_fill(100,ARRAY[max_slots])) OR (contract_version='affiliate-v4' AND commission_bps IS NULL)))
  );
CREATE OR REPLACE FUNCTION manekineko_validate_affiliate_program() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE config manekineko_collections%ROWTYPE; rate integer; demo_transition boolean:=false;
BEGIN
  SELECT * INTO STRICT config FROM manekineko_collections WHERE id=NEW.collection_id FOR SHARE;
  IF NEW.affiliate_rates_bps IS NULL THEN
    IF NEW.contract_version='affiliate-v3' THEN NEW.affiliate_rates_bps:=array_fill(100,ARRAY[NEW.max_slots]);
    ELSE RAISE EXCEPTION 'An explicit versioned rate schedule is required'; END IF;
  END IF;
  IF NEW.contract_version IN ('affiliate-v4','affiliate-v5','affiliate-v6') THEN NEW.commission_bps:=NULL; END IF;
  IF NEW.contract_version IN ('affiliate-v5','affiliate-v6') AND (config.contract_version<>NEW.contract_version OR config.affiliate_pool_bps IS NULL OR cardinality(NEW.affiliate_rates_bps)<>0) THEN
    RAISE EXCEPTION 'Pool versions require a matching pool collection and no individual rates';
  END IF;
  FOREACH rate IN ARRAY NEW.affiliate_rates_bps LOOP
    IF rate IS NULL OR rate<0 OR rate>10000 OR rate+config.prize_bps>10000 THEN RAISE EXCEPTION 'Affiliate rate and prize exceed the value of a referred purchase'; END IF;
  END LOOP;
  IF NEW.mode='live' AND (config.algorithm_version<>CASE WHEN NEW.contract_version='affiliate-v6' THEN 'unique-rank-v3' ELSE 'unique-rank-v2' END OR config.chain_id NOT IN (1,11155111)
    OR config.contract_version<>NEW.contract_version OR mod(config.mint_price_wei,CASE WHEN NEW.contract_version IN ('affiliate-v4','affiliate-v5','affiliate-v6') THEN 10000 ELSE 100 END)<>0) THEN
    RAISE EXCEPTION 'Live affiliate programs require matching Ethereum contract versions and exact mint prices';
  END IF;
  IF TG_OP='UPDATE' THEN
    demo_transition:=OLD.mode='demo' AND NEW.mode='demo' AND OLD.contract_version='affiliate-v3' AND NEW.contract_version='affiliate-v4'
      AND NOT EXISTS(SELECT 1 FROM manekineko_deployments WHERE collection_id=NEW.collection_id AND status='deployed');
    IF NEW.collection_id<>OLD.collection_id OR NEW.mode<>OLD.mode OR NEW.max_slots<>OLD.max_slots OR NEW.enrollment_signer IS DISTINCT FROM OLD.enrollment_signer
      OR ((NEW.contract_version<>OLD.contract_version OR NEW.affiliate_rates_bps IS DISTINCT FROM OLD.affiliate_rates_bps) AND NOT demo_transition) THEN
      RAISE EXCEPTION 'Affiliate program terms are immutable; create a new collection';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- For V5/V6 this versioned offer column binds the collection pool, never a personal commission.
ALTER TABLE manekineko_affiliate_challenges DROP CONSTRAINT manekineko_affiliate_challenges_contract_version_check,
  DROP CONSTRAINT manekineko_affiliate_challenge_offer_check,
  ADD CONSTRAINT manekineko_affiliate_challenges_contract_version_check CHECK (contract_version IN ('affiliate-v3','affiliate-v4','affiliate-v5','affiliate-v6')),
  ADD CONSTRAINT manekineko_affiliate_challenge_offer_check CHECK (
    (contract_version='affiliate-v3' AND affiliate_id IS NULL AND commission_bps IS NULL)
    OR (contract_version IN ('affiliate-v4','affiliate-v5','affiliate-v6') AND affiliate_id IS NOT NULL AND commission_bps IS NOT NULL AND affiliate_id BETWEEN 1 AND 100 AND commission_bps BETWEEN 0 AND 10000)
  );
CREATE OR REPLACE FUNCTION manekineko_validate_affiliate_challenge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM manekineko_affiliate_programs p JOIN manekineko_deployments d USING(collection_id) JOIN manekineko_collections c ON c.id=p.collection_id
    WHERE p.collection_id=NEW.collection_id AND p.mode='live' AND p.enrollment_enabled AND d.status='deployed'
    AND d.chain_id=NEW.chain_id AND d.contract_address=NEW.contract_address AND p.contract_version=NEW.contract_version
    AND (NEW.contract_version='affiliate-v3' OR (NEW.affiliate_id<=p.max_slots AND
      CASE WHEN NEW.contract_version IN ('affiliate-v5','affiliate-v6') THEN c.affiliate_pool_bps ELSE p.affiliate_rates_bps[NEW.affiliate_id] END=NEW.commission_bps))) THEN
    RAISE EXCEPTION 'Enrollment challenge requires an enabled deployed program and its exact offered rate or pool terms';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.collection_id<>OLD.collection_id OR NEW.wallet<>OLD.wallet OR NEW.chain_id<>OLD.chain_id OR NEW.contract_address<>OLD.contract_address
    OR NEW.contract_version<>OLD.contract_version OR NEW.affiliate_id IS DISTINCT FROM OLD.affiliate_id OR NEW.commission_bps IS DISTINCT FROM OLD.commission_bps
    OR NEW.origin<>OLD.origin OR NEW.nonce<>OLD.nonce OR NEW.ip_digest<>OLD.ip_digest OR NEW.expires_at<>OLD.expires_at OR NEW.created_at<>OLD.created_at OR OLD.consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Enrollment challenges and offered terms are immutable and single use';
  END IF;
  RETURN NEW;
END; $$;

ALTER TABLE manekineko_history_winners ADD COLUMN combination_key text;
ALTER TABLE manekineko_history_winners DROP CONSTRAINT manekineko_winner_score_check;
ALTER TABLE manekineko_history_winners ADD CONSTRAINT manekineko_winner_score_check CHECK (
  (algorithm_version='feistel-v1' AND combination_key IS NULL
    AND combination_code=(number_a-1)*16777216::bigint+(number_b-1)*65536::bigint+(number_c-1)*256+number_d-1
    AND score=(number_a::integer*number_b+number_c::integer*number_d)*4294967296::bigint+combination_code)
  OR (algorithm_version='unique-rank-v2' AND combination_key IS NULL
    AND number_a<=16 AND number_b<=16 AND number_c<=16 AND number_d<=16
    AND combination_code=(number_a-1)*4096+(number_b-1)*256+(number_c-1)*16+number_d-1 AND score=combination_code+1)
  OR (algorithm_version='unique-rank-v3' AND combination_key IS NOT NULL AND combination_key ~ '^0x[0-9a-f]{64}$'
    AND number_a<=16 AND number_b<=16 AND number_c<=16 AND number_d<=16
    AND combination_code=(number_a-1)*4096+(number_b-1)*256+(number_c-1)*16+number_d-1 AND score BETWEEN 1 AND 65536)
);
COMMENT ON COLUMN manekineko_history_winners.combination_key IS
  'V6 revealed on-chain combinationKey. The pinned indexer and public reader verify the scrambled score with this key; legacy algorithms require NULL.';
-- Preserve existing locks, financial percentage checks, deferred winner checks
-- and immutable-algorithm checks while applying unique-rank invariants to V6.
DO $$ DECLARE definition text; updated text; function_name text; BEGIN
  FOREACH function_name IN ARRAY ARRAY['manekineko_keep_algorithm()','manekineko_validate_history()'] LOOP
    SELECT pg_get_functiondef(function_name::regprocedure) INTO definition;
    updated:=replace(definition,'algorithm_version = ''unique-rank-v2''','algorithm_version IN (''unique-rank-v2'',''unique-rank-v3'')');
    IF updated=definition THEN RAISE EXCEPTION 'Expected versioned algorithm checks were not found in %',function_name; END IF;
    EXECUTE updated;
  END LOOP;
END; $$;
COMMIT;
