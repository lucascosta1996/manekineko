BEGIN;

-- A metadata edit and an indexer heartbeat are not chain time. Historical rows
-- remain unknown until the next verified snapshot; never backfill with now().
ALTER TABLE manekineko_collection_state
  ADD COLUMN IF NOT EXISTS observed_block_at timestamptz;
COMMENT ON COLUMN manekineko_collection_state.observed_block_at IS
  'Timestamp of block_number/block_hash, written atomically by the canonical indexer.';

COMMIT;
