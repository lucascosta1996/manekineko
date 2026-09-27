# Bots run notes 2: Launch U5/U6 implementation

Date: 2026-09-27 UTC. Source changes only; no application deployment, database mutation, worker control, X delivery or fund movement was performed by this scope.

## Current hosted reconciliation

The reported earnings outage did **not reproduce** during fresh authenticated checks against `https://manekineko-staging-launch.vercel.app` at 23:06 UTC. Anonymous API access returned 401; login, earnings page, Sepolia API and Mainnet API returned 200; logout returned 200. API responses were `private, no-store`.

The current hosted production target is `dpl_G3MDavoXK6SPSszZKSQ5SLNSz3Xv`, READY, with Git metadata `928f33d59dc1b40292d684c443e1152e33326ed0`. This identifies the tested hosted deployment, not a deployment of this implementation.

The Sepolia API verified all three registered deployments at block **11796512** (2026-09-27 23:06:12 UTC): Cinder Study, Lunar Stone and Satin Echo. Both Airy Garden collections returned owner `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223`, zero contract balance, zero ordinary withdrawable balance, zero remaining growth reserve, zero prize/affiliate/refund liabilities, and **2 ETH growth reserve previously withdrawn each**. Zero here was a successful read after funds had been collected; it was not an unavailable response. Mainnet was a separate, legitimately empty registered catalog. This does not rule out an earlier transient failure or a different selected network/session.

Sanitized private evidence: `.private/bots-notes-2-launch/hosted.json`. Existing credentials were read only in memory; the first restricted-network attempt failed before authenticated checks and the network-enabled retry succeeded.

## Accounting interface

`apps/launch/lib/creator-earnings.ts` remains read-only. It now returns:

- Report `status: empty | available | partial | unavailable`, canonical `blockHash`, block number/time, selected chain and exact wei totals.
- Verified collection runtime presence/hash plus version, round ID and current owner at the same canonical hash. The hash is observation evidence, not an independent compiler bytecode attestation.
- Existing separate ordinary proceeds, released growth reserve, gross revenue, unpaid prizes, unpaid affiliate entitlements, refund liabilities and other locked funds.
- `withdrawals.ordinaryWithdrawnWei` from bounded `Withdrawn` event history, independently nullable; `withdrawals.historyError` distinguishes incomplete history from current balances. Growth withdrawal history comes from contract storage. No past withdrawal is counted as currently available.

The catalog query deliberately includes archived/private/retired registered deployments, without a public-visibility filter. An empty catalog now explicitly explains that a known deployed address missing from registration needs reconciliation. Unsupported or failed reads remain visible and excluded from explicitly partial totals; errors are sanitized. Historical V3–V6 balance discovery remains supported without inventing unavailable growth accounting.

The existing server-only `LAUNCH_EARNINGS_RPC_URL_<chainId>` now also serves operation observations. Required RPC methods are `eth_chainId`, `eth_getBlockByNumber`, `eth_call`, `eth_getCode`, `eth_getBalance` and optional `eth_getLogs` for ordinary withdrawal history. State reads use EIP-1898 canonical block-hash parameters; history queries use bounded numeric ranges and a final canonical hash recheck. Providers that reject historical logs leave history unavailable without hiding current funds. Runtime needs the existing catalog read grants; no new write grants or migration are required.

## Network and lifecycle integration contract for M4

`lib/launch-navigation.ts` is the route authority: `launchDestination(path, chainId, automationId?)` and `safeLaunchDestination` admit explicit Launch pages and validated network/season parameters. Login preserves supported deep links. Header navigation, operations links and earnings links retain chain ID. The URL query is the persisted network context; `components/launch/use-launch-network.ts` updates it only after the calling editor accepts its existing unsaved-change guard.

The single visible header selector is shared across Seasons, Collections, Active collection, Upcoming collection and Earnings. Collections retains its existing environment restriction; Mainnet draft planning remains in Seasons in a Sepolia environment. Mainnet preparation/execution guards and origin/auth checks are unchanged. No automatic worker action is triggered by navigation or refresh.

`components/launch/use-launch-query.ts` defines chain-scoped, generation-checked GET reads, abort cleanup, manual retry, 60-second visible-tab refresh and tab-resume refresh. Previous-chain responses cannot replace the active chain; failed refreshes retain same-chain observations with an error and allow them to expire. Monotonic elapsed time advances the server observation, avoiding device-clock skew. Runtime-panel polling also discards outdated responses.

`lib/collection-observations.ts` verifies registered V9/V10 contracts on the selected RPC network using a recent canonical block and a final hash recheck. It checks registered version/round/supply/winner count and runtime presence, then reads immutable sale times, phase, cumulative primary mints, refund-adjusted circulating supply, actual configured award count and independent rank claim state. It does not infer four or six awards. Unverified reads become unavailable, never a fabricated zero or refreshed database timestamp.

`lib/collection-operations.ts` exports `OperationsReport` and `operationSeasonSummaries`, using the shared contract package lifecycle authority. It separates chain lifecycle, immutable prepared artifact, and worker state. Complete means the actual run's collections are terminal (draw finalized or refundable), independently of reward or social settlement. The actual prepared artifact supplies the collection count. Incomplete or stale observations cannot yield Complete. Superseded ten-step runs appear only as labeled audit history and do not populate the Upcoming view. Original and approved recovery dates remain visible; no artifacts or deployed deadlines are rewritten.

Seasons now displays observed lifecycle on saved-season cards and above prepared details. Both operations views show canonical block/time, errors and actual collection count. Prepared remains the immutable workflow record. The social/worker panel remains separately visible. M4 can replace the surrounding shell without reimplementing these state rules.

## Verification boundaries

- **Source/tests:** focused tests cover chain and generation isolation, login/deep-link allowlisting, canonical state/hash checks, stale/reorganized/wrong-chain/wrong-count observations, two actual collections, stale completion, unpaid prizes independent of season completion, current versus historical withdrawals, partial results and redacted errors. Launch typecheck and production build passed.
- **Local browser visuals:** not claimed by this scope. Header responsive CSS was adjusted for the persistent selector; M4's full dashboard/sidebar/mobile journey remains its companion scope.
- **Database persistence:** no hosted schema/data/grant change. Existing authenticated catalog reads succeeded. Disposable database regression results are recorded below.
- **Hosted authenticated UI:** current hosted earnings page/API succeeded as described above. The new source has not been deployed or hosted-browser verified.
- **Wallet/device:** no wallet or signing code is introduced in Launch; no real device transaction was attempted.
- **Canonical chain:** fresh hosted earnings read verified all three catalog entries. Parent U1 audit independently verified both Airy collections, each with six of six prizes paid. New source-reader live checks are recorded below.
- **X delivery:** no posts were sent by this scope. Parent U3 owns outbox reconciliation; `prizes-paid` illustrative previews were integrated with claimed awards and updated event-count tests.

### Final local and live-reader evidence

The complete Launch regression suite ran against the disposable local PostgreSQL container on port 54349: **218 passed, zero failures/skips**. No hosted environment file was loaded for test fixture writes. Typecheck and production build passed; whitespace validation passed.

The new source accounting and lifecycle readers were exercised separately against staging catalog data and the existing Sepolia RPC at canonical block **11796541**, hash `0x850edefbaee7d4c06cd51670c26edda2223b0dac825d75c31c32a94078c2c008`, timestamp **2026-09-27 23:12:00 UTC**. All three current balance reads succeeded. Both Airy contracts each had **2 ETH ordinary proceeds previously withdrawn**, **2 ETH growth reserve previously withdrawn**, and zero current available/protected balances. Cinder Study's older withdrawal-history query was unavailable, while its zero current balance remained independently verified and visible. This demonstrates the intended separation between history availability and current funds.

Both V10 collection observations were `complete`, 1,000 cumulative primary mints and 1,000 circulating NFTs, six actual awards each and every award claimed. Lunar Stone's deployed 30-day deadline and Satin Echo's approved 24-hour deadline were read and preserved. Restricted Launch catalog grants were verified: collections/deployments `SELECT=true`, collection `UPDATE=false`, deployment `DELETE=false`. No grant was changed. Sanitized evidence is in `.private/bots-notes-2-launch/live-reader.json`; authenticated RPC URLs and connection strings are excluded.

The complete new operations loader also ran read-only against staging at block **11796549**. It returned Airy Garden's actual run as **Complete, 2/2**, worker `completed`, artifact `prepared`, zero unpaid prizes, all prizes paid. The superseded run remained a separate **10-collection Superseded history** entry with unavailable completion count. Fresh source operation reads therefore resolve the prepared-versus-complete discrepancy without rewriting a database status or historical artifact. The check caught and corrected a SQL join requiring an explicit cast between text runtime chain IDs and numeric catalog chain IDs. Evidence: `.private/bots-notes-2-launch/live-operations.json`.

The runtime API now additionally selects only whitelisted outbox observation time/block/hash, unpaid-at-observation count, delivery latency, attempt count, retry time and an enum-validated next-action label. The UI displays them beside each action. Full payload history, journals and credentials are never included. Historical outbox rows lacking these fields continue to render their original status.


A further read at block **11796555** demonstrated partial-result recovery behavior: Cinder Study's ordinary **2 ETH** withdrawal history succeeded after reducing log-query chunks to 10,000 blocks, while Satin Echo's accounting read was temporarily unavailable and explicitly excluded from totals (2/3 verified). Both lifecycle observations at that block still succeeded. Earlier block 11796541 had independently verified all three balances. This variability is why the UI reports partial/unavailable status and retry instead of presenting a failed read as zero. The implementation does not claim uninterrupted RPC availability.

The final read-only retry with the production provider batching settings (`batchMaxCount: 10`) recovered **3/3 balances and all three ordinary withdrawal histories** at block **11796558**, hash `0xafa3eadaa58c7f14d48e1aa14234419d25c4b3ff0955733889312136bf4cabf0`, timestamp **2026-09-27 23:15:24 UTC**. Each registered collection had 2 ETH ordinary proceeds previously withdrawn; each Airy collection additionally had 2 ETH growth reserve previously withdrawn. All current available balances remained zero. Both Airy lifecycle observations remained complete with six paid awards. Block-specific evidence is preserved in `.private/bots-notes-2-launch/live-reader-11796558.json`. The temporary per-collection failure is retained in this record; its exact provider cause was not established.

Earnings retain and label the last successful same-chain snapshot when an HTTP refresh fails. Operations keep the indexed observation timestamp separate from canonical observation time; a failed RPC never makes that projection fresh. Unavailable season counts are shown as “Observation unavailable” with the actual sequence size, rather than a fabricated zero completed collections.
