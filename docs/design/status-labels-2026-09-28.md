# Collection status wording — 2026-09-28

The public Landing API returned Satin Echo with `stale: true`, status `unavailable`, no chain timestamp and a last update at 01:51:27 UTC when read at 02:44:03 UTC. The long “Observation delayed · last known state” badge was the intended freshness fallback, but exposed technical wording to collectors.

Landing and Web now display **Status unavailable** with a plain explanation that the latest status could not be confirmed and displayed details may be out of date. Web also suppresses the stale activity description, which could otherwise imply current mint or claim availability. Existing freshness checks, live indicators, countdown suppression, polling and transaction guards are unchanged. This UI correction does not repair or activate the paused season worker.

Verification: Web 279 unit tests passed (3 database skips); Landing 15 passed (2 database-dependent skips across its two suites). Both production builds, fixture builds, source-policy checks and visual harness typecheck passed. Reviewed phone (390px) and desktop (1440px) stale-state screenshots in Chromium, Firefox and WebKit. Landing coverage exercises failure after success, recovery, focus, retained data and suppressed live availability; Web coverage advances the server clock beyond the collection observation and checks the explanation and absent countdown/live indicator. No database, wallet or season operation was performed.

Evidence is local under `test-results/`; screenshot references are checked in under `tests/visual/baselines/darwin`. These scoped checks do not establish the result of the full remote visual workflow or real-device acceptance.
