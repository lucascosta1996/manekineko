-- V4 records carry their exact immutable financial terms. Historical V1/V2/V3 remain 50 percent.
BEGIN;
ALTER TABLE manekineko_collections
  ADD COLUMN contract_version text NOT NULL DEFAULT 'legacy' CHECK (contract_version IN ('legacy','affiliate-v3','affiliate-v4')),
  ADD COLUMN prize_bps integer NOT NULL DEFAULT 5000 CHECK (prize_bps BETWEEN 0 AND 10000),
  ADD CONSTRAINT manekineko_collection_financial_version_check CHECK (
    (contract_version='legacy' AND prize_bps=5000)
    OR (contract_version='affiliate-v3' AND prize_bps=5000 AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,100)=0)
    OR (contract_version='affiliate-v4' AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,10000)=0)
  );
UPDATE manekineko_collections c SET contract_version='affiliate-v3'
FROM manekineko_affiliate_programs p WHERE p.collection_id=c.id AND p.mode='live';
ALTER TABLE manekineko_collection_history
  ADD COLUMN contract_version text NOT NULL DEFAULT 'legacy' CHECK (contract_version IN ('legacy','affiliate-v3','affiliate-v4')),
  ADD COLUMN prize_bps integer NOT NULL DEFAULT 5000 CHECK (prize_bps BETWEEN 0 AND 10000),
  ADD CONSTRAINT manekineko_history_financial_version_check CHECK (
    (contract_version='legacy' AND prize_bps=5000)
    OR (contract_version='affiliate-v3' AND prize_bps=5000 AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,100)=0)
    OR (contract_version='affiliate-v4' AND algorithm_version='unique-rank-v2' AND mod(mint_price_wei,10000)=0)
  );
ALTER TABLE manekineko_history_winners DROP CONSTRAINT manekineko_history_winners_prize_paid_wei_check;
ALTER TABLE manekineko_history_winners ADD CONSTRAINT manekineko_history_winner_prize_wei_check CHECK (prize_paid_wei BETWEEN 0 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935);
CREATE FUNCTION manekineko_keep_financial_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contract_version<>OLD.contract_version OR NEW.prize_bps<>OLD.prize_bps THEN
    RAISE EXCEPTION 'Collection financial terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_collection_financial_terms BEFORE UPDATE ON manekineko_collections
FOR EACH ROW EXECUTE FUNCTION manekineko_keep_financial_terms();
CREATE TRIGGER manekineko_history_financial_terms BEFORE UPDATE ON manekineko_collection_history
FOR EACH ROW EXECUTE FUNCTION manekineko_keep_financial_terms();

-- Preserve all existing snapshot checks, moving the prize arithmetic to the collection-aware trigger.
DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint WHERE conrelid='manekineko_collection_state'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%prize_paid_wei%/ (2)%';
  EXECUTE format('ALTER TABLE manekineko_collection_state DROP CONSTRAINT %I',constraint_name);
END; $$;
ALTER TABLE manekineko_collection_state ADD CONSTRAINT manekineko_state_prize_fields_check CHECK (
  (prize_paid AND winning_token_id IS NOT NULL AND highest_score IS NOT NULL AND prize_recipient IS NOT NULL AND prize_transaction_hash IS NOT NULL)
  OR (NOT prize_paid AND prize_recipient IS NULL AND prize_paid_wei=0 AND prize_transaction_hash IS NULL)
);
CREATE FUNCTION manekineko_validate_snapshot_prize() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bps integer;
BEGIN
  SELECT prize_bps INTO STRICT bps FROM manekineko_collections WHERE id=NEW.collection_id FOR SHARE;
  IF NEW.prize_paid AND NEW.prize_paid_wei<>NEW.total_mint_revenue_wei*bps/10000 THEN
    RAISE EXCEPTION 'Prize does not match the immutable collection percentage';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_state_prize_valid BEFORE INSERT OR UPDATE ON manekineko_collection_state
FOR EACH ROW EXECUTE FUNCTION manekineko_validate_snapshot_prize();
-- Retain the existing shared archive locks, winner validation and V2 randomness rules.
DO $$ DECLARE definition text; updated text; BEGIN
  SELECT pg_get_functiondef('manekineko_validate_history()'::regprocedure) INTO definition;
  updated:=replace(definition,'winner.prize_paid_wei <> archive.total_minted * archive.mint_price_wei / 2','winner.prize_paid_wei <> archive.total_minted * archive.mint_price_wei * archive.prize_bps / 10000');
  IF updated=definition THEN RAISE EXCEPTION 'Expected legacy history prize validation was not found'; END IF;
  EXECUTE replace(updated,'50 percent prize','configured prize percentage');
END; $$;

ALTER TABLE manekineko_affiliate_programs
  DROP CONSTRAINT manekineko_affiliate_programs_contract_version_check,
  DROP CONSTRAINT manekineko_affiliate_programs_commission_bps_check,
  ALTER COLUMN commission_bps DROP NOT NULL,
  ADD COLUMN affiliate_rates_bps integer[],
  ADD CONSTRAINT manekineko_affiliate_version_check CHECK (contract_version IN ('affiliate-v3','affiliate-v4'));
-- The array is the immutable deployment schedule; array index 1 represents position 1.
UPDATE manekineko_affiliate_programs SET affiliate_rates_bps=array_fill(100,ARRAY[max_slots]);
ALTER TABLE manekineko_affiliate_programs ALTER COLUMN affiliate_rates_bps SET NOT NULL;
ALTER TABLE manekineko_affiliate_programs ADD CONSTRAINT manekineko_affiliate_rates_shape_check CHECK (
  array_ndims(affiliate_rates_bps)=1 AND array_lower(affiliate_rates_bps,1)=1 AND cardinality(affiliate_rates_bps)=max_slots
  AND array_position(affiliate_rates_bps,NULL) IS NULL
  AND ((contract_version='affiliate-v3' AND commission_bps=100 AND affiliate_rates_bps=array_fill(100,ARRAY[max_slots]))
    OR (contract_version='affiliate-v4' AND commission_bps IS NULL))
);
CREATE OR REPLACE FUNCTION manekineko_validate_affiliate_program() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE config manekineko_collections%ROWTYPE; rate integer; demo_transition boolean:=false;
BEGIN
  SELECT * INTO STRICT config FROM manekineko_collections WHERE id=NEW.collection_id FOR SHARE;
  IF NEW.affiliate_rates_bps IS NULL THEN
    IF NEW.contract_version='affiliate-v3' THEN NEW.affiliate_rates_bps:=array_fill(100,ARRAY[NEW.max_slots]);
    ELSE RAISE EXCEPTION 'V4 requires an explicit affiliate rate schedule'; END IF;
  END IF;
  IF NEW.contract_version='affiliate-v4' THEN NEW.commission_bps:=NULL; END IF;
  FOREACH rate IN ARRAY NEW.affiliate_rates_bps LOOP
    IF rate IS NULL OR rate<0 OR rate>10000 OR rate+config.prize_bps>10000 THEN
      RAISE EXCEPTION 'Affiliate rate and prize exceed the value of a referred purchase';
    END IF;
  END LOOP;
  IF NEW.mode='live' AND (config.algorithm_version<>'unique-rank-v2' OR config.chain_id NOT IN (1,11155111)
    OR config.contract_version<>NEW.contract_version OR mod(config.mint_price_wei,CASE WHEN NEW.contract_version='affiliate-v4' THEN 10000 ELSE 100 END)<>0) THEN
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
END;
$$;

ALTER TABLE manekineko_affiliate_challenges
  ADD COLUMN contract_version text NOT NULL DEFAULT 'affiliate-v3' CHECK (contract_version IN ('affiliate-v3','affiliate-v4')),
  ADD COLUMN affiliate_id integer,
  ADD COLUMN commission_bps integer,
  ADD CONSTRAINT manekineko_affiliate_challenge_offer_check CHECK (
    (contract_version='affiliate-v3' AND affiliate_id IS NULL AND commission_bps IS NULL)
    OR (contract_version='affiliate-v4' AND affiliate_id IS NOT NULL AND commission_bps IS NOT NULL AND affiliate_id BETWEEN 1 AND 100 AND commission_bps BETWEEN 0 AND 10000)
  );
CREATE OR REPLACE FUNCTION manekineko_validate_affiliate_challenge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM manekineko_affiliate_programs p JOIN manekineko_deployments d USING(collection_id)
    WHERE p.collection_id=NEW.collection_id AND p.mode='live' AND p.enrollment_enabled AND d.status='deployed'
    AND d.chain_id=NEW.chain_id AND d.contract_address=NEW.contract_address AND p.contract_version=NEW.contract_version
    AND (NEW.contract_version='affiliate-v3' OR (NEW.affiliate_id<=p.max_slots AND p.affiliate_rates_bps[NEW.affiliate_id]=NEW.commission_bps))) THEN
    RAISE EXCEPTION 'Enrollment challenge requires an enabled deployed program and its exact offered rate';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.collection_id<>OLD.collection_id OR NEW.wallet<>OLD.wallet OR NEW.chain_id<>OLD.chain_id OR NEW.contract_address<>OLD.contract_address
    OR NEW.contract_version<>OLD.contract_version OR NEW.affiliate_id IS DISTINCT FROM OLD.affiliate_id OR NEW.commission_bps IS DISTINCT FROM OLD.commission_bps
    OR NEW.origin<>OLD.origin OR NEW.nonce<>OLD.nonce OR NEW.ip_digest<>OLD.ip_digest OR NEW.expires_at<>OLD.expires_at OR NEW.created_at<>OLD.created_at OR OLD.consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Enrollment challenges and offered terms are immutable and single use';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE manekineko_affiliate_demo_accounts ADD COLUMN referred_mints integer NOT NULL DEFAULT 0 CHECK (referred_mints BETWEEN 0 AND 65536);
UPDATE manekineko_affiliate_demo_accounts a SET referred_mints=(a.accrued_wei/(c.mint_price_wei/100))::integer
FROM manekineko_collections c WHERE c.id=a.collection_id;
ALTER TABLE manekineko_affiliate_demo_accounts DROP CONSTRAINT manekineko_affiliate_demo_accounts_scenario_check;
DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint WHERE conrelid='manekineko_affiliate_demo_accounts'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%scenario%no_referrals%accrued_wei%';
  EXECUTE format('ALTER TABLE manekineko_affiliate_demo_accounts DROP CONSTRAINT %I',constraint_name);
END; $$;
ALTER TABLE manekineko_affiliate_demo_accounts ADD CONSTRAINT manekineko_demo_scenario_check CHECK (
  (scenario='no_referrals' AND referred_mints=0 AND accrued_wei=0 AND claimed_wei=0 AND NOT refundable)
  OR (scenario='pending_sellout' AND accrued_wei>0 AND claimed_wei=0 AND NOT refundable AND NOT sold_out)
  OR (scenario='claimable' AND accrued_wei>claimed_wei AND sold_out AND NOT refundable)
  OR (scenario='paid' AND accrued_wei>0 AND accrued_wei=claimed_wei AND sold_out AND NOT refundable)
  OR (scenario='refunded' AND claimed_wei=0 AND refundable AND NOT sold_out)
  OR (scenario='no_commission' AND referred_mints>0 AND accrued_wei=0 AND claimed_wei=0 AND NOT refundable)
);
CREATE OR REPLACE FUNCTION manekineko_validate_affiliate_demo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE program manekineko_affiliate_programs%ROWTYPE; price numeric; supply integer; rate integer;
BEGIN
  SELECT * INTO STRICT program FROM manekineko_affiliate_programs WHERE collection_id=NEW.collection_id;
  SELECT mint_price_wei,max_supply INTO STRICT price,supply FROM manekineko_collections WHERE id=NEW.collection_id;
  rate:=program.affiliate_rates_bps[NEW.affiliate_id];
  -- Old repeatable V3 seeds omit the count; infer it only under the original fixed commission.
  IF program.contract_version='affiliate-v3' AND NEW.referred_mints=0 AND NEW.accrued_wei>0 THEN NEW.referred_mints:=(NEW.accrued_wei/(price/100))::integer; END IF;
  IF program.mode<>'demo' OR NEW.affiliate_id>program.max_slots OR NEW.enrolled_slots>program.max_slots OR rate IS NULL
    OR NEW.referred_mints>supply OR NEW.accrued_wei<>NEW.referred_mints*price*rate/10000 THEN
    RAISE EXCEPTION 'Invalid fictional affiliate fixture';
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
