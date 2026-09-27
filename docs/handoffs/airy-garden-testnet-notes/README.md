# Airy Garden testnet notes: focused handoffs

These six specs translate the user's first-run notes into separate implementation scopes. They do not authorize live execution, posting, withdrawals or deployment. No agents were started and no fixes were implemented as part of preparing these documents.

**Implementation update (2026-09-27):** subsequent source work followed specs 01–06 in order. See the [implementation, validation and proposed recovery report](implementation-2026-09-27.md) for completed changes, dated read-only evidence and remaining hosted, wallet, mobile and live-run acceptance checks. The original specifications and source notes remain intact below.

**Subsequent user request:** deploy the complete worktree and create a live recovery script. The [recovery guide](../../airy-garden-live-recovery.md) documents the script, its successful read-only live audit and the separate plan approval/execution commands. The application release does not execute recovery.

To start a new Codex task, paste one complete spec. Each repeats the essential run context and constraints so it can stand on its own. For coordinated work, also include this index. Use isolated branches/worktrees when tasks run concurrently, with one owner per shared file. Do not have several tasks edit the worker, shared lifecycle model or Launch navigation independently.

## Task split

| Spec | Owner's scope | Dependencies |
|---|---|---|
| [01 — Public lifecycle and presentation](01-public-lifecycle-and-presentation.md) | Countdown/state model, compact mint/results UX, draw progress, landing hero, shared live styling | Agree status fields with 02/05; links with 04; renderer boundary with 03 |
| [02 — Affiliate enrollment](02-affiliate-enrollment-and-commission-journey.md) | Eligibility/bootstrap, admission configuration, affiliate timers, referral and claim journey | Shared states from 01; scenario integration with 06 |
| [03 — Treasury and verification](03-treasury-and-contract-verification.md) | Unallocated affiliate funds, operator accounting, explorer verification, immutable artwork boundaries | Provides balances/verification state to 05; settlement checks to 06 |
| [04 — Wallet prize claim hub](04-wallet-prize-claim-hub.md) | Connected-wallet prize discovery, unclaimed prizes and payment history | Navigation/entry points with 01; indexed event/read contract as needed |
| [05 — Launch operations and duration policy](05-launch-operations-and-duration-policy.md) | Active/upcoming collection pages, season visibility, 24-hour default/maximum | Balances from 03; shared states from 01; 30-minute exception with 06 |
| [06 — Rehearsal and recovery integration](06-rehearsal-coverage-and-recovery-integration.md) | Three-mint/30-minute refund scenario, affiliate sellout test, integrated acceptance | Requires scoped duration decision from 05 and functional paths from 01–04 |

The earlier [first-collection incident handoff](../../airy-garden-first-collection-handoff-2026-09-27.md) remains the detailed owner specification for X 403 diagnosis, paused-run recovery and missed second-collection scheduling. Give that to one recovery owner; spec 06 coordinates with that owner rather than duplicating changes to the worker.

## Suggested order

1. Begin read-only diagnosis of affiliate enrollment (02), reserve/verification (03), and the existing X recovery incident. These can proceed independently.
2. Have 01 define the shared lifecycle states and timestamp/freshness semantics. Then implement the public UI, 04's claim hub and 05's operator views with those agreed interfaces.
3. Resolve 24-hour ordinary policy versus the explicit 30-minute Sepolia exception before 06 implements the refund scenario.
4. Integrate and run isolated tests. Refresh live evidence, present a concrete recovery/run plan, and let the user approve live actions or run the command themselves.

## Important distinctions

- An announced schedule is useful even before deployment; it does not prove readiness or activation.
- “Awaiting activation” cannot be renamed “deployment in progress” unless deployment is actually pending.
- First collection in a season does not necessarily qualify for registry bootstrap, especially with imported historical V8 eligibility.
- V10 source already has a separate owner withdrawal function for unallocated affiliate growth reserve. The user's apparent missing 2 ETH is not proof of lost funds. Verify deployed state before changing economics.
- Source verification and withdrawal capability are separate. Verification should be automated and observable, but lack of explorer source does not inherently prevent a valid ABI call.
- Existing deployed NFT metadata/artwork and prepared deadlines are immutable history. New copy/defaults do not retroactively alter them.
- A refund test cannot validate sellout-based affiliate commissions; use separate scenarios.
- User-reported X cost “0.22 cents” needs unit/billing verification. Do not equate the 403 with depleted credits; 16 prior posts were recorded successful.

## Notes coverage

| User note or group | Spec |
|---|---|
| “Checking season status,” countdown appears only after deployment, scheduled-but-no-live message | 01 |
| Distinct enrollment and mint timers; disabled enrollment; qualifying NFT/first collection; configuration message | 02, shared lifecycle in 01 |
| Two-collection season no longer visible in Launch | 05 |
| “Awaiting activation” wording; too much mint-page information; long allowance label; highlighted live badge/animation | 01, Launch consistency in 05 |
| Landing hero live collection/upcoming countdown | 01 |
| Remove explanatory labels on NFTs | 01 UI inventory, 03 immutable renderer boundary |
| Default/max 24-hour mint lifetime | 05 |
| No-affiliate 2 ETH allocation; documentation; use funds for future prizes | 03 |
| Unverified contract; automatic verification; factory architecture; withdrawal tooling | 03 |
| “Claim your prizes” page, available and already claimed prizes | 04 |
| Launch “Active collection” and “Upcoming collection” pages | 05 |
| Explain Chainlink VRF; sold-out layout; progress while awaiting request/fulfillment/finalization; loading animation | 01 |
| Could not test affiliate commissions | 02, sellout scenario in 06 |
| Next test: 30 minutes, mint only 3, refund | 06 with 05 validation exception |
| Winner post delay and subsequent X 403; missing second-collection announcement | Existing incident handoff, integration in 06 |

The user's unedited notes are retained in [source-notes.txt](source-notes.txt). User observations and desired outcomes are not all confirmed defects; each spec identifies the needed verification and acceptance boundary.
