BEGIN;
-- Existing deployed versions keep their immutable terms. New V7 collections opt in explicitly.
ALTER TABLE manekineko_collections
  ADD COLUMN second_prize_bps integer,
  ADD COLUMN min_affiliate_referrals integer,
  ADD COLUMN affiliate_payout_cap_bps integer,
  ADD COLUMN sale_start_at timestamptz,
  ADD CONSTRAINT manekineko_v7_terms_check CHECK (
    (contract_version='affiliate-v7' AND second_prize_bps IS NOT NULL AND second_prize_bps>0 AND second_prize_bps<prize_bps
      AND min_affiliate_referrals IS NOT NULL AND min_affiliate_referrals BETWEEN 1 AND max_supply
      AND affiliate_payout_cap_bps IS NOT NULL AND affiliate_payout_cap_bps BETWEEN 1 AND 10000
      AND sale_start_at IS NOT NULL AND max_supply>=2)
    OR (contract_version<>'affiliate-v7' AND second_prize_bps IS NULL AND min_affiliate_referrals IS NULL AND affiliate_payout_cap_bps IS NULL AND sale_start_at IS NULL)
  );
-- Extend specific version predicates while preserving the full historical constraints.
DO $migration$ DECLARE item record; expression text; extra text; BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('manekineko_collections','manekineko_collections_contract_version_check', $$contract_version='affiliate-v7'$$),
    ('manekineko_collections','manekineko_collection_algorithm_check', $$algorithm_version='unique-rank-v4' AND randomness_provider='chainlink-vrf-v2.5' AND chain_id IN (1,11155111) AND reveal_delay_blocks IS NULL$$),
    ('manekineko_collections','manekineko_collection_financial_version_check', $$contract_version='affiliate-v7' AND algorithm_version='unique-rank-v4' AND affiliate_pool_bps IS NOT NULL AND affiliate_pool_bps BETWEEN 0 AND 10000 AND prize_bps+affiliate_pool_bps<=10000 AND mod(mint_price_wei,10000)=0$$),
    ('manekineko_collections','manekineko_collection_season_appearance_check', $$contract_version='affiliate-v7' AND season_id IS NOT NULL AND season_id ~ '^0x[0-9a-f]{64}$' AND season_id<>'0x'||repeat('0',64) AND season_name IS NOT NULL AND octet_length(season_name) BETWEEN 1 AND 64 AND season_name=btrim(season_name) AND season_name !~ '[[:cntrl:]]' AND collection_color IS NOT NULL AND collection_color ~ '^#[0-9A-F]{6}$' AND text_color IN ('#000000','#FFFFFF')$$),
    ('manekineko_affiliate_programs','manekineko_affiliate_version_check', $$contract_version='affiliate-v7'$$),
    ('manekineko_affiliate_programs','manekineko_affiliate_rates_shape_check', $$contract_version='affiliate-v7' AND cardinality(affiliate_rates_bps)=0 AND commission_bps IS NULL$$),
    ('manekineko_affiliate_challenges','manekineko_affiliate_challenges_contract_version_check', $$contract_version='affiliate-v7'$$),
    ('manekineko_affiliate_challenges','manekineko_affiliate_eligibility_proof_check', $$contract_version='affiliate-v7' AND eligibility_source_address IS NOT NULL AND eligibility_source_address ~ '^0x[0-9a-f]{40}$' AND eligibility_token_id IS NOT NULL AND ((eligibility_source_address='0x'||repeat('0',40) AND eligibility_token_id=0) OR (eligibility_source_address<>'0x'||repeat('0',40) AND eligibility_token_id BETWEEN 1 AND 65536))$$),
    ('manekineko_affiliate_challenges','manekineko_affiliate_challenge_offer_check', $$contract_version='affiliate-v7' AND affiliate_id IS NOT NULL AND commission_bps IS NOT NULL AND affiliate_id BETWEEN 1 AND 100 AND commission_bps BETWEEN 0 AND 10000$$)
  ) AS entries(relation,name,allowed) LOOP
    SELECT pg_get_expr(conbin,conrelid) INTO STRICT expression FROM pg_constraint WHERE conrelid=item.relation::regclass AND conname=item.name;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',item.relation,item.name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ((%s) OR (%s))',item.relation,item.name,expression,item.allowed);
  END LOOP;
END; $migration$;
-- These functions include the admission, immutable-term and NFT eligibility safeguards.
DO $$ DECLARE signature text; definition text; BEGIN
  FOREACH signature IN ARRAY ARRAY['manekineko_validate_affiliate_program()','manekineko_validate_affiliate_challenge()','manekineko_keep_algorithm()','manekineko_keep_affiliate_eligibility_proof()'] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    definition:=replace(definition,'''affiliate-v5'',''affiliate-v6''','''affiliate-v5'',''affiliate-v6'',''affiliate-v7''');
    definition:=replace(definition,'WHEN NEW.contract_version=''affiliate-v6'' THEN ''unique-rank-v3''','WHEN NEW.contract_version=''affiliate-v7'' THEN ''unique-rank-v4'' WHEN NEW.contract_version=''affiliate-v6'' THEN ''unique-rank-v3''');
    definition:=replace(definition,'''unique-rank-v2'',''unique-rank-v3''','''unique-rank-v2'',''unique-rank-v3'',''unique-rank-v4''');
    definition:=replace(definition,'NEW.contract_version=''affiliate-v6''','NEW.contract_version IN (''affiliate-v6'',''affiliate-v7'')');
    EXECUTE definition;
  END LOOP;
END; $$;
ALTER TABLE manekineko_collection_state
  ADD COLUMN award_count integer NOT NULL DEFAULT 1 CHECK(award_count IN (1,2)),
  ADD COLUMN sold_out_at timestamptz,
  ADD COLUMN revealed_at timestamptz,
  ADD COLUMN all_prizes_paid boolean NOT NULL DEFAULT false;
UPDATE manekineko_collection_state SET all_prizes_paid=prize_paid;

ALTER TABLE manekineko_collection_state DROP CONSTRAINT manekineko_state_prize_fields_check;
ALTER TABLE manekineko_collection_state ADD CONSTRAINT manekineko_state_prize_fields_check CHECK (
  (award_count=1 AND ((prize_paid AND winning_token_id IS NOT NULL AND highest_score IS NOT NULL AND prize_recipient IS NOT NULL AND prize_transaction_hash IS NOT NULL)
    OR (NOT prize_paid AND prize_recipient IS NULL AND prize_paid_wei=0 AND prize_transaction_hash IS NULL)))
  OR (award_count=2 AND prize_recipient IS NULL AND prize_transaction_hash IS NULL AND all_prizes_paid=prize_paid
    AND (prize_paid_wei=0 OR (winning_token_id IS NOT NULL AND highest_score IS NOT NULL)))
);
CREATE OR REPLACE FUNCTION manekineko_validate_snapshot_prize() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c manekineko_collections%ROWTYPE; BEGIN
  SELECT * INTO STRICT c FROM manekineko_collections WHERE id=NEW.collection_id FOR SHARE;
  IF NEW.award_count<>(CASE WHEN c.contract_version='affiliate-v7' THEN 2 ELSE 1 END)
    OR NEW.prize_paid_wei>NEW.total_mint_revenue_wei*c.prize_bps/10000
    OR (NEW.prize_paid AND NEW.prize_paid_wei<>NEW.total_mint_revenue_wei*c.prize_bps/10000) THEN
    RAISE EXCEPTION 'Prize does not match immutable collection terms';
  END IF;
  RETURN NEW;
END; $$;
CREATE FUNCTION manekineko_keep_v7_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.second_prize_bps IS DISTINCT FROM OLD.second_prize_bps OR NEW.min_affiliate_referrals IS DISTINCT FROM OLD.min_affiliate_referrals
    OR NEW.affiliate_payout_cap_bps IS DISTINCT FROM OLD.affiliate_payout_cap_bps OR NEW.sale_start_at IS DISTINCT FROM OLD.sale_start_at) THEN
    RAISE EXCEPTION 'V7 prize, referral and launch terms are immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER manekineko_keep_v7_terms BEFORE UPDATE ON manekineko_collections FOR EACH ROW EXECUTE FUNCTION manekineko_keep_v7_terms();
CREATE TABLE manekineko_collection_awards (
  collection_id uuid NOT NULL REFERENCES manekineko_collections(id),
  rank integer NOT NULL CHECK(rank BETWEEN 1 AND 2),
  token_id integer NOT NULL CHECK(token_id BETWEEN 1 AND 65536),
  score numeric(78,0) NOT NULL CHECK(score BETWEEN 1 AND 65536),
  amount_wei numeric(78,0) NOT NULL CHECK(amount_wei>0),
  numbers integer[] NOT NULL CHECK(array_ndims(numbers)=1 AND cardinality(numbers)=4 AND array_position(numbers,NULL) IS NULL AND 1<=ALL(numbers) AND 16>=ALL(numbers)),
  combination_code integer NOT NULL CHECK(combination_code BETWEEN 0 AND 65535),
  combination_key text NOT NULL CHECK(combination_key ~ '^0x[0-9a-f]{64}$'),
  current_holder text NOT NULL CHECK(current_holder ~ '^0x[0-9a-f]{40}$' AND current_holder<>'0x'||repeat('0',40)),
  determined_at timestamptz NOT NULL,
  determined_transaction text NOT NULL CHECK(determined_transaction ~ '^0x[0-9a-f]{64}$'),
  claimed boolean NOT NULL,
  winning_holder text CHECK(winning_holder ~ '^0x[0-9a-f]{40}$'),
  recipient text CHECK(recipient ~ '^0x[0-9a-f]{40}$'),
  paid_at timestamptz,
  claim_transaction text CHECK(claim_transaction ~ '^0x[0-9a-f]{64}$'),
  block_number bigint NOT NULL CHECK(block_number>=0),
  block_hash text NOT NULL CHECK(block_hash ~ '^0x[0-9a-f]{64}$'),
  PRIMARY KEY(collection_id,rank), UNIQUE(collection_id,token_id), UNIQUE(collection_id,score),
  CHECK ((claimed AND winning_holder IS NOT NULL AND recipient IS NOT NULL AND paid_at IS NOT NULL AND claim_transaction IS NOT NULL AND paid_at>=determined_at)
    OR (NOT claimed AND winning_holder IS NULL AND recipient IS NULL AND paid_at IS NULL AND claim_transaction IS NULL)),
  CHECK(combination_code=(numbers[1]-1)*4096+(numbers[2]-1)*256+(numbers[3]-1)*16+numbers[4]-1)
);
CREATE FUNCTION manekineko_validate_collection_award() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c manekineko_collections%ROWTYPE; BEGIN
  SELECT * INTO STRICT c FROM manekineko_collections WHERE id=NEW.collection_id FOR SHARE;
  IF c.contract_version<>'affiliate-v7' OR NEW.token_id>c.max_supply OR NEW.score<>c.max_supply-NEW.rank+1
    OR NEW.amount_wei<>c.max_supply*c.mint_price_wei*(CASE WHEN NEW.rank=1 THEN c.prize_bps-c.second_prize_bps ELSE c.second_prize_bps END)/10000 THEN
    RAISE EXCEPTION 'Award does not match versioned collection terms';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER manekineko_validate_collection_award BEFORE INSERT OR UPDATE ON manekineko_collection_awards
  FOR EACH ROW EXECUTE FUNCTION manekineko_validate_collection_award();
COMMENT ON TABLE manekineko_collection_awards IS 'Canonical V7 ranked results, including unclaimed prizes. Rebuilt atomically on reorganization; draw readiness is separate from holder claims.';
COMMENT ON COLUMN manekineko_collection_state.sold_out_at IS 'Canonical on-chain sellout time. Future season scheduling uses this fixed anchor, not keeper execution time.';
COMMIT;
