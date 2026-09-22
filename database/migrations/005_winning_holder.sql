-- V2 claimPrize can send ETH to an address different from the winning holder.
-- Preserve the actual holder from PrizeDelivered independently of its recipient.
BEGIN;

ALTER TABLE manekineko_history_winners ADD COLUMN winning_holder text;
ALTER TABLE manekineko_history_winners DISABLE TRIGGER manekineko_history_winner_updated;
UPDATE manekineko_history_winners
SET winning_holder = prize_recipient
WHERE algorithm_version = 'feistel-v1';
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE manekineko_history_winners ENABLE TRIGGER manekineko_history_winner_updated;
-- Do not infer a V2 holder from a destination address. Existing V2 rows without
-- event-backed holder provenance must make this migration fail closed.
ALTER TABLE manekineko_history_winners
  ALTER COLUMN winning_holder SET NOT NULL,
  ADD CONSTRAINT manekineko_winner_holder_check CHECK (
    winning_holder ~ '^0x[0-9a-f]{40}$' AND winning_holder <> '0x0000000000000000000000000000000000000000'
    AND (algorithm_version <> 'feistel-v1' OR winning_holder = prize_recipient)
  );

CREATE FUNCTION manekineko_set_legacy_winning_holder() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Original seeds and V1 indexers can omit the redundant holder field. V2
  -- callers must supply the actual PrizeDelivered holder; NOT NULL rejects gaps.
  IF NEW.algorithm_version = 'feistel-v1' AND NEW.winning_holder IS NULL THEN
    NEW.winning_holder := NEW.prize_recipient;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_legacy_winner_holder BEFORE INSERT ON manekineko_history_winners
FOR EACH ROW EXECUTE FUNCTION manekineko_set_legacy_winning_holder();
CREATE INDEX manekineko_history_holder_idx ON manekineko_history_winners(winning_holder);

COMMIT;
