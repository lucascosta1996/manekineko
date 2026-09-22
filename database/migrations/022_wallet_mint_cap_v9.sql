BEGIN;
CREATE INDEX manekineko_affiliate_claim_totals_idx ON manekineko_chain_events(collection_id)
 WHERE event_name='AffiliateCommissionClaimed';
-- V9 keeps V8 economics and artwork, adding a fixed cumulative 20-mint allowance.
-- Historical deployments and finalized launch payloads retain their original version.
DO $migration$ DECLARE item record; expression text; v9 text; BEGIN
  FOR item IN SELECT conrelid::regclass AS relation, conname AS name, pg_get_expr(conbin,conrelid) AS expression
    FROM pg_constraint WHERE contype='c' AND conrelid IN
      ('manekineko_collections'::regclass,'manekineko_affiliate_programs'::regclass,'manekineko_affiliate_challenges'::regclass)
      AND pg_get_expr(conbin,conrelid) LIKE '%''affiliate-v8''%'
  LOOP
    expression:=item.expression;
    v9:=replace(expression,'''affiliate-v8''','''affiliate-v9''');
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.relation,item.name);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK ((contract_version<>''affiliate-v9'' AND (%s)) OR (contract_version=''affiliate-v9'' AND (%s)))',item.relation,item.name,expression,v9);
  END LOOP;
END; $migration$;

DO $migration$ DECLARE signature text; definition text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'manekineko_validate_affiliate_program()', 'manekineko_validate_affiliate_challenge()',
    'manekineko_keep_algorithm()', 'manekineko_keep_affiliate_eligibility_proof()',
    'manekineko_validate_snapshot_prize()', 'manekineko_validate_collection_award()',
    'manekineko_valid_season_timing(jsonb)'
  ] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO STRICT definition;
    definition:=replace(definition,'''affiliate-v7'',''affiliate-v8''','''affiliate-v7'',''affiliate-v8'',''affiliate-v9''');
    definition:=replace(definition,'contract_version=''affiliate-v8''','contract_version IN (''affiliate-v8'',''affiliate-v9'')');
    EXECUTE definition;
  END LOOP;
END; $migration$;

CREATE OR REPLACE FUNCTION manekineko_launch_payload_version(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT CASE
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
COMMIT;
