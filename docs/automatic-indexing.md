# Automatic collection indexing

> Read [the current architecture handoff](architecture.md#database-and-indexing) for supported versions and rollout status. Local source supports V5–V10; the recorded live service is still configured for V8. The original V5 examples below are historical. Each reader uses an exact configured version/factory/hash. `INDEXER_TRUSTED_FACTORIES_JSON` supports multiple independently pinned readers, preserving historical outstanding claims when adding V10. Migration 026 admits the exact V10 algorithm pair without altering historical rows. V10 award combinations decode token identity; scores come from finalized chain state. Its permanent metadata is excluded from the historical refresh queue.

`apps/indexer` is a separate Vercel service. It reads Ethereum through QuickNode and writes confirmed collection snapshots and history to PostgreSQL. It has no wallet or transaction signer. A mint made through Etherscan, another website, or a direct contract call follows the same indexing path as a mint made in our web app.

## Data flow

1. The active QuickNode webhook sends signed notifications to `POST /api/indexer/quicknode` for the configured Sepolia contracts.
2. The service verifies authentication and claims a durable delivery lease. The notification only wakes the indexer: its addresses, counters, network fields and other values never become database state.
3. The indexer loads registered V5 deployments from the database, checks the trusted factory and immutable collection settings against the configured chain, and reads canonical logs through HTTP RPC. Contract calls and the factory bytecode read use the same EIP-1898 block hash with `requireCanonical: true`; canonical headers are checked again before committing.
4. Contiguous confirmed log batches, collection snapshots, history records and block checkpoints commit together. Retries cannot double-count mints. A changed checkpoint block hash triggers a rebuild of the affected collection's derived records.
5. The public web app refreshes its database-backed collection, mint and history data while the page is open.

A Vercel cron calls `GET /api/indexer/run` every minute to catch up after missed notifications, provider outages, unconfirmed notifications and new database registrations. This also updates deadline-driven state changes when no transaction emits a log. A WebSocket connection inside a short-lived serverless request is not used.

The 2026-09-21 source additionally schedules a separate authenticated `/api/indexer/metadata` cron to recover stale Sepolia Blockscout metadata after a confirmed reveal. It uses migration 025, per-token durable jobs and provider-wide pacing; it never blocks the chain-indexing cycle. The user requested keeping the changes local; migration/grant/deployment activation is deferred. See [automatic NFT metadata refresh](nft-metadata-refresh.md) for verification, quota limits and recovery.

## Authentication and delivery behavior

- `GET /api/indexer/run` and `GET /api/indexer/status` require `Authorization: Bearer <CRON_SECRET>`. The secret must contain at least 32 characters. Query-string credentials are not accepted.
- `POST /api/indexer/quicknode` requires `X-QN-Nonce`, `X-QN-Timestamp` and `X-QN-Signature`. The signature is HMAC-SHA256 over `nonce + timestamp + uncompressed raw UTF-8 JSON`, using `QUICKNODE_WEBHOOK_SECRET` as the key. The exact raw text is verified before parsing.
- Both compressed and decoded bodies are limited to 256 KiB. Only JSON and identity/gzip encodings are accepted. Malformed UTF-8, signatures, timestamps and encodings fail closed. The signature may be at most five minutes old or thirty seconds ahead of the server clock.
- Only digests of the nonce and payload are stored, with a 180-second processing lease. A successfully completed duplicate is acknowledged without another indexing cycle. A reused nonce with a different payload is rejected. Failed cycles release their delivery lease; interrupted workers can be retried after lease expiry.
- An incomplete or failed cycle returns HTTP 503 with `Retry-After: 30`. Provider and database exception text is not exposed. Invalid authentication never opens a database connection or starts RPC work.

QuickNode documents the signing format and gzip behavior in its [incoming Streams webhook validation guide](https://www.quicknode.com/guides/quicknode-products/streams/validating-incoming-streams-webhook-messages).

## Deployment configuration

Use a separate indexer project with `apps/indexer` as its Vercel root. Apply database migrations `014_chain_indexer.sql` and `015_indexer_webhook_deliveries.sql` first. Give the indexer a dedicated restricted database role; the web and launch apps do not receive its write access or authentication secrets.

For the existing isolated Sepolia staging database, use the reviewed setup script from the repository root:

```sh
node scripts/setup-indexer-staging.mjs
node scripts/setup-indexer-staging.mjs --apply
node scripts/setup-indexer-staging.mjs
```

The first command is a read-only preflight: it reports role existence, missing indexer migrations and whether the dedicated credentials are configured. `--apply` performs the changes and connects as the resulting runtime role to verify both permitted access and denied administrative access. The last preflight should report no pending indexer migrations and an existing configured role; it is not a substitute for the runtime privilege verification performed by `--apply`.

The script reads only `.env.staging.local`, validates its pinned direct PostgreSQL endpoint, owner and Sepolia staging marker, and refuses unrelated roles or unexpected missing migrations. The base staging schema must already exist. It applies only the reviewed indexer additions 014, 015 and 025, preserving the migration checksum ledger. It stores a newly generated, distinct `INDEXER_DATABASE_URL` in the private root environment before role creation so interrupted setup can resume with the same credential. Existing credentials are reused; fixtures are never imported.

The `manekineko_staging_indexer` role can read registered terms and change derived state, history, events, checkpoints and delivery leases. It cannot change mint prices, deployment addresses or enrollment signers, access login/admission tables, or create schema objects. `INDEXER_DATABASE_URL` becomes `DATABASE_URL` only in the indexer project's server environment. Never deploy `DATABASE_ADMIN_URL` or the combined root environment file. Keep this Sepolia-specific provisioner separate from any future mainnet database setup.

Required server-only environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Restricted indexer database role |
| `INDEXER_RPC_URL` | HTTPS QuickNode endpoint for the configured chain |
| `MANEKINEKO_CHAIN_ID` | `11155111` for staging Sepolia; `1` only for a separate mainnet deployment |
| `INDEXER_TRUSTED_FACTORY` | Deployed, reviewed factory address |
| `INDEXER_TRUSTED_FACTORY_CODEHASH` | Expected factory runtime code hash |
| `CRON_SECRET` | Random bearer secret for cron and operational status |
| `QUICKNODE_WEBHOOK_SECRET` | The provider's webhook security token |

Optional limits are parsed and bounded in `apps/indexer/lib/config.ts`. Sepolia defaults to two confirmation blocks; mainnet defaults to twelve. Neither confirmation setting promises permanent finality. The service rechecks canonical block hashes to recover from reorganizations. An observation appears after confirmations, a successful indexing cycle and the next UI refresh; it is not an immediate browser-local mint counter.

The staging project is `manekineko-staging-indexer`, with canonical origin `https://manekineko-staging-indexer.vercel.app`. Deploy the service's production target to enable its minute cron. Verify deployment readiness, an authenticated cycle and continuing checkpoint progress before relying on scheduled operation. QuickNode push has a separate activation boundary: populate the provider's actual security token and verify a real delivery before treating notifications as active.

The indexer project must be reachable by QuickNode at its canonical HTTPS URL. If Vercel deployment protection is enabled, configure an allowed server-to-server bypass header at the provider; do not put secrets in the callback URL. Application-level HMAC/bearer checks remain mandatory even when platform protection permits the request. Keep existing web/launch sign-in protection unchanged.

Configure the QuickNode event filter for logs from the trusted factory and registered round contracts, with a compact payload below 256 KiB. Include mint, transfer, sale activation, randomness, settlement, prize and refund events. If using an address-specific filter, update it when registering another collection. The cron remains the authoritative fallback and discovers newly registered collections without requiring a filter update. Configure retry delivery for non-success responses. Notifications that become stale during an extended outage may be rejected; cron backfill still covers their blocks.

## Operations and verification

`GET /api/indexer/status` returns the configured chain and confirmation depth, registered collection checkpoints, last successful/attempted indexing times and sanitized error counters. It does not return secrets. Check Vercel cron execution and QuickNode delivery logs as well as database progress; a configured secret alone does not prove that provider notifications are active.

Run the indexer tests and build:

```sh
npm run test --workspace @manekineko/indexer
npm run typecheck --workspace @manekineko/indexer
npm run build --workspace @manekineko/indexer
```

For the database regression, set `TEST_INDEXER_DATABASE=1` with a local `DATABASE_URL`. Tests use temporary schemas and refuse external database hosts. The ingress suite covers forged/stale signatures, gzip inflation, oversized bodies, failed downstream work, replay acknowledgment, and concurrent durable delivery claims. The chain engine has separate log, checkpoint and reorganization regressions.

Use [initial collection registration and operator recovery](live-collection-sync.md) to establish a new deployment's reviewed terms and first snapshot. Once registered, normal mint/randomness/prize/refund updates come from the indexer; they do not require an operator to rerun the registration command.

After deployment, verify an authenticated cycle, an authentic provider notification, replay deduplication and a mint performed outside the web app on a test collection. Inspect both the persisted `total_minted` snapshot and an already-open public page. An inactive collection cannot be used for a mint test until its owner intentionally activates the sale.

Retention: completed webhook delivery digests may be removed by a maintenance role after seven days. A previously recorded delivery cannot become valid again after the five-minute signature window. Never remove active leases or chain checkpoints as part of this cleanup. Canonical chain events are the audit trail and are retained.

## Staging verification — 2026-09-18 UTC

The indexer is deployed at `https://manekineko-staging-indexer.vercel.app`; its existing Vercel protection settings remain unchanged. Migrations 014 and 015 are applied to the isolated Sepolia database, with the dedicated restricted runtime role verified. The web deployment includes automatic database refresh for collections, history, mint details and affiliate balances.

Two unattended cron executions advanced the checkpoint from Sepolia block `11727075` to `11727078`, with zero failures and no manual authenticated run request. The initial scan recorded the deployment and randomness-funding events. An already-open History page received the new snapshot without reloading. Run/status endpoints returned 401 without their bearer credential.

A disposable local Hardhat chain and isolated PostgreSQL schema passed eight integration checks using the actual V5 factory/round and real public repositories: direct contract mint, repeated delivery, mint reorganization, alternate canonical mint, full VRF/prize lifecycle, and removal of an orphan winner. This proves the external-mint data path without consuming tickets in the inactive Sepolia rehearsal collection. A real Sepolia mint and genuine VRF fulfillment remain separate rehearsal steps. Private verification records are stored under the ignored `.vercel/indexer/` directory.

QuickNode webhook **Manekineko Sepolia collection events**, ID `d5e070ca-1629-4c02-915a-719431faf6f6`, is active on Ethereum Sepolia. Its `evmContractEvents` filter uses the separate `manekineko-sepolia-contracts` address list containing the factory and current round, with no event-hash restriction and compression disabled. The receiver remains at `/api/indexer/quicknode`. Add each future registered round to this list for push notifications; the minute cron covers all registered rounds independently.

An authentic QuickNode sample completed successfully at `2026-09-18T00:17:02Z` and produced one completed delivery record. Separate live synthetic checks passed signed delivery (200), identical replay deduplication (200), forged-signature denial (401 with no record), and gzip decoding (200). A fabricated mint count in the test payload did not affect the database snapshot. The final indexer deployment is `dpl_41ymizmd686dXV6yP7A89qzxpckV`, with its minute cron enabled. Private evidence is in `.vercel/indexer/quicknode-activation.json` and `.vercel/indexer/synthetic-webhook-verification.json`. No Sepolia mint was submitted for these receiver checks.
