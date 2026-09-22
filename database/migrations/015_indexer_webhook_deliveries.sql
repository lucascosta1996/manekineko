BEGIN;

CREATE TABLE manekineko_indexer_webhook_deliveries (
  delivery_id text PRIMARY KEY CHECK (delivery_id ~ '^[0-9a-f]{64}$'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  signed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  lease_token uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE INDEX manekineko_indexer_webhook_received_idx
  ON manekineko_indexer_webhook_deliveries(received_at);

COMMENT ON TABLE manekineko_indexer_webhook_deliveries IS
  'Hashed QuickNode nonce and payload digest only. Completed deliveries never run twice; failed or expired leases allow provider retries. Webhook bodies do not supply chain state.';

COMMIT;
