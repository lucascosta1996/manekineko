# Visual-system adoption audit

**Implementation follow-up:** The local source migration and browser/CI harness are recorded in [the implementation and verification record](implementation-2026-09-28.md). The findings below preserve the initial source evidence; they are not a claim that the former defects remain unchanged. Read the follow-up for actual results and open verification boundaries.

## Current local implementation status

The requested implementation now exists across all three consumers. The final strict browser run passed 618 checks with 306 planned secondary-engine viewport skips and no failures; all three app typechecks and production builds passed. The initial findings below are retained as history, with final commands and results in the [verification record](implementation-2026-09-28.md).

| Initial gap | Current treatment and evidence |
| --- | --- |
| Initial Refresh and lost observation | Explicit pending/empty/error/retry/stale state machine; delayed first-paint traces, duplicate guards, offline/visibility recovery and stable CTA checks |
| Divergent controls, fonts and compact overrides | Canonical shared tokens and typed controls; conflicting Web/Launch compact sheets removed; source ownership checks and three-engine computed metrics |
| Footer hierarchy and duplicate copyright | One public composition, canonical 13/20 and 12/18 roles, 16 px icons; private Launch footer retained |
| Newsletter validation and shifting actions | Inline validation, associated feedback, retained input and reserved busy/success labels; intercepted submission tests |
| Native confirmations and incomplete fields | Shared accessible confirmation, field, choice and disclosure contracts; cancellation, focus and intercepted action tests |
| Missing repeatable visual verification | Isolated production-component fixture apps, route/state screenshots, axe, component contracts, package scripts and checked-in CI workflow |

Local automation does not establish remote CI enforcement, live auth/wallet behavior, screen-reader acceptance or physical device behavior. Those boundaries remain open in the verification record. No deployment or operational action is part of this migration.

## Initial source audit (historical)

2026-09-28 UTC · Read-only source review of the local worktree before the new design documentation. This is not a browser reproduction, comprehensive accessibility audit or hosted-state check. Line numbers may move; the linked files and named selectors/components are the source anchors.

## Existing foundations

- Approved Tincta direction 06 has canonical [geometry](../brand/tincta/identity/geometry.json), generated app assets and a [parity command](../../scripts/generate-tincta-brand.mjs).
- [The UI package](../../packages/ui/package.json) exports icons, select, dialog primitives, footer, links and styles. It currently has no typed shared Button/LinkButton/IconButton family.
- [Shared styles](../../packages/ui/src/styles.css) already define near-black ink, muted text, a neutral surface, 3 px corners, 15 px body text, 14 px controls and compact headings.
- [Shared icons](../../packages/ui/src/icons.tsx) use Lucide, 18 px geometry and 1.6 stroke; [Select](../../packages/ui/src/select.tsx) and [Dialog](../../packages/ui/src/dialog.tsx) use Radix primitives.
- App scripts provide Node tests, typechecks and builds. No visual screenshot/accessibility harness or corresponding package script was found in the inspected app/shared-package inventory. Recheck the repository before implementing the pipeline.

## Confirmed source findings and required follow-up

| Finding | Evidence | Required treatment / proof |
| --- | --- | --- |
| Hero Refresh appears in initial pending | [LiveCollection](../../apps/landing-page/components/live-collection.tsx), initial `collection = null`, “Checking collection status…” and unconditional Refresh in the null branch; mounted in [Landing hero](../../apps/landing-page/app/landing-experience.tsx) | Distinct pending/empty/error states; no retry during first request; run the explicit [hero scenario](quality-gates.md#8-mandatory-hero-refresh-regression-scenario) |
| Refresh can retain UA button styling | [Landing globals](../../apps/landing-page/app/globals.css), `.text-link` defines layout/type but not button background/border/padding; shared global rules do not fully reset those properties | A complete shared text-action/button style in every branch; browser computed-style and first-frame evidence required |
| A failed poll discards the previous collection | `LiveCollection` catch calls `setCollection(null)` and clears the observation anchor | Decide safe, clearly labeled last-known display versus designed unavailable state; preserve freshness and transaction safety; test success → failed refresh |
| Equivalent buttons have different geometry | [Shared `.ui-button`](../../packages/ui/src/styles.css): 8×14 px padding, gap 8, min-height 36; [Web `.primary-button`](../../apps/web/app/globals.css): 17×21, gap 20, space-between; [Launch `.launch-button`](../../apps/launch/app/launch.css): 11×17, gap 16; [Landing `.button`](../../apps/landing-page/app/globals.css): 18×25, gap 25, min-height 54 before overrides | Implement one typed family and migrate consumers; compare actual final values, not only declarations |
| Global overrides conceal inconsistency | Shared styles enforce font/radius using `!important` and class-name substring matching; later app `compact.css` files redefine many controls | Consolidate ownership, remove obsolete overrides and introduce meaningful source/metric regression checks |
| Touch rules can be overridden later | Shared coarse-pointer rules set 44 px controls / 16 px inputs; `Launch compact styles` (subsequently removed) later set `.launch-button` min-height 36 and `.launch-field input/textarea` font-size 14 | Verify final computed metrics on touch/hybrid input; do not claim mobile compliance from the shared stylesheet alone |
| Font stacks drift between apps and portal | Web/Launch use system sans; Landing body uses Arial/Helvetica; `.ui-select-content` hardcodes Arial | Shared font tokens, inherited by portal surfaces and controls; cross-app and open-select evidence |
| Footer hierarchy is inconsistent | Shared footer links/body 14 px, headings 13 px; Launch footer 12 px; [Landing composition](../../apps/landing-page/app/landing-experience.tsx) includes shared footer and a separate legacy footer with another copyright | One composed footer; explicit 13 px link/body, 12 px heading/legal roles; maintain targets and contrast |
| Generic paragraph rules override specialized copy | [Landing compact styles](../../apps/landing-page/app/compact.css) contain `body .site p:not(...)` forcing 14 px/1.65 | Replace cascade accidents with explicit roles; verify footer, hero support, captions and terms together |
| Old icon selectors miss shared icons | Landing CSS uses `.icon`; shared `Icon` emits `.ui-icon` | Shared icon sizes/variants; remove ineffective local selectors; compare actual SVG geometry |
| Control state width is not specified | [Newsletter](../../apps/landing-page/app/newsletter-signup.tsx) changes “Join the launch list” / “Joining…” / “You’re in” without a stable button-width contract | Stable layout across labels and feedback; retain input on error; measure during transitions |
| Browser validation bubbles remain possible | Newsletter retains required email input with native form validation | Implement accessible inline validation before suppressing bubbles; preserve semantic input and server validation |
| App-owned native confirmations remain | `window.confirm` in [Launch console](../../apps/launch/components/launch/launch-console.tsx), [automation console](../../apps/launch/components/automations/automation-console.tsx) and settings flows | Shared accessible confirmations with preserved cancellation/action boundaries; visual QA uses intercepted writes |
| Styled native-input coverage needs review | Launch uses color, datetime and checkbox controls | Branded in-page triggers/fields, accessible behavior and documented OS-picker boundaries; inspect actual browser rendering |

The exact duration and visual appearance of the reported hero flash have not been measured here. The source establishes that Refresh is rendered before the initial fetch resolves and identifies incomplete button styling. Live reproduction and regression verification remain implementation work.

## Intentional target decisions introduced by version 1.0

These are specified changes to pursue, not descriptions of current computed output:

- Shared button geometry: 40 px default minimum, 44 px on any coarse pointer; uniform 14/20 text, 18 px icon, 8 px gap, 14 px horizontal padding and 3 px radius.
- One system-sans stack across apps and portals; named typography roles instead of tag-wide overrides.
- Quieter footer: 13/20 links/body, 12/18 headings/legal, 16 px optional icons, one legal/copyright composition.
- Distinct decorative separators versus sufficiently contrasting essential control borders.
- Explicit asynchronous states, stable control geometry, branded recovery and no retry during first-load pending.
- Mandatory state-specific browser evidence, computed-style assertions and a future CI adoption contract.

These values preserve the current compact, neutral identity while replacing contradictory per-app measures. Existing generated logo geometry, artwork colors and immutable NFT images are unchanged.

## Suggested implementation order

1. Establish the shared token contracts and button/text-action family with real production specimens and tests. Add the minimum deterministic browser harness needed to verify them.
2. Migrate hero pending/error/retry and newsletter feedback through the shared family; prove initial-state behavior and recovery.
3. Consolidate the footer, font inheritance, icons, form controls and portal styling; verify all consumers.
4. Replace native app-owned confirmations and migrate remaining controls, with safe interaction fixtures.
5. Cover route/loading/error/empty/authenticated variants, remove legacy overrides, then make the visual jobs required through normal repository governance.

Each step includes its applicable accessibility and regression checks; do not defer accessible behavior until the end. The [reusable prompt](agent-prompt.md) can drive a scoped implementation of any step. This audit itself authorizes no UI migration, hosted operation or protocol change.

## Documentation delivery boundary

The initial documentation task delivered the standard, reusable prompt, acceptance pipeline, source audit and links from agent/documentation entry points. That initial task did not fix the reported Refresh control, migrate buttons/footers, create a browser CI job or certify the apps. The implementation follow-up above supersedes those source gaps. Those distinctions must remain explicit in future handoffs.

Documentation validation: relative file links and source anchors were checked; independent reviews checked numeric contracts, scope and verification claims; proposed text/status/control color pairs were checked mathematically against their specified contrast thresholds; diff/whitespace checks passed. These are document checks, not browser accessibility or UI acceptance. App builds, browser scenarios and hosted operations were not run for this documentation-only change.
