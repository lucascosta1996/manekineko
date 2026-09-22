BEGIN;

-- Existing collection rows and signed/finalized documents are retained exactly.
-- Appearance is present only for collections deployed with the season-aware V6.
ALTER TABLE manekineko_collections
  ADD COLUMN season_id text,
  ADD COLUMN season_name text,
  ADD COLUMN collection_color text,
  ADD COLUMN text_color text,
  ADD CONSTRAINT manekineko_collection_season_appearance_check CHECK (
    (season_id IS NULL AND season_name IS NULL AND collection_color IS NULL AND text_color IS NULL)
    OR (contract_version='affiliate-v6'
      AND season_id IS NOT NULL AND season_name IS NOT NULL AND collection_color IS NOT NULL AND text_color IS NOT NULL
      AND season_id ~ '^0x[0-9a-f]{64}$' AND season_id <> '0x' || repeat('0',64)
      AND octet_length(season_name) BETWEEN 1 AND 64 AND season_name=btrim(season_name)
      AND season_name !~ '[[:cntrl:]]'
      AND collection_color ~ '^#[0-9A-F]{6}$' AND text_color IN ('#000000','#FFFFFF'))
  );
CREATE INDEX manekineko_collections_season_idx ON manekineko_collections(chain_id,season_id)
  WHERE season_id IS NOT NULL;

-- Serialize enrollment in a season so two concurrent registrations cannot
-- both insert collection ten. Separate networks have separate season capacity.
CREATE FUNCTION manekineko_guard_collection_season() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.season_id IS NOT NULL
    AND (NEW.season_id IS DISTINCT FROM OLD.season_id OR NEW.season_name IS DISTINCT FROM OLD.season_name
      OR NEW.collection_color IS DISTINCT FROM OLD.collection_color OR NEW.text_color IS DISTINCT FROM OLD.text_color
      OR NEW.chain_id IS DISTINCT FROM OLD.chain_id) THEN
    RAISE EXCEPTION 'Deployed collection season appearance is immutable';
  END IF;
  IF NEW.season_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.chain_id::text || ':' || NEW.season_id,0));
  IF EXISTS(SELECT 1 FROM manekineko_collections
    WHERE chain_id=NEW.chain_id AND season_id=NEW.season_id AND id<>NEW.id AND season_name IS DISTINCT FROM NEW.season_name) THEN
    RAISE EXCEPTION 'Collections in a season must share the same season name';
  END IF;
  IF (SELECT count(*) FROM manekineko_collections WHERE chain_id=NEW.chain_id AND season_id=NEW.season_id AND id<>NEW.id)>=10 THEN
    RAISE EXCEPTION 'A season may contain at most ten collections';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER manekineko_guard_collection_season BEFORE INSERT OR UPDATE ON manekineko_collections
  FOR EACH ROW EXECUTE FUNCTION manekineko_guard_collection_season();

-- The revisioned automation document is the season aggregate. Keep the existing
-- audit log, immutability and prepared-artifact equality checks unchanged.
CREATE FUNCTION manekineko_valid_launch_season(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE step jsonb;
BEGIN
  IF NOT (p ? 'seasonId') THEN RETURN true; END IF;
  IF jsonb_typeof(p->'seasonId') IS DISTINCT FROM 'string'
    OR p->>'seasonId' !~ '^0x[0-9a-f]{64}$' OR p->>'seasonId'='0x' || repeat('0',64)
    OR jsonb_typeof(p->'name') IS DISTINCT FROM 'string' OR octet_length(p->>'name') NOT BETWEEN 1 AND 64
    OR p->>'name' <> btrim(p->>'name') OR p->>'name' ~ '[[:cntrl:]]'
    OR jsonb_typeof(p->'steps') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p->'steps') NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
  FOR step IN SELECT * FROM jsonb_array_elements(p->'steps') LOOP
    IF step->'payload'->'contract'->>'seasonId' IS DISTINCT FROM p->>'seasonId'
      OR step->'payload'->'contract'->>'seasonName' IS DISTINCT FROM p->>'name'
      OR step->'payload'->'contract'->>'algorithmVersion' IS DISTINCT FROM 'unique-rank-v3' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END; $$;
ALTER TABLE manekineko_launch_automations ADD CONSTRAINT manekineko_launch_season_check
  CHECK (manekineko_valid_launch_season(plan));

COMMENT ON COLUMN manekineko_collections.season_id IS
  'Immutable nonzero bytes32 season identity; NULL retains historical collections. At most ten collections per network and season.';
COMMENT ON COLUMN manekineko_collections.collection_color IS
  'Reviewed #RRGGBB color stored on chain for the SVG background and collection name badge.';
COMMENT ON COLUMN manekineko_collections.text_color IS
  'Black or white contrast computed before deployment and stored on chain, with no on-chain luminance calculation.';
COMMIT;
