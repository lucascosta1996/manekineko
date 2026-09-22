BEGIN;
-- V8 uses a configurable equal prize count; previously deployed versions remain unchanged.
ALTER TABLE manekineko_collections ADD COLUMN winner_count integer;
ALTER TABLE manekineko_collections DROP CONSTRAINT manekineko_v7_terms_check;
ALTER TABLE manekineko_collections ADD CONSTRAINT manekineko_ranked_terms_check CHECK (
 (contract_version='affiliate-v7' AND winner_count IS NULL AND second_prize_bps IS NOT NULL AND second_prize_bps>0 AND second_prize_bps<prize_bps
   AND min_affiliate_referrals IS NOT NULL AND min_affiliate_referrals BETWEEN 1 AND max_supply
   AND affiliate_payout_cap_bps IS NOT NULL AND affiliate_payout_cap_bps BETWEEN 1 AND 10000 AND sale_start_at IS NOT NULL AND max_supply>=2)
 OR (contract_version='affiliate-v8' AND second_prize_bps IS NULL AND winner_count IS NOT NULL AND winner_count BETWEEN 1 AND 10 AND winner_count<=max_supply
   AND prize_bps>0 AND mod(prize_bps,winner_count)=0
   AND min_affiliate_referrals IS NOT NULL AND min_affiliate_referrals BETWEEN 1 AND max_supply
   AND affiliate_payout_cap_bps IS NOT NULL AND affiliate_payout_cap_bps BETWEEN 1 AND 10000 AND sale_start_at IS NOT NULL)
 OR (contract_version NOT IN ('affiliate-v7','affiliate-v8') AND winner_count IS NULL AND second_prize_bps IS NULL AND min_affiliate_referrals IS NULL AND affiliate_payout_cap_bps IS NULL AND sale_start_at IS NULL)
);
DO $migration$ DECLARE item record; expression text; extra text; BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('manekineko_collections','manekineko_collections_contract_version_check', $$contract_version='affiliate-v8'$$),
    ('manekineko_collections','manekineko_collection_algorithm_check', $$algorithm_version='unique-rank-v5' AND randomness_provider='chainlink-vrf-v2.5' AND chain_id IN (1,11155111) AND reveal_delay_blocks IS NULL$$),
    ('manekineko_collections','manekineko_collection_financial_version_check', $$contract_version='affiliate-v8' AND algorithm_version='unique-rank-v5' AND affiliate_pool_bps IS NOT NULL AND affiliate_pool_bps BETWEEN 0 AND 10000 AND prize_bps+affiliate_pool_bps<=10000 AND mod(mint_price_wei,10000)=0$$),
    ('manekineko_collections','manekineko_collection_season_appearance_check', $$contract_version='affiliate-v8' AND season_id IS NOT NULL AND season_id ~ '^0x[0-9a-f]{64}$' AND season_id<>'0x'||repeat('0',64) AND season_name IS NOT NULL AND octet_length(season_name) BETWEEN 1 AND 64 AND season_name=btrim(season_name) AND season_name !~ '[[:cntrl:]]' AND collection_color IS NOT NULL AND collection_color ~ '^#[0-9A-F]{6}$' AND text_color IN ('#000000','#FFFFFF')$$),
    ('manekineko_affiliate_programs','manekineko_affiliate_version_check', $$contract_version='affiliate-v8'$$),
    ('manekineko_affiliate_programs','manekineko_affiliate_rates_shape_check', $$contract_version='affiliate-v8' AND cardinality(affiliate_rates_bps)=0 AND commission_bps IS NULL$$),
    ('manekineko_affiliate_challenges','manekineko_affiliate_challenges_contract_version_check', $$contract_version='affiliate-v8'$$),
    ('manekineko_affiliate_challenges','manekineko_affiliate_eligibility_proof_check', $$contract_version='affiliate-v8' AND eligibility_source_address IS NOT NULL AND eligibility_source_address ~ '^0x[0-9a-f]{40}$' AND eligibility_token_id IS NOT NULL AND ((eligibility_source_address='0x'||repeat('0',40) AND eligibility_token_id=0) OR (eligibility_source_address<>'0x'||repeat('0',40) AND eligibility_token_id BETWEEN 1 AND 65536))$$),
    ('manekineko_affiliate_challenges','manekineko_affiliate_challenge_offer_check', $$contract_version='affiliate-v8' AND affiliate_id IS NOT NULL AND commission_bps IS NOT NULL AND affiliate_id BETWEEN 1 AND 100 AND commission_bps BETWEEN 0 AND 10000$$)
  ) AS entries(relation,name,allowed) LOOP
    SELECT pg_get_expr(conbin,conrelid) INTO STRICT expression FROM pg_constraint WHERE conrelid=item.relation::regclass AND conname=item.name;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',item.relation,item.name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ((%s) OR (%s))',item.relation,item.name,expression,item.allowed);
  END LOOP;
END; $migration$;

DO $$ DECLARE signature text; definition text; BEGIN
 FOREACH signature IN ARRAY ARRAY['manekineko_validate_affiliate_program()','manekineko_validate_affiliate_challenge()','manekineko_keep_algorithm()','manekineko_keep_affiliate_eligibility_proof()'] LOOP
   SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
   definition:=replace(definition,'''affiliate-v5'',''affiliate-v6'',''affiliate-v7''','''affiliate-v5'',''affiliate-v6'',''affiliate-v7'',''affiliate-v8''');
   definition:=replace(definition,'WHEN NEW.contract_version=''affiliate-v7'' THEN ''unique-rank-v4''','WHEN NEW.contract_version=''affiliate-v8'' THEN ''unique-rank-v5'' WHEN NEW.contract_version=''affiliate-v7'' THEN ''unique-rank-v4''');
   definition:=replace(definition,'''unique-rank-v2'',''unique-rank-v3'',''unique-rank-v4''','''unique-rank-v2'',''unique-rank-v3'',''unique-rank-v4'',''unique-rank-v5''');
   definition:=replace(definition,'NEW.contract_version IN (''affiliate-v6'',''affiliate-v7'')','NEW.contract_version IN (''affiliate-v6'',''affiliate-v7'',''affiliate-v8'')');
   EXECUTE definition;
 END LOOP;
END; $$;
ALTER TABLE manekineko_collection_state DROP CONSTRAINT manekineko_collection_state_award_count_check;
ALTER TABLE manekineko_collection_state ADD CONSTRAINT manekineko_collection_state_award_count_check CHECK(award_count BETWEEN 1 AND 10);
ALTER TABLE manekineko_collection_state DROP CONSTRAINT manekineko_state_prize_fields_check;
ALTER TABLE manekineko_collection_state ADD CONSTRAINT manekineko_state_prize_fields_check CHECK (
 (award_count=1 AND ((prize_paid AND winning_token_id IS NOT NULL AND highest_score IS NOT NULL AND prize_recipient IS NOT NULL AND prize_transaction_hash IS NOT NULL)
   OR (NOT prize_paid AND prize_recipient IS NULL AND prize_paid_wei=0 AND prize_transaction_hash IS NULL)))
 OR (prize_recipient IS NULL AND prize_transaction_hash IS NULL AND all_prizes_paid=prize_paid
   AND (prize_paid_wei=0 OR (winning_token_id IS NOT NULL AND highest_score IS NOT NULL)))
);
CREATE OR REPLACE FUNCTION manekineko_validate_snapshot_prize() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c manekineko_collections%ROWTYPE; BEGIN
 SELECT * INTO STRICT c FROM manekineko_collections WHERE id=NEW.collection_id FOR SHARE;
 IF NEW.award_count<>(CASE WHEN c.contract_version='affiliate-v8' THEN c.winner_count WHEN c.contract_version='affiliate-v7' THEN 2 ELSE 1 END)
   OR NEW.prize_paid_wei>NEW.total_mint_revenue_wei*c.prize_bps/10000
   OR (NEW.prize_paid AND NEW.prize_paid_wei<>NEW.total_mint_revenue_wei*c.prize_bps/10000) THEN RAISE EXCEPTION 'Prize does not match immutable collection terms'; END IF;
 IF c.contract_version IN ('affiliate-v7','affiliate-v8') THEN
   IF NEW.prize_recipient IS NOT NULL OR NEW.prize_transaction_hash IS NOT NULL OR NEW.all_prizes_paid<>NEW.prize_paid THEN RAISE EXCEPTION 'Ranked prizes require individual award claims'; END IF;
 ELSE
   IF (NEW.prize_paid AND (NEW.prize_recipient IS NULL OR NEW.prize_transaction_hash IS NULL))
     OR (NOT NEW.prize_paid AND (NEW.prize_recipient IS NOT NULL OR NEW.prize_transaction_hash IS NOT NULL OR NEW.prize_paid_wei<>0)) THEN RAISE EXCEPTION 'Legacy prize fields are inconsistent'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION manekineko_keep_winner_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.winner_count IS DISTINCT FROM OLD.winner_count THEN RAISE EXCEPTION 'Winner count is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER manekineko_keep_winner_count BEFORE UPDATE ON manekineko_collections FOR EACH ROW EXECUTE FUNCTION manekineko_keep_winner_count();
ALTER TABLE manekineko_collection_awards DROP CONSTRAINT manekineko_collection_awards_rank_check;
ALTER TABLE manekineko_collection_awards ADD CONSTRAINT manekineko_collection_awards_rank_check CHECK(rank BETWEEN 1 AND 10);
CREATE OR REPLACE FUNCTION manekineko_validate_collection_award() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c manekineko_collections%ROWTYPE; count integer; bps integer; BEGIN
 SELECT * INTO STRICT c FROM manekineko_collections WHERE id=NEW.collection_id FOR SHARE;
 IF c.contract_version='affiliate-v8' THEN count:=c.winner_count; bps:=c.prize_bps/c.winner_count;
 ELSIF c.contract_version='affiliate-v7' THEN count:=2; bps:=CASE WHEN NEW.rank=1 THEN c.prize_bps-c.second_prize_bps ELSE c.second_prize_bps END;
 ELSE RAISE EXCEPTION 'This collection does not use ranked awards'; END IF;
 IF NEW.rank>count OR NEW.token_id>c.max_supply OR NEW.score<>c.max_supply-NEW.rank+1 OR NEW.amount_wei<>c.max_supply*c.mint_price_wei*bps/10000 THEN
   RAISE EXCEPTION 'Award does not match versioned collection terms'; END IF;
 RETURN NEW;
END; $$;
COMMENT ON TABLE manekineko_collection_awards IS 'Canonical ranked results and holder claims: V7 two unequal prizes, V8 configured equal prizes. Rebuilt atomically on reorganization.';
-- Admit V8 drafts without rewriting finalized V7 or historical payload hashes.
CREATE FUNCTION manekineko_valid_equal_prizes(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE c jsonb:=p->'contract'; winners integer; prize integer; supply integer; BEGIN
 IF jsonb_typeof(c->'winnerCount') IS DISTINCT FROM 'string' OR c->>'winnerCount' !~ '^([1-9]|10)$'
   OR jsonb_typeof(c->'prizeBps') IS DISTINCT FROM 'string' OR c->>'prizeBps' !~ '^[1-9][0-9]{0,4}$'
   OR jsonb_typeof(c->'maxSupply') IS DISTINCT FROM 'string' OR c->>'maxSupply' !~ '^[1-9][0-9]{0,4}$'
   OR c ? 'secondPrizeBps' THEN RETURN false; END IF;
 winners:=(c->>'winnerCount')::integer; prize:=(c->>'prizeBps')::integer; supply:=(c->>'maxSupply')::integer;
 RETURN supply BETWEEN winners AND 65536 AND prize BETWEEN 1 AND 10000 AND mod(prize,winners)=0;
END; $$;
CREATE OR REPLACE FUNCTION manekineko_launch_payload_version(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT CASE WHEN p->'contract' ? 'algorithmVersion' THEN CASE
   WHEN p->'contract'->>'algorithmVersion'='unique-rank-v5'
     AND (p->'contract' ?& ARRAY['affiliatePoolBps','winnerCount','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt'])
     AND manekineko_valid_equal_prizes(p) THEN 'affiliate-v8'
   WHEN p->'contract'->>'algorithmVersion'='unique-rank-v4'
     AND (p->'contract' ?& ARRAY['affiliatePoolBps','secondPrizeBps','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt']) THEN 'affiliate-v7'
   WHEN p->'contract'->>'algorithmVersion'='unique-rank-v3' AND p->'contract' ? 'affiliatePoolBps' THEN 'affiliate-v6'
   ELSE NULL END
 WHEN p->'contract' ? 'affiliatePoolBps' THEN 'affiliate-v5' ELSE 'affiliate-v4' END;
$$;
DO $$ DECLARE signature text; definition text; BEGIN
 FOREACH signature IN ARRAY ARRAY['manekineko_valid_launch_season(jsonb)','manekineko_valid_season_timing(jsonb)'] LOOP
   SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
   definition:=replace(definition,'''unique-rank-v3'',''unique-rank-v4''','''unique-rank-v3'',''unique-rank-v4'',''unique-rank-v5''');
   definition:=replace(definition,'manekineko_launch_payload_version(step->''payload'') IS DISTINCT FROM ''affiliate-v7''','COALESCE(manekineko_launch_payload_version(step->''payload''),'''') NOT IN (''affiliate-v7'',''affiliate-v8'')');
   IF signature='manekineko_valid_season_timing(jsonb)' THEN
     definition:=replace(definition,'IF NOT (p ? ''timing'') THEN RETURN NOT (p ? ''social''); END IF;',
       'IF NOT (p ? ''timing'') THEN RETURN NOT (p ? ''social''); END IF; IF manekineko_launch_plan_version(p) IS NULL THEN RETURN false; END IF;');
   END IF;
   EXECUTE definition;
 END LOOP;
END; $$;
COMMIT;
