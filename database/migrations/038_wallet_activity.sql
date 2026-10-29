BEGIN;
SET LOCAL lock_timeout = '5s';
-- Confirmed, replayable display data. Never authorizes a claim or a transfer.
ALTER TABLE manekineko_nft_mirror_sources
  ADD COLUMN wallet_cursor_block bigint,
  ADD COLUMN wallet_cursor_hash text,
  ADD COLUMN wallet_synced_at timestamptz,
  ADD CHECK ((wallet_cursor_block IS NULL) = (wallet_cursor_hash IS NULL)),
  ADD CHECK (wallet_cursor_block IS NULL OR wallet_cursor_block >= from_block),
  ADD CHECK (wallet_cursor_hash IS NULL OR wallet_cursor_hash ~ '^0x[0-9a-f]{64}$');
CREATE TABLE manekineko_wallet_activity (
  chain_id integer NOT NULL CHECK (chain_id=11155111),
  controller text NOT NULL,
  block_number bigint NOT NULL CHECK (block_number>=0),
  block_hash text NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer NOT NULL CHECK (log_index>=0),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  event_type text NOT NULL CHECK (event_type IN ('transfer','payment')),
  collection_id integer NOT NULL CHECK (collection_id BETWEEN 0 AND 256),
  token_id integer NOT NULL CHECK (token_id BETWEEN 0 AND 33619968),
  sender text CHECK (sender ~ '^0x[0-9a-f]{40}$'),
  recipient text NOT NULL CHECK (recipient ~ '^0x[0-9a-f]{40}$'),
  amount_wei numeric(78,0),
  payment_kind integer,
  PRIMARY KEY (chain_id,controller,block_number,log_index),
  FOREIGN KEY (chain_id,controller) REFERENCES manekineko_nft_mirror_sources ON DELETE CASCADE,
  CHECK ((event_type='transfer' AND sender IS NOT NULL AND token_id>0 AND amount_wei IS NULL AND payment_kind IS NULL)
    OR (event_type='payment' AND sender IS NULL AND amount_wei>=0 AND amount_wei IS NOT NULL AND payment_kind IS NOT NULL AND payment_kind BETWEEN 0 AND 6))
);
CREATE INDEX wallet_activity_recipient ON manekineko_wallet_activity (chain_id,controller,recipient,event_type,block_number DESC,log_index DESC);
CREATE INDEX wallet_activity_owner ON manekineko_wallet_activity (chain_id,controller,token_id,block_number DESC,log_index DESC) WHERE event_type='transfer';
COMMIT;
