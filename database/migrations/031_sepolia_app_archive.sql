BEGIN;
-- App removal keeps frozen plans, deployed terms and transaction journals intact.
-- No Mainnet entity can be archived through this test-only operation.
CREATE TABLE manekineko_sepolia_app_archive (
 entity_type text NOT NULL CHECK(entity_type IN ('collection','automation','run')),
 entity_id uuid NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(entity_type,entity_id)
);
CREATE FUNCTION manekineko_guard_sepolia_app_archive() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Test archive identity is immutable'; END IF;
 IF NEW.entity_type='collection' THEN
  IF NOT EXISTS(SELECT 1 FROM manekineko_collections c JOIN manekineko_deployments d ON d.collection_id=c.id WHERE c.id=NEW.entity_id AND c.chain_id=11155111 AND d.status='deployed') THEN RAISE EXCEPTION 'Only deployed Sepolia collections may be archived'; END IF;
 ELSIF NEW.entity_type='automation' THEN
  IF NOT EXISTS(SELECT 1 FROM manekineko_launch_automations WHERE id=NEW.entity_id AND plan->>'chainId'='11155111') THEN RAISE EXCEPTION 'Only Sepolia automations may be archived'; END IF;
  IF EXISTS(SELECT 1 FROM manekineko_season_runtime_runs WHERE automation_id=NEW.entity_id AND desired_state<>'paused' AND status<>'completed') THEN RAISE EXCEPTION 'Pause the test run before archiving'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM manekineko_season_runtime_runs WHERE id=NEW.entity_id AND chain_id='11155111' AND (desired_state='paused' OR status='completed')) THEN RAISE EXCEPTION 'Only paused or completed Sepolia runs may be archived'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_guard_sepolia_app_archive BEFORE INSERT OR UPDATE OR DELETE ON manekineko_sepolia_app_archive FOR EACH ROW EXECUTE FUNCTION manekineko_guard_sepolia_app_archive();
REVOKE ALL ON manekineko_sepolia_app_archive FROM PUBLIC;
-- Tombstones contain only entity IDs, never private runtime or draft contents.
GRANT SELECT ON manekineko_sepolia_app_archive TO PUBLIC;
ALTER TABLE manekineko_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY active_test_collections ON manekineko_collections USING(NOT EXISTS(SELECT 1 FROM manekineko_sepolia_app_archive a WHERE a.entity_type='collection' AND a.entity_id=id));
ALTER TABLE manekineko_deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY active_test_deployments ON manekineko_deployments USING(NOT EXISTS(SELECT 1 FROM manekineko_sepolia_app_archive a WHERE a.entity_type='collection' AND a.entity_id=collection_id));
ALTER TABLE manekineko_collection_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY active_test_history ON manekineko_collection_history USING(NOT EXISTS(SELECT 1 FROM manekineko_sepolia_app_archive a WHERE a.entity_type='collection' AND a.entity_id=id));
ALTER TABLE manekineko_launch_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY active_test_automations ON manekineko_launch_automations USING(NOT EXISTS(SELECT 1 FROM manekineko_sepolia_app_archive a WHERE a.entity_type='automation' AND a.entity_id=id));
ALTER TABLE manekineko_season_runtime_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY active_test_runs ON manekineko_season_runtime_runs USING(NOT EXISTS(SELECT 1 FROM manekineko_sepolia_app_archive a WHERE a.entity_type='automation' AND a.entity_id=automation_id));
ALTER TABLE manekineko_season_runtime_public ENABLE ROW LEVEL SECURITY;
CREATE POLICY active_test_schedules ON manekineko_season_runtime_public USING(NOT EXISTS(SELECT 1 FROM manekineko_sepolia_app_archive a WHERE a.entity_type='run' AND a.entity_id=run_id));
COMMIT;
