# Ligature implementation acceptance · 2026-10-21

The user selected **C / Ligature** from study 02 and requested its application across all apps, favicons, headers and generated Twitter images. The canonical master preserves the selected regular/micro TC paths and the six uppercase Instrument Sans outlines with their study spacing. The earlier lowercase-t identity is superseded for application and social branding.

## Scope and consumers

| Surface | Change / evidence |
| --- | --- |
| Landing parent `/` | Generated uppercase wordmark in header and footer; responsive production screenshots and parent-page fixtures |
| Landing `/rewards` | Header and composed footer retain the shared quiet Rewards label |
| Web | Shared shell across seasons, mint, collection/affiliate/contract, history, My NFTs, NFT detail, prizes and docs; loading/error/not-found boundaries; compact wallet/brand mark and off-chain preview signature |
| Launch | Login, operator sidebar, mobile drawer, all workspace sections and loading/error/not-found shells retain Rewards hierarchy |
| Browser/home-screen icons | All three production builds serve matching SVG, 16/32/48 ICO and 180 px Apple PNG; actual HTML link metadata and returned bytes checked |
| X event renderer | Worker PNGs and Launch SVG previews use the same generated path-only Mainnet lockup for all supported events; Sepolia keeps the existing neutral name and explicit test marker |
| Social review kit | Teaser and seven event templates, SVG/PNG exports, contact sheet and ZIP regenerated; 32 archive entries match the current source files |
| Future raster campaigns | Six transparent ink/white PNG references generated from the canonical mark, wordmark and lockup; guidance points away from historical lowercase poster references |

`node scripts/generate-tincta-brand.mjs --check` verifies all **46** canonical derivatives. The three old `45 / 14` aspect-ratio rules were replaced with the wordmark's actual `3947 / 780` ratio, including the Web preview signature. Existing 96/88 px wordmark widths, accessible names, clear space and Rewards styling remain intact.

The former drawing paths and old aspect ratio no longer occur in active app/UI source. Immutable on-chain renderers and minted NFT metadata, catalog identities/palettes, frozen exports, already uploaded X media, confirmed/ambiguous outbox intents and historical raster campaign originals were not rewritten. No database, wallet, chain, external X or deployment operations were performed.

## Local checks

- Web: 290 tests passed, 3 database-dependent tests skipped; typecheck and production build passed.
- Launch: 190 app tests and 5 preparation-tool tests passed; 6 database-dependent tests skipped; typecheck and production build passed.
- Landing: 16 tests passed; 2 environment-dependent tests skipped across app/newsletter tooling; typecheck and production build passed.
- UI source policy and its 10 tests, UI harness typecheck, generated-brand parity and diff whitespace checks passed.
- Social image/copy suites: 19 tests passed. All production event types include the canonical Ligature; Sepolia remains neutral. PNG dimensions, deterministic rendering, ordered palettes and preview labeling remain covered.
- All three isolated fixture apps built successfully. Fixtures import production components/styles, deny external requests and intercept writes; they do not establish authenticated data or live-wallet behavior.
- The 32-route/viewport brand-lockup matrix passes in Chromium, WebKit and Firefox (96 checks), including new aspect-ratio assertions, overflow checks and automated brand accessibility scans.
- Broader route/state checks and updated screenshots cover desktop/mobile, menus, parent/Rewards round trips, login pending/error, documentation, NFT/claim regions, reduced motion, forced colors and text reflow. See the result files below for counts and exclusions.
- Actual production-build shell/icon verification passed for Landing `/`, Web `/docs` and Launch `/login` at 320/390/1440 px: [asset report](verification/production-assets.json). Screenshots are in the same directory.
- The study remains reproducible with its previous-identity comparator frozen separately. Its selected C preview and original research record pass the standalone browser check.

### Browser results and known unrelated failures

The first Firefox run failed before loading any page with `NS_ERROR_NET_ERROR_RESPONSE`. The failure also reproduced against the standalone study. Disabling the host's system proxy for the loopback-only Firefox fixture project resolved it; the setting is now explicit in Playwright configuration. No screenshot thresholds were relaxed.

The Chromium/WebKit expanded run had **471 passed, 159 intentionally skipped, 4 failed**: [results](verification/chromium-webkit-results.json). The four failures are the same two pre-existing stale-status copy assertions at 390/1440 px in both engines. `tests/visual/web.spec.ts:227–228` expects “Status unavailable” / “Details below may be out of date.” Existing, unchanged `apps/web/components/collection-activity.tsx` instead renders “Collection update delayed” / “Figures below are from the last confirmed collection update. Affiliate availability is checked separately.” This behavior was already in commit `d15c00e`; it was not changed to satisfy a branding test. These two cases are excluded from the Firefox rerun and their unrelated component snapshots are unchanged.

The Firefox expanded rerun and all 32 brand checks are recorded in [Firefox results](verification/firefox-results.json). Screenshot baselines were refreshed for the approved logo replacement in the repository's pinned macOS environment. This is local browser evidence, not hosted deployment, physical-device testing, manual screen-reader certification, authenticated session validation or X delivery.
