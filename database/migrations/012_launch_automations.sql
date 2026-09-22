BEGIN;

-- Ordered collection settings are one revisioned document. A write cannot leave
-- a partly updated schedule, and a prepared document is never an execution flag.
CREATE TABLE manekineko_launch_automations (
  id uuid PRIMARY KEY,
  plan jsonb NOT NULL CHECK (
    jsonb_typeof(plan) = 'object' AND
    plan ?& ARRAY['name','chainId','startAt','intervalSeconds','failurePolicy','steps'] AND
    jsonb_typeof(plan->'name') = 'string' AND length(plan->>'name') BETWEEN 1 AND 100 AND plan->>'name' = btrim(plan->>'name') AND
    plan->>'chainId' IN ('1','11155111') AND plan->>'failurePolicy' = 'pause' AND
    jsonb_typeof(plan->'steps') = 'array' AND jsonb_array_length(plan->'steps') BETWEEN 1 AND 100 AND
    octet_length(plan::text) <= 2097152
  ),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','prepared')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  prepared_artifact jsonb,
  content_hash text CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL REFERENCES manekineko_launch_users(id),
  updated_by uuid NOT NULL REFERENCES manekineko_launch_users(id),
  prepared_by uuid REFERENCES manekineko_launch_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  prepared_at timestamptz,
  CHECK (
    (status = 'draft' AND prepared_artifact IS NULL AND content_hash IS NULL AND prepared_by IS NULL AND prepared_at IS NULL) OR
    (status = 'prepared' AND prepared_artifact IS NOT NULL AND content_hash IS NOT NULL AND prepared_by IS NOT NULL AND prepared_at IS NOT NULL
      AND prepared_artifact = plan || jsonb_build_object('schemaVersion',1,'kind','launch-automation','contractVersion','affiliate-v4'))
  )
);
CREATE INDEX manekineko_launch_automations_updated_idx ON manekineko_launch_automations(updated_at DESC,id DESC);

CREATE TABLE manekineko_launch_automation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  automation_id uuid NOT NULL REFERENCES manekineko_launch_automations(id),
  revision integer NOT NULL,
  event text NOT NULL CHECK (event IN ('created','updated','prepared')),
  actor_id uuid NOT NULL REFERENCES manekineko_launch_users(id),
  plan jsonb NOT NULL,
  content_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(automation_id,revision)
);

CREATE FUNCTION manekineko_guard_launch_automation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Launch automations must be retained for audit'; END IF;

  -- Serialize against account suspension, including writes by a future worker.
  PERFORM id FROM manekineko_launch_users WHERE id = NEW.updated_by AND disabled_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Launch actor is inactive';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.revision <> 1 OR NEW.created_by <> NEW.updated_by THEN
      RAISE EXCEPTION 'Create a draft before preparing a launch automation';
    END IF;
  ELSE
    IF OLD.status = 'prepared' THEN RAISE EXCEPTION 'Prepared launch automations are immutable'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'Launch automation identity is immutable and revisions must advance exactly once';
    END IF;
    IF NEW.status = 'prepared' AND NEW.prepared_by IS DISTINCT FROM NEW.updated_by THEN
      RAISE EXCEPTION 'The preparing actor must match the update actor';
    END IF;
  END IF;
  NEW.updated_at = clock_timestamp();
  IF NEW.status = 'prepared' THEN NEW.prepared_at = NEW.updated_at; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_guard_launch_automation BEFORE INSERT OR UPDATE OR DELETE ON manekineko_launch_automations
  FOR EACH ROW EXECUTE FUNCTION manekineko_guard_launch_automation();

CREATE FUNCTION manekineko_record_launch_automation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO manekineko_launch_automation_events(automation_id,revision,event,actor_id,plan,content_hash)
    VALUES(NEW.id,NEW.revision,CASE WHEN TG_OP = 'INSERT' THEN 'created' WHEN NEW.status = 'prepared' THEN 'prepared' ELSE 'updated' END,NEW.updated_by,NEW.plan,NEW.content_hash);
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_record_launch_automation AFTER INSERT OR UPDATE ON manekineko_launch_automations
  FOR EACH ROW EXECUTE FUNCTION manekineko_record_launch_automation();

CREATE FUNCTION manekineko_guard_launch_automation_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Launch automation audit events are immutable';
END;
$$;
CREATE TRIGGER manekineko_guard_launch_automation_event BEFORE UPDATE OR DELETE ON manekineko_launch_automation_events
  FOR EACH ROW EXECUTE FUNCTION manekineko_guard_launch_automation_event();

COMMIT;
