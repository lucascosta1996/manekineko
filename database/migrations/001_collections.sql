-- Apply with psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/001_collections.sql
-- Namespaced tables permit this schema to share a database with other applications.
BEGIN;

CREATE TABLE IF NOT EXISTS manekineko_networks (
  chain_id bigint PRIMARY KEY CHECK (chain_id BETWEEN 1 AND 9007199254740991),
  name text NOT NULL CHECK (length(name) > 0),
  currency_symbol text NOT NULL CHECK (length(currency_symbol) BETWEEN 1 AND 16),
  currency_decimals smallint NOT NULL CHECK (currency_decimals BETWEEN 0 AND 36),
  explorer_url text NOT NULL CHECK (explorer_url ~ '^https://'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manekineko_series (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (octet_length(name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manekineko_collections (
  id uuid PRIMARY KEY,
  series_id uuid NOT NULL REFERENCES manekineko_series(id),
  chain_id bigint NOT NULL REFERENCES manekineko_networks(chain_id),
  round_id numeric(78,0) NOT NULL CHECK (round_id BETWEEN 1 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (octet_length(name) BETWEEN 1 AND 80),
  symbol text NOT NULL CHECK (octet_length(symbol) BETWEEN 1 AND 16),
  description text NOT NULL DEFAULT '',
  max_supply integer NOT NULL CHECK (max_supply BETWEEN 1 AND 65536),
  mint_price_wei numeric(78,0) NOT NULL CHECK (mint_price_wei >= 2 AND mod(mint_price_wei, 2) = 0),
  mint_duration_seconds bigint NOT NULL CHECK (mint_duration_seconds BETWEEN 1 AND 9007199254740991),
  reveal_delay_blocks smallint NOT NULL CHECK (reveal_delay_blocks BETWEEN 2 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series_id, round_id),
  UNIQUE (id, chain_id),
  CHECK (mint_price_wei * max_supply <= 115792089237316195423570985008687907853269984665640564039457584007913129639935)
);

-- A draft has no chain address or active deadline. Failed deployment attempts can
-- keep their transaction hash; publish an address only after receipt verification.
CREATE TABLE IF NOT EXISTS manekineko_deployments (
  collection_id uuid PRIMARY KEY,
  chain_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'undeployed' CHECK (status IN ('undeployed', 'deploying', 'deployed', 'failed')),
  contract_address text CHECK (contract_address ~ '^0x[0-9a-f]{40}$' AND contract_address <> '0x0000000000000000000000000000000000000000'),
  factory_address text CHECK (factory_address ~ '^0x[0-9a-f]{40}$' AND factory_address <> '0x0000000000000000000000000000000000000000'),
  owner_address text CHECK (owner_address ~ '^0x[0-9a-f]{40}$' AND owner_address <> '0x0000000000000000000000000000000000000000'),
  transaction_hash text CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  deployment_block numeric(78,0) CHECK (deployment_block BETWEEN 0 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  mint_deadline timestamptz,
  deployed_at timestamptz,
  verified_source_url text CHECK (verified_source_url ~ '^https://'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (collection_id, chain_id) REFERENCES manekineko_collections(id, chain_id),
  UNIQUE (chain_id, contract_address),
  CHECK (
    (status = 'deployed' AND contract_address IS NOT NULL AND owner_address IS NOT NULL AND transaction_hash IS NOT NULL AND deployment_block IS NOT NULL AND mint_deadline IS NOT NULL AND deployed_at IS NOT NULL)
    OR (status <> 'deployed' AND contract_address IS NULL AND deployment_block IS NULL AND mint_deadline IS NULL AND deployed_at IS NULL)
  )
);

-- This table is an indexed snapshot, never an authority for payments or winners.
-- A trusted future worker writes it only after reading the deployed contract.
CREATE TABLE IF NOT EXISTS manekineko_collection_state (
  collection_id uuid PRIMARY KEY REFERENCES manekineko_deployments(collection_id),
  phase text NOT NULL CHECK (phase IN ('minting', 'awaiting_reveal', 'settling', 'awaiting_prize', 'complete', 'refundable')),
  total_minted integer NOT NULL DEFAULT 0 CHECK (total_minted BETWEEN 0 AND 65536),
  total_mint_revenue_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK (total_mint_revenue_wei BETWEEN 0 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  settled_count integer NOT NULL DEFAULT 0 CHECK (settled_count BETWEEN 0 AND total_minted),
  refunded_count integer NOT NULL DEFAULT 0 CHECK (refunded_count BETWEEN 0 AND total_minted),
  total_refunded_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK (total_refunded_wei BETWEEN 0 AND total_mint_revenue_wei),
  reveal_block numeric(78,0) CHECK (reveal_block BETWEEN 0 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  reveal_seed text CHECK (reveal_seed ~ '^0x[0-9a-f]{64}$'),
  winning_token_id integer CHECK (winning_token_id BETWEEN 1 AND total_minted),
  highest_score numeric(78,0) CHECK (highest_score BETWEEN 0 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  prize_paid boolean NOT NULL DEFAULT false,
  prize_recipient text CHECK (prize_recipient ~ '^0x[0-9a-f]{40}$' AND prize_recipient <> '0x0000000000000000000000000000000000000000'),
  prize_paid_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK (prize_paid_wei BETWEEN 0 AND total_mint_revenue_wei),
  prize_transaction_hash text CHECK (prize_transaction_hash ~ '^0x[0-9a-f]{64}$'),
  block_number numeric(78,0) NOT NULL CHECK (block_number BETWEEN 0 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  block_hash text NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((phase = 'complete') = prize_paid),
  CHECK (
    (prize_paid AND winning_token_id IS NOT NULL AND highest_score IS NOT NULL AND prize_recipient IS NOT NULL AND prize_paid_wei = total_mint_revenue_wei / 2 AND prize_transaction_hash IS NOT NULL)
    OR (NOT prize_paid AND prize_recipient IS NULL AND prize_paid_wei = 0 AND prize_transaction_hash IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS manekineko_collections_chain_idx ON manekineko_collections(chain_id);
CREATE INDEX IF NOT EXISTS manekineko_state_phase_idx ON manekineko_collection_state(phase);

CREATE OR REPLACE FUNCTION manekineko_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION manekineko_validate_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  config manekineko_collections%ROWTYPE;
  deployment_status text;
BEGIN
  SELECT * INTO STRICT config FROM manekineko_collections WHERE id = NEW.collection_id;
  SELECT status INTO STRICT deployment_status FROM manekineko_deployments WHERE collection_id = NEW.collection_id;
  IF deployment_status <> 'deployed' THEN
    RAISE EXCEPTION 'Cannot record chain state for an undeployed collection';
  END IF;
  IF NEW.total_minted > config.max_supply OR NEW.total_mint_revenue_wei <> NEW.total_minted * config.mint_price_wei THEN
    RAISE EXCEPTION 'Mint snapshot does not match collection configuration';
  END IF;
  IF NEW.total_refunded_wei <> NEW.refunded_count * config.mint_price_wei THEN
    RAISE EXCEPTION 'Refund snapshot does not match collection configuration';
  END IF;
  IF NEW.prize_paid AND (NEW.total_minted <> config.max_supply OR NEW.settled_count <> config.max_supply OR NEW.reveal_seed IS NULL) THEN
    RAISE EXCEPTION 'Prize requires a sold-out, revealed and settled collection';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER manekineko_series_updated BEFORE UPDATE ON manekineko_series
FOR EACH ROW EXECUTE FUNCTION manekineko_touch_updated_at();
CREATE OR REPLACE TRIGGER manekineko_collections_updated BEFORE UPDATE ON manekineko_collections
FOR EACH ROW EXECUTE FUNCTION manekineko_touch_updated_at();
CREATE OR REPLACE TRIGGER manekineko_deployments_updated BEFORE UPDATE ON manekineko_deployments
FOR EACH ROW EXECUTE FUNCTION manekineko_touch_updated_at();
CREATE OR REPLACE TRIGGER manekineko_state_updated BEFORE UPDATE ON manekineko_collection_state
FOR EACH ROW EXECUTE FUNCTION manekineko_touch_updated_at();
CREATE OR REPLACE TRIGGER manekineko_state_valid BEFORE INSERT OR UPDATE ON manekineko_collection_state
FOR EACH ROW EXECUTE FUNCTION manekineko_validate_snapshot();

COMMIT;
