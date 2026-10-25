BEGIN;
SET LOCAL lock_timeout = '5s';
-- V14 controllers create immutable V13 paid rounds. This projection records the
-- controller version; Genesis itself is outside the paid-season NFT gallery.
ALTER TABLE manekineko_nft_mirror_sources
  DROP CONSTRAINT manekineko_nft_mirror_sources_version_check;
ALTER TABLE manekineko_nft_mirror_sources
  ADD CONSTRAINT manekineko_nft_mirror_sources_version_check CHECK (version IN (12,13,14));
COMMIT;
