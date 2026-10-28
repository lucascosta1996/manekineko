BEGIN;
SET LOCAL lock_timeout = '5s';
-- V17 uses the collection-aware projection introduced in 036. Its separate
-- contract address and source version preserve every historical V16 row.
ALTER TABLE manekineko_nft_mirror_sources DROP CONSTRAINT manekineko_nft_mirror_sources_version_check;
ALTER TABLE manekineko_nft_mirror_sources ADD CONSTRAINT manekineko_nft_mirror_sources_version_check
  CHECK (version IN (12,13,14,16,17) AND (version NOT IN (16,17) OR chain_id=11155111));
COMMIT;
