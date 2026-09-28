# Reusable prompt: strict visual identity and UI quality

Copy the prompt below into a frontend task. In this repository the linked standard is already the Tincta profile. In another repository, replace the paths and use its own approved brand profile; preserve the process and acceptance rigor. Set a specific task scope so the agent does not reinterpret a small feature request as authorization for a complete redesign.

---

You are the senior frontend engineer, UI/UX designer, visual designer and typography reviewer responsible for this work. Treat visual consistency, interaction quality and accessibility as implementation requirements. Be exceptionally exacting. A page that compiles or looks acceptable in its final desktop state is not complete.

**Task:** Implement the Tincta visual identity standard across all three frontend applications and their shared UI package. Resolve the inconsistencies recorded in `docs/design/adoption-audit.md`, discover and fix equivalent defects throughout the in-scope routes, and establish the repeatable verification pipeline required by `docs/design/quality-gates.md`. Preserve the approved brand, existing product behavior, exact requested copy, collection identity, financial meaning and version-specific protocol rules.

Complete the work in this order, verifying each stage before broadening the migration:

1. Consolidate the canonical tokens and implement the missing shared Button, LinkButton, IconButton and text-action contracts in `packages/ui`. Establish production-component specimens and deterministic browser fixtures. Standardize typography, control dimensions, padding, spacing, borders, radii, icons, focus and interaction states.
2. Fix the Landing hero's initial Refresh flash. Separate pending, confirmed empty, error, retry and stale/background-refresh states; keep the first frame branded and the main CTA stable. Fix newsletter validation and pending/success/error geometry without losing entered data or bypassing validation.
3. Migrate equivalent controls across Landing, Web/docs and Launch to the shared contracts. Unify app and portal fonts; remove conflicting legacy and compact-style overrides, ineffective icon selectors and accidental browser-default presentation. Verify final computed styles, including coarse-pointer and hybrid-input rules.
4. Consolidate the public footer into one composition per page, remove duplicate copyright and apply the specified smaller, quieter typography and icons. Apply the same text and interaction standards to Launch's compact operator footer while preserving its private-app composition.
5. Complete the form, menu, select, dialog, drawer, disclosure, feedback, loading, empty and error-state contracts. Replace app-owned native confirmations with accessible shared dialogs while preserving cancellation, confirmation requirements and side-effect guards. Keep semantic HTML and the documented OS/vendor boundaries intact.
6. Audit every in-scope route and shared shell for hierarchy, alignment, responsive behavior, long content, missing assets, keyboard access, focus, contrast, motion and all relevant asynchronous states. Correct remaining deviations from the standard; do not stop after fixing the example hero button or a single representative page.
7. Implement the browser component-contract tests, deterministic screenshot/state regressions, accessibility checks, runnable package scripts and repository CI workflow needed to enforce the documented gates. Cover all consumers of shared changes, including the mandatory hero regression scenario. Review baseline images deliberately and document commands, fixtures and evidence. Remote merge-protection configuration remains a separately authorized repository-administration action.
8. Update the adoption audit and verification record to distinguish completed work, remaining defects and unverified boundaries. Deliver the actual implementation and evidence, not another proposal or a checklist presented as passing tests.

**Mode:** Implement and verify. This prompt is prepared for a local source implementation and cross-app migration, including the missing visual-test harness and checked-in CI configuration. Complete applicable quality gates and report failures or unavailable coverage honestly. Deployment, hosted configuration/data changes, protocol changes, wallet transactions, season execution and external messages are outside this task.

**Applications and routes:** Audit the full route inventory below and migrate every conflicting first-party component or style. Include all variants, shared layouts, navigation, footers, portals and available loading/error/not-found boundaries. Use deterministic fixtures for dynamic routes and authenticated states; verify redirects at their destination instead of inventing new pages.

| Application / shared surface | Routes and required coverage |
| --- | --- |
| `packages/ui` | Tokens/styles; buttons and text actions; icons; form controls; selects and their portals; dialogs/drawers; links; public footer; component specimens. Verify every consuming frontend after shared changes. |
| `apps/landing-page` | `/`: header/mobile navigation, hero and live-collection status, rewards, newsletter, season/color browser, NFT previews, informational sections, FAQs and composed footer. Exercise `/api/live-collection` and newsletter response scenarios through local interception; API business behavior remains unchanged. |
| `apps/web` | `/`, `/seasons`, `/seasons/[chainId]/[seasonId]`, `/mint`, `/mint/[collectionId]`, `/mint/[collectionId]/affiliates`, `/mint/[collectionId]/contract`, `/history`, `/my-nfts`, `/nfts/[collectionId]/[tokenId]`, `/prizes`, `/docs` and `/docs/[slug]`. Include shared public/documentation shells, wallet disconnected/connected/pending/error fixtures, collection lifecycle states, claim feedback, forms, menus and route fallback boundaries. Preserve historical collection behavior and report real connected-wallet coverage separately from fixtures. |
| `apps/launch` | `/`, `/login`, `/dashboard`, `/activity`, `/settings`, `/seasons`, `/launch`, `/automations`, `/active-collection`, `/upcoming-collection` and `/earnings`. Include login and authenticated shells, sidebar/mobile drawer, network controls, draft/configuration editors, accounting/status views, validation, confirmations, pending/error/empty states and the compact operator footer. Intercept mutations during visual tests; do not operate a real season or change saved hosted configuration. |

Reconcile this inventory with the current route tree before starting; include newly discovered first-party pages in these three apps and record the final tested inventory. Indexer, worker services, contracts and unrelated repositories are outside the UI migration scope. Their status may be displayed through existing frontend interfaces without modifying their operational behavior.

**Visual standard:** `docs/design/visual-identity.md`.

**Acceptance pipeline:** `docs/design/quality-gates.md`.

**Known adoption gaps:** `docs/design/adoption-audit.md`.

If a field is omitted, infer it from the user's actual task and state the assumption. An audit or document request does not authorize UI changes. An implementation request authorizes the necessary local implementation and verification; it does not itself authorize deployment, database mutation, wallet transactions or sending messages.

## A. Establish the actual system before editing

1. Read root and applicable app `AGENTS.md` files. Read the standard and quality gates in full. Follow repository-specific framework documentation requirements.
2. Identify the approved brand assets, shared components, token source, font stack, CSS import order, portal roots, route shells and test tools. Reuse the established visual language. Do not invent a second design system or import another project's identity.
3. Inspect the requested area plus representative neighboring pages and equivalent controls in other apps. Trace actual rendered components and final computed styles. Check conflicting legacy selectors and later stylesheets instead of assuming the presence of tokens proves consistency.
4. For Tincta, preserve approved direction-06 geometry, exact season colors/order, permanent artwork, explicit copy, saved terms and protocol semantics. Read architecture/version guides when the presentation depends on chain or financial state.
5. Inventory all visible states: first paint, loading, slow request, loaded, empty, error, timeout, retry, stale data, background refresh, disconnected/unauthorized, disabled and recovery. Include menus, dialogs, validation, footer and error boundaries.
6. Establish a brief acceptance list tied to requirement IDs in the quality gates. If browser evidence or a fixture is missing, name that gap; do not replace it with assumed success.

## B. Apply one precise visual contract

Use the canonical values from the profile. The same role and variant must have identical type, padding, icon dimensions, gap, radius, border and interaction behavior across all apps. Different page purposes may change composition, not the underlying controls.

- Share primary, secondary, ghost, destructive and icon-only buttons through one component family. Navigation uses real links with shared visual variants. Parents own external spacing; controls have zero external margin.
- Use one font stack, explicit typography roles and a deliberate hierarchy. Match line height, weight, tracking and numeral behavior. Do not make unsupported one-pixel adjustments in page CSS.
- Use shared spacing, surface, border, radius, focus and motion tokens. Remove obsolete overrides when migrating. Do not add a blanket `!important` rule or selector matching arbitrary class-name substrings to simulate consistency.
- Use the shared icon family with the specified box/stroke. Center icons optically within their documented slot; fix a genuine repeated optical issue in the shared icon contract, not by scattered transforms.
- All first-party controls and feedback MUST be styled from their first visible frame. No native-looking retry button, default select arrow, default dialog, browser validation bubble, default link treatment or unstyled fallback may appear in app-owned UI.
- Preserve semantic HTML, keyboard behavior, native scrolling, autofill and accessibility. System permission sheets, OS pickers and external wallet surfaces are outside the app's styling boundary; theme supported vendor surfaces and record real limits.
- Keep headers, content and footers on coherent alignment lines. Use responsive composition and intrinsic sizing, not screenshot-specific fixed positions or overflow hiding.
- Make footers visually quieter using the exact smaller footer type roles, restrained icons, subtle separation and one copyright block. Maintain contrast, focus and touch targets. Do not use near-invisible text or duplicate footer systems.

For a missing reusable primitive, implement the smallest complete shared contract, its representative states and meaningful tests, then migrate the in-scope consumers. Do not import a fictional export that the package does not provide. Do not claim entire-repository adoption after migrating only one route.

## C. Treat temporary states as production UI

Never show a retry/refresh action just because data has not arrived yet. Distinguish pending, confirmed empty and error. Keep the main content and CTA hierarchy stable. Provide a branded recovery action only when it is useful and truthful.

Preserve button dimensions and icon slots through busy/success/error transitions. Guard duplicate activation and retain input on failure. Keep focus stable, associate errors with fields, and announce meaningful status once. A spinner without an accessible name or explanation is incomplete.

When retaining last-known data after a failed refresh, label it honestly and suppress actions that require fresh authorization/availability. Do not present unknown amounts as zero, scheduled time as confirmed activation, or estimated/pending funds as paid. Follow the existing product's verified state rules.

When Tincta Landing is in scope, test `/api/live-collection` while held pending, empty, failed, recovered and failing after a successful observation. The initial state must not show a “Refresh” button. Preserve a single dominant hero CTA and keep newsletter capture below rewards. For another project or route, apply the same state discipline to its relevant data regions without adding unrelated endpoint checks.

## D. Inspect the details deliberately

Review every in-scope surface for:

- Misaligned edges/baselines; uneven gutters; inconsistent card padding; irregular vertical rhythm.
- Font-stack drift, oversized supporting text, competing headings, clipped ascenders/descenders, bad wrapping, excessive tracking, crowded line height and unreadable captions.
- Button height/padding/gap differences; stretched or mismatched icons; off-center labels; missing pressed/focus states; layout movement on pending or success.
- Footer text competing with body copy, duplicate legal rows, overly large social icons and prominent support buttons.
- Browser-default chrome during pending, errors, validation, portals or first paint.
- Tiny hit areas, hover-only actions, invisible keyboard focus, clipped rings, inaccessible dialogs and broken tab order.
- Long content, short screens, zoom, reduced motion, coarse input, missing assets, failed network calls and stale-data recovery.

Do not mistake consistency for making everything equally prominent. Use semantic roles to preserve hierarchy, and do not remove useful information to make a screenshot cleaner.

## E. Verify through the full applicable pipeline

Follow `quality-gates.md`. For implementation work:

1. Run the relevant source, type, unit/interaction and production-build checks.
2. Verify actual computed control metrics against canonical values, including portal content and touch-capable layouts.
3. Inspect deterministic component specimens and real consumer routes at the required desktop, tablet and phone sizes, plus breakpoint boundaries.
4. Exercise keyboard, focus, dialog behavior, form validation, accessible names, contrast, reduced motion, forced colors, text enlargement and overflow.
5. Hold and fail API responses to inspect first paint, pending, slow, error, retry and stale transitions. A settled screenshot is insufficient.
6. Compare screenshots against reviewed baselines in the same browser/OS/font environment. Review the differences; never blindly accept updated baselines.
7. Retest every app consuming a changed shared primitive. Record unavailable authenticated, wallet or hosted coverage explicitly.

Use deterministic local fixtures and intercepted writes for visual scenarios. Do not submit real signup records, modify hosted data, sign wallet transactions or change the execution network just to populate a screenshot.

Missing visual automation is a real gap. For an implementation task whose scope includes establishing the pipeline, add the necessary harness and scripts. Otherwise perform the available manual checks, document the gap and do not call the change fully pipeline-compliant. Never invent a test command or mark skipped checks passed.

## F. Deliver a reviewable result

Report:

1. The concrete changes and the inconsistencies they resolve.
2. Shared components/tokens used or changed and the affected consumers.
3. Tests run, their actual results, scenario/viewport coverage and paths to evidence.
4. Any unresolved defects, exceptions and verification boundaries.
5. Whether the requested scope meets every applicable gate; if not, which gates remain open.

Fix in-scope failures before declaring completion. Do not stop after listing obvious problems when implementation was requested. Do not broaden a documentation request into an app rewrite. Do not deploy or claim live behavior without separate authorization and evidence.

Your quality bar is a coherent, calm and deliberate product whose components look and behave as if one meticulous team built them together. Every visible state counts.

---

## Short instruction for future tasks

> Follow `docs/design/visual-identity.md` and `docs/design/quality-gates.md` for this change. Reuse the shared system, preserve the approved brand and product semantics, verify every relevant state including first paint/error/retry, and report actual evidence and remaining gaps. Do not claim visual compliance from a build alone.
