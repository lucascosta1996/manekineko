BEGIN;
-- Display/execution membership is separate from immutable prepared artifacts.
CREATE TABLE IF NOT EXISTS manekineko_season_review_members (
 automation_id uuid PRIMARY KEY REFERENCES manekineko_launch_automations(id),
 review_group jsonb NOT NULL CHECK (jsonb_typeof(review_group)='object' AND jsonb_array_length(review_group->'stages')=3),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS manekineko_season_review_superseded (
 automation_id uuid PRIMARY KEY REFERENCES manekineko_launch_automations(id),
 replacement_id uuid NOT NULL REFERENCES manekineko_launch_automations(id),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK (automation_id<>replacement_id)
);
CREATE OR REPLACE FUNCTION manekineko_guard_review_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE matches integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Review membership is immutable'; END IF;
 IF TG_TABLE_NAME='manekineko_season_review_superseded' THEN
   SELECT count(*) INTO matches FROM manekineko_launch_automations WHERE id IN (NEW.automation_id,NEW.replacement_id) AND plan->>'chainId'='11155111';
   IF matches<>2 THEN RAISE EXCEPTION 'Review replacement is Sepolia only'; END IF;
 ELSE
   SELECT count(*) INTO matches FROM manekineko_launch_automations a JOIN jsonb_array_elements(NEW.review_group->'stages') s ON a.id::text=s->>'automationId'
    WHERE a.plan->>'chainId'='11155111' AND a.plan->>'seasonId'=NEW.review_group->>'seasonId' AND a.plan->>'name'=NEW.review_group->>'seasonName'
      AND jsonb_array_length(a.plan->'steps')=1 AND a.plan->'steps'->0->>'id'=s->>'collectionId'
      AND a.plan->'steps'->0->'payload'->'contract'->>'name'=s->>'name'
      AND upper(a.plan->'steps'->0->'payload'->'contract'->>'collectionColor')=upper(s->>'color');
   IF matches<>3 OR (SELECT count(DISTINCT s->>'automationId') FROM jsonb_array_elements(NEW.review_group->'stages') s)<>3
     OR (SELECT count(DISTINCT s->>'collectionId') FROM jsonb_array_elements(NEW.review_group->'stages') s)<>3
     OR EXISTS(SELECT 1 FROM manekineko_season_review_members m WHERE m.review_group->>'seasonId'=NEW.review_group->>'seasonId' AND m.review_group<>NEW.review_group)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.review_group->'stages') s WHERE s->>'automationId'=NEW.automation_id::text)
     THEN RAISE EXCEPTION 'Review members must share a verified three-collection Sepolia identity'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS manekineko_guard_review_membership ON manekineko_season_review_members;
CREATE TRIGGER manekineko_guard_review_membership BEFORE INSERT OR UPDATE OR DELETE ON manekineko_season_review_members FOR EACH ROW EXECUTE FUNCTION manekineko_guard_review_membership();
DROP TRIGGER IF EXISTS manekineko_guard_review_replacement ON manekineko_season_review_superseded;
CREATE TRIGGER manekineko_guard_review_replacement BEFORE INSERT OR UPDATE OR DELETE ON manekineko_season_review_superseded FOR EACH ROW EXECUTE FUNCTION manekineko_guard_review_membership();
REVOKE ALL ON manekineko_season_review_members,manekineko_season_review_superseded FROM PUBLIC;
-- Independent review runs share one public season identity. Keep each run's
-- public observation so Web can combine members instead of overwriting history.
ALTER TABLE IF EXISTS manekineko_season_runtime_public DROP CONSTRAINT IF EXISTS manekineko_season_runtime_public_chain_id_season_id_key;
-- A grouped draft may receive run-day timing/factory settings, never a different identity.
CREATE OR REPLACE FUNCTION manekineko_guard_review_plan() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g jsonb; s jsonb;
BEGIN
 SELECT review_group INTO g FROM manekineko_season_review_members WHERE automation_id=NEW.id;
 IF g IS NULL THEN RETURN NEW; END IF;
 SELECT value INTO s FROM jsonb_array_elements(g->'stages') WHERE value->>'automationId'=NEW.id::text;
 IF NEW.plan->>'chainId' IS DISTINCT FROM '11155111' OR NEW.plan->>'seasonId' IS DISTINCT FROM g->>'seasonId'
   OR NEW.plan->>'name' IS DISTINCT FROM g->>'seasonName' OR jsonb_array_length(NEW.plan->'steps')<>1
   OR NEW.plan->'steps'->0->>'id' IS DISTINCT FROM s->>'collectionId'
   OR NEW.plan->'steps'->0->'payload'->'contract'->>'name' IS DISTINCT FROM s->>'name'
   OR upper(NEW.plan->'steps'->0->'payload'->'contract'->>'collectionColor') IS DISTINCT FROM upper(s->>'color')
 THEN RAISE EXCEPTION 'Review collection identity is immutable'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS manekineko_guard_review_plan ON manekineko_launch_automations;
CREATE TRIGGER manekineko_guard_review_plan BEFORE UPDATE ON manekineko_launch_automations FOR EACH ROW EXECUTE FUNCTION manekineko_guard_review_plan();
COMMIT;
