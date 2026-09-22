-- Private provenance for independent Sepolia drafts. Never part of an export.
BEGIN;
ALTER TABLE manekineko_launch_automations
  ADD COLUMN mock_source_id uuid REFERENCES manekineko_launch_automations(id),
  ADD COLUMN mock_source_revision integer,
  ADD COLUMN mock_catalog_order integer,
  ADD CONSTRAINT manekineko_mock_source_unique UNIQUE (mock_source_id),
  ADD CONSTRAINT manekineko_mock_source_check CHECK (
    (mock_source_id IS NULL AND mock_source_revision IS NULL AND mock_catalog_order IS NULL)
    OR (mock_source_id IS NOT NULL AND mock_source_id <> id
      AND mock_source_revision IS NOT NULL AND mock_source_revision > 0
      AND plan->>'chainId' = '11155111'
      AND (mock_catalog_order IS NULL OR mock_catalog_order > 0))
  );

CREATE FUNCTION manekineko_guard_mock_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.mock_source_id,NEW.mock_source_revision,NEW.mock_catalog_order)
      IS DISTINCT FROM ROW(OLD.mock_source_id,OLD.mock_source_revision,OLD.mock_catalog_order) THEN
      RAISE EXCEPTION 'Mock season provenance is immutable' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.mock_source_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM manekineko_launch_automations
      WHERE id=NEW.mock_source_id AND plan->>'chainId'='1' AND revision=NEW.mock_source_revision) THEN
      RAISE EXCEPTION 'Mock season requires the saved Mainnet source revision' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER manekineko_guard_mock_source BEFORE INSERT OR UPDATE ON manekineko_launch_automations
  FOR EACH ROW EXECUTE FUNCTION manekineko_guard_mock_source();
COMMIT;
