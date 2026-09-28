# Public collection freshness recovery — 2026-09-28

## Cause

The hosted minute cron was running, but its collection cycles returned `dependency_unavailable`. At 02:51 UTC, Satin Echo had 57 consecutive failures and its last successful checkpoint was approximately 58 minutes old. Public snapshot timestamps were consequently older than the UI's three-minute freshness window.

A bounded staging diagnostic reproduced an ethers `CALL_EXCEPTION` whose nested RPC error was `-32007`: the provider's 50 requests/second limit had been exceeded. Basic RPC health and isolated canonical contract/log reads succeeded. Batched parallel contract verification and award snapshots caused bursts; concurrent factory profiles shared the same RPC account without pacing. This was not evidence that the season needed restarting.

## Fix

`createRpcProvider` now uses one shared pacing queue per runtime for all factory readers. It reserves 75 ms per JSON-RPC method, counting each member of a batch; idle time does not accumulate burst credits. Existing batches remain bounded at ten methods. This also applies to metadata reads that use the same provider factory. Separate serverless instances and external clients are not coordinated globally, so this leaves headroom rather than claiming an account-wide quota guarantee.

Rate-limit errors are stored as the fixed `rpc_rate_limited` code. Request payloads, authenticated URLs and credentials are not persisted. Canonical block/hash verification, immutable trust pins, event/accounting checks, database leases, atomic commits and failed-batch retry boundaries remain unchanged. The UI freshness threshold has not been relaxed.

## Verification

Local Indexer tests, typecheck and production build are recorded with the release. SQL integration tests requiring a disposable database remain explicitly skipped. Regression tests cover concurrent batch pacing, no idle burst credit, safe error classification and no checkpoint/snapshot advancement on throttling.

Recovery invokes only the existing indexer path: blockchain reads and verified derived database updates. No wallet signing, season execution, X delivery, schema change or hosted configuration change is part of this fix. Secrets remain in memory in ignored local diagnostics.

Before release, all three collections completed full concurrent canonical snapshot refreshes successfully at confirmed Sepolia block 11797661. The V8 profile completed in 20.6 seconds and the V10 profile in 34.3 seconds, within the existing 45-second budget. Local tests: 70 passed, eight disposable-database opt-ins skipped; Indexer typecheck and production build passed. Hosted unattended verification follows deployment and is distinct from this local recovery evidence.
