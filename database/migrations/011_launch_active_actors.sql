BEGIN;

-- A session can be revoked after an HTTP check. Lock and recheck the actor in
-- the configuration write itself, including writes from a future private worker.
CREATE OR REPLACE FUNCTION manekineko_guard_launch_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Launch configurations must be retained for audit'; END IF;

  PERFORM id FROM manekineko_launch_users WHERE id = NEW.updated_by AND disabled_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Launch actor is inactive';
  END IF;

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

COMMIT;
