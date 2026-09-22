-- Confirmed chain projections. This worker never holds a transaction signer.
BEGIN;

CREATE TABLE manekineko_indexer_checkpoints (
  collection_id uuid PRIMARY KEY REFERENCES manekineko_deployments(collection_id),
  block_number bigint CHECK (block_number >= 0),
  block_hash text CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  trust_fingerprint text CHECK (trust_fingerprint ~ '^[0-9a-f]{64}$'),
  last_reconciled_at timestamptz,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error_code text CHECK (last_error_code ~ '^[a-z_]{1,64}$'),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  reorg_count integer NOT NULL DEFAULT 0 CHECK (reorg_count >= 0),
  lease_owner uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((block_number IS NULL) = (block_hash IS NULL)),
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL))
);

CREATE TABLE manekineko_chain_events (
  collection_id uuid NOT NULL REFERENCES manekineko_indexer_checkpoints(collection_id),
  block_number bigint NOT NULL CHECK (block_number >= 0),
  block_hash text NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  transaction_index integer NOT NULL CHECK (transaction_index >= 0),
  log_index integer NOT NULL CHECK (log_index >= 0),
  event_name text NOT NULL,
  arguments jsonb NOT NULL CHECK (jsonb_typeof(arguments) = 'object'),
  topics jsonb NOT NULL CHECK (jsonb_typeof(topics) = 'array'),
  data text NOT NULL CHECK (data ~ '^0x[0-9a-f]*$'),
  block_timestamp timestamptz NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, transaction_hash, log_index),
  UNIQUE (collection_id, block_number, log_index)
);
CREATE INDEX manekineko_chain_events_order_idx
  ON manekineko_chain_events(collection_id, block_number, log_index);
CREATE INDEX manekineko_chain_events_outcome_idx
  ON manekineko_chain_events(collection_id, event_name, block_number)
  WHERE event_name IN ('PrizeDelivered', 'Refunded');
CREATE INDEX manekineko_indexer_due_idx
  ON manekineko_indexer_checkpoints(last_attempt_at NULLS FIRST);

COMMENT ON TABLE manekineko_indexer_checkpoints IS
  'Lease-protected contiguous confirmed log coverage. A cursor advances only with its canonical logs and projections in one transaction.';
COMMENT ON TABLE manekineko_chain_events IS
  'Canonical V5 logs from any transaction origin, including Etherscan. Reorganizations delete orphan logs and rebuild snapshots/history.';

COMMIT;
