-- An archive projection is separate from deployment and verified chain state.
-- Sample history belongs here, never in manekineko_collection_state.
BEGIN;

CREATE TABLE IF NOT EXISTS manekineko_collection_history (
  id uuid PRIMARY KEY,
  series_id uuid NOT NULL REFERENCES manekineko_series(id),
  chain_id bigint NOT NULL REFERENCES manekineko_networks(chain_id),
  round_id numeric(78,0) NOT NULL CHECK (round_id BETWEEN 1 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  name text NOT NULL CHECK (octet_length(name) BETWEEN 1 AND 80),
  symbol text NOT NULL CHECK (octet_length(symbol) BETWEEN 1 AND 16),
  max_supply integer NOT NULL CHECK (max_supply BETWEEN 1 AND 65536),
  total_minted integer NOT NULL CHECK (total_minted BETWEEN 0 AND max_supply),
  mint_price_wei numeric(78,0) NOT NULL CHECK (mint_price_wei >= 2 AND mod(mint_price_wei, 2) = 0),
  total_refunded_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK (total_refunded_wei >= 0),
  status text NOT NULL CHECK (status IN ('completed', 'refunded')),
  opened_at timestamptz NOT NULL,
  closed_at timestamptz NOT NULL CHECK (closed_at >= opened_at),
  is_mock boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series_id, round_id),
  CHECK (mint_price_wei * max_supply <= 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  -- Refunded archive rows represent fully delivered refunds, not refund eligibility.
  CHECK (
    (status = 'completed' AND total_minted = max_supply AND total_refunded_wei = 0)
    OR (status = 'refunded' AND total_refunded_wei = total_minted * mint_price_wei)
  )
);

CREATE TABLE IF NOT EXISTS manekineko_history_winners (
  collection_id uuid PRIMARY KEY REFERENCES manekineko_collection_history(id) ON DELETE CASCADE,
  token_id integer NOT NULL CHECK (token_id BETWEEN 1 AND 65536),
  number_a smallint NOT NULL CHECK (number_a BETWEEN 1 AND 256),
  number_b smallint NOT NULL CHECK (number_b BETWEEN 1 AND 256),
  number_c smallint NOT NULL CHECK (number_c BETWEEN 1 AND 256),
  number_d smallint NOT NULL CHECK (number_d BETWEEN 1 AND 256),
  combination_code numeric(10,0) NOT NULL CHECK (combination_code BETWEEN 0 AND 4294967295),
  score numeric(78,0) NOT NULL CHECK (score >= 0),
  prize_recipient text NOT NULL CHECK (prize_recipient ~ '^0x[0-9a-f]{40}$' AND prize_recipient <> '0x0000000000000000000000000000000000000000'),
  prize_paid_wei numeric(78,0) NOT NULL CHECK (prize_paid_wei > 0),
  paid_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Exactly the four-byte encoding and ranking calculation in ManekinekoRound.
  CHECK (combination_code = (number_a - 1) * 16777216::bigint + (number_b - 1) * 65536::bigint + (number_c - 1) * 256 + number_d - 1),
  CHECK (score = (number_a::integer * number_b + number_c::integer * number_d) * 4294967296::bigint + combination_code)
);

CREATE INDEX IF NOT EXISTS manekineko_history_closed_idx ON manekineko_collection_history(closed_at DESC, id);
CREATE INDEX IF NOT EXISTS manekineko_history_status_idx ON manekineko_collection_history(status);
CREATE INDEX IF NOT EXISTS manekineko_history_recipient_idx ON manekineko_history_winners(prize_recipient);

-- Check both sides at commit so a worker can insert an archive and its winner
-- within one transaction. No partial completed state can be saved.
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
  SELECT * INTO archive FROM manekineko_collection_history WHERE id = history_id;
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

CREATE OR REPLACE TRIGGER manekineko_history_updated BEFORE UPDATE ON manekineko_collection_history
FOR EACH ROW EXECUTE FUNCTION manekineko_touch_updated_at();
CREATE OR REPLACE TRIGGER manekineko_history_winner_updated BEFORE UPDATE ON manekineko_history_winners
FOR EACH ROW EXECUTE FUNCTION manekineko_touch_updated_at();

DROP TRIGGER IF EXISTS manekineko_history_valid ON manekineko_collection_history;
CREATE CONSTRAINT TRIGGER manekineko_history_valid AFTER INSERT OR UPDATE OR DELETE ON manekineko_collection_history
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION manekineko_validate_history();
DROP TRIGGER IF EXISTS manekineko_history_winner_valid ON manekineko_history_winners;
CREATE CONSTRAINT TRIGGER manekineko_history_winner_valid AFTER INSERT OR UPDATE OR DELETE ON manekineko_history_winners
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION manekineko_validate_history();

COMMIT;
