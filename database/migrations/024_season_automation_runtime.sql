BEGIN;

-- Runtime data is deliberately separate from immutable prepared plans. Only the
-- public projection table may be granted to the Web role. No PUBLIC grants.
CREATE TABLE manekineko_season_runtime_profiles (
 chain_id text PRIMARY KEY CHECK(chain_id IN ('1','11155111')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
 enabled boolean NOT NULL DEFAULT true,
 handle text NOT NULL CHECK(handle ~ '^[A-Za-z0-9_]{1,15}$'),
 expected_account_id text NOT NULL CHECK(expected_account_id ~ '^[0-9]{1,30}$'),
 public_base_url text NOT NULL CHECK(length(public_base_url) BETWEEN 8 AND 500),
 encrypted_credentials text NOT NULL CHECK(length(encrypted_credentials) BETWEEN 40 AND 16000),
 updated_by uuid NOT NULL REFERENCES manekineko_launch_users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE manekineko_season_runtime_runs (
 id uuid PRIMARY KEY,
 automation_id uuid NOT NULL UNIQUE REFERENCES manekineko_launch_automations(id),
 automation_revision integer NOT NULL CHECK(automation_revision > 0),
 prepared_hash text NOT NULL CHECK(prepared_hash ~ '^[a-f0-9]{64}$'),
 chain_id text NOT NULL REFERENCES manekineko_season_runtime_profiles(chain_id),
 profile_revision integer NOT NULL CHECK(profile_revision > 0),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','paused','failed','completed')),
 desired_state text NOT NULL DEFAULT 'running' CHECK(desired_state IN ('running','paused')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
 state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(state)='object' AND octet_length(state::text)<=8388608),
 last_error text CHECK(length(last_error)<=2000),
 heartbeat_at timestamptz,
 lease_owner text,
 lease_expires_at timestamptz,
 created_by uuid NOT NULL REFERENCES manekineko_launch_users(id),
 updated_by uuid NOT NULL REFERENCES manekineko_launch_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manekineko_season_runtime_runs_ready_idx ON manekineko_season_runtime_runs(chain_id,status,desired_state);

CREATE FUNCTION manekineko_guard_season_runtime_run() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE saved manekineko_launch_automations%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Season runtime history must be retained'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO STRICT saved FROM manekineko_launch_automations WHERE id=NEW.automation_id FOR SHARE;
  IF saved.status<>'prepared' OR saved.revision<>NEW.automation_revision OR saved.content_hash<>NEW.prepared_hash
   OR saved.prepared_artifact->>'contractVersion' IS DISTINCT FROM 'affiliate-v9'
   OR saved.plan->>'chainId' IS DISTINCT FROM NEW.chain_id OR NOT (saved.plan ? 'timing')
   OR NOT (saved.plan ? 'seasonId') THEN RAISE EXCEPTION 'Runtime requires the exact prepared V9 season revision and hash'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(saved.plan->'steps') AS step
   WHERE manekineko_launch_payload_version(step->'payload') IS DISTINCT FROM 'affiliate-v9'
    OR step->'payload'->'contract'->>'chainId' IS DISTINCT FROM NEW.chain_id) THEN RAISE EXCEPTION 'Runtime collection version or network mismatch'; END IF;
 ELSIF NEW.id IS DISTINCT FROM OLD.id OR NEW.automation_id IS DISTINCT FROM OLD.automation_id
   OR NEW.automation_revision IS DISTINCT FROM OLD.automation_revision OR NEW.prepared_hash IS DISTINCT FROM OLD.prepared_hash
   OR NEW.chain_id IS DISTINCT FROM OLD.chain_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Runtime plan binding is immutable';
 END IF;
 NEW.updated_at:=clock_timestamp();
 RETURN NEW;
END; $$;
CREATE TRIGGER manekineko_guard_season_runtime_run BEFORE INSERT OR UPDATE OR DELETE ON manekineko_season_runtime_runs
 FOR EACH ROW EXECUTE FUNCTION manekineko_guard_season_runtime_run();

CREATE TABLE manekineko_season_runtime_actions (
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES manekineko_season_runtime_runs(id),
 action_key text NOT NULL CHECK(length(action_key) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK(length(kind) BETWEEN 1 AND 80),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','submitted','confirmed','uncertain','failed')),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object'),
 result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(result)='object'),
 encrypted_raw_transaction text,
 tx_hash text CHECK(tx_hash IS NULL OR tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
 last_error text CHECK(length(last_error)<=2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,action_key)
);

CREATE TABLE manekineko_season_runtime_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES manekineko_season_runtime_runs(id),
 event text NOT NULL CHECK(length(event) BETWEEN 1 AND 80),
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manekineko_season_runtime_events_run_idx ON manekineko_season_runtime_events(run_id,id DESC);

CREATE TABLE manekineko_season_runtime_public (
 run_id uuid PRIMARY KEY REFERENCES manekineko_season_runtime_runs(id),
 chain_id text NOT NULL CHECK(chain_id IN ('1','11155111')),
 season_id text NOT NULL CHECK(season_id ~ '^0x[0-9a-f]{64}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(chain_id,season_id)
);
COMMENT ON TABLE manekineko_season_runtime_public IS 'Whitelisted public schedule published only after first verified X announcement. Never copy private runtime state or secrets here.';
COMMENT ON TABLE manekineko_season_runtime_actions IS 'Private durable transaction and social outbox. Ambiguous delivery pauses; never blindly retry a possibly accepted X write.';
REVOKE ALL ON manekineko_season_runtime_profiles,manekineko_season_runtime_runs,manekineko_season_runtime_actions,manekineko_season_runtime_events,manekineko_season_runtime_public FROM PUBLIC;
COMMIT;
