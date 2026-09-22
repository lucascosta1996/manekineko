BEGIN;
-- Historical challenge signatures remain unchanged. New V6 intents bind the
-- exact NFT, including the explicit zero/zero marker for the bootstrap round.
ALTER TABLE manekineko_affiliate_challenges
  ADD COLUMN eligibility_source_address text,
  ADD COLUMN eligibility_token_id numeric(78,0),
  ADD CONSTRAINT manekineko_affiliate_eligibility_proof_check CHECK (
    (eligibility_source_address IS NULL AND eligibility_token_id IS NULL)
    OR (contract_version='affiliate-v6' AND eligibility_source_address IS NOT NULL AND eligibility_token_id IS NOT NULL
      AND eligibility_source_address ~ '^0x[0-9a-f]{40}$'
      AND ((eligibility_source_address='0x0000000000000000000000000000000000000000' AND eligibility_token_id=0)
        OR (eligibility_source_address<>'0x0000000000000000000000000000000000000000'
          AND eligibility_token_id>0
          AND eligibility_token_id<=115792089237316195423570985008687907853269984665640564039457584007913129639935)))
  );

CREATE FUNCTION manekineko_keep_affiliate_eligibility_proof() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.contract_version='affiliate-v6'
    AND (NEW.eligibility_source_address IS NULL OR NEW.eligibility_token_id IS NULL) THEN
    RAISE EXCEPTION 'New V6 challenges require their signed holder eligibility proof';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.eligibility_source_address IS DISTINCT FROM OLD.eligibility_source_address
    OR NEW.eligibility_token_id IS DISTINCT FROM OLD.eligibility_token_id) THEN
    RAISE EXCEPTION 'Affiliate eligibility proof is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER manekineko_keep_affiliate_eligibility_proof
  BEFORE INSERT OR UPDATE ON manekineko_affiliate_challenges
  FOR EACH ROW EXECUTE FUNCTION manekineko_keep_affiliate_eligibility_proof();
COMMENT ON COLUMN manekineko_affiliate_challenges.eligibility_source_address IS
  'Signed V6 source NFT contract, or zero address for the canonical first collection. NULL preserves old signatures; new V6 admission rejects missing proof.';
COMMIT;
