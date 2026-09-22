BEGIN;
-- Extend versioned snapshots without rewriting any draft or finalized financial terms.
ALTER TABLE manekineko_launch_configurations DROP CONSTRAINT manekineko_launch_configurations_check;
ALTER TABLE manekineko_launch_configurations ADD CONSTRAINT manekineko_launch_configurations_check CHECK (
  (status='draft' AND finalized_artifact IS NULL AND content_hash IS NULL AND finalized_by IS NULL AND finalized_at IS NULL)
  OR (status='finalized' AND finalized_artifact IS NOT NULL AND content_hash IS NOT NULL AND finalized_by IS NOT NULL AND finalized_at IS NOT NULL
    AND finalized_artifact=jsonb_build_object('schemaVersion',1,'contractVersion',CASE WHEN payload->'contract' ? 'affiliatePoolBps' THEN 'affiliate-v5' ELSE 'affiliate-v4' END,'contract',payload->'contract','operations',payload->'operations'))
);
CREATE FUNCTION manekineko_launch_plan_version(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN bool_and(step->'payload'->'contract' ? 'affiliatePoolBps') THEN 'affiliate-v5'
    WHEN bool_and(NOT (step->'payload'->'contract' ? 'affiliatePoolBps')) THEN 'affiliate-v4' ELSE NULL END
  FROM jsonb_array_elements(p->'steps') step;
$$;
ALTER TABLE manekineko_launch_automations DROP CONSTRAINT manekineko_launch_automations_check;
ALTER TABLE manekineko_launch_automations ADD CONSTRAINT manekineko_launch_automations_check CHECK (
  (status='draft' AND prepared_artifact IS NULL AND content_hash IS NULL AND prepared_by IS NULL AND prepared_at IS NULL)
  OR (status='prepared' AND prepared_artifact IS NOT NULL AND content_hash IS NOT NULL AND prepared_by IS NOT NULL AND prepared_at IS NOT NULL
    AND manekineko_launch_plan_version(plan) IS NOT NULL
    AND prepared_artifact=plan || jsonb_build_object('schemaVersion',1,'kind','launch-automation','contractVersion',manekineko_launch_plan_version(plan)))
);

ALTER TABLE manekineko_collections DROP CONSTRAINT manekineko_collections_contract_version_check,
  DROP CONSTRAINT manekineko_collection_financial_version_check,
  ADD COLUMN affiliate_pool_bps integer,
  ADD CONSTRAINT manekineko_collections_contract_version_check CHECK (contract_version IN ('legacy','affiliate-v3','affiliate-v4','affiliate-v5')),
  ADD CONSTRAINT manekineko_collection_financial_version_check CHECK (
    (contract_version='legacy' AND prize_bps=5000 AND affiliate_pool_bps IS NULL)
    OR (contract_version='affiliate-v3' AND prize_bps=5000 AND affiliate_pool_bps IS NULL AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,100)=0)
    OR (contract_version='affiliate-v4' AND affiliate_pool_bps IS NULL AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,10000)=0)
    OR (contract_version='affiliate-v5' AND affiliate_pool_bps IS NOT NULL AND affiliate_pool_bps BETWEEN 0 AND 10000 AND prize_bps+affiliate_pool_bps<=10000 AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,10000)=0)
  );
ALTER TABLE manekineko_collection_history DROP CONSTRAINT manekineko_collection_history_contract_version_check,
  DROP CONSTRAINT manekineko_history_financial_version_check,
  ADD COLUMN affiliate_pool_bps integer,
  ADD CONSTRAINT manekineko_collection_history_contract_version_check CHECK (contract_version IN ('legacy','affiliate-v3','affiliate-v4','affiliate-v5')),
  ADD CONSTRAINT manekineko_history_financial_version_check CHECK (
    (contract_version='legacy' AND prize_bps=5000 AND affiliate_pool_bps IS NULL)
    OR (contract_version='affiliate-v3' AND prize_bps=5000 AND affiliate_pool_bps IS NULL AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,100)=0)
    OR (contract_version='affiliate-v4' AND affiliate_pool_bps IS NULL AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,10000)=0)
    OR (contract_version='affiliate-v5' AND affiliate_pool_bps IS NOT NULL AND affiliate_pool_bps BETWEEN 0 AND 10000 AND prize_bps+affiliate_pool_bps<=10000 AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,10000)=0)
  );
CREATE OR REPLACE FUNCTION manekineko_keep_financial_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contract_version<>OLD.contract_version OR NEW.prize_bps<>OLD.prize_bps OR NEW.affiliate_pool_bps IS DISTINCT FROM OLD.affiliate_pool_bps THEN
    RAISE EXCEPTION 'Collection financial terms are immutable';
  END IF;
  RETURN NEW;
END; $$;
ALTER TABLE manekineko_affiliate_programs DROP CONSTRAINT manekineko_affiliate_version_check,
  DROP CONSTRAINT manekineko_affiliate_rates_shape_check,
  ADD CONSTRAINT manekineko_affiliate_version_check CHECK (contract_version IN ('affiliate-v3','affiliate-v4','affiliate-v5')),
  ADD CONSTRAINT manekineko_affiliate_rates_shape_check CHECK (
    (contract_version='affiliate-v5' AND cardinality(affiliate_rates_bps)=0 AND commission_bps IS NULL)
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
  IF NEW.contract_version IN ('affiliate-v4','affiliate-v5') THEN NEW.commission_bps:=NULL; END IF;
  IF NEW.contract_version='affiliate-v5' AND (config.contract_version<>'affiliate-v5' OR config.affiliate_pool_bps IS NULL OR cardinality(NEW.affiliate_rates_bps)<>0) THEN
    RAISE EXCEPTION 'V5 requires a matching pool collection and no individual rates';
  END IF;
  FOREACH rate IN ARRAY NEW.affiliate_rates_bps LOOP
    IF rate IS NULL OR rate<0 OR rate>10000 OR rate+config.prize_bps>10000 THEN RAISE EXCEPTION 'Affiliate rate and prize exceed the value of a referred purchase'; END IF;
  END LOOP;
  IF NEW.mode='live' AND (config.algorithm_version<>'unique-rank-v2' OR config.chain_id NOT IN (1,11155111)
    OR config.contract_version<>NEW.contract_version OR mod(config.mint_price_wei,CASE WHEN NEW.contract_version IN ('affiliate-v4','affiliate-v5') THEN 10000 ELSE 100 END)<>0) THEN
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

-- For V5 this versioned offer column binds the collection pool, never a personal commission.
ALTER TABLE manekineko_affiliate_challenges DROP CONSTRAINT manekineko_affiliate_challenges_contract_version_check,
  DROP CONSTRAINT manekineko_affiliate_challenge_offer_check,
  ADD CONSTRAINT manekineko_affiliate_challenges_contract_version_check CHECK (contract_version IN ('affiliate-v3','affiliate-v4','affiliate-v5')),
  ADD CONSTRAINT manekineko_affiliate_challenge_offer_check CHECK (
    (contract_version='affiliate-v3' AND affiliate_id IS NULL AND commission_bps IS NULL)
    OR (contract_version IN ('affiliate-v4','affiliate-v5') AND affiliate_id IS NOT NULL AND commission_bps IS NOT NULL AND affiliate_id BETWEEN 1 AND 100 AND commission_bps BETWEEN 0 AND 10000)
  );
CREATE OR REPLACE FUNCTION manekineko_validate_affiliate_challenge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM manekineko_affiliate_programs p JOIN manekineko_deployments d USING(collection_id) JOIN manekineko_collections c ON c.id=p.collection_id
    WHERE p.collection_id=NEW.collection_id AND p.mode='live' AND p.enrollment_enabled AND d.status='deployed'
    AND d.chain_id=NEW.chain_id AND d.contract_address=NEW.contract_address AND p.contract_version=NEW.contract_version
    AND (NEW.contract_version='affiliate-v3' OR (NEW.affiliate_id<=p.max_slots AND
      CASE WHEN NEW.contract_version='affiliate-v5' THEN c.affiliate_pool_bps ELSE p.affiliate_rates_bps[NEW.affiliate_id] END=NEW.commission_bps))) THEN
    RAISE EXCEPTION 'Enrollment challenge requires an enabled deployed program and its exact offered rate or pool terms';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.collection_id<>OLD.collection_id OR NEW.wallet<>OLD.wallet OR NEW.chain_id<>OLD.chain_id OR NEW.contract_address<>OLD.contract_address
    OR NEW.contract_version<>OLD.contract_version OR NEW.affiliate_id IS DISTINCT FROM OLD.affiliate_id OR NEW.commission_bps IS DISTINCT FROM OLD.commission_bps
    OR NEW.origin<>OLD.origin OR NEW.nonce<>OLD.nonce OR NEW.ip_digest<>OLD.ip_digest OR NEW.expires_at<>OLD.expires_at OR NEW.created_at<>OLD.created_at OR OLD.consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Enrollment challenges and offered terms are immutable and single use';
  END IF;
  RETURN NEW;
END; $$;
COMMIT;
