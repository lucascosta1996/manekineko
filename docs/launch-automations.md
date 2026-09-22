# Launch automation plans

**Current integration:** new editable plans target V10 and frozen V9 plans keep V9. Versioned permanent-identity previews, exact registry pins, migration 026 and the persistent V9/V10 worker are implemented locally. Live rollout remains pending. Use [season automation](season-automation.md) and the [V10 handoff](permanent-combinations-v10.md) for current commands; V6/V7 design details below are historical.

Open **`/seasons`** in the independent `apps/launch` application. The page uses the existing operator account, session and PostgreSQL database. Seasons and Configurations are available in the shared navigation. The old `/automations` URL redirects to `/seasons`.

A season is a named group of **1–10 collections**, stored as an ordered launch plan. Each season has a stable identity; each collection has its own name and hex color. Set the collection count, then customize each entry. A saved configuration can supply starting values; the plan stores independent copies, so later template edits do not change another collection's terms.

Each collection retains its own identity, NFT background color, supply, mint price, prize share, affiliate positions and pool percentage, round owner, enrollment signer, enrollment window and randomness funding/settings. All collections in one sequence use the same network and factory series. New plans select a V10 factory; saved historical plans retain their version. Later entries inherit that series; the version-aware worker resolves and verifies its actual deployed address.

V6 sequences also share the canonical affiliate eligibility registry. The first entry of an automation is **not** automatically exempt from NFT ownership: only the first official collection registered across the network gets that exception. Later applicants must hold an NFT from any earlier official collection that sold out, revealed and paid its winner. Each wallet and NFT can qualify one position per destination, with ownership checked at enrollment; later transfers preserve the registered position and earnings. Enrollment closes before minting, so the target’s own NFTs cannot qualify. [Holder eligibility](affiliate-holder-eligibility.md) explains registration and the unchanged automated abuse checks.

The NFT displays the season name and collection name. Black or white text is selected before deployment for contrast, then stored with the colors on chain. Names and artwork terms are frozen into each reviewed export. See [seasons and collection appearance](seasons.md).

## Historical V7 fixed season timing

At the V7 implementation milestone, new drafts used the [two-prize V7 model](season-v7-implementation.md). Configure the first UTC opening, the waiting time before the next collection (default 3600 seconds), and its announcement delay (default 1800 seconds). Follow-up dates are anchored to the canonical sellout timestamp. The next collection can be deployed before its opening once the preceding draw is verified and both prizes are reserved; it need not wait for holders to withdraw. The mint lifetime starts at the fixed `saleStartAt`. Missed preparation or activation pauses the season.

X message templates are stored with the plan, but publishing and deployment execution are not connected. Sellout statistics and verified winners use separate messages because VRF is asynchronous. The future schedule and action-intent tables retain the prepared revision/hash, source block and fixed times with idempotent identities. They do not dispatch jobs.

## Historical V4–V6 dates and progression

- **Lifetime from deployment:** the closing deadline is derived from that collection's actual deployment block. Enrollment uses part of this lifetime.
- **Fixed closing date:** the saved UTC deadline stays fixed even if an earlier collection takes longer than expected. The future worker must pause when the deadline no longer leaves sufficient deployment/enrollment time; it must never extend it silently.
- **Earliest start:** an optional lower bound for the first deployment, not a guaranteed broadcast time.
- **Interval:** a minimum wait after the previous collection has sold out and paid its winner. The predecessor gate always takes precedence over a calendar target.

Later collections cannot overlap in the same factory. Unsold/refunded collections, a missing prize payout, expired fixed dates, unavailable funding and deployment failures require intervention. The configured failure policy is to pause; there is no automatic skip or randomness retry policy.

Absolute dates are entered, stored and reviewed in **UTC**. Explicit UTC avoids daylight-saving ambiguities and preserves the saved instant exactly. No actual deployment date is presented as confirmed before a transaction exists. A deadline derived at worker execution must be based on a fresh pinned chain block and revalidated immediately before sending.

## Saved plans and prepared snapshots

**Save season** persists an editable draft. **Validate all collections** checks the saved revision without deploying or changing its state. **Prepare season** validates every entry and freezes the versioned snapshot with its content hash. Copy a prepared plan to change its terms. Stale revisions fail instead of overwriting another operator's edits.

The export is intended for a future deployment worker. Preparing a plan does not activate a scheduler. This release has **no connected transaction worker, signing keys, automatic spending or background blockchain execution**; the page displays that status explicitly.

Preparation and execution are distinct. A prepared plan may become ineligible over time as fixed deadlines expire or chain conditions change. The worker must always revalidate it and compare its hash against the authenticated database record. A SHA-256 digest provides integrity relative to that trusted value; it does not prove independent approval or ownership of the entered wallets.

## Backend boundary

The APIs under `/api/launch/automations` require the same live operator session as configuration APIs. Every mutation also requires the configured origin. Drafts, ordered collection payloads, revisions and audit records live in PostgreSQL; no browser storage is used as the source of truth. List responses contain summaries rather than returning every nested plan.

The server applies matching V7, V6, V5 or V4 validation to each collection. Shared factory authority and canonical eligibility registry, unique stable entry IDs, bounded counts/body sizes, exact integer amounts, deadline behavior and chronological constraints are additionally validated for the sequence. Database triggers enforce active operators, revision increments, retained audit history and immutable prepared records.

There is no public `enabled` or `run` endpoint. The future worker should use a separately restricted identity, claim a prepared plan entry atomically, bind its idempotency key to the plan hash and stable entry ID, and persist transaction intent before sending. Retries must reconcile the recorded nonce/transaction before another submission. A blockchain observer must verify sellout, factory identity and confirmations before progression. Historical versions require prize payment; V7 requires a verified draw and fully protected prize liabilities, allowing later independent holder claims.

Use one sequence per factory at execution time. Cross-plan ownership of a factory, funding budgets, gas ceilings, owner-authorized activation/settlement, signer custody and live job monitoring must be implemented and qualified before enabling Mainnet automation. The planning UI does not establish those operational guarantees.

## Local setup and checks

```sh
npm run launch:db:migrate
npm run dev:launch
npm run launch:test
npm run launch:db:test:automations
node --env-file=apps/launch/.env.local --env-file=.env.launch-credentials.local scripts/verify-launch-http.mjs
npm run build:launch
```

Database regression checks use disposable local schemas. They do not prepare your saved Mainnet drafts or send blockchain transactions.

## Shared pools and legacy plans

New V7 plans use equal payouts after the referral minimum and common cap, as described in [V7 economics](season-v7-implementation.md). Historical V5/V6 plans retain their [proportional referral pools](affiliate-pools.md). Each collection chooses its own pool percentage. The sellout summary separates sales, prize, affiliate pool and minimum operator remainder. Changing the number of positions does not change the pool. Holding a qualifying NFT or enrolling does not itself earn commission. Editable legacy plans can explicitly convert to V7 and clear incompatible factory and registry selections; prepared snapshots remain immutable. A factory series cannot mix contract versions. Templates preserve the target sequence’s payout model and canonical eligibility registry.
