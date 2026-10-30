# Hosted X sender and recovery

This service replaces the laptop-dependent V17 posting loop. It observes the explicitly registered Sepolia deployment and delivers its milestone artwork to the account saved in Launch. It has no wallet, signing key, deployment or funding authority. Old runners and private journals remain immutable.

## Execution and latency

- Launch runs `/api/social-sender/run` every minute through Vercel Cron. Every invocation requires an exact `CRON_SECRET` bearer token; the endpoint is dynamic and has a 120-second limit.
- Migration 039 stores the source binding, outbox, expiring lease, retry deadline and health in PostgreSQL. Eight concurrent invocation tests admit one worker. An abandoned lease expires after three minutes; stale workers cannot overwrite a successor's journal.
- The read-only observer requires two independently hosted RPCs to agree on a fresh block two blocks behind the lower head, the deployed runtime/profile, and the complete milestone projection. It rechecks the projection, account revision and lease before each public write. The historical CLI continues to use finalized blocks.
- Healthy delivery is expected in roughly one to two minutes after the milestone, including confirmations, scheduling and API work. This is an operating target, not a guarantee. X rate limits/outages, RPC disagreement, unavailable storage and platform scheduling can delay delivery. Two-block confirmation is faster than finality but carries reorganization risk.
- Newly sent anchors are checked until finalized. If a reorganization leaves the same milestone intact, its anchor is updated without reposting. If the milestone disappears, `reorg_review_required` stops publication and raises a health failure; a public correction requires review.

Vercel does not retry a failed cron invocation. The service therefore persists its own retry schedule and resumes on subsequent invocations. An independent **X sender watchdog** GitHub workflow runs every five minutes, checks health, and invokes recovery if needed. GitHub schedules can themselves be delayed; they are a secondary check, not the primary scheduler. A failed workflow is visible in Actions and uses the repository's existing GitHub notification preferences.

## Delivery and recovery

Each event is identified by network, contract, collection and stage. Pending artwork can refresh; confirmed or uncertain content remains exact evidence. Media IDs and expiry are persisted before posting. An intent is committed before the public X request. Successful post IDs are committed immediately.

Safe failures retry with a 30-second exponential backoff capped at five minutes; a longer X `Retry-After` or rate-limit reset takes precedence. The scheduler keeps running after errors. A saved credential rotation is picked up next cycle when the numeric account and website still match the registered source. Disabling the saved profile prevents publication.

A timeout, server error, malformed success or database interruption after POST may mean X accepted the post. Automatic recovery searches up to 60 recent account posts and verifies exact author, text, media and reply context. A verified match marks the intent sent without another POST. An absent match is not proof of non-delivery: `delivery_needs_reconciliation` remains visible and blocks blind resending. An operator must investigate older/hidden/deleted posts or insufficient X read permissions. No system can guarantee exactly-once writes to X without an idempotent create-post API.

## Configuration and scope

The Launch production environment uses its existing restricted `DATABASE_URL`, encrypted account profile and `SEASON_RUNNER_MASTER_KEY`, plus server-only `SOCIAL_RPC_PRIMARY`, `SOCIAL_RPC_SECONDARY` and `CRON_SECRET`. The RPC hostnames must differ. The GitHub watchdog stores only `SOCIAL_SENDER_CRON_SECRET`; it receives no database, RPC, X or wallet credentials.

Only V17 Sepolia sources are supported in this release. Mainnet, the paused V16 rehearsal, public brand accounts and unknown deployments are not activated. New deployments require reviewed source registration with their runtime hash, network, public origin and authorized numeric X account. Changing the frontend address alone does not change publication authority.

The registered source is `v17-sepolia`, contract `0xdb0A3f76DE225377B7B6D1b70C14F1A12aDbe480`, runtime hash `0x1e3bef6ef6d189205f9da3537b5dd5e530d05a6af67a708a49a386187c7c563c`, account `805459104844103680` / `@luckyOne9619`, public app `https://app.tincta.xyz`. Its 37 historical sent records are imported before enabling. The import is real delivery evidence, not a fixture. No test milestones are invented to validate activation.

## Operations

- Read `/api/social-sender/status` using a Launch operator session or the cron bearer token. It reports source status, last successful observation, retry time, pending/uncertain counts and oldest pending age. It returns no credentials or full payloads. A stale observation or pending item older than three minutes, uncertain intent or recorded failure makes health fail.
- Check the **X sender watchdog** workflow and Launch function logs. Log messages contain only source ID and bounded error codes. Authentication errors require valid account credentials; canonical-state disagreements require healthy agreeing RPCs.
- To stop delivery, set the source's `enabled` field to false through restricted operational access, or disable the saved X profile. Disable the watchdog workflow when intentionally pausing the service. Preserve the outbox. Never delete sent/uncertain records to force a retry.
- To restore a worker, preserve its source binding and outbox, repair the dependency, and let the next invocation recover. Do not run the legacy file sender concurrently for the same source. Explicitly expired media can upload again; uncertain public posts cannot.
- Migration: `node scripts/setup-social-sender-staging.mjs --apply`. It verifies the dedicated staging identity, grants only Launch SELECT/INSERT/UPDATE, verifies restricted-role access, and enables no source. Web receives no access to the table.

## Verification boundaries

Eleven focused tests cover durable intents, lost acknowledgements, restarts, retry timing, failed persistence after a successful POST, account/phase changes, ordering, obsolete pending observations, cron authentication, dual-RPC anchors and real PostgreSQL lease fencing. The PostgreSQL test runs only on localhost, and the Checks workflow supplies an isolated PostgreSQL 17 service. Transport tests additionally cover timeline reconciliation, mismatched evidence, read-only absence and rate-limit reset parsing.

On October 30, a read-only live preflight verified both RPC projections against all 37 historical records and verified the saved X account. Automatic timeline lookup found and fully verified existing post `2115978713544507806`, without uploading media or publishing a post. Activation records are kept in the private operations directory `.private/social-sender/`, including hosted health snapshots and workflow/deployment verification. Source tests, hosted scheduling, terminal CI and live failure injection are separate evidence; consult the activation record rather than assuming deployment from this document. The V17 closeout's failed live scenarios and Mainnet qualification boundaries are unchanged.

Sources: [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [X user-post timeline](https://docs.x.com/x-api/users/get-posts).
