BEGIN;
-- V11 is a new immutable version. V3-V10 rows and frozen plans keep their rules.
DO $migration$ DECLARE item record; expression text; v11 text; BEGIN
 FOR item IN SELECT conrelid::regclass AS relation,conname AS name,pg_get_expr(conbin,conrelid) AS expression
  FROM pg_constraint WHERE contype='c' AND conrelid IN
   ('manekineko_collections'::regclass,'manekineko_affiliate_programs'::regclass,'manekineko_affiliate_challenges'::regclass)
   AND pg_get_expr(conbin,conrelid) LIKE '%''affiliate-v10''%'
 LOOP
  expression:=item.expression;
  v11:=replace(expression,'''affiliate-v10''','''affiliate-v11''');
  IF item.name='manekineko_ranked_terms_check' THEN
   v11:=$terms$second_prize_bps IS NULL AND winner_count IS NOT NULL AND winner_count BETWEEN 1 AND 10 AND winner_count<=max_supply
    AND prize_bps>0 AND mod(prize_bps,winner_count)=0 AND min_affiliate_referrals IS NOT NULL AND min_affiliate_referrals=1
    AND affiliate_payout_cap_bps IS NOT NULL AND affiliate_payout_cap_bps=0 AND sale_start_at IS NOT NULL$terms$;
  END IF;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.relation,item.name);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK ((contract_version<>''affiliate-v11'' AND (%s)) OR (contract_version=''affiliate-v11'' AND (%s)))',item.relation,item.name,expression,v11);
 END LOOP;
END; $migration$;

DO $migration$ DECLARE signature text; definition text; BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'manekineko_validate_affiliate_program()', 'manekineko_validate_affiliate_challenge()',
  'manekineko_keep_algorithm()', 'manekineko_keep_affiliate_eligibility_proof()',
  'manekineko_validate_snapshot_prize()', 'manekineko_validate_collection_award()',
  'manekineko_valid_launch_season(jsonb)', 'manekineko_valid_season_timing(jsonb)',
  'manekineko_guard_season_runtime_run()'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO STRICT definition;
  definition:=replace(definition,'''affiliate-v9'',''affiliate-v10''','''affiliate-v9'',''affiliate-v10'',''affiliate-v11''');
  definition:=replace(definition,'NEW.contract_version=''affiliate-v10''','NEW.contract_version IN (''affiliate-v10'',''affiliate-v11'')');
  EXECUTE definition;
 END LOOP;
 SELECT pg_get_functiondef('manekineko_launch_payload_version(jsonb)'::regprocedure) INTO STRICT definition;
 definition:=replace(definition,'THEN ''affiliate-v10'' ELSE NULL END',
  'THEN CASE WHEN p->''contract''->>''affiliatePayoutCapBps''=''0'' THEN CASE WHEN p->''contract''->>''minAffiliateReferrals''=''1'' THEN ''affiliate-v11'' ELSE NULL END ELSE ''affiliate-v10'' END ELSE NULL END');
 EXECUTE definition;
END; $migration$;
COMMENT ON COLUMN manekineko_collections.affiliate_payout_cap_bps IS 'V7-V10: referral-count payout cap. V11: immutable zero sentinel for full equal affiliate budget; minimum is exactly one paid referral.';
COMMIT;
