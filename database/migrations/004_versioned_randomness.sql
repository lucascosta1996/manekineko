-- Preserve every existing collection and archive as the original V1 algorithm.
-- V2 rows must explicitly opt in; no V2 collection, deployment or prize is seeded.
BEGIN;

INSERT INTO manekineko_networks (chain_id, name, currency_symbol, currency_decimals, explorer_url)
VALUES (1, 'Ethereum Mainnet', 'ETH', 18, 'https://etherscan.io')
ON CONFLICT (chain_id) DO NOTHING;

ALTER TABLE manekineko_collections
  ADD COLUMN algorithm_version text NOT NULL DEFAULT 'feistel-v1',
  ADD COLUMN randomness_provider text NOT NULL DEFAULT 'future-blockhash',
  ALTER COLUMN reveal_delay_blocks DROP NOT NULL,
  ADD CONSTRAINT manekineko_collection_algorithm_check CHECK (
    (algorithm_version = 'feistel-v1' AND randomness_provider = 'future-blockhash' AND reveal_delay_blocks IS NOT NULL)
    OR (algorithm_version = 'unique-rank-v2' AND randomness_provider = 'chainlink-vrf-v2.5' AND chain_id IN (1, 11155111) AND reveal_delay_blocks IS NULL)
  );

ALTER TABLE manekineko_collection_history
  ADD COLUMN algorithm_version text NOT NULL DEFAULT 'feistel-v1',
  ADD COLUMN randomness_provider text NOT NULL DEFAULT 'future-blockhash',
  ADD CONSTRAINT manekineko_history_algorithm_check CHECK (
    (algorithm_version = 'feistel-v1' AND randomness_provider = 'future-blockhash')
    OR (algorithm_version = 'unique-rank-v2' AND randomness_provider = 'chainlink-vrf-v2.5' AND chain_id IN (1, 11155111))
  ),
  ADD CONSTRAINT manekineko_history_id_algorithm_unique UNIQUE (id, algorithm_version);

ALTER TABLE manekineko_history_winners
  ADD COLUMN algorithm_version text NOT NULL DEFAULT 'feistel-v1',
  DROP CONSTRAINT manekineko_history_winners_check,
  DROP CONSTRAINT manekineko_history_winners_check1,
  ADD CONSTRAINT manekineko_winner_algorithm_fk FOREIGN KEY (collection_id, algorithm_version)
    REFERENCES manekineko_collection_history(id, algorithm_version) ON DELETE CASCADE,
  ADD CONSTRAINT manekineko_winner_score_check CHECK (
    (algorithm_version = 'feistel-v1'
      AND combination_code = (number_a - 1) * 16777216::bigint + (number_b - 1) * 65536::bigint + (number_c - 1) * 256 + number_d - 1
      AND score = (number_a::integer * number_b + number_c::integer * number_d) * 4294967296::bigint + combination_code)
    OR (algorithm_version = 'unique-rank-v2'
      AND number_a <= 16 AND number_b <= 16 AND number_c <= 16 AND number_d <= 16
      AND combination_code = (number_a - 1) * 4096 + (number_b - 1) * 256 + (number_c - 1) * 16 + number_d - 1
      AND score = combination_code + 1)
  );

CREATE FUNCTION manekineko_keep_algorithm() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.algorithm_version <> OLD.algorithm_version OR NEW.randomness_provider <> OLD.randomness_provider) THEN
    RAISE EXCEPTION 'Collection algorithm and randomness provider are immutable';
  END IF;
  IF NEW.algorithm_version = 'unique-rank-v2' AND NOT EXISTS (
    SELECT 1 FROM manekineko_networks WHERE chain_id = NEW.chain_id AND currency_symbol = 'ETH' AND currency_decimals = 18
  ) THEN
    RAISE EXCEPTION 'V2 requires an Ethereum ETH network';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_collection_algorithm_valid BEFORE INSERT OR UPDATE ON manekineko_collections
FOR EACH ROW EXECUTE FUNCTION manekineko_keep_algorithm();
CREATE TRIGGER manekineko_history_algorithm_valid BEFORE INSERT OR UPDATE ON manekineko_collection_history
FOR EACH ROW EXECUTE FUNCTION manekineko_keep_algorithm();

-- Network currency cannot invalidate an existing V2 row after its insert check.
CREATE FUNCTION manekineko_keep_ethereum_currency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.chain_id IN (1, 11155111) AND (NEW.currency_symbol <> 'ETH' OR NEW.currency_decimals <> 18) THEN
    RAISE EXCEPTION 'Ethereum networks must use ETH with 18 decimals';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_network_currency_valid BEFORE INSERT OR UPDATE ON manekineko_networks
FOR EACH ROW EXECUTE FUNCTION manekineko_keep_ethereum_currency();

ALTER TABLE manekineko_collection_state
  ADD COLUMN randomness_request_id numeric(78,0) CHECK (randomness_request_id BETWEEN 1 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  ADD COLUMN randomness_state text CHECK (randomness_state IN ('not_requested', 'pending', 'fulfilled')),
  ADD COLUMN randomness_word numeric(78,0) CHECK (randomness_word BETWEEN 0 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  DROP CONSTRAINT manekineko_collection_state_phase_check,
  ADD CONSTRAINT manekineko_state_phase_check CHECK (phase IN (
    'pending_activation', 'minting', 'awaiting_reveal', 'settling', 'awaiting_request',
    'awaiting_randomness', 'awaiting_finalization', 'awaiting_prize', 'complete', 'refundable'
  )),
  ADD CONSTRAINT manekineko_state_randomness_check CHECK (
    (randomness_state IS NULL AND randomness_request_id IS NULL AND randomness_word IS NULL)
    OR (randomness_state IS NOT NULL AND (
    (randomness_state = 'not_requested' AND randomness_request_id IS NULL AND randomness_word IS NULL)
    OR (randomness_state = 'pending' AND randomness_request_id IS NOT NULL AND randomness_word IS NULL)
    OR (randomness_state = 'fulfilled' AND randomness_request_id IS NOT NULL AND randomness_word IS NOT NULL)))
  );

CREATE OR REPLACE FUNCTION manekineko_validate_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  config manekineko_collections%ROWTYPE;
  deployment_status text;
BEGIN
  SELECT * INTO STRICT config FROM manekineko_collections WHERE id = NEW.collection_id FOR SHARE;
  SELECT status INTO STRICT deployment_status FROM manekineko_deployments WHERE collection_id = NEW.collection_id FOR SHARE;
  IF deployment_status <> 'deployed' THEN RAISE EXCEPTION 'Cannot record chain state for an undeployed collection'; END IF;
  IF NEW.total_minted > config.max_supply OR NEW.total_mint_revenue_wei <> NEW.total_minted * config.mint_price_wei THEN
    RAISE EXCEPTION 'Mint snapshot does not match collection configuration';
  END IF;
  IF NEW.total_refunded_wei <> NEW.refunded_count * config.mint_price_wei THEN
    RAISE EXCEPTION 'Refund snapshot does not match collection configuration';
  END IF;
  IF config.algorithm_version = 'feistel-v1' THEN
    IF NEW.randomness_state IS NOT NULL OR NEW.randomness_request_id IS NOT NULL OR NEW.randomness_word IS NOT NULL
      OR NEW.phase IN ('pending_activation', 'awaiting_request', 'awaiting_randomness', 'awaiting_finalization') THEN
      RAISE EXCEPTION 'V1 snapshot cannot contain V2 randomness';
    END IF;
    IF NEW.prize_paid AND (NEW.total_minted <> config.max_supply OR NEW.settled_count <> config.max_supply OR NEW.reveal_seed IS NULL) THEN
      RAISE EXCEPTION 'Prize requires a sold-out, revealed and settled collection';
    END IF;
  ELSE
    IF NEW.randomness_state IS NULL OR NEW.reveal_block IS NOT NULL OR NEW.reveal_seed IS NOT NULL OR NEW.phase IN ('awaiting_reveal', 'settling') THEN
      RAISE EXCEPTION 'V2 snapshot cannot contain V1 randomness';
    END IF;
    IF (NEW.phase IN ('pending_activation', 'minting', 'awaiting_request', 'refundable') AND NEW.randomness_state <> 'not_requested')
      OR (NEW.phase = 'awaiting_randomness' AND NEW.randomness_state <> 'pending')
      OR (NEW.phase IN ('awaiting_finalization', 'awaiting_prize', 'complete') AND NEW.randomness_state <> 'fulfilled') THEN
      RAISE EXCEPTION 'V2 randomness state does not match phase';
    END IF;
    IF (NEW.phase = 'pending_activation' AND NEW.total_minted <> 0)
      OR (NEW.phase IN ('minting', 'refundable') AND NEW.total_minted >= config.max_supply)
      OR (NEW.phase IN ('awaiting_request', 'awaiting_randomness', 'awaiting_finalization', 'awaiting_prize', 'complete') AND NEW.total_minted <> config.max_supply) THEN
      RAISE EXCEPTION 'V2 supply does not match phase; sold-out collections cannot refund';
    END IF;
    IF NEW.phase IN ('awaiting_prize', 'complete') THEN
      IF NEW.settled_count <> config.max_supply OR NEW.highest_score IS DISTINCT FROM config.max_supply::numeric OR NEW.winning_token_id IS NULL THEN
        RAISE EXCEPTION 'V2 finalized collection requires exactly one highest rank equal to supply';
      END IF;
    ELSIF NEW.settled_count <> 0 OR NEW.highest_score IS NOT NULL OR NEW.winning_token_id IS NOT NULL THEN
      RAISE EXCEPTION 'V2 winner exists only after finalization';
    END IF;
    IF NEW.phase <> 'refundable' AND (NEW.refunded_count <> 0 OR NEW.total_refunded_wei <> 0) THEN
      RAISE EXCEPTION 'V2 refunds require an unsold refundable collection';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Retain the shared archive lock from migration 003 when validating both tables.
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
  IF previous_id IS NOT NULL AND previous_id <> history_id THEN RAISE EXCEPTION 'Archive identifiers are immutable'; END IF;
  SELECT * INTO archive FROM manekineko_collection_history WHERE id = history_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO winner FROM manekineko_history_winners WHERE collection_id = history_id;
  IF archive.status = 'completed' THEN
    IF NOT FOUND THEN RAISE EXCEPTION 'Completed archive requires a winner'; END IF;
    IF winner.token_id > archive.total_minted
      OR winner.prize_paid_wei <> archive.total_minted * archive.mint_price_wei / 2
      OR winner.paid_at < archive.opened_at OR winner.paid_at > archive.closed_at THEN
      RAISE EXCEPTION 'Archive winner does not match supply, 50 percent prize or dates';
    END IF;
    IF archive.algorithm_version = 'unique-rank-v2' AND winner.score <> archive.max_supply THEN
      RAISE EXCEPTION 'V2 archive winning rank must equal collection supply';
    END IF;
  ELSIF FOUND THEN
    RAISE EXCEPTION 'Refunded archive cannot have a winner';
  ELSIF archive.algorithm_version = 'unique-rank-v2' AND archive.total_minted = archive.max_supply THEN
    RAISE EXCEPTION 'V2 sold-out collections cannot refund';
  END IF;
  RETURN NULL;
END;
$$;

COMMIT;
