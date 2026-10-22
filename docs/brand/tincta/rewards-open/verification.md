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
