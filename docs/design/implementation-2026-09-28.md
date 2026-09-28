# Visual system implementation and verification

Local implementation · 2026-09-28 UTC · standard v1.0

Base revision: `02db86832051a4f9808feb9baab48f44802bc81d`; implementation and reviewed baselines remain uncommitted in the working tree. Existing agent/design documentation changes were preserved.

This record covers Landing, Web/docs, Launch and `packages/ui`. It does not authorize or establish deployment, database persistence, real authentication, wallet signing, season operations or external delivery.

## Implementation

- `packages/ui/src/tokens.css` is the authored foundation. Shared buttons, links, icon buttons, text actions, fields, choices, select portals, dialogs, confirmations, menus, tabs, disclosures, feedback, loading treatments and footer consume it. Server components use the separate server-safe class helpers. Canonical geometry is 40 px / 44 px for coarse pointers, 14/20 px control type, 18 px icons and 3 px corners; footer icons use 16 px.
- App button implementations and conflicting compact rules were removed. App styles own layout and explicit typography roles. Portals receive the common font/tokens. Launch retains its private operator composition.
- Landing distinguishes initial pending, successful empty, loaded, error, retry and stale observations. Initial pending has no Refresh action. A failed poll retains explicitly stale context and suppresses fresh availability. The primary CTA precedes the status slot. Newsletter uses inline constraint validation, associates errors, guards duplicate requests, reserves state-label width and preserves the entered email on failures.
- Landing now has one public footer with one copyright, legal text and a quiet motion action. Missing artwork has a reserved, designed fallback. Mobile navigation, FAQ and support interactions remain semantic.
- Web normalizes UTC display strings across server and browser to avoid Safari hydration differences. Wallet read failures now show an actionable message instead of raw provider JSON. The documentation overview’s outdated “no live V10 deployment” statement was replaced with the dated September 27 Sepolia observation from the repository recovery report; it makes no Mainnet availability claim.
- Launch confirmations use the shared modal with cancellation, focus containment/restoration and guarded side effects. Login validates inline. Fresh read responses immediately anchor the display clock; stale operations do not enable execution. Web retains version-specific mint/NFT/claim presentation and adds branded shell fallbacks.

## Repeatable verification

The isolated Next applications in `tests/visual/apps` import production components and real application styles. Production applications do not route these fixtures. Fixture startup freezes server Date to the same fixture instant (including the copyright year), cleans copied public assets before every build, uses an environment allowlist, never loads app environment files and imports no auth/database readers. Context routing permits only the three exact fixture origins, intercepts writes before route matching (including non-API POST/server actions), and blocks external origins and service workers. Mutations return controlled local fixtures; no signup, configuration save, login, transaction or season operation reaches a service.

`tests/visual/route-inventory.json` records production routes, redirects and relevant states. Source policy compares this inventory with the actual page tree. Web documentation slugs are enumerated from production content. Redirect destinations are rendered in the component fixtures; this is distinct from executing real server data/auth paths.

Commands:

```sh
npm ci
npx playwright install chromium firefox webkit
npm run ui:source
npm run ui:typecheck
node scripts/generate-tincta-brand.mjs --check
node --import tsx scripts/generate-landing-artwork.mjs --check
npm run landing:test
npm run web:test
npm run launch:test
npm run typecheck --workspace @manekineko/landing-page
npm run typecheck --workspace @manekineko/web
npm run typecheck --workspace @manekineko/launch
npm run build:landing
npm run build:web
npm run build:launch
npm run ui:fixtures:build
npm run ui:test
```

`UI_APP=landing|web|launch` restricts server startup for focused tests. Run matching tests only when using it. Playwright owns and stops its fixture servers and refuses an already occupied port. Ports are 4311–4313.

Playwright and its accessibility peer use the same pinned `playwright-core` 1.58.2. Reduced motion is configured through `contextOptions`, with an explicit preference-and-pause interaction test; a top-level option is not supported by this runner. Screenshots are pinned to Playwright 1.58.2, OS family, engine, locale en-US, UTC, DPR 1 and fixed fixture data/time. Chromium covers five sizes (320×800, 390×844, 768×1024, 1280×800, 1440×900); Firefox/WebKit cover phone/desktop routes and component/interaction contracts. Explicit breakpoint tests cover 599/600/601, 759/760/761 and 959/960/961. Short-screen overlays use 390×568. Coarse input is emulated at desktop width; this is not proof of physical simultaneous mouse/touch hardware. macOS WebKit’s native Option-Tab is used for navigation links when its normal Tab preference skips them; Enter/Escape and focus restoration are still asserted.

Capture occurs while fixture timers are paused. Accessibility scans resume timers because axe requires timer callbacks. Hero traces include test-controlled pending frames after 0.5, 3 and 10 real seconds, with matching fixture-clock advancement and response release. The timeout scenario advances the fixture clock through the explicit 12-second observation deadline and checks that busy state clears in every engine. Screenshots alone do not establish absence of a transient flash.

Baselines live under `tests/visual/baselines/darwin/<engine>`. Comparison uses threshold 0.1 and zero permitted differing pixels. Initial images and later intended changes require visual review; `npm run ui:baselines` is a maintainer action, never part of CI. Font or renderer changes require a new reviewed environment baseline, not a higher tolerance. Local reference environment: macOS 15.4.1 arm64, Node 22.20.0. The run records actual environment in `test-results/visual-environment.json`.

The checked-in `.github/workflows/visual-ui.yml` performs source/brand checks, all three consumers' unit/type/build checks, isolated production fixture builds, browser comparisons and axe scans, and uploads reports/traces/diffs. It targets the macOS 15 arm64 label documented in [GitHub’s runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). `tests/visual/environment.json` and the setup guard require the same OS major, CPU architecture, browser revisions and system-font hashes before comparison. Exact OS patch is recorded; any runner renderer differences still fail the zero-pixel comparison. A different font set or platform requires reviewed references. The workflow has not been executed remotely during this task; hosted runner patch/font drift may require a separately reviewed reference. Branch protection has not been changed.

## Evidence and acceptance

The final strict `npm run ui:test` run completed on 2026-09-28 UTC with baseline updates disabled: **618 passed, 306 intentional viewport skips, 0 failures, 0 flaky tests**, in 5.6 minutes. Machine-readable result: `test-results/visual/results.json`; log: `test-results/consolidated-final.log`; browsable report: `playwright-report/index.html`. This successful run supersedes the earlier investigative runs.

| Check | Actual result |
| --- | --- |
| Source-policy and fixture Date compatibility | 10 passed; workspace ownership/inventory checks passed |
| App unit tests | Landing 15 passed / 2 database skips; Web 279 passed / 3 database skips; Launch 190 passed / 6 database skips |
| Typechecks | All three applications and the strict visual harness passed |
| Production builds | All three applications and all three isolated fixture applications passed |
| Asset parity | 23 approved brand artifacts and 6 permanent SVG design previews verified |
| Canonical contrast calculation | 17 text/control pairs passed the applicable 4.5:1 or 3:1 threshold; `test-results/token-contrast.json` |
| Strict browser matrix | 618 passed / 306 planned viewport skips / 0 failed / 0 flaky; all three engines |
| Reviewed reference inventory | 600 PNGs: 459 route/fallback, 18 shared-component, 12 Landing-state, 48 Web-state and 63 Launch-state references |
| Source/document review | Independent shared and cross-app reviews, local design links and `git diff --check` passed |

Database skips require a disposable local PostgreSQL fixture and do not establish hosted persistence. Browser viewport skips are the intentional secondary-engine omission of 320/768/1280 widths; Chromium covers all five required sizes.

Visual review covered full-page composition and 1:1 detail crops: Landing hero/rewards/artwork/FAQ/footer at all five widths; Web season/mint/NFT/claim/docs routes and fallback states; Launch dashboards, mobile drawer, confirmation, every collection-editor tab, expanded season identity/cadence/terms and sequence review. The review corrected issues that automated scans alone missed, including squeezed mobile tab labels and excessive guide-card height. Reviewed baseline changes are intentional token/layout/state corrections; no screenshot masks or relaxed pixel tolerance were used. Earlier failing investigative runs remain under ignored local evidence directories and are superseded only by the final strict result.

Local reports and traces: `test-results/` and `playwright-report/` (ignored generated artifacts). Reviewed reference images: `tests/visual/baselines/`. The automated matrix covers 51 rendered route/fallback targets: 3 Landing, 36 Web/docs, and 12 Launch. Production redirects are mapped to their existing destinations. Production components and supplied state fixtures are exercised; live server repositories, sessions, wallets and service permissions are separate boundaries.

Manual screen-reader operation, browser-chrome zoom to 400%, actual iOS/Android keyboards/touch, physical hybrid hardware, hosted UI and real connected-wallet transactions remain unverified. A bounded attempt opened and closed an owned Chrome fixture tab, but native app control failed with “Sky Computer Use native pipe closed before response”; the available browser API exposed viewport sizing rather than browser-chrome zoom. No browser setting changed. The 320 px viewport and 200% root-text checks are not a substitute for actual browser zoom. OS pickers and supported vendor wallet surfaces retain the documented boundaries. These limits preclude a claim of complete device/accessibility acceptance.


## Requirement disposition

The final strict-run result above is the authority for automated pass/fail status. Manual or hosted boundaries are not promoted to a pass by automation.

| Requirement | Disposition | Local evidence / remaining boundary |
| --- | --- | --- |
| VI-01 | Pass (local) | Approved direction-06 parity and six immutable-style preview artifacts; source review preserves catalog/financial/version semantics; dated docs observation corrected. Live state is not inferred. |
| VI-02 | Pass (local) | One token/control source, typed actions, removed legacy overrides, structural JSX/CSS ownership and route-inventory checks. |
| VI-03 | Pass (local) | Fine/coarse computed geometry in all engines and all consumers; short labels retain 44 px touch width; tap activation and busy geometry checks. |
| VI-04 | Pass (local) | Shared role metrics, app body/caption checks, portal font equality, full route references and text-enlargement checks. |
| VI-05 | Pass (local) | Branded held-pending, error/retry, validation, confirmation, select and boundary fixtures. OS/vendor surfaces remain outside first-party styling. |
| VI-06 | Pass (local) | One composed public footer, exact footer metrics/contrast and touch targets; compact private Launch composition retained. |
| VI-07 | Pass (local) | Hero initial/empty/error/retry/stale/timeout/offline/hidden-visible transitions; NFT pending/error/retry, wallet and Launch read-state fixtures. |
| VI-08 | Pass (local) | CTA and action geometry, duplicate guards, retained drafts, focus restoration and no late offline freshness. |
| VI-09 | Automated pass; manual acceptance unverified | Five primary widths, two secondary-engine widths, breakpoint edges, landscape, 320 px reflow, 200% text and spacing pass where exercised. Actual 400% browser zoom remains **unverified**. |
| VI-10 | Automated pass; manual acceptance unverified | Axe and browser keyboard/focus journeys; shared dialog containment, cancellation and restoration; native WebKit link-navigation path. Manual screen-reader acceptance remains **unverified**. |
| VI-11 | Automated pass; manual acceptance unverified | Contrast scans, canonical control borders, coarse metrics/taps, forced-colors focus and explicit reduced-motion checks. Physical hybrid/mobile input and software-keyboard acceptance remain **unverified**. |
| VI-12 | Pass (local) | Shared icon metrics and asset parity; explicit pause/resume and reduced-motion behavior. Existing catalog/SVG identity retained. |
| VI-13 | Local pass; remote enforcement unverified | Local cross-app component/route/state regressions and checked-in CI configuration. Remote CI execution and repository merge enforcement remain **unverified**. |
| VI-14 | Pass (local) | Commands, route/state inventory, browser/font profile, reviewed references, reports and trace paths are recorded with limits. |

The implementation is locally reviewable; it is not fully accepted against every manual/device/release gate. No hosted configuration, database mutation, wallet signing, deployment, season execution, repository publication or external message was performed.
