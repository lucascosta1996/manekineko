# Runtime database and Launch controls

Migration `database/migrations/024_season_automation_runtime.sql` adds runtime tables. Migration `026_permanent_combinations_v10.sql` extends exact V10 collection/manifest constraints and prepared V9/V10 run binding. Apply the full ordered migration chain through 026, including 025, through the normal administrative process. No new V10 runtime table grants are required; verify the existing restricted roles after migration. Historical metadata-refresh queue grants/activation are separate. Do not seed a hosted database. Runtime data never changes prepared season artifacts or historical collection terms.

The worker needs a **direct PostgreSQL connection** because it holds a session advisory lock. Launch and Web can keep their existing pooled connections. Keep three separate restricted roles: existing Launch, existing Web, and a dedicated season worker. Role/password creation remains an administrative setup step; the grants tool neither creates users nor prints credentials.

Set these environment variables through the operator's secret manager:

- `SEASON_RUNNER_DATABASE_ADMIN_URL`: administrative connection used only for applying grants.
- `SEASON_RUNNER_EXPECTED_DATABASE_HOST`: exact expected database hostname.
- `SEASON_RUNNER_EXPECTED_DATABASE_NAME`: exact expected database name.

Remote administrative URLs require `sslmode=verify-full`. The hostname/name must match the explicit expected values. Then run:

```sh
node --experimental-strip-types scripts/season-runner/provision.ts \
  --launch-role YOUR_EXISTING_LAUNCH_ROLE \
  --web-role YOUR_EXISTING_WEB_ROLE \
  --worker-role YOUR_DEDICATED_WORKER_ROLE

# After reviewing the target and the role names:
node --experimental-strip-types scripts/season-runner/provision.ts \
  --launch-role YOUR_EXISTING_LAUNCH_ROLE \
  --web-role YOUR_EXISTING_WEB_ROLE \
  --worker-role YOUR_DEDICATED_WORKER_ROLE --execute
```

Replace the placeholders with actual lowercase PostgreSQL role names. Without `--execute`, only local configuration is checked; no connection or grants are made. The exported `grantRuntimeRoles(pool, roles)` function is available for administrative provisioning integrations. Run this after existing staging-role provisioning, which resets application grants.

The grants separate responsibilities:

- Web can read only `manekineko_season_runtime_public` from the new tables. It cannot read account credentials, launch plans, private journals or transaction ciphertext.
- Launch can manage encrypted per-network X profiles, enqueue a run against a prepared homogeneous V9/V10 revision/hash, update run controls, and read sanitized outbox/event fields. It cannot read encrypted signed transactions from the outbox.
- The worker can read prepared plans and encrypted profiles, update runtime state, publish schedules, register verified V9/V10 collections and maintain indexer projections. It cannot read Launch passwords/sessions or update immutable collection economics.

Launch and the worker must share the same `SEASON_RUNNER_MASTER_KEY`, a base64-encoded random 32-byte key. X credentials and worker journals use AES-256-GCM with context binding. Back up the key securely; replacing it without re-encrypting saved records makes them unreadable. Never expose it as a `NEXT_PUBLIC_` value or commit it. `MANEKINEKO_CHAIN_ID` is required for runtime writes; staging remains Sepolia execution plus Mainnet draft planning.

In Launch, save four OAuth 1.0a credentials, the numeric expected X account ID, the handle and the public HTTPS website for each network. The API returns configuration metadata only. Empty secret inputs preserve saved credentials; replacing them requires all four. Credentials can be rotated after all runs on that network are paused and the worker leases have expired.

Start enqueues work; it does not create a worker process. Start/resume binds the reviewed plan, profile and run revisions. Pause preserves submitted transactions. Completed seasons retain their completed status and support separate pause/resume of late claim monitoring. To change the X account for a new season, first pause completed claim monitors; a run that already announced keeps its original account/website binding in encrypted worker state. Restoring its original account is required before resuming its thread. A credential rotation for the same account can resume with the latest profile revision.

Verification is isolated: `apps/launch/test/season-runtime-database.test.ts`, `scripts/season-runner/provision.test.ts`, `scripts/season-runner/store.test.ts` and `scripts/season-runner/registration.test.ts` accept `SEASON_RUNTIME_TEST_DATABASE_URL` only for localhost. Each creates and drops its own disposable database; grants/store tests also create and remove unique temporary roles. The store test executes real advisory locks, encrypted recovery, action persistence and publication under the restricted worker role. Passing these tests proves local persistence and permission boundaries, not hosted deployment, chain broadcast or X publishing.

Local verification on 2026-09-21 used a disposable PostgreSQL 16 container on port 54339, explicit opt-in test URLs and unique databases/roles; no staging environment was loaded for test writes. Migration 026 preserved old finalized exports and draft catalog identities, rejected mixed-version runtime plans and retained staging Mainnet preparation restrictions. This is not evidence that 026 or V10 grants/configuration have been applied to staging.
