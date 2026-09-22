# Automatic NFT metadata refresh

V10 is explicitly excluded from queue discovery, claiming, reading and processing. Its permanent numbers/artwork exist from mint and omit Score/Status traits. This queue continues serving historical V5–V9 metadata only; the separate staging queue was activated in the release below.

Implementation date: 2026-09-21. Activation was initially deferred at the user’s request. The user subsequently authorized the staging release on 2026-09-22 UTC: migration 025, restricted queue grants and the separate metadata cron are now active. Discovery backfilled 1,000 V8 jobs, and scheduled execution confirmed the first refreshed NFT against its full on-chain metadata. The queue is still processing; this is not confirmation that every explorer entry is current. See [the staging release record](staging-v10-release.md) for operational verification.

## On-chain timing

V8 and V9 store the authenticated VRF word in the callback. Permissionless bounded `finalizeDraw` then selects the winners and sets `revealed` in one transaction. From that transaction onward, every existing NFT's `tokenURI` returns its revealed numbers, score and SVG. The same transaction emits ERC-4906 `BatchMetadataUpdate(1,totalMinted)`, and both versions advertise the ERC-4906 interface. Prize claims preserve revealed metadata.

The contract cannot make an external explorer update its cache. No hosted metadata endpoint, mutable renderer or protocol change is required here. The [contract lifecycle regression](../apps/contracts/test/NftMetadataLifecycle.ts) covers sealed sellout, VRF fulfillment, reveal, all winning/losing metadata, the update event and all six prize claims in V8 and V9.

## Durable explorer recovery

The separate authenticated `GET /api/indexer/metadata` cron runs every minute in the Indexer project. It does not share the chain-indexing request or hold a signer. Explorer downtime cannot interrupt indexing, VRF finalization, prize claims or subsequent collections.

1. Discover every token of registered, trusted, confirmed collections in `awaiting_prize` or `complete`. A fulfilled VRF word without draw finalization is insufficient. Discovery also backfills the existing completed V8 collection; webhook delivery and season-worker participation are not required.
2. Persist one job per collection/token in `manekineko_nft_metadata_jobs`. Each generation binds the indexer's immutable-term fingerprint and VRF word. Repeated discovery is idempotent; an alternate reveal resets old results. Unrevealed or quarantined collections cannot supply due jobs.
3. Lease a due job. Verify the RPC chain, factory code hash, immutable terms, deployment receipt, revealed flag and generation. A bounded cycle shares one confirmed block and reuses successful immutable checks only for the exact collection fingerprint at that block, avoiding repeated RPC bursts. Each token still checks its generation and reads `tokenURI` with `requireCanonical: true`; recheck the block before an explorer request or verified result. A verification failure ends that cycle, leaving durable retries for a later invocation.
4. Compare the full explorer JSON, including SVG and traits, with the on-chain JSON. Already matching entries need no refresh. Object-key ordering is ignored; array order and actual values are preserved.
5. For a stale entry, reserve a provider quota slot and persist the attempt **before** sending PATCH. An accepted or uncertain request moves to delayed verification. Later cron invocations issue GETs; acknowledgement alone never completes a job. A restart retains the attempt and cannot immediately repeat it.
6. Allow at least 15 minutes before another PATCH, always after a fresh mismatching GET. After five requests without a match, flag the token for operator attention and continue read-only verification hourly. Verification work takes priority over new requests.

The worker processes at most six jobs per invocation with a bounded time budget. Multiple cron/manual invocations use expiring leases and one shared provider quota across all trusted factories. The database stores public identifiers, hashes, attempts and sanitized errors, never RPC credentials or wallet keys.

## Provider limits and monitoring

The implemented adapter is **Sepolia Blockscout only**. Mainnet reports `supported: false`; it needs separate marketplace qualification. ERC-4906 signaling remains in the contracts on every supported chain.

The worker spaces PATCH attempts at least 90 seconds apart: at most 40 per hour, beneath Blockscout's documented default 50-per-hour/IP allowance. A completely stale 1,000-NFT collection therefore needs at least roughly **25 hours**, and the minute cron cadence, retries or a provider backlog can make it longer. This is automatic eventual recovery, not an immediate explorer-rendering guarantee. Other tools on the same IP may consume the provider's shared quota too.

HTTP 429 suspends all explorer requests for at least one hour, honoring longer `Retry-After` values up to 24 hours. Authorization failures or HTML challenges block automatic requests for operator review; the worker does not bypass them. The separate metadata cron returns HTTP 503 for failures or blocked jobs. Authenticated `/api/indexer/status` includes queue counts, recent errors, oldest creation times, last verified times and provider state. Monitor these alongside cron failures and queue age; a green chain-indexing result does not prove explorer completion.

Blockscout exposes a collection-wide refresh endpoint, but its [official implementation](https://github.com/blockscout/blockscout/blob/master/apps/block_scout_web/lib/block_scout_web/controllers/api/v2/token_controller.ex) requires an administrator API key. An ordinary user API key is not evidence of that permission. For prompt full-collection refreshes, arrange supported provider access and qualify that path separately. Do not increase concurrency or evade the public quota.

## Activation and recovery

The additive migration is [025_nft_metadata_refresh.sql](../database/migrations/025_nft_metadata_refresh.sql). It creates only the queue and provider state tables. Use the existing pinned Sepolia provisioner to apply it and add their permissions to the dedicated indexer role; Web and Launch receive no new access. Never use fixture seeding.

```sh
node scripts/setup-indexer-staging.mjs          # read-only preflight
node scripts/setup-indexer-staging.mjs --apply # requires approved staging activation
node scripts/setup-indexer-staging.mjs          # confirm no pending migrations
```

Deploy only the `manekineko-staging-indexer` project after the migration/grants pass, preserving its existing environment and versioned factory pins. Inspect the Vercel dry-run upload list first. The existing `CRON_SECRET` secures the new route; no new secret is needed. Verify unauthorized access is denied, an authenticated metadata cycle persists jobs, a subsequent cycle verifies actual explorer output, both cron definitions are live, and ordinary indexing still succeeds.

After resolving provider authorization/challenge failures, an authorized operator can clear that provider's `blocked`/`last_error` fields and set `retry_after` to the current time. Preserve `next_refresh_at` so an operator reset does not bypass the existing quota. Reset an exhausted token's attempt budget only after investigating why fresh metadata still fails to match; never manually mark a token `verified`.

The old [manual refresh tool](../scripts/refresh-nft-explorer.mjs) remains available for targeted diagnosis. Do not run a bulk manual refresh alongside this queue without accounting for the same provider quota. To disable recovery, remove/pause the metadata cron deployment; chain indexing can continue independently, and persisted jobs resume when recovery is re-enabled.

## Original local verification (2026-09-21)

- Both V8/V9 Solidity metadata lifecycle tests passed; contract TypeScript checks passed in the original investigation.
- 71 Indexer tests passed with no skips, including the isolated full-migration PostgreSQL database and restricted-role concurrency/recovery tests. No fixture was written to staging.
- Indexer typechecking and production build passed, including the new route.
- Live token #81 was independently confirmed to match Blockscout's full metadata and image at Sepolia block **11747946**. Evidence: `.vercel/nft-gallery/v8-token81-confirmed.json`.
- The new worker's canonical reader also passed a read-only live check against the existing restricted database registration, immutable V8 terms and token #81 on 2026-09-21 at 02:04 UTC. Its full metadata hash matched Blockscout; evidence: `.vercel/nft-gallery/metadata-reader-live-check.json`. This read used no queue writes, refresh request or migration.
- Staging preflight found only migration 025 pending. The upload dry run contained no environment files, private journals or wallet vaults. The user explicitly deferred migration/grant application and deployment; hosted queue execution had not been tested at that point. The later authorized activation and hosted verification are recorded above.
