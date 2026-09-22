-- Explorer caches are external projections, independent of draw/prize settlement.
BEGIN;

CREATE TABLE manekineko_nft_metadata_jobs (
  collection_id uuid NOT NULL REFERENCES manekineko_deployments(collection_id),
  token_id integer NOT NULL CHECK (token_id BETWEEN 1 AND 65536),
  generation text NOT NULL CHECK (length(generation) BETWEEN 66 AND 143),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verifying','verified','blocked')),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  refresh_attempts integer NOT NULL DEFAULT 0 CHECK (refresh_attempts >= 0),
  last_refresh_at timestamptz,
  expected_hash text CHECK (expected_hash ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz,
  last_error text CHECK (last_error ~ '^[a-z_]{1,64}$'),
  lease_owner uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, token_id),
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL))
);
CREATE INDEX manekineko_nft_metadata_due_idx ON manekineko_nft_metadata_jobs(next_attempt_at)
  WHERE status <> 'verified';

-- One shared quota for every factory/worker using this explorer. Reserve BEFORE HTTP.
CREATE TABLE manekineko_nft_metadata_providers (
  provider text PRIMARY KEY CHECK (provider = 'blockscout_sepolia'),
  next_refresh_at timestamptz NOT NULL DEFAULT now(),
  retry_after timestamptz NOT NULL DEFAULT now(),
  blocked boolean NOT NULL DEFAULT false,
  last_error text CHECK (last_error ~ '^[a-z_]{1,64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO manekineko_nft_metadata_providers(provider) VALUES ('blockscout_sepolia');
REVOKE ALL ON manekineko_nft_metadata_jobs, manekineko_nft_metadata_providers FROM PUBLIC;

COMMIT;
