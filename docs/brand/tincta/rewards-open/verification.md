# Open implementation — local verification

22 October 2026. The user selected study 06 C / Open and authorized PFP exports and application across the landing pages and other apps.

## Delivered

- One authored vector reconstruction, retaining the selected silhouette, separate two-face center and warm palette. Precise solid fills replace the raster sketch's slight shading.
- White-background PFP PNGs at 400 and 1024 px, white PFP SVG, transparent SVG/1024 px PNG and a six-file ZIP.
- Parent Landing hero and Rewards feature; Rewards hero/header/footer; shared Web/docs and Launch branding; Web wallet artwork.
- Mainnet social image signature and eight local review templates regenerated, with the 32-file social ZIP refreshed. Sepolia's neutral network signature is unchanged.
- Parent Ligature wordmark, TC browser/Apple icons, Morph/Assembly artwork, all season palettes and permanent NFT artwork remain unchanged.

## Checks performed

| Check | Result |
| --- | --- |
| Canonical brand generator `--check` | 55 derivatives match their masters |
| All three app typechecks | Passed |
| All three production builds | Passed |
| Shared UI source policy and its tests | Passed, 10 tests |
| Visual harness typecheck | Passed |
| Social copy/image tests | 19 passed |
| Three isolated visual fixture builds | Passed |
| Rewards branding and parent-page browser suite | 111 passed, 6 planned secondary-engine viewport skips |
| Expanded Landing/routes/Launch/Web browser suite | 612 passed, 312 planned skips, no failures |
| PFP dimensions and circular safe area | Both sizes correct; no colored pixels outside the circular crop |
| Archives | PFP six entries and social 32 entries byte-match current source files |
| Production Landing `/` and `/rewards` | Open SVG present, no overflow at 320/390/1440 px; served Ligature icon bytes match the unchanged canonical icon |
| Diff whitespace | Passed |

Browser checks ran in Chromium, Firefox and WebKit using the pinned local macOS environment. The brand matrix covers Landing, Web/docs, My NFTs, Launch login/sidebar/mobile navigation and loading/error/not-found shells. Expanded checks cover route accessibility, responsive layout, first-paint/pending/error/retry/stale states, keyboard navigation, forms, dialogs and wallet fixtures. The updated motion check confirms Open keeps its fixed palette/orientation while existing ancillary motion still respects reduced motion.

The two known unrelated stale-copy assertions in `tests/visual/web.spec.ts` were excluded in each engine: they expect “Status unavailable” / “Details below may be out of date.” while the existing component renders “Collection update delayed” and its longer last-confirmed-update explanation. These were documented before this artwork change in the [Ligature record](../identity/ligature-verification.md). They were not silently relabeled as passes or changed in this task.

Screenshot baselines were refreshed for the approved artwork and added shared symbol. Representative desktop/mobile production heroes, shared brand crops, route screenshots, loading/error shells and the regenerated social contact sheet were visually reviewed. No screenshot tolerance was relaxed. Controls and product copy retain their existing behavior.

## Evidence

- [Expanded browser results](verification/browser-expanded.json)
- [Brand browser log](verification/browser-brand.log)
- [Browser environment](verification/browser-environment.json)
- [Production Landing checks](verification/production-landing.json)
- [PFP checks](verification/pfp-check.json)
- [Desktop parent landing](verification/production-parent-1440.png)
- [Mobile Rewards landing](verification/production-rewards-390.png)

Local production preview: `http://127.0.0.1:8129/rewards`. The production preview's collection-status endpoint was unavailable during inspection; the designed error state rendered. Successful and pending lifecycle states were exercised in isolated fixtures, not inferred from that preview.

## Boundaries

Source/build/browser verification is local. There was no deployment, X upload/post, database change, wallet signature or chain transaction. Launch authenticated screens and connected-wallet states were tested with isolated fixtures; live authentication, hosted UI, physical-device and manual screen-reader acceptance remain unverified. This report does not assert full repository acceptance while the known unrelated assertions and those evidence boundaries remain open.

## Rewards hero animation · 23 October 2026

Scope: Rewards Landing `/rewards` only. `RewardsHeroArtwork` reuses the unchanged shared SVG; Landing CSS supplies an eight-second translation loop for the overall artwork, folded wings and center. Intersection and document-visibility observers pause the loop when it cannot be seen. Reduced motion renders the original static composition from first paint. Shared tokens, controls, header/footer artwork, product copy and generated assets are unchanged.

Local checks passed: Landing typecheck and production build; isolated Landing fixture build; `npm run ui:source` (10 tests plus source policy); canonical brand parity (55 artifacts); visual harness typecheck; diff whitespace. `npm run landing:test` passed 17 tests with two database-dependent skips across its two suites.

`UI_APP=landing npx playwright test tests/visual/landing.spec.ts tests/visual/resilience.spec.ts --grep 'Landing|landing breakpoint|landing coarse'` passed **75 checks**, with six planned secondary-engine viewport skips. Motion frames were sampled at 0/2/4/6/8 seconds, checking unchanged path dimensions/colors, contained artwork, a seamless loop and a stable CTA. The same coverage checks offscreen/hidden-tab pause/resume, live reduced-motion changes and static header branding. The suite also covers initial pending, empty/error/retry/stale states, newsletter interception, keyboard navigation, axe, breakpoint reflow, 200% text, text spacing and coarse targets. Existing screenshot baselines passed without updates.

Environment: macOS 15.4.1 arm64, Node 22.20.0, Playwright 1.58.2, Chromium 145.0.7632.6, Firefox 146.0.1 and WebKit 26.0; system sans, en-US, UTC. Motion coverage: Chromium at 320/390/768/1280/1440 px; Firefox/WebKit at 390/1440 px. Desktop/mobile sampled frames were visually inspected. Local artifacts: `test-results/visual/results.json`, `test-results/visual-environment.json`, and the `landing-Landing-Open-hero-*` screenshot/trace/video folders. Browser fixtures block external requests and intercept writes.

The local production preview at `http://127.0.0.1:3101/rewards` was opened for review; its collection-status service was unavailable and displayed the existing recovery state. No deployment, hosted data changes or wallet/chain operations were performed. Physical devices and manual screen-reader review remain unverified. The existing user-directed omission of hero pause controls remains documented in the visual standard.

## Stronger Rewards hero motion · 25 October 2026

The user requested more noticeable logo motion and deployment. The loop now takes five seconds, with a 4% overall lift, 2.5% outward wing travel and up to 6.5% additional center lift. Only the existing Rewards hero keyframes change. Canonical SVG paths, fills, orientation, static branding and page layout remain intact; reduced motion and offscreen/hidden-tab pausing keep their existing behavior.

Local verification passed: Landing typecheck and production build; isolated Landing fixture build; `npm run landing:test` (24 passes, two isolated-database skips); source policy and its 10 tests; visual harness typecheck; generated brand parity (55 artifacts); diff whitespace. `UI_APP=landing npx playwright test tests/visual/landing.spec.ts tests/visual/minimal-content.spec.ts tests/visual/resilience.spec.ts --grep 'Landing|Reward examples|landing breakpoint|landing coarse'` passed **90 checks**, with 12 planned secondary-engine viewport skips. An initial broader selection also included six Web-only cases without the Web fixture server; those connection errors were resolved by selecting the intended Landing scope, not by changing product code or weakening assertions.

The existing motion test samples quarter-cycle frames and the return to rest, measures visible opening/lift at phone sizes, and checks unchanged plane dimensions/colors, containment, stable CTA geometry, preference changes and visibility pausing. Motion coverage uses Chromium at 320/390/768/1280/1440 px and Firefox/WebKit at 390/1440 px. Additional Landing coverage includes pending/error/retry/stale status, newsletter fixtures, keyboard/axe, coarse targets, text enlargement and breakpoint reflow. Desktop and phone peak-motion screenshots were inspected; no screenshot baselines changed. Local evidence is under ignored `test-results/visual/`, including `results.json` and the `landing-Landing-Open-hero-*` frames. Browser environment is recorded in `test-results/visual-environment.json`.

These checks establish local browser behavior. Hosted deployment is verified separately after publishing the commit. Physical devices and manual screen-reader review remain unverified; no hosted data or chain operation is part of this animation change.
