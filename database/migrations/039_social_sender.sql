BEGIN;
SET LOCAL lock_timeout = '5s';
-- Delivery authority only. No signing keys, RPC credentials or contract writes.
CREATE TABLE manekineko_social_senders (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,80}$'),
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'
    AND config->>'version'='17' AND config->>'chainId'='11155111'
    AND config ?& ARRAY['version','chainId','controller','controllerCodeHash','appUrl','xAccountId']
    AND config - ARRAY['version','chainId','controller','controllerCodeHash','appUrl','xAccountId'] = '{}'::jsonb),
  enabled boolean NOT NULL DEFAULT false,
  entries jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(entries) = 'array'),
  lease_token uuid,
  lease_until timestamptz,
  checked_at timestamptz,
  observed_at timestamptz,
  delivered_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  last_error text CHECK (last_error ~ '^[a-z0-9_]{1,80}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
REVOKE ALL ON manekineko_social_senders FROM PUBLIC;
COMMIT;
