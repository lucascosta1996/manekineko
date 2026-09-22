-- Serialize validation across the archive and winner rows. Without a shared row
-- lock, concurrent edits to each table could independently pass against old data.
BEGIN;

CREATE OR REPLACE FUNCTION manekineko_validate_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  history_id uuid;
  archive manekineko_collection_history%ROWTYPE;
  winner manekineko_history_winners%ROWTYPE;
  previous_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'manekineko_collection_history' THEN
    history_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    IF TG_OP = 'UPDATE' THEN previous_id := OLD.id; END IF;
  ELSE
    history_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.collection_id ELSE NEW.collection_id END;
    IF TG_OP = 'UPDATE' THEN previous_id := OLD.collection_id; END IF;
  END IF;
  IF previous_id IS NOT NULL AND previous_id <> history_id THEN
    RAISE EXCEPTION 'Archive identifiers are immutable';
  END IF;
  -- Compatible with FK key-share locks, but serializes non-key archive edits and
  -- all winner validations for this collection until the transaction completes.
  SELECT * INTO archive FROM manekineko_collection_history WHERE id = history_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO winner FROM manekineko_history_winners WHERE collection_id = history_id;
  IF archive.status = 'completed' THEN
    IF NOT FOUND THEN RAISE EXCEPTION 'Completed archive requires a winner'; END IF;
    IF winner.token_id > archive.total_minted
       OR winner.prize_paid_wei <> archive.total_minted * archive.mint_price_wei / 2
       OR winner.paid_at < archive.opened_at
       OR winner.paid_at > archive.closed_at THEN
      RAISE EXCEPTION 'Archive winner does not match supply, 50 percent prize or dates';
    END IF;
  ELSIF FOUND THEN
    RAISE EXCEPTION 'Refunded archive cannot have a winner';
  END IF;
  RETURN NULL;
END;
$$;

COMMIT;
