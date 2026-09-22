BEGIN;
-- Extend version discrimination without rewriting any historical document or hash.
CREATE OR REPLACE FUNCTION manekineko_launch_payload_version(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT CASE WHEN p->'contract' ? 'algorithmVersion' THEN CASE
   WHEN p->'contract'->>'algorithmVersion'='unique-rank-v4'
     AND (p->'contract' ?& ARRAY['affiliatePoolBps','secondPrizeBps','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt']) THEN 'affiliate-v7'
   WHEN p->'contract'->>'algorithmVersion'='unique-rank-v3' AND p->'contract' ? 'affiliatePoolBps' THEN 'affiliate-v6'
   ELSE NULL END
 WHEN p->'contract' ? 'affiliatePoolBps' THEN 'affiliate-v5' ELSE 'affiliate-v4' END;
$$;
CREATE OR REPLACE FUNCTION manekineko_valid_launch_season(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE step jsonb;
BEGIN
 IF NOT (p ? 'seasonId') THEN RETURN true; END IF;
 IF jsonb_typeof(p->'seasonId') IS DISTINCT FROM 'string'
   OR p->>'seasonId' !~ '^0x[0-9a-f]{64}$' OR p->>'seasonId'='0x' || repeat('0',64)
   OR jsonb_typeof(p->'name') IS DISTINCT FROM 'string' OR octet_length(p->>'name') NOT BETWEEN 1 AND 64
   OR p->>'name'<>btrim(p->>'name') OR p->>'name' ~ '[[:cntrl:]]'
   OR jsonb_typeof(p->'steps') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p->'steps') NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
 FOR step IN SELECT * FROM jsonb_array_elements(p->'steps') LOOP
   IF step->'payload'->'contract'->>'seasonId' IS DISTINCT FROM p->>'seasonId'
     OR step->'payload'->'contract'->>'seasonName' IS DISTINCT FROM p->>'name'
     OR COALESCE(step->'payload'->'contract'->>'algorithmVersion','') NOT IN ('unique-rank-v3','unique-rank-v4') THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END; $$;
CREATE FUNCTION manekineko_valid_season_timing(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE timing jsonb:=p->'timing'; social jsonb:=p->'social'; step jsonb; key text;
BEGIN
 IF NOT (p ? 'timing') THEN RETURN NOT (p ? 'social'); END IF;
 IF jsonb_typeof(timing) IS DISTINCT FROM 'object' OR timing-'version'-'anchor'-'nextLaunchDelaySeconds'-'nextAnnouncementDelaySeconds'-'winnerAnnouncement'-'missedLaunchPolicy'<>'{}'::jsonb
   OR timing->'version' IS DISTINCT FROM '1'::jsonb OR timing->>'anchor' IS DISTINCT FROM 'previous_sellout'
   OR timing->>'winnerAnnouncement' IS DISTINCT FROM 'after_verified_draw' OR timing->>'missedLaunchPolicy' IS DISTINCT FROM 'pause'
   OR p->>'intervalSeconds' IS DISTINCT FROM '0' OR p->>'failurePolicy' IS DISTINCT FROM 'pause' THEN RETURN false; END IF;
 FOREACH key IN ARRAY ARRAY['nextLaunchDelaySeconds','nextAnnouncementDelaySeconds'] LOOP
   IF jsonb_typeof(timing->key) IS DISTINCT FROM 'string' OR timing->>key !~ '^(0|[1-9][0-9]{0,6})$' THEN RETURN false; END IF;
 END LOOP;
 IF (timing->>'nextLaunchDelaySeconds')::integer NOT BETWEEN 1 AND 2592000
   OR (timing->>'nextAnnouncementDelaySeconds')::integer >= (timing->>'nextLaunchDelaySeconds')::integer THEN RETURN false; END IF;
 FOR step IN SELECT * FROM jsonb_array_elements(p->'steps') LOOP
   IF manekineko_launch_payload_version(step->'payload') IS DISTINCT FROM 'affiliate-v7' THEN RETURN false; END IF;
 END LOOP;
 IF p ? 'social' THEN
   IF jsonb_typeof(social) IS DISTINCT FROM 'object'
     OR social-'enabled'-'channel'-'selloutTemplate'-'winnersTemplate'-'nextLaunchTemplate'<>'{}'::jsonb
     OR jsonb_typeof(social->'enabled') IS DISTINCT FROM 'boolean' OR social->>'channel' IS DISTINCT FROM 'x' THEN RETURN false; END IF;
   FOREACH key IN ARRAY ARRAY['selloutTemplate','winnersTemplate','nextLaunchTemplate'] LOOP
     IF jsonb_typeof(social->key) IS DISTINCT FROM 'string' OR length(btrim(social->>key)) NOT BETWEEN 1 AND 2000 THEN RETURN false; END IF;
   END LOOP;
   IF strpos(social->>'selloutTemplate','{{winners}}')>0 OR strpos(social->>'nextLaunchTemplate','{{launchAt}}')=0 THEN RETURN false; END IF;
 END IF;
 RETURN true;
END; $$;
ALTER TABLE manekineko_launch_automations ADD CONSTRAINT manekineko_season_timing_check CHECK (manekineko_valid_season_timing(plan));

-- Durable intent contract for the future executor. Nothing reads or dispatches
-- this table yet. Only prepared, immutable revisions can receive a schedule.
CREATE TABLE manekineko_season_launch_schedule (
 id uuid PRIMARY KEY,
 automation_id uuid NOT NULL REFERENCES manekineko_launch_automations(id),
 automation_revision integer NOT NULL CHECK (automation_revision>0),
 prepared_content_hash text NOT NULL CHECK (prepared_content_hash ~ '^[0-9a-f]{64}$'),
 step_id uuid NOT NULL,
 predecessor_collection_id uuid REFERENCES manekineko_collections(id),
 source_block_number numeric(78,0),
 source_block_hash text,
 sold_out_at timestamptz,
 announcement_at timestamptz,
 launch_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(automation_id,automation_revision,step_id),
 CHECK ((predecessor_collection_id IS NULL AND source_block_number IS NULL AND source_block_hash IS NULL AND sold_out_at IS NULL AND announcement_at IS NULL)
   OR (predecessor_collection_id IS NOT NULL AND source_block_number IS NOT NULL AND source_block_number>=0 AND source_block_hash IS NOT NULL AND source_block_hash ~ '^0x[0-9a-f]{64}$'
     AND sold_out_at IS NOT NULL AND announcement_at IS NOT NULL AND sold_out_at<=announcement_at AND announcement_at<launch_at))
);
CREATE FUNCTION manekineko_guard_season_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE saved manekineko_launch_automations%ROWTYPE; ordinal integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'A fixed season schedule is immutable; supersede the prepared plan after operator review'; END IF;
 SELECT * INTO STRICT saved FROM manekineko_launch_automations WHERE id=NEW.automation_id FOR SHARE;
 IF saved.status<>'prepared' OR saved.revision<>NEW.automation_revision OR saved.content_hash<>NEW.prepared_content_hash
   OR NOT (saved.plan ? 'timing') THEN RAISE EXCEPTION 'Schedules require the exact prepared season revision and hash'; END IF;
 SELECT ord INTO ordinal FROM jsonb_array_elements(saved.plan->'steps') WITH ORDINALITY AS steps(step,ord) WHERE step->>'id'=NEW.step_id::text;
 IF ordinal IS NULL THEN RAISE EXCEPTION 'Schedule step is not in the prepared season'; END IF;
 IF ordinal=1 THEN
   IF NEW.predecessor_collection_id IS NOT NULL OR saved.plan->>'startAt' IS NULL OR NEW.launch_at<>(saved.plan->>'startAt')::timestamptz THEN RAISE EXCEPTION 'First launch must match the prepared fixed start'; END IF;
 ELSE
   IF NEW.predecessor_collection_id IS NULL OR NEW.launch_at IS DISTINCT FROM NEW.sold_out_at+make_interval(secs=>(saved.plan->'timing'->>'nextLaunchDelaySeconds')::integer)
     OR NEW.announcement_at IS DISTINCT FROM NEW.sold_out_at+make_interval(secs=>(saved.plan->'timing'->>'nextAnnouncementDelaySeconds')::integer) THEN RAISE EXCEPTION 'Follow-up timing must be anchored exactly to the canonical sellout'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER manekineko_guard_season_schedule BEFORE INSERT OR UPDATE OR DELETE ON manekineko_season_launch_schedule FOR EACH ROW EXECUTE FUNCTION manekineko_guard_season_schedule();
CREATE TABLE manekineko_season_action_intents (
 id uuid PRIMARY KEY,
 schedule_id uuid NOT NULL REFERENCES manekineko_season_launch_schedule(id),
 kind text NOT NULL CHECK(kind IN ('sellout_post','winners_post','next_launch_post','deploy_collection','activate_collection')),
 due_at timestamptz,
 prerequisite text NOT NULL CHECK(prerequisite IN ('finalized_sellout','verified_draw','confirmed_deployment','fixed_launch_ready')),
 idempotency_key text NOT NULL UNIQUE CHECK(length(idempotency_key) BETWEEN 1 AND 200),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=16000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(schedule_id,kind),
 CHECK ((kind='sellout_post' AND prerequisite='finalized_sellout')
   OR (kind IN ('winners_post','deploy_collection') AND prerequisite='verified_draw')
   OR (kind='next_launch_post' AND prerequisite='confirmed_deployment')
   OR (kind='activate_collection' AND prerequisite='fixed_launch_ready'))
);
CREATE FUNCTION manekineko_guard_season_intent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE schedule manekineko_season_launch_schedule%ROWTYPE; expected_due timestamptz;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Season action intents are immutable'; END IF;
 SELECT * INTO STRICT schedule FROM manekineko_season_launch_schedule WHERE id=NEW.schedule_id FOR SHARE;
 expected_due:=CASE NEW.kind WHEN 'sellout_post' THEN schedule.sold_out_at WHEN 'next_launch_post' THEN schedule.announcement_at WHEN 'activate_collection' THEN schedule.launch_at ELSE NULL END;
 IF NEW.due_at IS DISTINCT FROM expected_due OR (NEW.kind IN ('sellout_post','next_launch_post','winners_post') AND schedule.predecessor_collection_id IS NULL) THEN
   RAISE EXCEPTION 'Action time must match its fixed schedule and predecessor';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER manekineko_guard_season_intent BEFORE INSERT OR UPDATE OR DELETE ON manekineko_season_action_intents FOR EACH ROW EXECUTE FUNCTION manekineko_guard_season_intent();
COMMENT ON TABLE manekineko_season_action_intents IS 'Non-executing future-worker intents. No credentials, signing or X dispatch. A future executor must recheck canonical chain evidence, exact contract config, posts and funding before action.';
COMMENT ON TABLE manekineko_season_launch_schedule IS 'Immutable fixed launch plan anchored to a finalized sellout; a reorg or missed readiness requires pausing, not silently moving launch_at. The future worker must verify predecessor binding to the prepared step.';
COMMIT;
