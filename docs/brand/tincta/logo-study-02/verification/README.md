# Local study verification

21 October 2026 · Design-study scope only

## Checks completed

- `node docs/brand/tincta/logo-study-02/generate.mjs`: generated the concept SVGs, native-size PNGs, four proposal boards and standalone HTML successfully.
- `node docs/brand/tincta/logo-study-02/verify.mjs`: passed in Chromium 145.0.7632.6 on macOS, device pixel ratio 1, en-US, Asia/Shanghai timezone. See [browser-check.json](browser-check.json).
- At 320, 390, 768, 1280 and 1440 CSS px: no page-level horizontal overflow and no broken board images.
- All three directions: selection changes the displayed geometry and text; dark/light controls change the actual surface and pressed state; the Rewards control adds and removes the label.
- Glyph-size control: a requested 16 px SVG rendered at 16 × 16 CSS px. The 16–32 px samples select their provisional optical drawing.
- Inspect buttons: update the direction, move to the inspector and focus the native select. Keyboard typeahead and Tab were verified. Native operating-system popup arrow navigation was not established by the headless automation and is not claimed.
- Automated axe scans: no violations in the tested light desktop and dark mobile states. This is not a complete accessibility certification or manual screen-reader review.
- Expanded research matrix: all 30 rows available, with table scrolling contained on mobile.
- Enlarged paragraph/description letter and word spacing at 320 px: no page-level horizontal overflow. This is a text-spacing check, not a claim of full 200% text enlargement coverage.
- Local image/link references in `index.html`: all targets exist.
- Manual image review: directions, typography, applications, current/proposed silhouettes, reference field, desktop direction comparison and mobile dark inspector. Corrected a misplaced Rewards outline on the lettering board and balanced the exported symbol/wordmark proportions before delivery.
- `node scripts/generate-tincta-brand.mjs --check`: all 23 existing production artifacts still match approved direction 06.
- `git diff --check`: no tracked diff whitespace errors. The study is a new untracked directory; source files were also checked directly for trailing whitespace.

## Evidence

- [Desktop directions](directions-1440.png)
- [Mobile directions](directions-390.png)
- [Mobile dark inspector](inspector-390-dark.png)
- [Full desktop study](study-1440.png)
- [Full mobile study](study-390.png)

The official-site research captures contain their own access limits. Bybit and Mastercard did not yield a usable local site capture; Curve remained blank/faded; Tether's homepage capture was blank and its official media guide was used instead. Coinbase's press page presented a challenge, so its official design-system wordmark was inspected. These are source-access limits, not successful visual reviews.

## Not established by this work

No production UI migration, application build, remote CI run, hosted deployment, authenticated product review, connected wallet, physical-device acceptance, database change or chain operation occurred. No human recognition study or trademark clearance was performed. The three identities remain exploratory proposals; small and reversed drawings still need final optical review after direction selection.

The study preview is served locally on port 8126 for review. Its complete files are also usable directly from the study directory.
