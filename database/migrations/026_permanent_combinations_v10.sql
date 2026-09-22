BEGIN;

-- Add V10 without changing historical rows, catalog identities or frozen exports.
-- Its economic terms are V9's; only the version/algorithm pair changes.
DO $migration$ DECLARE item record; expression text; v10 text; BEGIN
  FOR item IN SELECT conrelid::regclass AS relation, conname AS name, pg_get_expr(conbin,conrelid) AS expression
    FROM pg_constraint WHERE contype='c' AND conrelid IN
      ('manekineko_collections'::regclass,'manekineko_affiliate_programs'::regclass,'manekineko_affiliate_challenges'::regclass)
      AND pg_get_expr(conbin,conrelid) LIKE '%''affiliate-v9''%'
  LOOP
    expression:=item.expression;
    v10:=replace(replace(expression,'''affiliate-v9''','''affiliate-v10'''),'''unique-rank-v5''','''unique-rank-v6''');
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.relation,item.name);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK ((contract_version<>''affiliate-v10'' AND (%s)) OR (contract_version=''affiliate-v10'' AND (%s)))',item.relation,item.name,expression,v10);
  END LOOP;
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT expression FROM pg_constraint
    WHERE conrelid='manekineko_collections'::regclass AND conname='manekineko_collection_algorithm_check';
  ALTER TABLE manekineko_collections DROP CONSTRAINT manekineko_collection_algorithm_check;
  EXECUTE format('ALTER TABLE manekineko_collections ADD CONSTRAINT manekineko_collection_algorithm_check CHECK
    ((contract_version<>''affiliate-v10'' AND (%s)) OR (contract_version=''affiliate-v10'' AND algorithm_version=''unique-rank-v6''
      AND randomness_provider=''chainlink-vrf-v2.5'' AND chain_id IN (1,11155111) AND reveal_delay_blocks IS NULL))',expression);
END; $migration$;
ALTER TABLE manekineko_collections ADD CONSTRAINT manekineko_v10_appearance_required CHECK
  (contract_version<>'affiliate-v10' OR (season_id IS NOT NULL AND season_name IS NOT NULL AND collection_color IS NOT NULL AND text_color IS NOT NULL));

DO $migration$ DECLARE signature text; definition text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'manekineko_validate_affiliate_program()', 'manekineko_validate_affiliate_challenge()',
    'manekineko_keep_algorithm()', 'manekineko_keep_affiliate_eligibility_proof()',
    'manekineko_validate_snapshot_prize()', 'manekineko_validate_collection_award()',
    'manekineko_valid_launch_season(jsonb)', 'manekineko_valid_season_timing(jsonb)'
  ] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO STRICT definition;
    definition:=replace(definition,'''affiliate-v8'',''affiliate-v9''','''affiliate-v8'',''affiliate-v9'',''affiliate-v10''');
    definition:=replace(definition,'''unique-rank-v4'',''unique-rank-v5''','''unique-rank-v4'',''unique-rank-v5'',''unique-rank-v6''');
    definition:=replace(definition,'CASE WHEN NEW.contract_version IN (''affiliate-v8'',''affiliate-v9'',''affiliate-v10'') THEN ''unique-rank-v5''',
      'CASE WHEN NEW.contract_version=''affiliate-v10'' THEN ''unique-rank-v6'' WHEN NEW.contract_version IN (''affiliate-v8'',''affiliate-v9'') THEN ''unique-rank-v5''');
    EXECUTE definition;
  END LOOP;
END; $migration$;

CREATE OR REPLACE FUNCTION manekineko_launch_payload_version(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT CASE
 WHEN p->'contract'->>'algorithmVersion'='unique-rank-v6' THEN CASE
   WHEN p->'contract'->'maxMintsPerWallet'='"20"'::jsonb
     AND (p->'contract' ?& ARRAY['affiliatePoolBps','winnerCount','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt'])
     AND manekineko_valid_equal_prizes(p) THEN 'affiliate-v10' ELSE NULL END
 WHEN p->'contract' ? 'maxMintsPerWallet' AND
   (p->'contract'->'maxMintsPerWallet' IS DISTINCT FROM '"20"'::jsonb OR p->'contract'->>'algorithmVersion' IS DISTINCT FROM 'unique-rank-v5') THEN NULL
 WHEN p->'contract' ? 'algorithmVersion' THEN CASE
   WHEN p->'contract'->>'algorithmVersion'='unique-rank-v5'
     AND (p->'contract' ?& ARRAY['affiliatePoolBps','winnerCount','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt'])
     AND manekineko_valid_equal_prizes(p) THEN CASE WHEN p->'contract' ? 'maxMintsPerWallet' THEN 'affiliate-v9' ELSE 'affiliate-v8' END
   WHEN p->'contract'->>'algorithmVersion'='unique-rank-v4'
     AND (p->'contract' ?& ARRAY['affiliatePoolBps','secondPrizeBps','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt']) THEN 'affiliate-v7'
   WHEN p->'contract'->>'algorithmVersion'='unique-rank-v3' AND p->'contract' ? 'affiliatePoolBps' THEN 'affiliate-v6'
   ELSE NULL END
 WHEN p->'contract' ? 'affiliatePoolBps' THEN 'affiliate-v5' ELSE 'affiliate-v4' END;
$$;

CREATE OR REPLACE FUNCTION manekineko_guard_season_runtime_run() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE saved manekineko_launch_automations%ROWTYPE; version text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Season runtime history must be retained'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO STRICT saved FROM manekineko_launch_automations WHERE id=NEW.automation_id FOR SHARE;
  version:=saved.prepared_artifact->>'contractVersion';
  IF saved.status<>'prepared' OR saved.revision<>NEW.automation_revision OR saved.content_hash<>NEW.prepared_hash
   OR COALESCE(version,'') NOT IN ('affiliate-v9','affiliate-v10')
   OR saved.plan->>'chainId' IS DISTINCT FROM NEW.chain_id OR NOT (saved.plan ? 'timing')
   OR NOT (saved.plan ? 'seasonId') THEN RAISE EXCEPTION 'Runtime requires the exact prepared V9/V10 season revision and hash'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(saved.plan->'steps') AS step
   WHERE manekineko_launch_payload_version(step->'payload') IS DISTINCT FROM version
    OR step->'payload'->'contract'->>'chainId' IS DISTINCT FROM NEW.chain_id) THEN RAISE EXCEPTION 'Runtime collection version or network mismatch'; END IF;
 ELSIF NEW.id IS DISTINCT FROM OLD.id OR NEW.automation_id IS DISTINCT FROM OLD.automation_id
   OR NEW.automation_revision IS DISTINCT FROM OLD.automation_revision OR NEW.prepared_hash IS DISTINCT FROM OLD.prepared_hash
   OR NEW.chain_id IS DISTINCT FROM OLD.chain_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Runtime plan binding is immutable';
 END IF;
 NEW.updated_at:=clock_timestamp();
 RETURN NEW;
END; $$;

COMMENT ON TABLE manekineko_collection_awards IS 'Canonical ranked results and holder claims: V7 unequal, V8-V10 equal prizes. V10 combinations encode token identity; score is an independent finalized chain result. Rebuilt atomically on reorganization.';
-- Existing staging network checks and role grants remain unchanged. V10 uses
-- existing canonical tables; activation still requires separately verified pins.
COMMIT;
