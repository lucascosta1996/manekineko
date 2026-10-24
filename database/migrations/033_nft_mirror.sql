BEGIN;

-- An independent, disposable read projection. Never authorizes protocol transactions.
CREATE TABLE manekineko_nft_mirror_sources (
  chain_id integer NOT NULL CHECK (chain_id IN (1,11155111)),
  controller text NOT NULL CHECK (controller ~ '^0x[0-9a-f]{40}$'),
  fingerprint text NOT NULL,
  code_hash text NOT NULL CHECK (code_hash ~ '^0x[0-9a-f]{64}$'),
  version integer NOT NULL CHECK (version IN (12,13)),
  from_block bigint NOT NULL CHECK (from_block >= 0),
  cursor_block bigint,
  cursor_hash text,
  anchor_block bigint,
  anchor_hash text,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  lease_owner uuid,
  lease_until timestamptz,
  PRIMARY KEY (chain_id,controller),
  CHECK ((cursor_block IS NULL) = (cursor_hash IS NULL)),
  CHECK ((anchor_block IS NULL) = (anchor_hash IS NULL))
);

CREATE TABLE manekineko_nft_mirror_collections (
  chain_id integer NOT NULL,
  address text NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
  controller text NOT NULL,
  round_id integer NOT NULL CHECK (round_id BETWEEN 1 AND 256),
  name text NOT NULL,
  season_name text NOT NULL,
  season_id text NOT NULL,
  color text NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  text_color text NOT NULL CHECK (text_color IN ('#000000','#FFFFFF')),
  renderer text NOT NULL,
  deployment_block bigint NOT NULL,
  cursor_block bigint,
  cursor_hash text,
  synced_at timestamptz,
  checked_at timestamptz NOT NULL DEFAULT 'epoch',
  PRIMARY KEY (chain_id,address),
  UNIQUE (chain_id,controller,round_id),
  FOREIGN KEY (chain_id,controller) REFERENCES manekineko_nft_mirror_sources ON DELETE CASCADE,
  CHECK ((cursor_block IS NULL) = (cursor_hash IS NULL))
);

CREATE TABLE manekineko_nft_mirror_tokens (
  chain_id integer NOT NULL,
  collection_address text NOT NULL,
  token_id integer NOT NULL CHECK (token_id BETWEEN 1 AND 65536),
  mint_block bigint NOT NULL,
  mint_block_hash text NOT NULL,
  mint_transaction text NOT NULL,
  burned boolean NOT NULL DEFAULT false,
  metadata jsonb,
  numbers smallint[],
  combination_code integer CHECK (combination_code BETWEEN 0 AND 65535),
  cached_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  retry_after timestamptz NOT NULL DEFAULT 'epoch',
  PRIMARY KEY (chain_id,collection_address,token_id),
  FOREIGN KEY (chain_id,collection_address) REFERENCES manekineko_nft_mirror_collections ON DELETE CASCADE,
  CHECK ((metadata IS NULL AND numbers IS NULL AND combination_code IS NULL AND cached_at IS NULL)
    OR (jsonb_typeof(metadata) = 'object' AND metadata IS NOT NULL AND numbers IS NOT NULL
      AND array_length(numbers,1) = 4 AND array_ndims(numbers) = 1 AND array_position(numbers,NULL) IS NULL
      AND numbers <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]::smallint[]
      AND combination_code IS NOT NULL AND cached_at IS NOT NULL))
);
CREATE INDEX nft_mirror_ready ON manekineko_nft_mirror_tokens (chain_id,collection_address,token_id) WHERE metadata IS NOT NULL;
CREATE INDEX nft_mirror_pending ON manekineko_nft_mirror_tokens (retry_after,chain_id,collection_address,token_id) WHERE metadata IS NULL;
CREATE INDEX nft_mirror_collection_schedule ON manekineko_nft_mirror_collections (chain_id,controller,checked_at);
COMMIT;
