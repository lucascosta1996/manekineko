# Visual quality pipeline and acceptance checklist

Version 1.0 · 2026-09-28 UTC · Companion to the [visual identity standard](visual-identity.md).

**Current enforcement status:** local source implementation now includes Playwright component/route/state tests, axe scans, deterministic isolated production fixtures and a checked-in visual CI workflow. See the [implementation record](implementation-2026-09-28.md) for actual executed results and remaining boundaries. The workflow has not been verified on the remote runner and branch protection is unchanged. The [adoption audit](adoption-audit.md) preserves the starting gaps.

## 1. Non-negotiable acceptance rule

All applicable gates must pass for a claim of visual compliance. There is no averaged score that allows an unstyled error button to be offset by an attractive hero. Treat a transient defect as a defect. Mark each check **pass**, **fail**, **unverified**, or **not applicable with reason**.

For a documentation-only task, verify document consistency, links, source references and instruction discoverability; do not run app builds and imply the UI changed. For an implementation task, complete the applicable stages below. A missing harness, unavailable authentication or absent browser engine is unverified coverage, not a passing check.

Do not expand a small change into unrelated app rewrites. Verify unchanged shared contracts around it and record pre-existing defects separately. However, a new component cannot rely on a known broken shared behavior without addressing it or recording a specific unresolved gate. A claim about the entire product requires auditing the entire claimed scope.

## 2. Requirement register

These identifiers link implementation reports and regression scenarios to the normative sections. They are acceptance requirements, not current test names.

| ID | Requirement | Standard section | Passing evidence |
| --- | --- | --- | --- |
| VI-01 | Canonical identity and product truth preserved | 1, 4 | Asset parity, content/source review, version-correct fixtures |
| VI-02 | One token/component source; no new style forks | 3, 5 | Dependency/style review and consumer inventory |
| VI-03 | Equivalent button metrics identical | 6 | Computed metrics and component/consumer screenshots |
| VI-04 | Correct type hierarchy and portal font | 5.2, 8 | Computed font checks and wrap/zoom inspection |
| VI-05 | No accidental UA styling in any owned state | 7 | Control inventory, first-paint/state evidence, validation/dialog tests |
| VI-06 | Small, quiet, readable composed footer | 9 | Footer metrics, contrast, target sizes, no duplicate copyright |
| VI-07 | Pending/empty/error/stale modeled separately | 10 | Deterministic state-transition tests and recordings |
| VI-08 | Stable async geometry and honest actions | 6, 10 | Element measurements before/during/after transitions; focus/activation assertions |
| VI-09 | Responsive layout, alignment and readable overflow | 9, 11 | Viewport/breakpoint/zoom evidence |
| VI-10 | Accessible semantics, keyboard and focus | 6–8, 11 | Automated scan plus manual keyboard/assistive-technology evidence |
| VI-11 | Contrast, target size and resilient user preferences | 5, 11 | Measured contrast/targets, reduced motion/forced colors/text-spacing checks |
| VI-12 | Reusable assets/icons and restrained motion | 4, 6, 11 | Icon metrics, asset checks and motion inspection |
| VI-13 | Cross-app regression coverage | 3, 12 | Affected-consumer matrix and results |
| VI-14 | Truthful, reproducible acceptance record | 12 | Report with scope, versions, fixtures, commands and artifact paths |

## 3. Stage A — inventory and baseline

Before implementation:

1. Record task scope, affected apps/routes, components and data dependencies. Include layout/error/loading/not-found boundaries, portal content, mobile menus and authenticated pages.
2. Read the visual standard, applicable agent instructions and existing design-system source. List which tokens/components exist and which require implementation.
3. Build a route × state inventory. Start with all changed routes and every consumer of changed primitives. A route with a different shell or override is a separate consumer.
4. Capture the existing defect when possible. If only source evidence is available, label it source evidence. Do not claim a reproduced browser problem without opening that state.
5. Record the intended differences and exact acceptance requirements. A baseline containing a known defect is not an approved reference.

Required reusable specimens for initial system adoption: typography roles; every button variant/state and icon-only action; input/textarea/select and validation; checkbox/radio/switch; date/file/color trigger; tabs; menu; dialog/drawer; accordion; badge; card; table; spinner/skeleton; feedback; header; footer. Specimens must import production components, not a lookalike CSS demonstration.

Create a deterministic fixture route or component explorer appropriate to the repository. Keep private fixtures out of public production routes. Storybook is optional; a tested fixture page is sufficient. Add a route manifest so later agents know which consumers to verify.

## 4. Stage B — source and contract checks

MUST check:

- Canonical shared imports and generated-asset parity. No duplicate button implementations for app-specific names.
- No new literal colors, type sizes, radii or spacing outside authored tokens, approved component calculations, source artwork or a documented exception.
- No new blanket `!important`, class-name substring styling, app CSS overriding component internals, or unrelated paragraph selectors controlling footers/captions.
- Every first-party interactive element maps to a documented component/contract. Raw semantic HTML is acceptable inside a shared primitive; raw unstyled route-level controls are not.
- No first-party `window.alert`, `window.confirm` or `window.prompt` in the migrated scope. The replacement preserves cancellation and side-effect guards.
- No fabricated links, empty links, default-looking fallback buttons, unhandled image fallbacks or unsupported vendor shadow-DOM patches.
- Explicit state model and duplicate-request handling. A single null branch must not conflate loading, empty and error.
- Text, network, identity and financial semantics remain unchanged unless the task explicitly changes them.

An automated source rule should understand JSX/CSS structure and produce a file/rule diagnostic. Grep can help discovery but cannot establish that a control has correct final styles. A narrow baseline allowlist may track existing violations during migration; each item needs owner/scope/removal criteria and cannot silently permit new violations.

## 5. Stage C — functional and build checks

Existing commands verified in the repository scripts at adoption time:

| Scope | Commands |
| --- | --- |
| Landing | `npm run landing:test`; `npm run typecheck --workspace @manekineko/landing-page`; `npm run build:landing` |
| Web | `npm run web:test`; `npm run typecheck --workspace @manekineko/web`; `npm run build:web` |
| Launch | `npm run launch:test`; `npm run typecheck --workspace @manekineko/launch`; `npm run build:launch` |
| All shared UI consumers | All three rows above |
| Brand derivatives | `node scripts/generate-tincta-brand.mjs --check` |
| Landing artwork derivatives, when affected | `node --import tsx scripts/generate-landing-artwork.mjs --check` |
| Diff hygiene | `git diff --check` |

Inspect current scripts before execution; names may evolve. The implemented browser commands are `npm run ui:fixtures:build` and `npm run ui:test`; `npm run ui:source` checks JSX/CSS ownership, fixture-clock behavior and route-inventory drift; `npm run ui:typecheck` validates the harness and configuration. Browser tests include axe scans. See the implementation record for environment and baseline requirements; script existence alone is not passing evidence.

Tests must meaningfully verify behavior: semantic controls, focus handling, validation, pending/empty/error distinctions, retry recovery and prevention of duplicate writes. Do not add tests that merely reproduce CSS declarations or search for a token string and call them visual verification.

Use isolated databases for suites that require persistence. Local `.env` files can target staging; never seed them to populate visual fixtures. Record skipped database-dependent tests separately. A unit test or successful build establishes neither a browser appearance nor a live wallet/database outcome.

## 6. Stage D — computed-style and interaction contracts

At a default root and fixed viewport, compare the browser's computed values with the standard for each variant and state. Repeat under `any-pointer: coarse`, including a hybrid configuration where a fine pointer also exists.

Required properties:

- Font family, size, weight, line height, letter spacing and text transform.
- Minimum and actual height/width, padding on all sides, external margins and display/alignment.
- Icon width/height/stroke, label gap, flex shrinking and vertical centering.
- Border width/style/color, radius, background, text color and focus outline/offset.
- Disabled/busy behavior, accessible name, correct element type and duplicate activation guard.
- Portal typography, viewport collision handling, owner-relative positioning, focus and stacking.
- Footer text roles, 16 px icon variant, link target dimensions and single composed legal region.

Pass criteria:

1. Token-controlled color, weight, family, border, radius and spacing match exactly at their applicable environment/root. Allow at most 0.5 CSS px for browser rounding of geometric/fluid type calculations; it is not permission to choose a different token.
2. With unchanged label/viewport, sibling controls of the same variant have no unexplained height or alignment difference. Different label lengths may produce different widths.
3. A button's pending/success/error box changes by at most 1 CSS px in either dimension at a fixed viewport/font, unless necessary text enlargement/wrapping is the cause and the responsive contract is verified separately.
4. Touch targets meet their specified geometry and do not overlap. A small icon does not imply a small target.
5. Hover/pressed/disabled states do not change border width, padding or line wrapping. Focus is visible and unobscured.

Assert specified minimum sizes as minima, not fixed dimensions, when content wraps or user text sizing changes. Assert the exact token padding/font/icon/radius at the applicable root. Test state stability with a pinned content fixture separately from responsive growth.

Run metrics against rendered production components in real consumers, not just a specimen that omits app styles. This specifically catches later `compact.css` rules overriding shared touch sizes or font settings.

## 7. Stage E — deterministic browser and visual regression

### Environment and fixtures

- Pin browser version, operating system/container image, viewport, device scale factor, locale, timezone and font availability for each screenshot baseline. Record them in the evidence.
- Use deterministic local API fixtures for names, amounts, dates, network, catalog order and long content. Freeze time when comparing countdown screenshots; separately test ticking behavior.
- Wait for actual font/image readiness and the intended state. Use explicit test-controlled response gates, not arbitrary sleep delays or `networkidle` on a continuously polling page.
- Default static comparisons disable nonessential animation. Separately verify motion and reduced-motion behavior; disabling all animation cannot prove motion quality.
- Compare like environments. Different system fonts on macOS, Windows and Linux need separate review/baselines, not ever-increasing image thresholds.
- Save reference, actual and diff images plus a trace/recording for failed transitions. Screenshots of one selected component supplement full-page evidence; they do not hide neighboring regressions.

### Required viewports

| Scenario | CSS viewport | Required coverage |
| --- | --- | --- |
| Narrow phone | 320 × 800 | Reflow, wrapping, header/footer, controls |
| Typical phone | 390 × 844 | Full relevant states, touch, menus, forms |
| Tablet | 768 × 1024 | Columns, navigation transition, portrait composition |
| Desktop | 1280 × 800 | Page rhythm, short viewport, dialog scrolling |
| Wide desktop | 1440 × 900 | Maximum widths, alignment and full states |

Also inspect both sides of every touched breakpoint, including 599/600/601, 759/760/761 and 959/960/961 px when those boundaries apply. Test a 390 × 568 short screen with an open dialog/keyboard-sensitive form and a landscape phone for affected navigation/overlays.

Component contract tests run in Chromium, Firefox and WebKit for supported web UI. Full route screenshot coverage runs at all five sizes in the pinned primary engine; critical changed route/state coverage runs at 390 and 1440 px in the other two engines. If an engine is unavailable, mark that coverage unverified. For mobile releases, add actual Safari/iOS and Chrome/Android review for keyboard, viewport and touch behavior; WebKit/viewport emulation is not device acceptance.

### Required states

- Button: default, hover where supported, pressed, keyboard focus, disabled, busy; selected/toggled where applicable.
- Form: empty, focused, filled, invalid, submitting, success, server failure, retry, long validation copy and autofill-compatible rendering.
- Region: first render, held pending, slow response, populated, confirmed empty, timeout, malformed/unavailable response, retry/recovery, stale observation, offline/reconnect and background refresh.
- Overlay: open, constrained position, long content, Escape/cancel, outside interaction according to modal policy, focus containment and restoration.
- Layout: shortest and longest supported content, unavailable URLs, missing images, expanded FAQ, empty/populated table, authenticated/unauthorized where in scope.

### Diff policy

For a pinned environment, begin with a per-pixel comparison threshold of 0.1 and zero differing pixels beyond that threshold. Calibrate only for demonstrated renderer noise, document the tool's threshold semantics and preserve strict element-metric checks. Threshold changes are reviewed test changes, not an escape from inspecting a diff.

Every meaningful visual difference needs a disposition: intended and reviewed, regression to fix, or a precise documented environment limitation. Do not ignore a small percentage of the full page automatically; a badly styled button can occupy very few pixels.

Do not mask controls, text, statuses, artwork or footers to make tests pass. Freeze dynamic data instead. A narrowly bounded uncontrollable third-party region may use an exception with separate interaction/manual evidence. Never mass-update baselines without reviewing the actual and diff images.

## 8. Mandatory hero refresh regression scenario

This is an acceptance scenario to implement, not an existing passing test.

1. Open the production-rendered Landing route with a cold page cache and intercept `/api/live-collection` before navigation.
2. Hold the initial response until explicitly released. Inspect the first styled paint, pre-response DOM and pending region. Capture representative early and slow frames, including roughly 0.5, 3 and 10 seconds. A trace/video must cover transitions between snapshots; the timestamps alone cannot prove that no flash occurred.
3. Assert no Refresh/Retry action in initial pending, no error wording, no raw/native control appearance, and no main-heading/CTA replacement. Measure the reserved region and hero CTA position.
4. Release a valid published collection fixture. Verify truthful name/state/observation information and the expected CTA hierarchy. Record any layout movement; pending and loaded status-slot geometry should avoid displacing the primary CTA.
5. Repeat with a successful empty response. Show a confirmed empty state, not failure or pending. No pointless retry should compete with the primary CTA.
6. Repeat with request failure, timeout and invalid response. Show a persistent styled error with the shared retry/text-action contract. Click retry once, hold it pending, attempt repeated activation and assert only one active request for that action. Recover successfully.
7. Start with valid data, then fail a poll. Verify the defined last-known state and observation context or a designed unavailable state if retention is unsafe. Never show stale availability as fresh or an unsafe enabled transaction action.
8. Verify offline/online and hidden/visible transitions preserve content/focus and do not create duplicate polls. Timers must not spam screen readers.
9. Repeat relevant cases at 390 and 1440 px, with reduced motion and keyboard navigation. Confirm the footer and navigation remain styled while the API is delayed.

Capture the same state sequence for every new asynchronous region. A screenshot taken after the request resolves cannot pass VI-05, VI-07 or VI-08 by itself.

## 9. Stage F — accessibility and resilience

Use automated accessibility checks on each relevant route/state, including open dialogs and menus. Resolve all applicable detected violations, regardless of severity label. An automated scan is necessary once the harness exists but insufficient for accessibility acceptance.

Manual verification includes:

- Complete the relevant journey using only Tab, Shift+Tab, Enter, Space, arrows and Escape where appropriate. Check focus visibility, logical order, modal containment and return focus.
- Review landmarks/headings, accessible control names, selected/expanded/busy state, field errors and useful live-region feedback with a screen reader on representative changed flows.
- Verify supplemental hover/focus content is dismissible, hoverable and persistent: enter it with the pointer, keep it visible while relevant content is hovered/focused, and dismiss tooltips with Escape without moving focus.
- Measure text and essential non-text contrast, including hover, selected, stale and error states. Check footer text on its actual surface.
- Verify pointer targets and separation at coarse input. Test actual activation, not just a bounding box.
- Test 200% text enlargement and browser zoom to 400%, plus the 320 px reflow view. Apply the standard's text-spacing overrides and confirm nothing essential clips.
- Test `prefers-reduced-motion`, forced colors/high contrast and keyboard focus on artwork/dark backgrounds.
- Test software-keyboard effects, long errors, delayed/failed images, slow API responses, navigation away/back and recovery without losing user-authored input.
- Check console/hydration errors and layout shifts. Attribute pre-existing environment errors rather than concealing them. A missing console error is not visual approval.

Do not automate real transaction signing, destructive confirmation, mailing-list insertion or hosted writes as part of screenshot acceptance. Use local fixtures and intercepted mutations; real end-to-end operations have their own authorization and evidence boundaries.

## 10. Stage G — review and release decision

An agent/reviewer compares screenshots and interactions against the standard, not only against the old page. Review at actual size and enlarged detail. Inspect type rhythm, aligned edges, optical centering, visual hierarchy, breathing room and the footer's relative prominence.

Blocking defects include any applicable failed requirement: UA-styled first-party control; inaccessible or clipped action; inconsistent control metrics; incorrect brand/financial state; absent error/retry styling; broken mobile layout; missing requested visual evidence. “Minor” polish issues in the changed scope are still work to finish, not grounds to assert flawless UI.

The implementation may be source-complete while device/authenticated/hosted coverage is unverified. Report that exact status. Do not label it fully accepted. Updating this document or a screenshot cannot turn missing coverage into a pass.

## 11. CI adoption contract

When implementing automated enforcement, establish these real jobs and map them to actual package scripts:

1. Token/component source-policy and generated-asset checks.
2. Relevant type/unit/interaction checks and production builds.
3. Deterministic local fixtures and production-mode app startup, with readiness checks and owned-process cleanup.
4. Browser component contracts, route/state visual comparisons and automated accessibility scans.
5. Artifact upload for screenshots/diffs/traces and machine-readable result summaries.

Run targeted app checks for app-local changes. Changes to tokens, shared components, identity generators or shell styles trigger all consumer apps. Cache installations/build outputs without reusing stale screenshots from a different commit. A browser job that executes zero expected tests must fail.

Baseline creation/update is an explicit reviewed diff tied to a commit and environment. Configure merge protection through the repository's normal governance when that work is authorized. Until jobs and merge requirements actually exist, describe enforcement as documented/manual, not CI-enforced.

## 12. Evidence template

Copy this into an implementation report or review description. Link usable local artifacts or repository evidence; do not include secrets, private wallet keys or authenticated URLs.

```text
Task / revision:
Visual standard version:
Scope (apps, routes, shared consumers):
Mode (documentation / audit / implementation):
Intended visual changes:

Components / tokens reused or changed:
Legacy overrides removed:
State fixtures and write interception:
Browser / OS / versions / fonts / locale / timezone / DPR:
Viewport and breakpoint coverage:

Checks actually run:
- Command or manual procedure:
- Result and skipped checks:
- Evidence path:

Requirement results:
- VI-xx: pass / fail / unverified / not applicable (reason)

Visual review:
- Before / after / diff paths:
- First-paint and transition evidence:
- Keyboard / screen reader / contrast / zoom / motion evidence:
- Reviewed baseline changes and rationale:

Exceptions or remaining defects (scope, owner, review trigger):
Verification boundaries:
- Local source/build:
- Local browser:
- Authenticated interface:
- Connected wallet:
- Real devices:
- Hosted UI:
- Database/chain operations:

Acceptance: accepted for stated scope / incomplete (open gates)
Reviewer and review date:
```
