BEGIN;
-- The private season planner can hold Mainnet drafts in staging. Finalized
-- artifacts and live chain records keep the existing Sepolia-only boundary.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.manekineko_launch_automations'::regclass
    AND conname='manekineko_launch_automations_staging_chain') THEN
    ALTER TABLE public.manekineko_launch_automations DROP CONSTRAINT manekineko_launch_automations_staging_chain;
    ALTER TABLE public.manekineko_launch_automations ADD CONSTRAINT manekineko_launch_automations_staging_chain CHECK (
      (COALESCE(plan->>'chainId','')='11155111' OR (COALESCE(plan->>'chainId','')='1' AND status='draft'))
      AND NOT jsonb_path_exists(plan, '$.steps[*].payload.contract.chainId ? (@ != $chain)', jsonb_build_object('chain',plan->>'chainId'))
    );
  END IF;
END $$;

COMMIT;
