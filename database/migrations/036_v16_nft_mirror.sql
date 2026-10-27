BEGIN;
SET LOCAL lock_timeout = '5s';
-- Independent V16 projections preserve the historical address-keyed tables and
-- allow the old indexer to run throughout a rolling application deployment.
ALTER TABLE manekineko_nft_mirror_sources DROP CONSTRAINT manekineko_nft_mirror_sources_version_check;
ALTER TABLE manekineko_nft_mirror_sources ADD CONSTRAINT manekineko_nft_mirror_sources_version_check
  CHECK (version IN (12,13,14,16) AND (version<>16 OR chain_id=11155111));
CREATE TABLE manekineko_nft_mirror_v16_collections
  (LIKE manekineko_nft_mirror_collections INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE manekineko_nft_mirror_v16_collections
  ADD PRIMARY KEY (chain_id,address,round_id),
  ADD UNIQUE (chain_id,controller,round_id),
  ADD UNIQUE (chain_id,address,round_id,kind),
  ADD FOREIGN KEY (chain_id,controller) REFERENCES manekineko_nft_mirror_sources ON DELETE CASCADE,
  ADD CHECK (chain_id=11155111 AND address=controller AND renderer=address);
CREATE TABLE manekineko_nft_mirror_v16_tokens
  (LIKE manekineko_nft_mirror_tokens INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE manekineko_nft_mirror_v16_tokens
  ADD COLUMN round_id integer NOT NULL CHECK (round_id BETWEEN 0 AND 256),
  ADD PRIMARY KEY (chain_id,collection_address,round_id,token_id),
  ADD FOREIGN KEY (chain_id,collection_address,round_id,kind)
    REFERENCES manekineko_nft_mirror_v16_collections(chain_id,address,round_id,kind) ON DELETE CASCADE;
CREATE INDEX nft_mirror_v16_ready ON manekineko_nft_mirror_v16_tokens (chain_id,collection_address,round_id,token_id) WHERE metadata IS NOT NULL;
CREATE INDEX nft_mirror_v16_pending ON manekineko_nft_mirror_v16_tokens (retry_after,chain_id,collection_address,round_id,token_id) WHERE metadata IS NULL;
CREATE INDEX nft_mirror_v16_schedule ON manekineko_nft_mirror_v16_collections (chain_id,controller,checked_at);
COMMIT;
