# Airy Garden live recovery

Created 2026-09-27 for the existing paused two-collection Sepolia run. The application release does not run this script or start the worker. Live recovery has not been applied.

## Scope

`npm run season:recover:airy-garden` audits run `257c7ab9-9e56-4daf-b5db-917a05d15d1c`, automation `79b44791-5787-4a26-90db-86a06a286a3b`. It cannot select Mainnet or the superseded ten-collection run. Lunar Stone (`369e50fc-47f3-496f-938d-53e5ea0f9d02`, round `0xaeCf42388f3Df8A92279d68065920745B73Ad728`) must still have a confirmed sellout, verified draw and reserved prizes. Satin Echo (`2a7d8825-da7d-42e6-92b4-f15a34d78e27`) must have no deployment, signed intent or social action.

The original prepared artifact, its hash, collection identities, economics, registry pins, factory, signed transactions and confirmed posts remain unchanged. A separate hash-bound runtime record overrides only Satin Echo's opening and mint duration to **24 hours**. Lunar Stone's deployed duration remains unchanged. The missed original opening remains in the audit, Launch operations and subsequent public announcement. This is an explicit recovery of an undeployed step, not an edit to a finalized export.

## Commands

Run from the repository root with Node 22 and compiled contract artifacts (`npm run contracts:compile`). The existing private files below must remain owner-only mode `0600`. Their values are never printed. The default command performs only RPC/database reads; its advisory lock prevents overlap with a worker.

```sh
npm run season:recover:airy-garden -- \
  --env-file .env.staging.local \
  --env-file .env.staging.wallets.local \
  --env-file .private/v10-setup-2026-09-25/worker.env
```

To prepare a reviewable continuation, add `--start-at YYYY-MM-DDTHH:mm:ssZ --output .private/airy-recovery-plan.json`, replacing the timestamp with the intended **UTC mint opening**. It must allow the full frozen enrollment window plus at least one hour from plan creation, and be within seven days. The command audits all journal receipts again and writes a new mode-0600 file; it refuses to overwrite a prior plan. Output includes the exact old/new schedule, original and replacement duration, evidence block, prepared/state/action hashes, run/profile revisions and `planHash`. Plans expire after 15 minutes. Reading the file does not apply it.

After reviewing that document, this separate command applies exactly the file and hash supplied:

```sh
npm run season:recover:airy-garden -- \
  --env-file .env.staging.local \
  --env-file .env.staging.wallets.local \
  --env-file .private/v10-setup-2026-09-25/worker.env \
  --execute --plan .private/airy-recovery-plan.json --expected-hash SHA256_FROM_PLAN_OUTPUT
```

Execution rechecks the canonical block, receipts, predecessor, deployment absence, active/newer runs, private state, immutable artifact and X profile revision. It locks and updates the **same** run atomically, records `recovery_schedule_approved`, and queues it. It does not broadcast transactions, send X posts, claim prizes, withdraw funds, reconcile failed posts or start a process. A duplicate application of the same plan returns `already-applied` without requeueing; a different plan is rejected. Changed or expired inputs require a fresh audit and a newly reviewed plan.

Continue through the existing [Airy Garden worker runbook](airy-garden-v10-runbook.md), using the same encrypted 50-wallet vault, owner, registry pins, public X profile, donor list, recycling setting and spending caps. Run the worker's read-only preflight first. Its immutable configuration binding rejects different arguments. The recovery tool does not prove the vault is available, replenish balances or replace that preflight. Starting the worker with `--execute` can deploy Satin Echo, post the corrected schedule and conduct the previously configured rehearsal. It is a separate live operation.

## Recovery behavior and boundaries

- The next opening stays fixed after approval. The worker verifies the original recovery evidence and predecessor before deployment and keeps its normal readiness, transaction-journal and activation-window guards. It never shifts a missed opening automatically.
- Satin Echo's opening announcement explicitly states “rescheduled” and includes the original opening, new opening and enrollment time. Public projection remains gated by a confirmed announcement; Launch can show the approved correction while the worker is queued.
- The failed supplemental winner reply remains recorded. Existing confirmed roots and replies are reused; the prior fix prevents that optional reply from blocking the next opening. No claim about the original X 403's billing cause is made. A failed required new announcement can still pause recovery.
- Explorer verification remains the existing separate queue and CLI. A successful recovery audit proves the checked runtime/constructor lineage, not successful Etherscan publication.
- The separate three-mint/30-minute refund scenario is **not** applied to Satin Echo. It uses the scenario preparation flow and isolated collection described in the handoff report.
- Never delete or replace a pending transaction, clear confirmed post IDs, replay the superseded run, seed staging with test fixtures, or infer successful connected-wallet claims from unit tests.

The script's first live read-only audit passed on 2026-09-27: the run remained paused, all 108 saved transactions were canonical, 16 posts were confirmed, one supplemental winner reply remained failed, Lunar Stone was revealed and ready for its successor, and Satin Echo had not started. No live recovery, transaction, X post or withdrawal was executed for that audit.

See [the six-spec implementation report](handoffs/airy-garden-testnet-notes/implementation-2026-09-27.md) for the wider release and remaining wallet/rehearsal acceptance boundaries.
