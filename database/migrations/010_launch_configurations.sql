BEGIN;

CREATE TABLE manekineko_launch_configurations (
  id uuid PRIMARY KEY,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 100 AND label = btrim(label)),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND payload ?& ARRAY['contract','operations'] AND octet_length(payload::text) <= 32768),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  finalized_artifact jsonb,
  content_hash text CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL REFERENCES manekineko_launch_users(id),
  updated_by uuid NOT NULL REFERENCES manekineko_launch_users(id),
  finalized_by uuid REFERENCES manekineko_launch_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CHECK (
    (status = 'draft' AND finalized_artifact IS NULL AND content_hash IS NULL AND finalized_by IS NULL AND finalized_at IS NULL) OR
    (status = 'finalized' AND finalized_artifact IS NOT NULL AND content_hash IS NOT NULL AND finalized_by IS NOT NULL AND finalized_at IS NOT NULL
      AND finalized_artifact = jsonb_build_object('schemaVersion',1,'contractVersion','affiliate-v4','contract',payload->'contract','operations',payload->'operations'))
  )
);
CREATE INDEX manekineko_launch_configurations_updated_idx ON manekineko_launch_configurations(updated_at DESC,id);

CREATE TABLE manekineko_launch_configuration_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  configuration_id uuid NOT NULL REFERENCES manekineko_launch_configurations(id),
  revision integer NOT NULL,
  event text NOT NULL CHECK (event IN ('created','updated','finalized')),
  actor_id uuid NOT NULL REFERENCES manekineko_launch_users(id),
  label text NOT NULL,
  payload jsonb NOT NULL,
  content_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(configuration_id,revision)
);

CREATE FUNCTION manekineko_guard_launch_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Launch configurations must be retained for audit'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.revision <> 1 OR NEW.created_by <> NEW.updated_by THEN
      RAISE EXCEPTION 'Create a draft before finalizing a launch configuration';
    END IF;
  ELSE
    IF OLD.status = 'finalized' THEN RAISE EXCEPTION 'Finalized launch configurations are immutable'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'Launch identity is immutable and revisions must advance exactly once';
    END IF;
    IF NEW.status = 'finalized' AND NEW.finalized_by IS DISTINCT FROM NEW.updated_by THEN
      RAISE EXCEPTION 'The finalizing actor must match the update actor';
    END IF;
  END IF;
  NEW.updated_at = clock_timestamp();
  IF NEW.status = 'finalized' THEN NEW.finalized_at = NEW.updated_at; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_guard_launch_configuration BEFORE INSERT OR UPDATE OR DELETE ON manekineko_launch_configurations
  FOR EACH ROW EXECUTE FUNCTION manekineko_guard_launch_configuration();

CREATE FUNCTION manekineko_record_launch_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO manekineko_launch_configuration_events(configuration_id,revision,event,actor_id,label,payload,content_hash)
    VALUES(NEW.id,NEW.revision,CASE WHEN TG_OP = 'INSERT' THEN 'created' WHEN NEW.status = 'finalized' THEN 'finalized' ELSE 'updated' END,NEW.updated_by,NEW.label,NEW.payload,NEW.content_hash);
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_record_launch_configuration AFTER INSERT OR UPDATE ON manekineko_launch_configurations
  FOR EACH ROW EXECUTE FUNCTION manekineko_record_launch_configuration();

CREATE FUNCTION manekineko_guard_launch_configuration_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Launch configuration audit events are immutable';
END;
$$;
CREATE TRIGGER manekineko_guard_launch_configuration_event BEFORE UPDATE OR DELETE ON manekineko_launch_configuration_events
  FOR EACH ROW EXECUTE FUNCTION manekineko_guard_launch_configuration_event();

COMMIT;
