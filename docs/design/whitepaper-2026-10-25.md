# TAS-1 whitepaper · 25 October 2026

## Scope and content

The parent Tincta site adds `/whitepaper`, presenting **TAS-1 — Tincta Autonomous Standard**, draft 0.1.0. It is an architecture proposal independent of Rewards, with no assigned ERC/EIP number and no assertion that an existing deployment conforms. The nine requirements cover the full authority graph, sealing, lifecycle progress, permissionless execution, complete onchain data, asset invariants, dependencies, discovery and evidence. Thirteen reading sections include two semantic diagrams, a Solidity interface proposal and six primary-source references.

The proposal distinguishes onchain enforcement from transaction submission and gas funding. Strict conformance excludes indispensable offchain data authorities; oracle/randomness extensions disclose integrity, availability and selective-abort assumptions. The canonical manifest schema, reference implementation and executable conformance suite remain future work. No contract, deployment pin, database, worker, wallet or social action changes.

## Presentation and components

- Reuses current Ligature identity, shared foundation tokens, `LandingNavigation`, `Button`, `Icon`, footer brand and footer link contracts.
- Parent `/` and `/whitepaper` share `StudioHeader` and `StudioFooter`; header, footer and research copy link to the paper. Existing Rewards navigation keeps its behavior.
- The server-rendered article uses a 68ch prose measure, a sticky desktop contents list, stacked mobile navigation, semantic headings/definitions/figures, and source links.
- Print uses the browser dialog and a dedicated print stylesheet. Without JavaScript the article and section links work, and the print action is replaced by browser-print instructions.
- Whitepaper content has no asynchronous data dependency, wallet state, database query or external media dependency. Pending/error/retry data cases are not applicable. Existing app-level boundaries are unchanged.

## Local evidence

- Landing tests: 24 passed; two database-dependent tests skipped (no isolated newsletter database supplied).
- Full `npm run check` passed: 467 contract tests plus 635 application/tooling tests, with 21 environment-dependent skips. All five workspace typecheck/build tasks succeeded; four unchanged workspace builds were cache hits. The contract suite included its complete local 20-collection rehearsal.
- Landing production build and typecheck passed. `/whitepaper` is statically prerendered. UI harness typecheck, source policy and generated identity/artwork parity passed.
- `UI_APP=landing npx playwright test tests/visual/whitepaper.spec.ts tests/visual/studio.spec.ts tests/visual/landing-navigation.spec.ts`: **63 passed, 36 planned secondary-engine viewport skips**, no failures.
- Chromium covers 320, 390, 768, 1280, 1440, 1920 and 2560 px for the paper; Firefox and WebKit cover 390/1440 px. Tests cover section destinations, parent navigation, mobile-menu selection/Escape/resizing, print invocation/media, JavaScript-disabled reading, axe scans, 200% text, text spacing, reduced motion, forced colors and breakpoint reflow.
- The browser environment is recorded in `tests/visual/environment.json`: macOS 15.4.1 arm64, Playwright 1.58.2, Chromium 145.0.7632.6, Firefox 146.0.1 and WebKit 26.0; en-US, UTC, DPR 1, shared system font stack.
- A separate real production-server smoke check verified HTTP 200, canonical/OG metadata, one h1, no page errors, coarse-pointer 44 px print/contents targets, no horizontal overflow and the JavaScript-disabled print fallback.
- Desktop/mobile screenshots and diagram details were visually inspected. Reproducible browser artifacts are under ignored `test-results/visual/`; production screenshots are under ignored `test-results/whitepaper-production/`. New-page screenshots are inspection evidence, not a claim of comparison to a pre-existing baseline.

## Verification boundaries

VI-01 through VI-06 and VI-09 through VI-14 have scoped source/browser evidence as described above. VI-07/08 asynchronous state gates do not apply to this static article. Existing shared behavior is exercised through parent and Rewards navigation regressions. No physical-device, manual screen-reader, connected-wallet or chain execution acceptance is claimed. Automated axe checks do not establish complete accessibility.

Full repository release validation and hosted deployment are recorded with the release result; the local evidence above alone does not establish hosted delivery or GitHub CI success.
