# Confirmed mint notifications and free Genesis headline

Scope: parent Tincta landing, Rewards landing, public app and docs. The Genesis introduction now says **One free NFT. Two utilities.** Existing gas, voting, affiliate qualification and deployment explanations remain in place.

The shared floating bar uses the existing confirmed NFT mirror through a read-only endpoint. It shows Genesis or paid collection names, an NFT number and a transaction link. Sepolia notices identify the test network. There are no invented wallets, mint timestamps or activity counts. See [the mirror guide](../nft-mirror.md#public-mint-notifications) for polling, freshness, bounded sampling and deployment requirements.

The bar uses shared typography, spacing, icons and controls. It occupies no document space, stays within the viewport, does not animate, and sits below modal layers. A polite live region announces activity. Hover or keyboard focus keeps the transaction link available; the close control hides notifications for the tab session. Initial, empty, failed and malformed responses remain visually quiet. Resuming a hidden/offline page resets the activity baseline.

## Local acceptance

- Landing, Web and Launch production builds passed. The visual source contracts and harness TypeScript check passed.
- Web: 300 passed, three optional database cases skipped. Indexer: 73 passed, nine optional database cases skipped. Landing: 27 passed, two optional database cases skipped across its app and setup suites.
- Six mirror tests passed with SQL enabled in a disposable localhost PostgreSQL database. They cover transaction grouping, independent chain limits, fresh trusted pins, stale/unverified-source exclusion, recent-block bounds and burned tokens, alongside existing replay/reorg/lease checks. No fixtures were written to hosted databases.
- The built Web server passed its actual HTTP route check against an isolated SELECT-only PostgreSQL role: confirmed batch activity, restricted public fields and exclusion of an unverified source, alongside gallery pagination checks.
- Notification, Genesis copy and cross-app control browser checks: 67 passed across Chromium, Firefox and WebKit, with 38 intentional duplicate viewport skips. Coverage includes initial-history suppression, both NFT kinds, correct explorer domains, duplicate suppression, keyboard pause, session dismissal, malformed/error recovery, hidden-tab recovery, accessible 44px touch controls, 320–1440px notification geometry and enlarged text.
- Inspected phone and desktop screenshots of the notification with the revised Genesis heading. Notification accessibility scans passed. Test activity is synthetic and isolated from production.
- All 24 landing first-paint, empty/error/retry and deadline checks passed. Six desktop snapshots were updated for the added word “free” in the Genesis heading; strict screenshot comparisons passed afterward. The hero and artwork retain their geometry.

The first notification geometry run paused the browser clock during axe's timer-based scan and timed out. Resuming the test clock before that scan fixed the test harness; the full browser rerun above passed. A complete historical contract rehearsal was not rerun for this website-only change. Hosted readiness and live activity delivery are separate release checks; no real wallet mint is claimed by these local checks.
