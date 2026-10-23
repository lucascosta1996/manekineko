# Rewards community-voting copy

23 October 2026. Scope: Landing `/rewards`, its metadata and existing responsive styles. The user retained community choice and withdrew the proposed winner-count/prize floors. Contract, preparation, local deployment, rehearsal and protocol-test files match their starting state. The previously requested hero animation remains intact.

The page now explains that eligible NFT holders choose published packages of price, supply, winner count and mint duration. The terms become final at the voting deadline. The fixed 60/20/20 allocation remains distinct from those choices. The prize section, catalog summary, process, FAQ and footer identify 1 ETH as an illustration, without a minimum or cap claim. The six-ticket visual is explicitly labeled as an example.

Examples use the existing V12 round arithmetic: 1,000 NFTs at 0.01 ETH with six winners pays 1 ETH each; 2,000 with six pays 2 ETH each; 1,000 with ten pays 0.6 ETH each. These are sellout illustrations, not an assertion that a deployed ballot offers these options. Affiliate copy now states that claims vest after a successful draw. Refund copy reflects the voted mint duration and the existing 72-hour missing-randomness condition.

Source references: `ManekinekoVotingV12.validateTerms`, `ManekinekoRoundV12.prizeAmountForRank`, and `docs/deadline-governance-v12.md`. Existing SVG artwork, shared controls, tokens and disclosure behavior are reused. The example comparison uses a semantic definition list and existing type/spacing/color tokens.

Local verification:

- Landing unit checks: 17 passed, two database-dependent tests skipped across the two suites.
- Landing typecheck, production build and isolated fixture build passed.
- UI source checks (10 tests plus policy), harness typecheck, 55 generated brand assets and diff whitespace passed.
- Landing/resilience browser suite: 72 passed initially, six planned secondary-engine viewport skips; three desktop image comparisons differed only at the intentional summary copy. All three differences were inspected, their references updated, and the three checks passed on rerun. No screenshot tolerance changed.
- Chromium, Firefox and WebKit coverage includes pending/error/retry/stale states, keyboard, axe, coarse input, breakpoints, 200% text, text spacing and the existing motion checks. The prize section was inspected in the local production preview, with a capture at `test-results/rewards-voting-copy.png`.

No deployment, database mutation, frozen-runtime rewrite or chain transaction occurred. The local preview's live collection service remains unavailable and renders the existing recovery state. Real devices, hosted UI and manual screen-reader checks remain unverified.


## Compact shell and treasury wording follow-up

The later October 23 request removes “winning is never guaranteed” and the equivalent FAQ sentence. Rewards now uses a 56 px minimum navbar with 4 px vertical padding and a hamburger below 960 px. The menu includes the launch-list link, retains 44 px link targets, closes on selection/Escape and restores keyboard focus on Escape. The shared `PublicFooter` has an explicit compact density, enabled only on Rewards: two link columns on phones, four columns on desktop, smaller outer spacing and concise legal copy. Existing font, contrast, support-dialog and touch-target contracts remain unchanged.

Current Landing, the Web participant explainer, public docs and the V12 architecture/financial guide call the ordinary 20% allocation the protocol treasury, intended for current infrastructure and future Tincta projects. The FAQ and docs explain that the fixed operator wallet still withdraws and manages it after a successful draw; this wording does not create a spending restriction or new treasury contract. Prize, affiliate, refund and unused affiliate reserve rules are unchanged. Historical audits, technical function names, contracts and frozen rehearsals are preserved.

Verification for this follow-up:

- Landing and Web typechecks and production builds passed; all three isolated visual fixtures built successfully.
- Landing checks: 17 passed, two database-dependent skips. Public-docs checks: four passed. UI source policy/10 tests, harness typecheck, generated-brand parity (55 artifacts) and diff whitespace passed.
- Scoped browser run: 182 passed, 12 planned viewport skips, 12 expected screenshot differences from the shorter header and one macOS WebKit link-tab test mismatch. The header images were reviewed and updated without changing tolerances. The keyboard test now uses macOS WebKit’s Option+Tab link navigation, consistent with the existing Web test convention. All 15 affected checks passed on rerun; no outstanding failures remain in this scope.
- Coverage includes compact navbar/footer at 320/390/768/1280/1440 px, hamburger destination/keyboard/Escape behavior, default shared-footer metrics, Web/Launch shared consumers, all current public guides, participant voting/minting fixtures, axe, coarse pointers, breakpoint reflow, 200% text and the existing asynchronous/motion checks.
- The local production preview was refreshed and inspected. Screenshots: `test-results/rewards-compact-menu.png` and `test-results/rewards-compact-footer.png`. Browser fixtures use intercepted data; no signup or wallet write was submitted.

The local live-collection service still displays its existing unavailable/Refresh state. This follow-up was not deployed and does not establish hosted, live-wallet or physical-device acceptance.


## Navigation in document flow follow-up

The subsequent request replaces the floating Rewards menu and adds the same mobile navigation to the parent landing page. Both routes now use the app-owned `LandingNavigation` composition with shared buttons/icons. Below 960 px, its list expands inside the header and pushes `main` down. The list has 48 px minimum rows, subtle separators, no box shadow or panel border, no scroll lock and no fixed height. The parent page keeps Research/Projects/Upcoming; Rewards keeps its existing destinations and launch-list action. Desktop navigation remains horizontal. The design contract is recorded in `visual-identity.md`.

Escape restores focus, selecting a destination closes the menu, and switching to desktop closes it without leaving focus on a hidden control. Chromium may clear focus to the document body before delivering its media-query event; the component handles that case when an open menu closes.

Local verification: Landing typecheck/production build, isolated fixture build, UI source checks, harness typecheck and whitespace checks passed. Landing unit checks passed 17 tests with two database-dependent skips. The scoped three-engine browser run passed 126 checks with 38 planned secondary-viewport skips and identified the Chromium resize-focus issue. After the fix, all six affected navigation interaction tests passed across Chromium, Firefox and WebKit. Existing Rewards screenshots matched without baseline updates. Coverage includes in-flow geometry at 320/390/768/959/960/961/1440 px, both pages, anchor selection, keyboard/Escape, resizing, 200% text, forced colors, accessibility, parent page navigation, announcement first-paint/retry states and hero motion.

Both menus were inspected in the refreshed local production preview. Captures are `test-results/rewards-navigation-in-flow.png` and `test-results/parent-navigation-in-flow.png`. No deployment or external write was made; real devices and manual screen readers remain unverified.


## Shared launch list and Open app follow-up

The parent page now includes the shared signup form, a header action and a footer anchor. The hosted parent (`LANDING_SITE_ROLE=studio`) sends credential-free JSON directly to the Rewards newsletter API; the parent project needs no database secrets. Exact parent-origin preflight/response headers permit that request while preserving private storage, duplicate handling, bounded input and the durable network quota. Rewards accepts its public domain even when the older preview origin remains configured. Its desktop header and mobile menu expose **Open app** at `https://app.tincta.xyz`; the launch list remains in the mobile menu and footer.

Local production previews require `NEWSLETTER_ALLOW_LOCAL_PREVIEW=1`. Next's internal localhost normalization is accepted only for loopback callers matching the actual Host and port; hosted requests still require Vercel network attribution. This was verified against the built HTTP endpoint, not only a constructed Request object.

Verification on 2026-10-23:

- Landing: 23 tests passed, including restricted database integration, plus the setup script's isolated PostgreSQL 17 test (no skips). Production build, app and harness typechecks, ten UI source tests, source policy and whitespace checks passed.
- A disposable PostgreSQL 17 container and the actual built `/api/newsletter` route verified normalized persistence, duplicate idempotency, and five attempts followed by a 429 response. The container was removed. No test subscribers were added to Neon.
- Four browser files (`newsletter`, `studio`, `landing-navigation`, `landing`) ran 201 scenarios: 145 initially passed, 50 planned secondary-engine viewport scenarios skipped, and six desktop image comparisons identified the intended header CTA change. Their differences were reviewed and the six checks passed against updated references. No screenshot comparison threshold changed. Coverage includes both forms' pending/error/429/retry/success behavior, retained drafts, duplicate-submit protection, stable geometry, axe checks, mobile/desktop links, navigation, enlarged text and first-paint recovery.
- Main-page form inspected in the local production preview: `test-results/tincta-main-waitlist.png`.

At verification time the existing Neon database refused even a read-only connection with quota error 53000. The user elected to restore its quota. The live database connection and live signup persistence therefore remain unverified. No deployment occurred; release the Rewards handler before the parent form. Actual mobile devices and manual screen-reader review remain unverified.


## Public allocation reminder follow-up

The live `app.tincta.xyz` home page was read on 2026-10-23 and still contained “20% operator”; its prior local treasury changes had not been deployed. The shared public explainer now explicitly says: “The 20% protocol treasury allocation covers current infrastructure costs and funds upcoming Tincta projects.” Landing and public docs use matching purpose wording, retaining the explanation of who withdraws/manages the funds and the absence of an onchain spending restriction. No contract allocation changed.

Web and Landing production builds passed. Four docs checks and six existing public voting-view browser checks at 390/1440 across Chromium, Firefox and WebKit passed. The actual local Web production page was inspected and captured at `test-results/rewards-treasury-explanation.png`. Public participant source no longer uses “20% operator” as the allocation label. Historical technical records and operator tooling retain their contract terminology. Hosted publication remains pending.
