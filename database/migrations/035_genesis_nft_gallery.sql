BEGIN;
SET LOCAL lock_timeout = '5s';

-- Genesis is a collectible outside the paid season catalog, with no four-number identity.
ALTER TABLE manekineko_nft_mirror_collections ADD COLUMN kind text NOT NULL DEFAULT 'paid' CHECK (kind IN ('paid','genesis'));
ALTER TABLE manekineko_nft_mirror_collections DROP CONSTRAINT manekineko_nft_mirror_collections_round_id_check;
ALTER TABLE manekineko_nft_mirror_collections ADD CONSTRAINT nft_mirror_collection_kind_round
  CHECK ((kind='paid' AND round_id BETWEEN 1 AND 256) OR (kind='genesis' AND round_id=0));
ALTER TABLE manekineko_nft_mirror_collections ADD CONSTRAINT nft_mirror_collection_kind_key UNIQUE (chain_id,address,kind);
ALTER TABLE manekineko_nft_mirror_tokens ADD COLUMN kind text NOT NULL DEFAULT 'paid' CHECK (kind<>'genesis' OR token_id<=1000);
ALTER TABLE manekineko_nft_mirror_tokens ADD CONSTRAINT nft_mirror_token_collection_kind
  FOREIGN KEY (chain_id,collection_address,kind) REFERENCES manekineko_nft_mirror_collections(chain_id,address,kind) ON DELETE CASCADE;
ALTER TABLE manekineko_nft_mirror_tokens DROP CONSTRAINT manekineko_nft_mirror_tokens_check;
ALTER TABLE manekineko_nft_mirror_tokens ADD CONSTRAINT nft_mirror_metadata_kind CHECK (
  (metadata IS NULL AND numbers IS NULL AND combination_code IS NULL AND cached_at IS NULL)
  OR (metadata IS NOT NULL AND jsonb_typeof(metadata)='object' AND cached_at IS NOT NULL AND (
    (kind='paid' AND numbers IS NOT NULL AND cardinality(numbers)=4 AND array_ndims(numbers)=1
      AND array_position(numbers,NULL) IS NULL AND numbers <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]::smallint[]
      AND combination_code IS NOT NULL)
    OR (kind='genesis' AND token_id<=1000 AND numbers IS NOT NULL AND cardinality(numbers)=0 AND combination_code IS NULL)
  ))
);
COMMIT;
