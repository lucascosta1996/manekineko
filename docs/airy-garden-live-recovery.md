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

To prepare a reviewable continuation, add `--start-at YYYY-MM-DDTHH:mm:ssZ --output .private/airy-recovery-plan.json`, replacing the timestamp with the intended **UTC mint opening**. It must allow the full frozen enrollment window plus at least 15 minutes of preparation, and be within seven days. Execution also requires at least 15 minutes remaining before enrollment. This preparation allowance was shortened at the user's request for a one-hour opening; enrollment and activation checks are unchanged. The command audits all journal receipts again and writes a new mode-0600 file; it refuses to overwrite a prior plan. Output includes the exact old/new schedule, original and replacement duration, evidence block, prepared/state/action hashes, run/profile revisions and `planHash`. Plans expire after 15 minutes. Reading the file does not apply it.

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

### Recover managed test prizes before scheduling

`npm run season:settle:airy-prizes -- --env-file .env.staging.local --env-file .env.staging.wallets.local --env-file .private/v10-setup-2026-09-25/worker.env` audits the exact paused Lunar Stone run and original encrypted vault. Add `--execute` only for the authorized recovery. It requires the round's saved Etherscan verification to be successful, checks all winning holders belong to the saved 50-wallet vault, and has each holder claim directly to the existing deployer/round owner. It reuses the original fee limits, aggregate spending cap, chain lock and durable signed transaction journals. An interrupted execution resumes those same transactions; never delete a pending entry. It cannot mint, start a collection or post to X. The run remains paused.

This command recovers prizes only. Ordinary creator proceeds and unallocated affiliate growth reserve remain separate. The existing season worker's explicitly bound `--recycle-sepolia-funds` behavior can subsequently withdraw released creator balances for the ongoing rehearsal.

Etherscan V2 submissions and polling now put the chain ID in the URL, as required by its network router. Source input and constructor arguments remain bound to the exact deployed build. Verification maintenance also synchronizes the operator journal in the rehearsal state.

### Continuation safeguards

- The next opening stays fixed after approval. The worker verifies the original recovery evidence and predecessor before deployment and keeps its normal readiness, transaction-journal and activation-window guards. It never shifts a missed opening automatically.
- Satin Echo's opening announcement explicitly states “rescheduled” and includes the original opening, new opening and enrollment time. Public projection remains gated by a confirmed announcement; Launch can show the approved correction while the worker is queued.
- The failed supplemental winner reply remains recorded. Existing confirmed roots and replies are reused; the prior fix prevents that optional reply from blocking the next opening. No claim about the original X 403's billing cause is made. A failed required new announcement can still pause recovery.
- Explorer verification remains the existing separate queue and CLI. A successful recovery audit proves the checked runtime/constructor lineage, not successful Etherscan publication.
- The separate three-mint/30-minute refund scenario is **not** applied to Satin Echo. It uses the scenario preparation flow and isolated collection described in the handoff report.
- Never delete or replace a pending transaction, clear confirmed post IDs, replay the superseded run, seed staging with test fixtures, or infer successful connected-wallet claims from unit tests.

The script's first live read-only audit passed on 2026-09-27: the run remained paused, all 108 saved transactions were canonical, 16 posts were confirmed, one supplemental winner reply remained failed, Lunar Stone was revealed and ready for its successor, and Satin Echo had not started. No live recovery, transaction, X post or withdrawal was executed for that audit.

## Authorized live recovery, 2026-09-27

At the user's subsequent explicit request, Lunar Stone's exact V10 source and constructor were submitted to Etherscan. Both verification status polling and a separate source/ABI lookup confirmed **verified** (`ManekinekoRoundV10`, compiler `v0.8.37+commit.f401782d`). The initial rejection exposed incorrect V2 chain routing; the corrected verifier includes `chainid` in the URL.

By 17:30 UTC, all six managed winning holders had claimed **1 ETH each directly to deployer `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223`**. Canonical receipts and `AwardClaimed` events confirmed the recipients and amounts. Six separate gas top-ups were also journaled. The deployer balance after this operation was `6.219886817192370910` Sepolia ETH. Creator ordinary proceeds (`2 ETH`) and growth reserve (`2 ETH`) remained in Lunar Stone at that checkpoint; the run remained paused.

| Rank | Confirmed prize transaction |
| --- | --- |
| 1 | [0x4705393e…](https://sepolia.etherscan.io/tx/0x4705393eae50fcb2cca1317a038fe1eaa90cb4a9042c9d0407d11ccd967a5846) |
| 2 | [0x49a4e9eb…](https://sepolia.etherscan.io/tx/0x49a4e9ebee8c587a6a1084bef098b08ea1b4db9ce8de1833d1029bd1b99a07cd) |
| 3 | [0x033310b7…](https://sepolia.etherscan.io/tx/0x033310b733e133619572348eb7aea1b86891215c84ec864cdd41d72b63b0f5b9) |
| 4 | [0xd709f0d2…](https://sepolia.etherscan.io/tx/0xd709f0d20aa71c67cc811ac9811660c3a2046de4088672c21e4c4180ad2da023) |
| 5 | [0x98ce089f…](https://sepolia.etherscan.io/tx/0x98ce089ff38b9dbe3e062e90ddde8aeed0bd79532210ae34ba2f5394181e9905) |
| 6 | [0x598b1a1e…](https://sepolia.etherscan.io/tx/0x598b1a1e2e59c2901e01933fc33d283e2804bae2e1fae4cc8c332e273b39a268) |

The existing worker's read-only preflight then passed with the original 50-wallet vault, two-collection artifact, owner and Sepolia X account. The user explicitly approved publishing recovery announcements. The requested fixed mint target is **18:10 UTC / 15:10 São Paulo**, preceded by the original full 15-minute affiliate enrollment window from **17:55 UTC / 14:55 São Paulo**. Scheduling and actual activation are separate checks; this paragraph alone does not establish activation.

**Handoff checkpoint:** applying that schedule rolled back because `FOR UPDATE`/`FOR SHARE` on the read-only profile/artifact tables requires update privileges. The run remained paused at revision 6; no successor deployment or new X post occurred. The local fix uses Launch's existing `season-profile:11155111` transaction advisory lock and relies on the database trigger that forbids changes or deletion of prepared artifacts. The worker receives no extra permissions. Regression checks and worker type-checking passed. The user then clarified that live scripts should be handed to them to execute. No subsequent schedule application or worker start was performed.

Run **`npm run season:resume:airy-garden -- --execute`** from the repository root for a fresh user-controlled continuation. This wrapper runs read-only worker checks, creates and displays a fresh hash-bound plan, and asks the terminal user to type `START` before applying it and starting the existing worker. The new default opening is **one hour after the user starts the command**, with the full 15-minute enrollment period beforehand. The earlier 18:10 target was not installed. An explicit `--start-at` can select another UTC opening, subject to preparation and expiration guards. Omitting `--execute` performs only the read-only checks and writes a local review plan. Keep the worker terminal running; Ctrl-C stops it. Do not start a second worker.

See [the six-spec implementation report](handoffs/airy-garden-testnet-notes/implementation-2026-09-27.md) for the wider release and remaining wallet/rehearsal acceptance boundaries.


## User-run continuation pause, 2026-09-27

Read-only checks around 20:04 UTC confirmed that the user-applied recovery kept affiliate enrollment at **18:27:52 UTC** and mint opening at **18:42:52 UTC**. Satin Echo (`0x67b59F893C8de118b11F06689E174Cc744bfd612`) was activated with **600/1,000 minted**. Its deadline is September 28 at 18:42:52 UTC. No new schedule is needed.

The reported funding transaction `0x95276bafbfbb21942f8fbf34f119ddee0b50df854ec171966e2ff9001b240b63` succeeded in block 11795572. Its journal still recorded submission; continuation must reconcile the same receipt. Read-only journal checks passed, including a rate-limited recheck of one inconclusive provider response. Worker preflight and the next funded wallet's 20-ticket mint gas simulation passed. These checks do not establish the original exception: the old generic pause message discarded that detail. No transaction or database mutation was performed during this diagnosis.

The local wrapper now recognizes an already-applied recovery and displays its saved schedule. Run `npm run season:resume:airy-garden -- --execute` and type `START` to continue that existing run. Omit `--start-at`: changing the opening of an applied recovery is rejected. If the saved run is paused, review it in Launch and select Resume before retrying. At this checkpoint its saved status and desired state were already running. Keep only one worker terminal running. The normal network lock and canonical receipt checks still apply; do not delete journals or manually resend the funding transaction.

Pause reporting now distinguishes known balance, nonce, fee-cap, spending-cap, receipt and provider failures using fixed labels without exposing provider URLs or database parameters. It still stops for operator review and never automatically restarts. Local validation: 12 targeted recovery/resume/error-reporting tests passed, plus worker type-checking.


## Repeated pause at 880 mints, 2026-09-27

The user-reported mint `0xb70aaf1326a16868fdba57fc078c3cfe6809d3058051b892880b23160f73710c` succeeded in block **11795800**, bringing Satin Echo to **880/1,000**. The worker logged submission at 20:43:12 UTC and a generic pause at 20:44:18 UTC. Its saved wallet journal still had that transaction as submitted. This places the failure before durable confirmation reconciliation completed; the preceding shared preflight and account check are also candidates. The log does not establish the exact exception, a database failure, RPC throttling, or a bot-only defect.

Read-only investigation verified every wallet journal's canonical receipts, both collection snapshots, and five repeated V10 preflight/receipt checks. A rehearsal decision using address-only wallet stubs and execution disabled found the next funding action, then stopped at the explicit execution guard. This demonstrates that the current decision can progress to funding; it does not validate signing, persistence, or completion. No worker restart, chain transaction, live database write or X delivery was performed during this investigation.

A confirmed diagnostic defect existed in transaction persistence: its catch discarded the underlying exception, and unknown errors were reduced to one generic reason. The local fix retains the nested cause, maps journal-save and common database/provider errors to fixed labels, and emits a sanitized `worker_error` record before attempting to persist the pause. Unknown failures retain only a message digest and an allowlisted source filename/line; no raw messages, URLs, SQL parameters, signed bytes or full stacks are logged. The durable-save failure still requires reload and cannot cause a blind resend. Local validation: 26 focused transaction, logging and error-reporting tests and worker type-checking passed.

**Qualification remains open.** The cause of the historical pause is not recovered. Mainnet does not run simulated buyers, but shares the preflight, canonical-receipt and journal-persistence paths. Do not dismiss this as a rehearsal-only issue or call Mainnet qualified. A further user-controlled continuation uses the same `season:resume:airy-garden -- --execute` command, same run and journal; if it fails, preserve the preceding `worker_error` diagnostic as well as the pause. This continuation is for gathering decisive evidence and completing Sepolia acceptance, not a claim that the underlying incident was fixed.
