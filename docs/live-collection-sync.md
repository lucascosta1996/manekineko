# Register and recover a real Sepolia collection

`scripts/sync-staging-collection.mjs` is the explicit command for initial registration and operator recovery. It reads the approved export and a completed V5 or V6 deployment journal, verifies real Ethereum Sepolia receipts and local compiled bytecode, and publishes a confirmed snapshot into the existing staging PostgreSQL schema. It never loads a wallet private key, signs a transaction, deploys, activates minting, or mints tickets.

Routine updates for registered V5/V6 collections are handled by the separate [automatic indexer](automatic-indexing.md). Its authenticated cron catches up canonical logs, and its signed QuickNode endpoint can wake a cycle sooner. Transactions do not need to originate in the web app: Etherscan and direct contract mints enter the same database projection. Initial registration still establishes the reviewed immutable collection data and deployment provenance; the indexer does not infer arbitrary collections from a webhook body.

Run `npm run contracts:compile` before using it. With Node 22:

```sh
node --experimental-strip-types scripts/sync-staging-collection.mjs \
  --journal /absolute/path/to/confirmed-v5-journal.json \
  --manifest .vercel/sepolia-20-ticket/launch-export.json \
  --expected-hash edec9510ddf4368c2e3164858111176441575c73deaba4e78e0f695af09a0055 \
  --collection-id 3342c115-3d41-4cb4-be45-fa103178f0ff \
  --output .vercel/sepolia-20-ticket/catalog-preview.json
```

This is a preview. Review the address, chain, phase, snapshot block, and optional cleanup IDs. Repeat with `--write` to register or refresh the same collection. The command reads only the private `.env.staging.local`, checks the pinned staging database marker, and requires the UUID and content hash to match its finalized launch configuration. Existing IDs or immutable financial terms cannot be relabeled. Repeated writes are idempotent; older snapshots and same-height block reorganizations fail closed. All contract state reads use one block two blocks behind the current head, and its canonical hash is checked again immediately before database commit.

Optional `--remove-mocks` includes only the two known original undeployed demo catalog IDs and the eight original archive IDs that still have `is_mock=true`. Any catalog deployment, transaction, indexed chain state, live program, challenge, or admission rate-limit state excludes the row. Real collection/history rows are never candidates. The option works in preview mode too. Seed fixtures stay in source control for isolated tests; do not run `db:seed` against staging.

Optional `--enable-enrollment` requires the V5 factory address and code hash to match `AFFILIATE_TRUSTED_FACTORY_V5_11155111` and `AFFILIATE_TRUSTED_FACTORY_CODEHASH_V5_11155111` in the staging environment, with the chain phase still pending activation. Configure and verify the web deployment's admission signer, origin, Turnstile, and matching trusted factory pins before using it. Ordinary synchronization preserves the existing enrollment setting.

A newly deployed collection appears as pending activation, with zero mints and no winner. It is not inserted into completed history. The web history page shows such collections separately as in progress. The indexer subsequently updates mint progress, randomness and outcomes from confirmed chain activity; this command remains available for an explicit recovery snapshot. A completed archive requires a matching confirmed `PrizeDelivered` event, preserving both the winning holder and their selected payout recipient. Refunded history is created only after every minted ticket has actually been refunded. An expired collection with no buyers remains unarchived.

Do not run this administrator command after every transaction or concurrently with indexing the same collection. Its older-snapshot and same-height reorganization guards intentionally fail closed. The automatic indexer owns durable checkpoints, replay, canonical-block checks and atomic reorganization rollback; use its authenticated status endpoint and logs to diagnose delayed updates. If an operator recovery snapshot is needed, pause scheduled and webhook execution and allow active workers to finish, preview and apply the command, then resume indexing and verify catch-up. Production qualification and independent contract audit remain separate from successful synchronization.

## Tests

```sh
node --experimental-strip-types --test scripts/staging-collection-sync.test.mjs
COLLECTION_SYNC_TEST_ENV=/path/to/local-postgres.env \
  node --experimental-strip-types scripts/verify-staging-collection-database.mjs
```

The integration test accepts localhost only, creates an isolated randomly named schema, applies the actual migrations and seeds, verifies preview/write/idempotency/cleanup/terminal history, and drops that schema afterward. It never reads the staging database URL.

For explicit cleanup of the former local demonstration database, `inspectMockRemoval(client)` and `removeMockRecords(client, preview)` are exported. Use a transaction on that known local database, inspect the returned IDs, then call removal with that same preview and commit. Do not pass arbitrary IDs; the removal function reselects and compares eligible rows before deleting dependencies.

V6 exports must contain `algorithmVersion: "unique-rank-v3"` and use their own factory, bytecode and trust pins. Registration stores the exact contract/algorithm pair; V6 winner archives also retain `combinationKey()` and verify the inverse encoding. Existing V5 records are never relabeled. See [V6 deployment](deployment-v6.md).
