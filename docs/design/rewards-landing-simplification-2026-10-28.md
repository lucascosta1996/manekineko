# Rewards landing simplification

2026-10-28 · Scope: Rewards landing, its shared Landing navigation consumer, and the parent navigation regression.

The machine now renders its animated scene without the description, playback controls, storyboard buttons or note beneath it. Playback starts and loops automatically while visible, suspends offscreen and in hidden tabs, and stays on the static winners frame for reduced motion. Returning to ordinary motion restarts the flow. Its accessible scene explanation and immutable example artwork remain intact.

The collection-terms section ends after the season explorer; the bottom season/collection/winner summary and its footnote are removed, together with their unused styles. Navigation replaces How it works with FAQ linking to the questions section, followed by Documentation opening `https://app.tincta.xyz/docs` in a new tab. Desktop and mobile use the same link configuration, with `noopener noreferrer`. Existing shared tokens, buttons, icons, brand assets, footer and data-state components are reused unchanged.

## Local verification

- Visual source policy and its 12 tests, visual harness typecheck, generated-brand parity and diff hygiene passed.
- `npm run check` passed across the repository (tests, typechecks and all five build tasks). Environment-gated database tests retained their existing skips; no hosted fixture data was created. The production Landing fixture also built successfully.
- `UI_APP=landing npx playwright test tests/visual/rewards-machine.spec.ts tests/visual/landing-navigation.spec.ts tests/visual/landing.spec.ts tests/visual/studio.spec.ts`: **130 passed, 38 planned secondary-engine viewport skips**. Chromium, Firefox and WebKit cover automatic claim settlement and looping, hidden/offscreen suspension, reduced-motion changes, unchanged NFT images, 200% text, keyboard navigation, link order/attributes, responsive menus, axe, live-collection pending/empty/error/retry/stale states, newsletter feedback and the parent-page regression.
- Primary widths: 320, 390, 768, 1280 and 1440 px; navigation additionally checks 959/960/961 px. Secondary engines cover phone/desktop and preference/interaction checks.
- Six desktop loaded/stale hero baselines were updated after inspecting every diff: the changes are the requested navigation and removed machine description. The final run passed without snapshot updates. Mobile and parent baselines remain unchanged.
- Reviewed desktop/phone hero, collection-section and navigation images. Evidence is under ignored `test-results/landing-simplification/`; final browser output is `final-browser.log`. The environment record is `test-results/visual-environment.json` (macOS 15.4.1 arm64, Playwright 1.58.2, Chromium 145.0.7632.6, Firefox 146.0.1, WebKit 26.0, system sans, en-US/UTC, DPR 1).

Physical-device and manual screen-reader acceptance remain unverified. Local browser results do not establish hosted deployment or real-wallet behavior. Application deployment is verified separately; this change does not operate a collection or modify protocol rules.
