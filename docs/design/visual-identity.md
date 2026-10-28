# Tincta visual identity and component standard

Version 1.1 · 2026-10-27 · Governing specification for UI work.

This document defines the target, not a claim that the current apps meet it. It preserves the approved Tincta identity and resolves inconsistencies in component geometry, typography, states and composition. The [adoption audit](adoption-audit.md) records current source findings; the [quality gates](quality-gates.md) define the required evidence. Use the [agent prompt](agent-prompt.md) to apply this system to a task.

**Acceptance means every applicable requirement passes. “Looks better,” a passing build, or a high average score is insufficient.** A requirement marked MUST is mandatory. A SHOULD may differ only through a documented, narrowly scoped exception. An untested requirement is unverified, never passed.

## 1. Scope and authority

- Apply to `apps/landing-page`, `apps/web` including public documentation, `apps/launch`, and all shared presentation in `packages/ui`.
- Cover headers, footers, authentication, pages, reusable components, portals, menus, dialogs, loading boundaries, error boundaries, 404s, empty results, tooltips, form feedback and every intermediate asynchronous state.
- Indexer and workers have no independent UI. Any first-party interface showing their status follows this standard.
- The same role MUST have the same appearance and behavior across apps. A marketing section and an operator table may have different composition; their equivalent buttons, inputs and dialogs may not acquire separate design systems.
- For other repositories, reuse the prompt and quality process with that project's own identity profile. Do not copy Tincta's logo, palette or NFT rules into unrelated brands. There must be one explicit profile per brand, not one per page.

Authority order: explicit user requirements and repository safety rules; immutable product and protocol truth; this cross-app presentation standard; canonical generated identity geometry; documented component contracts; page composition. Existing CSS is migration evidence, not permission to preserve a defect. This standard supersedes conflicting presentation suggestions in older app-specific design notes, not historical records or protocol behavior.

Preserve exact requested copy, casing, punctuation, catalog names, colors, order, identifiers and financial values. Presentation work MUST NOT change chain selection, contract rules, eligibility, claims, saved terms, frozen exports or historical NFT renderers. Check [architecture](../architecture.md) and [V10 permanent combinations](../permanent-combinations-v10.md) when presenting those concepts.

## 2. Design direction

Tincta is restrained, precise and content-led: a white canvas, near-black typography, quiet neutral framing, geometric artwork and collection colors. Space communicates grouping. Type communicates hierarchy. Controls communicate actions. Motion explains change.

Apple is a reference for consistency, clear hierarchy, feedback, adaptation and care across interaction methods. These principles are described in its [design guidance](https://developer.apple.com/design/), [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) and [design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles). The dimensions, colors and web rules below are Tincta decisions, not values prescribed by Apple. Do not imitate Apple logos, platform chrome, glass effects, capsule controls or proprietary assets.

MUST:

1. Give each page an obvious purpose and each task region one visually dominant action.
2. Use stable alignment, readable type, predictable interaction and deliberate spacing at every supported size.
3. Design the first visible frame and every transition with the same care as the final populated screen.
4. Make failure and recovery understandable without exposing stack traces or implementation jargon.
5. Prefer existing shared primitives and remove conflicting styles when migrating them.

MUST NOT:

- Introduce arbitrary radii, colors, type sizes or spacing to make a single page “special.”
- Use weak contrast, tiny text or hidden controls to achieve a quiet appearance.
- Add decorative badges, gradients, shadows, cards or animation without an information or interaction purpose.
- Make every heading, metric and button compete for attention.
- Change factual meaning to fit a layout, hide financial qualifications, or present unknown data as zero.

## 3. One authored system

`packages/ui` owns tokens, typed Button/LinkButton/IconButton/TextAction controls, forms, selects, dialogs, disclosures, icons and the public footer. Production-component browser fixtures and the local verification pipeline exist; remote execution and device acceptance require separate evidence.

The implementation MUST have one authored token source in `packages/ui`; app themes consume it. Generated platform artifacts may be copied where builds require them, but copies need a parity check. Do not maintain three hand-edited token sets.

Required layers:

1. **Foundation tokens:** color, type, spacing, border, radius, motion, elevation and stacking.
2. **Semantic component tokens:** button metrics, input metrics, footer type and state colors.
3. **Shared components:** behavior, semantics, states and token consumption.
4. **Page layouts:** width, grid, grouping and responsive composition only.

App CSS MUST NOT override shared component padding, font, radius, icon geometry or state colors. A component change belongs in the shared implementation and its specimens. Do not standardize through class-name substring selectors, blanket `!important`, deeply nested specificity, repeated appended overrides, or broad paragraph rules that swallow captions and footer text.

A staged migration may keep a legacy class adapter temporarily. It must delegate to the same contract, have a recorded removal scope and introduce no new consumers. Use a complete component stylesheet available with the first render; do not wait for a client effect to apply the design system. Portal roots must receive the same tokens and font stack.

## 4. Identity assets and artwork

The approved logo is **C — Ligature**, selected on 2026-10-21. Follow the [canonical identity guide](../brand/tincta/identity/README.md).

- Use the generated uppercase outlined wordmark, its `3947 × 780` view box and natural aspect ratio. Never recreate it as text, stretch it, add a period, add a second name, or revive an older mark in app chrome.
- Use the compact `TC` ligature only in established small brand and favicon roles. Preserve canonical favicon geometry and its dark tile.
- Launch Rewards artwork is **Open**, approved 2026-10-22. Rewards Landing and Web headers use TC + REWARDS; the Rewards landing hero uses the approved Rewards machine. See the scoped overrides below. Use its [canonical vector master](../brand/tincta/rewards-open/README.md) through the shared `RewardsArtwork` component. The Rewards lockup places a 20 px Open symbol before the Ligature wordmark with 8 px clear space, retaining an 8 px gap to the quiet Rewards label. Parent chrome and browser icons retain Ligature. Open keeps its fixed warm palette and orientation; it does not cycle through collection colors.
- Header wordmark width: 72 px on desktop, 64 px in the mobile shell. Every footer uses only the canonical 28 px TC glyph, with no wordmark, Open artwork or Rewards badge. Height is automatic. Reserve at least 12 px exterior clear space around the lockup, within a larger accessible link target; internal gaps use 8 px.
- Static brand assets retain their canonical ink `#111111`; UI text uses the ink token below. Inline wordmarks inherit the intended surface foreground. This is a documented brand-asset distinction, not an invitation to add more grays.
- A home link has the accessible name “Tincta home”; a decorative SVG inside it does not repeat that name.
- Preserve `seasons.json` ordering and exact hex colors, stable season identity and canonical geometric artwork. Collection colors are content, not arbitrary UI status colors.
- Existing tokens display their real historical artwork. V10 permanent artwork never gains score, prize, rank or changing lifecycle overlays inside its immutable image; current results belong in adjacent UI.
- Landing artwork remains SVG. Reserve its intrinsic aspect ratio before load and provide a designed failure fallback. Do not show a broken-image glyph or substitute remote stock artwork.

Edit the authored geometry and regenerate derivatives; never patch generated copies individually. Verification: `node scripts/generate-tincta-brand.mjs --check`.

## 5. Foundation tokens

Tables give target values at a default 16 px root. Implement text and scalable dimensions in `rem`, with the equivalents below, and keep browser/user text scaling enabled. One CSS px hairlines may remain px. Do not force the root to 10 px or disable zoom.

Use `box-sizing: border-box` for components and their pseudo-elements. All minimum sizes and geometry calculations below include padding and borders. Generic **mobile** token values apply below 600 CSS px; generic **desktop** values apply at 600 px and above unless a table states otherwise. Navigation and sidebar collapse boundaries are independent layout decisions.

### 5.1 Color and contrast

| Semantic token | Value | Use |
| --- | --- | --- |
| `color.canvas` | `#ffffff` | Page and control canvas |
| `color.surface` | `#fafafa` | Quiet grouped surfaces |
| `color.surface-hover` | `#f0f0f0` | Hover on light controls |
| `color.surface-pressed` | `#e8e8e8` | Pressed or selected neutral surface |
| `color.ink` | `#171717` | Main text, primary control fill |
| `color.muted` | `#666666` | Secondary text, captions, footer |
| `color.line` | `#e4e4e4` | Decorative separators only |
| `color.control-border` | `#767676` | Boundaries needed to identify an input/control |
| `color.on-ink` | `#ffffff` | Text/icons on dark controls |
| `color.focus` | `#555555` | Focus outline for ordinary navigation links and disclosures |
| `color.success` / `color.success-bg` | `#166534` / `#f0fdf4` | Confirmed success feedback |
| `color.warning` / `color.warning-bg` | `#854d0e` / `#fffbeb` | Actionable caution |
| `color.danger` / `color.danger-bg` | `#b42318` / `#fff4f2` | Validation errors/destructive actions |

Normal text, including footer and placeholder text, MUST reach 4.5:1 against its actual background. Large text may use 3:1 only at the WCAG large-text threshold: at least 24 CSS px regular or about 18.67 CSS px bold. Essential control boundaries, state indicators and meaningful icons require 3:1 against adjacent colors. Thin decorative separators may be quieter only when they carry no necessary information. Measure actual composited colors, including opacity and overlays. See [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Communicate errors, success, selection and network identity with text or shape as well as color. Disabled controls use explicit tokens, not whole-element opacity that also fades explanations. In forced-colors mode, permit system colors and keep boundaries/focus recognizable. Tincta v1 is a light interface; a dark mode requires a complete separately tested semantic palette, not browser auto-inversion.

### 5.2 Typography

Sans: `-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`.

Mono: `"SFMono-Regular", Consolas, "Liberation Mono", monospace`.

Use the same stack in all apps, portals, inputs and overlays. No remote font request is needed. Different operating systems may choose different installed fonts; consistency is measured within a pinned environment, with separate cross-platform inspection. Do not claim pixel-identical typography across operating systems.

| Role | Size | Line height | Weight | Tracking |
| --- | --- | --- | --- | --- |
| `type.hero` | `clamp(1.5rem, 2.5vw, 1.75rem)` = 24–28 px | 1.12 | 500 | -0.035em |
| `type.page` | `clamp(1.25rem, 2vw, 1.5rem)` = 20–24 px | 1.15 | 500 | -0.035em |
| `type.marketing-section` | `clamp(1.125rem, 2vw, 1.375rem)` = 18–22 px | 1.2 | 500 | -0.025em |
| `type.section` | 18 px | 1.25 | 500 | -0.025em |
| `type.subheading` | 16 px | 1.35 | 500 | -0.01em |
| `type.body` | 14 px | 22 px | 400 | 0 |
| `type.control` | 13 px | 18 px | 500 | 0 |
| `type.label` | 12 px | 18 px | 500 | 0 |
| `type.caption` | 12 px | 18 px | 400 | 0 |
| `type.footer` | 12 px | 18 px | 400 | 0 |
| `type.footer-heading` | 12 px | 18 px | 600 | 0 |
| `type.footer-legal` | 12 px | 18 px | 400 | 0 |

Compact scale, user-directed on 2026-10-24: these values replace the earlier large marketing and product scales in every app, including Launch and parent Landing. There is no universal smallest industry font. The 14 px reading base is informed by [Carbon’s productive type set](https://www.carbondesignsystem.com/building-blocks/foundations/typography/type-sets); the exact sizes here are Tincta decisions. Preserve 200% text reflow and contrast. Do not reduce essential text below body size. Controls have a 32 px default target and 44 px coarse-pointer target, exceeding the [WCAG 2.2 minimum target-size criterion](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum). Coarse-pointer inputs keep 16 px text to avoid browser focus zoom.

- Use one semantic `h1` per page and an ordered heading structure. Visual size is a named role, not dictated by the HTML tag alone.
- Readable article text has a maximum measure of 68ch. Hero support text has a maximum measure of 55ch; hero headings use 22ch. Adjust wrapping through layout, not arbitrary text compression.
- Body content, errors and explanations MUST NOT be reduced to caption size just to fit a card. Required transaction costs and material terms remain body or label size in their relevant task region.
- No app-owned informational text below 12 px at the default root. Immutable NFT image typography is outside this rule; provide relevant accessible information beside the image.
- Buttons use sentence case, exact product terminology and no letter spacing. Do not add uppercase labels as decoration. Preserve explicit user-provided copy.
- Use tabular numerals for changing counters, aligned amounts and comparison tables. Mono is for addresses, hashes and technical identifiers, not an entire page of prose.
- Long addresses/hashes may use controlled wrapping or a shortened display with an accessible full value and copy action. Never truncate amounts, claim status, error explanations or the only accessible name.
- Prefer natural line wrapping. Avoid hard-coded `<br>` elements solely to match one screenshot. Check long labels, translated content where supported and 200% text enlargement.

### 5.3 Spacing, shape and elevation

Spacing scale: **0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 px**. Use tokens. The exact button/input padding below is an intentional component calculation, not a new general spacing scale.

| Relationship | Target |
| --- | --- |
| Icon and label | 8 px |
| Label and field | 8 px |
| Field and helper/error | 4 px |
| Related actions | 12 px |
| Form groups | 24 px |
| Card padding | 20 px desktop; 16 px mobile |
| Page title and content | 24 px |
| Product sections | 24–32 px mobile; 32–48 px desktop |
| Major public sections | 48 px per side mobile; 80 px per side desktop |
| Content to footer separator | At least 64 px mobile; 96 px desktop, including compact footers |
| Paragraphs in prose | 16 px |

- Base control, card, menu and dialog radius: **3 px**. Circular swatches, circular status dots and intrinsic artwork circles are shape roles, not button radius exceptions.
- Border width: **1 px**, reserved in every state so hover/focus/selection does not change geometry.
- Flat pages and cards have no default shadow. Overlay menu: `0 12px 36px rgb(0 0 0 / 0.12)`; dialog: `0 20px 80px rgb(0 0 0 / 0.12)`; dialog backdrop: `rgb(0 0 0 / 0.33)`.
- Stacking roles: base 0, sticky shell 50, popover 100, modal backdrop 150, modal 160, modal-owned popup 170, toast 180, tooltip 190. A popup must belong to the active dialog's focus/interaction scope; z-index alone is insufficient.
- Controls carry **zero external margin**. Their parent owns gap and spacing. Do not hide negative margins or per-icon transforms inside unrelated page selectors.

## 6. Button, link and icon contracts

Apple's [button guidance](https://developer.apple.com/design/human-interface-guidelines/buttons) informs recognizable actions, pressed feedback and coherent grouping. The web measurements here are explicit local choices; Apple points are not CSS-pixel prescriptions.

### 6.1 One button geometry

Primary, secondary, ghost and destructive buttons share these metrics, including buttons that appear only on error or while retrying:

| Property | Fine pointer/default | Any coarse pointer |
| --- | --- | --- |
| Minimum height | 32 px | 44 px |
| Padding block | 6 px | 12 px |
| Padding inline | 12 px | 12 px |
| Border | 1 px, always reserved | Same |
| Text | 13 px / 18 px, weight 500, sans | Same |
| Icon box / stroke | 16 × 16 px / 1.6 | Same |
| Label/icon gap | 8 px | Same |
| Radius | 3 px | Same |
| External margin | 0 | 0 |
| Alignment | inline-flex; centered on both axes | Same |

These yield 32 px = 18 + 2×6 + 2×1 at default text size. Use `min-height`, not a fixed height that clips enlarged/wrapped text. Increase the minimum inline size to 44 px on coarse input. Use `any-pointer: coarse` so touch-capable hybrids are included.

- Primary: ink fill and border, white text. Hover fill `#333333`; pressed fill `#000000`.
- Secondary: white fill, ink text and control-border token. Hover surface-hover; pressed surface-pressed.
- Ghost: transparent fill and transparent reserved border, ink text. Same geometry; neutral hover/pressed surfaces.
- Destructive: danger fill/border, white text; hover `#921f16`, pressed `#7a1a13`. Reserve for genuinely destructive actions, not ordinary errors.
- Disabled: surface-pressed fill, muted text, decorative line border, no hover/pressed change. Put the reason nearby when it is not obvious; do not require hovering a disabled control to discover it.
- Control focus (user-directed update, 2026-10-25): buttons, button-like links and form fields have no added focus outline or shadow ring on click or keyboard focus. Preserve their normal 1 px borders, validation colors and actual checked/selected state. Keyboard focus uses a surface change and underlined action text; checked controls highlight their label. Focused fields use the hover surface. Forced-colors mode uses system Highlight/HighlightText fills. Do not blur controls or change focus behavior to hide a ring. Ordinary navigation links and disclosures retain the 2 px outline with 3 px offset.

Do not create a larger hero button, smaller retry button, different newsletter padding or special wallet-label typography. Full-width is a layout option, not a new type/spacing variant. Action groups wrap or stack with their documented gap. Button labels may wrap only when available width or text enlargement requires it; the icon keeps its size and the target grows.

Icon-only buttons use a 32 × 32 px minimum box with **7 px padding on all sides**, or 44 × 44 px with **13 px on all sides** for coarse input, including the 16 px icon and 1 px border. Their text gap is zero. Do not inherit the text button's 12 px inline padding. Scaled tokens may grow the box; do not clip content to a fixed size. Provide a specific accessible name, such as “Close dialog,” and a tooltip when the action is not self-evident. Do not use a tooltip as the only accessible name.

### 6.2 Semantics and state

- Use a real `<button type="button">` for actions and `<button type="submit">` for form submission. Use an `<a href>` for navigation. A navigation link may use the shared button appearance; it does not gain button keyboard behavior or an invented `disabled` attribute.
- Give every button a specified default, hover, active, focus-visible, disabled and busy state. Selected/toggled controls also expose their actual selection semantics.
- During a request, preserve the control box, show honest pending feedback and prevent duplicate submission. A spinner occupies the same 16 px slot as an icon and does not push the label sideways. Reserve the largest state label's width using layout/content, not arbitrary delays.
- `aria-busy` belongs on the updating control/region. Communicate completion or failure accessibly once; do not replace a label with an unnamed spinner. Keep focus stable. When using `aria-disabled` to preserve focus, block activation in every input path.
- A pressed state changes color or inset treatment, not padding, border width, font weight or position. No scale/bounce on routine controls.

### 6.3 Text actions and icons

An inline text action is a distinct semantic presentation, not an undersized filled button. Use it for secondary inline recovery, copy help or footer support. It uses the surrounding named text role, an explicit transparent background, zero border, inherited font/color and a visible underline or established contextual affordance. Inline sentence links/actions have zero padding and margin, follow text flow and use WCAG's inline exception. Standalone text actions use inline-flex, vertical centering, an 8 px icon gap, zero margin, zero padding and an explicit minimum target of **32 × 32 px** on fine input or **44 × 44 px** on coarse input; start-align list/footer text and center isolated actions. The minimum box supplies vertical space without changing adjacent text alignment. Do not enlarge overlapping hit regions with invisible pseudo-elements.

All routine icons use the shared Lucide `Icon`, `currentColor`, 16 × 16 px and 1.6 stroke. A footer inline icon has an explicit **16 × 16 px** variant; standalone illustrations are separate assets. Do not mix Unicode arrows, emoji, another icon pack or `.icon` selectors that miss `.ui-icon`. Decorative icons are hidden from assistive technology; their parent control supplies the name. Add a semantic icon mapping in the shared source rather than pasting one-off SVG paths into pages.

## 7. No browser-default presentation in first-party UI

**No app-owned interactive or feedback surface may appear with accidental user-agent styling, including for one frame.** “Native” here concerns unstyled presentation, not semantic HTML, accessibility behavior, scrolling or keyboard interaction.

- Every button, input, textarea, select trigger, checkbox, radio, disclosure, file-upload trigger and date/color entry surface needs a complete component style: font, color, fill, border, radius, padding, dimensions and all applicable states.
- Do not rely on UA button bevels, default fonts, blue/purple link defaults, default summary markers, native app-triggered `alert`/`confirm`/`prompt`, or browser validation bubbles as the designed application experience.
- Replace app-owned confirmation flows with the shared accessible dialog contract while preserving the original confirmation requirement, pending lock, cancel behavior and actual action boundary.
- Custom form validation must exist before suppressing native validation bubbles. Retain semantic input types and constraint metadata, implement client and server checks, associate errors, and focus the first invalid field or an accessible summary. Removing `required` or validation is not a styling fix.
- Reset only what the component owns. `appearance: none` without replacing affordances/states is incomplete. Do not use `all: unset` indiscriminately or remove outlines without providing focus-visible styles.
- Browser permission prompts, file choosers, password managers, autofill menus, OS date/color pickers, browser chrome and external wallet apps are system-owned. Keep the in-page trigger branded; do not fake a system security prompt. Native scrolling and assistive technology remain intact.
- Vendor wallet modals are constrained by supported theme APIs. Use the shared font, palette and nearest supported shape, inventory visible differences, and verify them separately. Do not promise exact corners/icons, patch private shadow DOM or use vendor limitations to excuse first-party defects.

## 8. Forms and other component families

| Family | Required visual and behavioral contract |
| --- | --- |
| Input / textarea | 32 px minimum field height, 6 px block / 12 px inline padding, 1 px control border, 3 px radius; 13/18 regular text. Coarse input: minimum 44 px, 16/20 text, 11 px block padding. Textarea grows; never clips content to the single-line height. Visible label, hint and associated error. Placeholder is supplemental, never the label. |
| Select / combobox | Same field metrics and font; shared accessible primitive, same tokens in the portaled list; 8 px icon gap; options at least 32 px high, 44 px on coarse input. Correct keyboard, typeahead, selected/disabled states, scrolling and focus return. A search field is needed only when the option set justifies it. |
| Checkbox / radio / switch | Shared accessible primitive or styled semantic input, visible checked/unchecked/focus/disabled states, clickable label. Indicator may be 18 px; combined target at least 32 px, 44 px coarse. Explain irreversible switches before activation. |
| Date / time / color / file | Branded field and trigger; preserve format/timezone meaning, keyboard editing, validation and a usable platform picker/chooser where appropriate. Do not display an unstyled native swatch/button inside the field. |
| Tabs / segmented controls | One shared geometry, 32 px minimum/44 px coarse, explicit selected state independent of color alone. Use tab semantics only for same-page tab panels; navigation is links with `aria-current`. No pill styling added per page. |
| Dialog / drawer | Shared accessible primitive, title, description when useful, named close control, focus containment, Escape policy, focus restoration and background interaction blocking. 20 px padding; 16 px on mobile. Dialog max-width 440 px for simple confirmations; documented larger content variant 640 px. At least 16 px viewport inset, internal scrolling for short heights and virtual keyboard. |
| Menu / popover / tooltip | Shared tokens, owner-relative placement with collision handling; no clipped content or detached trigger. Correct role and keyboard behavior. Supplemental hover content is hoverable and persistent while its trigger/content is hovered or focused; the pointer can enter it. Tooltip also appears on focus, dismisses with Escape without moving focus, and never contains the only essential instruction. |
| Card | 1 px decorative border only when grouping needs it, 3 px radius, 20/16 px padding, no default shadow. Optional whole-card link cannot contain nested interactive controls; otherwise use separate named links/actions. |
| Table / list | Semantic header/cells, 13/18 compact tabular text, 12/18 header labels, tabular numeric alignment, units retained. 12 px cell padding; interactive rows at least 44 px. Show sorting state. On narrow screens use readable cards or a clearly bounded horizontal table scroller, not clipped columns. |
| Accordion | Styled semantic disclosure or accessible primitive, shared chevron, visible focus, expanded state and generous target. Answer content remains readable and selectable. |
| Badge / status | 12/18 label, 4 px block / 8 px inline padding, text plus optional symbol, 3 px radius. No clickable affordance unless interactive. Never use a colored dot as the sole status. |
| Toast / inline feedback | Use inline persistent errors for recovery or decisions; a toast may supplement completion. Errors do not disappear on a timer. No essential detail conveyed only by animation. Toaster does not steal focus or cover the active control. |
| Skeleton / spinner | Match the real content geometry, one restrained neutral treatment, no fake values. Mark decorative skeletons hidden; expose one useful region status. Reduced motion gets a static skeleton/progress treatment. |

New component families need a contract with anatomy, tokens, state table, semantics, responsive behavior, content limits and evidence before production use. Do not ship an undocumented one-off because no shared component exists yet.

## 9. Page composition and responsive behavior

- Fluid page shells (user-directed update, 2026-10-24): align headers, main sections and footers to the shared `--ui-page-gutter`, `max(1rem, 2.5vw)`, across parent Landing, Rewards, Web/docs/gallery and Launch. This gives desktop content 95% of the viewport without a fixed maximum width, and preserves a 16 px minimum inset on small screens. Apply this gutter once at the outer shell; nested route wrappers must not add another page inset or width cap. Wide grids, tables and documentation diagrams use the available space. Paragraphs retain a 68ch reading measure; centered hero copy, focused wallet forms and dialogs keep their purpose-specific limits. Verify aligned edges and no horizontal page overflow at 320, 390, 768, 1280, 1440, 1920 and 2560 px, including enlarged text. Artwork carousels use the same initial gutter while retaining their own horizontal scroll.
- Public section rhythm (2026-10-27): use `--ui-section-space` on both the top and bottom of each major Landing section: 80 px per side, 48 px below 600 px. Adjacent content blocks therefore have 160/96 px separation without stacked section margins or extra inner-wrapper padding. The app’s primary workspace and gallery use the same outer section spacing. Focused action groups stay centered within their existing 44rem measure (54rem for voting/Genesis); grids and the outer shells retain their fluid width. Give a section its own clear entrance, content and exit. Keep the public primary region at least one viewport tall through loading and recovery, with natural growth on small screens; never clip a form to achieve centering. Closing sections apply this padding to their content below the spectrum strip. Keep product-card and documentation paragraph spacing distinct from marketing section spacing. Rewards hero copy and its primary action are centered above the full-width Rewards machine, with a 32 px gap. The support copy reads “You vote. You mint. You win. The next collection opens.” The scene uses a maximum 75rem measure and reflows into normal vertical flow below a 56.25rem container width, including with enlarged text. Holder rewards is section 06, followed by independently verifiable section 07. Its title, explanation and action share the left column; the calculation heading aligns with the title in the right column. Reuse the following FAQ section’s column proportions and gap so their column edges align.
- Product shell header minimum: 56 px, with 8 px vertical padding and sufficient height to contain targets. Grow at zoom; no fixed header height that clips text. Launch desktop sidebar: 224 px, main padding 32 px; collapse to an accessible drawer when its content no longer fits. Adopt 960 px as the default sidebar collapse boundary and verify adjacent widths.
- Landing compact-shell exception (2026-10-23), shared by parent `/` and `/rewards`: use 4 px header padding, a 56 px minimum height and 44 px brand targets. Both use `LandingNavigation` and collapse below 960 px. The hamburger reveals a full-width navigation list in normal document flow, expanding the header and pushing the main content down. Use 48 px minimum link rows, 16 px body type, subtle line-token separators and the existing arrow icons. No floating panel, shadow, fixed height, overlay, scroll lock or focus trap. Rewards keeps its launch-list action as the final row; parent retains Research/Projects/Upcoming. Links wrap and the document scrolls normally on short screens or enlarged text. The closed list is hidden; the trigger exposes its controlled ID and expanded state. Escape closes and restores trigger focus, selecting a link closes before anchor navigation, and crossing into desktop closes the menu and moves focus out of hidden controls. Desktop links remain horizontal. Verify open/closed layout, keyboard, 959/960/961 px resizing and 200% text on both routes.
- Public navigation collapses at 760 px by default; test 759/760/761 px and long labels. Move the breakpoint centrally if fit evidence requires it, not through route-specific patches.
- A page must work at 320 px without page-level horizontal scrolling. Wide data tables/code can have clearly scoped scrolling; never conceal overflow with `body { overflow-x: hidden }` to hide a defect.
- At mobile sizes, stack logically, preserve reading order, keep critical actions near their context and account for safe areas and the software keyboard. Do not change DOM order only to match a desktop composition.
- Use normal document flow and meaningful intrinsic sizes. Test short/long pages, one/many cards, missing imagery, empty tables and long validation messages.
- Do not bake viewport-height hero assumptions that push the CTA off a short phone screen. Reserve media geometry and keep essential copy visible without motion or hydration-dependent reveals.

### Landing hero

One headline, one short support message, one dominant CTA and deliberate artwork/space. Current and upcoming collection information belongs in a slim announcement bar above the navbar, outside the hero. Keep the announcement to one line when space allows; allow long names and recovery feedback to wrap without clipping. On phones, retain the collection name, status and details link while omitting supplemental counts/countdowns. Newsletter capture remains below rewards. Do not add dense facts, multiple bright badges or another competing CTA to the hero.

The 2026-10-24 compact scale supersedes the earlier single-line Landing headline exception. Headlines may wrap naturally, including on mobile and at enlarged text settings; never compress text below its named role to force one line.

The announcement's initial live-data request MUST NOT render “Refresh,” “Retry,” an error badge or a browser-looking button. It gets a neutral, styled pending state in a stable status slot. Retry is a response to an actual failure. Background refresh does not replace the hero with a loading panel. Preserve stale-state warnings and accessible observation context alongside the collection link.

Rewards copy direction (2026-10-23): emphasize community voting over published packages of price, supply, winner count and duration, with the fixed revenue allocation stated separately. The six-winner / 1 ETH illustrations are neither universal terms nor minimum prizes. Preserve the community's choices within existing contract limits; do not turn marketing examples into protocol restrictions. See [the scoped copy and verification record](rewards-voting-copy-2026-10-23.md).

The user-requested announcement gradient represents the featured season's published palette, preserving its color order. Render each source color at 40% mixed with the canvas token, use the ink token for readable text, and blend left to right without continuous animation. A published collection color is the fallback when no season palette is available; missing or invalid colors retain the neutral surface. Palette data is optional decorative information and must not invalidate collection status or imply fresh availability.

### Footer

The footer is useful and quiet. Use one composed footer per page, not two separate footer systems with duplicated copyright or conflicting type. Typography, contrast and interaction rules below apply to all apps. The multi-column glyph/link composition is the **public footer** for Web and Landing. Launch may retain a compact operator footer with relevant account/operational links; do not add public marketing columns or support promotion to its private shell.

- Link and supporting copy: **12/18 px**, weight 400, muted token.
- Group labels: **12/18 px**, weight 600, ink; no oversized headings.
- Legal/copyright: **12/18 px**, muted; include each item once. Material transaction terms belong near the transaction, not only in the footer.
- All footer branding: canonical TC glyph only, 28 px square. Optional link icon in any footer: 16 px, gap 8 px.
- Public composition: top border 1 px line token; top margin 96 px desktop / 64 px mobile; vertical padding 32 px desktop, 24 px mobile. Column gap 32/24 px. Four columns at 960 px+, two at 600–959 px, one below 600 px.
- Rewards Landing opts into the shared `PublicFooter` compact density (2026-10-23): 96/64 px top margin, 24 px vertical padding and 16 px gaps and 12 px legal separator padding. Below 960 px, the brand and support span two link columns; at 960 px and above use the usual four columns. Typography, 32/44 px link targets and support behavior are unchanged. Other consumers keep the default density.
- Private operator composition: 1 px line separator, 96/64 px top margin, 24 px vertical padding and 12 px row/action gap. Wrap naturally within the operator content container; use the same footer text roles and target minimums.
- Link/text-action rows: at least 32 px high on fine input, 44 px on coarse input. Smaller type does not mean smaller touch targets. Keyboard focus is fully visible.
- Support opens the existing support experience through a quiet text action. A footer action must not masquerade as a working service when it is unavailable.
- No primary filled CTA, oversized social icons, decorative motion or repeated signup promotion in the footer. Missing external URLs produce honest unavailable text or omission according to the existing product contract; never `href="#"`, invented URLs or dead buttons.

## 10. Async state is part of the design

Every asynchronous region needs an explicit state model. A null object cannot stand in for loading, empty and error simultaneously.

| State | Required presentation | Forbidden presentation |
| --- | --- | --- |
| First render / initial pending | Stable branded shell; reserved content region; one neutral status | Retry before failure, unstyled controls, zero placeholders presented as truth |
| Slow response | Retain shell and context; persistent pending explanation when useful | Blank hero, arbitrary reload prompts, fake percentage |
| Success | Real data with the appropriate action/status | Imagined availability or silently stale values |
| Confirmed empty | Explain the absence and only valid next actions | Treating empty data as a server error |
| Background refresh | Keep useful content visible, unobtrusive busy cue only if needed | Full-region skeleton flash, focus reset |
| Refresh fails with previous data | Last-known content only if safe, explicitly stale with observation context; suppress unsafe freshness-dependent actions | Advertising stale data as currently live/actionable |
| Initial error / timeout | Styled persistent explanation and shared retry/text action | UA button, stack trace, unexplained empty region |
| Retry pending | Same control footprint, guarded repeat activation, busy feedback | Multiple requests from repeated clicks |
| Recovery | Restore real state without stealing focus; announce meaningful change once | Success toast before confirmed result |
| Offline / dependency unavailable | Clear state and recovery path; preserve user input | Lost drafts, hidden failure, automatic repeated writes |

For Tincta, unknown availability, mint eligibility or claims must remain unknown until the appropriate source verifies them. Last-known data is informational, not transaction authorization. Preserve existing freshness thresholds and lifecycle truth; presentation changes do not invent new live-chain guarantees.

Countdowns use tabular numerals, do not announce every second and never interpret reaching zero as confirmation of a chain event. A failed refresh must not silently retain an enabled unsafe action. Error regions remain visually subordinate to the main page purpose unless the task itself cannot continue.

## 11. Motion, accessibility and resilience

- Micro-interaction duration: 120 ms; menu/disclosure: 160 ms; dialog: 200 ms. Use `cubic-bezier(0.2, 0, 0, 1)` for entrances/state transitions; linear for a progress spinner. Animate opacity/transform without moving surrounding layout. No `transition: all`.
- Existing bounded hero artwork motion may retain its documented composition. Continuous decorative motion needs a working pause control and a complete static reduced-motion state. User-directed Landing exception (2026-09-30): omit the hero and footer pause/play controls; continue honoring the device reduced-motion preference for artwork and palette cycling. Do not hide information behind reveal animations.
- User-approved Rewards machine (2026-10-27) replaces the former orange Open hero on the Rewards landing only. A light spatial scene shows wallets minting, a prize ETH bucket filling, a separate blue Chainlink VRF chamber, six illustrative winning NFTs, then holder claims emptying the prize bucket. The bucket represents the fixed 60% prize allocation, not all contract funds; other reserves are separate. VRF receives a randomness request after sellout, not the prize coins. Equal ETH claim flights go to the displayed holders; NFT artwork and four permanent numbers never change. Six winners and fictional wallets illustrate collection terms, not a live draw or a fixed winner count. Use deterministic canonical SVG previews generated by `scripts/generate-rewards-machine-artwork.mjs`; this does not change deployed artwork. The 12-second loop uses a 0.5-second pool pause, starts VRF at 3.1 seconds and reveals winners from 4.5 seconds. It has Mint / Pool / VRF / Winners / Claims controls and an explicit pause/play control, superseding the older no-controls exception for this scene. Pause outside the viewport and in hidden tabs; reduced motion gets a complete static Winners frame and instant step selection. Scope styles to the machine, keep the primary CTA above the scene, and reflow the diagram in normal document flow on phones and with enlarged text. No RPC, wallet connection, extra rendering library or remote asset is needed.
- User-directed Landing motion (2026-10-27, strengthened after visual feedback): both marketing pages use a small 4 px staggered word entrance, decorative shared icons and restrained editorial parallax. The user clarified that 3D typography means subtle spatial movement as a section leaves focus: h1/h2 text has no shadow, bevel or extrusion. Headings stay neutral in the central reading zone, then depart by at most 6–12 px horizontally, 4 px vertically, 18 px in depth and 2 degrees of tilt. This follows the actual section position, with a small spatial range independent of the sculpture paths. Large word flips and opposing headline-line travel are removed. Perspective scales with the viewport so full-width heading boxes stay within the page. Reduced motion and forced colors retain flat, static typography. Marketing CTA links enter once with an 8 px lift over 500 ms, without tilt or replay at viewport boundaries, then animate their arrows and respond to hover with a small lift and a light sweep; keyboard focus settles the action. Form controls, recovery actions and navigation remain stationary. Preserve shared control metrics, copy, section spacing, the white canvas and canonical NFT artwork. This is a scoped exception to restrained decorative motion and stationary marketing actions. Text stays present, selectable and accessible before hydration; use native scrolling and honor reduced motion from first paint.
- Parent `/` uses clear beveled glass sculptures: portals, monoliths, stepped blocks, crosses, linked frames, stacks, arches and split Ethereum diamonds vary across its six sections. The diamond uses two separated faceted 3D volumes with reflective edges in the hero, projects and closing sections. Its silhouette follows the Ethereum reference mark's 540 × 879.4 proportions: a tall upper diamond, concave lower chevron and continuous V-shaped separation. Mirrored facet ridges provide glass depth; do not replace the lower notch with a flat pyramid cap. Closing sculptures use smaller, vertically centered forms and projected horizontal bounds to remain fully inside their section throughout movement. Translucent faces and reflective bevels pass in front of words to demonstrate transparency; the layer never intercepts input, and marketing actions and newsletter controls sit above it. Following live inspection of [Noomo](https://noomoagency.com/) and its public scroll-animation setup (2026-10-27), sculptures follow continuous curved X/Z paths with gradual approach and recession and opposing lateral travel. The later underwater-motion refinement keeps their vertical anchor in normal document flow: no authored Y travel, scroll-compensation rebound, bobbing or pitch/roll rocking. Depth excursions and scroll-driven yaw are smaller so the forms remain secondary to the content. Camera-space Z changes the perspective of individual faces, including their relative scale, rather than uniformly scaling the SVG. Smaller viewports use smaller forms and reduced text parallax while retaining broad sculpture travel. Neutral translucent gradients are allowed only in this authored artwork; glass controls and new brand colors remain outside this exception.
- `LandingMotion` owns one passive native scroll listener and maps the actual scroll position directly to sculpture progress. The latest feedback removes the former four-second delayed response: slower movement comes from longer spatial paths, with lateral travel below 0.5 px per scroll pixel, rather than temporal catch-up. Forward and reverse movement begin on the next animation frame. Horizontal position, scroll-driven yaw and depth share this progress; there is no authored vertical displacement or rebound. All section geometry is measured in a batch and cached until resize; neighboring scenes are projected 240 px before entering view so their movement is already synchronized on arrival. A cached beveled 3D mesh projects into SVG consistently across Chromium, Firefox and WebKit. Each visible sculpture also rotates continuously through a full 360° around its 3D Y axis, completing one revolution every 64, 80 or 96 seconds at a fixed pitch and roll. Rotation continues when scrolling stops, pauses offscreen and in hidden tabs, and respects reduced motion. The frame loop runs continuously only while a sculpture is visible; Rewards updates on scroll or resize. There is no React rendering on scroll, remote model, raster asset or WebGL dependency. Entrance observers disconnect after first intersection: moving a button across the viewport edge cannot restart its animation. Text and action motion pause in hidden tabs. Decoration is noninteractive and hidden from assistive technology. Clip only the dedicated decorative layer, and size/position the closing forms so that clipping never cuts them. Reduced motion restores static geometry and inline text and removes parallax, entrances and loops, including a preference change during an active frame; forced colors omits the sculptures. Preserve the established omission of hero/footer pause buttons. Owner: Landing presentation; recheck depth, text overlap/readability, input access and preferences after geometry or layout changes.
- Scoped local verification of the immediate-scroll and Ethereum revision (2026-10-27): Landing production build/typecheck, UI-harness typecheck, visual source policy, generated-brand parity and diff hygiene passed. Landing unit tests passed 32 checks with two database-dependent skips (disposable test databases are not configured). Tests cover direct scroll progress and bounded spatial rate, zero vertical trajectory and fixed pitch/roll, perspective depth, complete 360-degree revolutions and finite faceted Ethereum geometry. After rebuilding the fixture, `UI_APP=landing npx playwright test tests/visual/landing-motion.spec.ts tests/visual/studio.spec.ts tests/visual/landing-navigation.spec.ts` passed 99 checks with 42 planned secondary-engine viewport skips in Chromium, Firefox and WebKit. Coverage includes 320/390/768/1280/1440/2560 px, breakpoint edges, enlarged text, text spacing, axe, keyboard navigation, no-JavaScript readability, shadow-free neutral headings and bounded spatial departure/return on both pages, button entrance/hover motion, one-shot entrances at viewport boundaries, immediate forward/reverse scroll response without delayed catch-up, next-section synchronization, transparent text overlap without blocked actions, complete closing sculpture bounds on desktop and phone (animated and reduced motion), idle rotation, hidden-tab/reduced-motion stops and forced colors. Frame sampling verifies constant sculpture document-space Y throughout scroll and reversal; no CSS bobbing remains. Existing reduced-motion screenshot baselines remain unchanged. The final log is `test-results/scroll-fixes-browser-final.log`; desktop, phone and cross-browser screenshots are under ignored `test-results/visual/`. The local production server at `http://localhost:3101/` was rebuilt, restarted and visually checked with scrolling. This is local evidence only: no deployment, database mutation or chain operation. Physical-device and manual screen-reader acceptance remain unverified.
- Ethereum silhouette correction (2026-10-27): rebuilt the mesh around the [Ethereum reference outline](https://commons.wikimedia.org/wiki/File:Ethereum_logo.svg), replacing the flat-topped lower pyramid with an open chevron and correcting the width/height and split proportions. The glass material and scroll/rotation choreography remain unchanged. Six focused geometry/motion unit checks pass, including silhouette proportions and empty-space probes through the V-shaped split. Production build, UI-harness typecheck, source policy and 18 focused browser checks pass across Chromium, Firefox and WebKit (`tests/visual/landing-motion.spec.ts --grep 'glass|closing|without animation'`). Reviewed desktop and phone renders, full closing bounds, transparency, no-JavaScript readability and reduced motion. Log: `test-results/ethereum-shape-browser.log`. Local preview rebuilt and refreshed; no hosted release.
- Reduced motion disables nonessential movement, shimmer and smooth scrolling. Forced-colors mode preserves semantic visibility. Motion must never be required to interpret status.
- Support keyboard operation, clear focus order, Escape and focus restoration for overlays, screen-reader names/roles/states, and text selection. Hover is an enhancement, never the sole means to discover an action.
- Additional hover/focus content must remain usable when magnified or reached with the pointer; follow [dismissible, hoverable and persistent feedback guidance](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).
- At 200% text enlargement and 400% browser zoom/reflow, no essential content or controls are lost. WCAG reflow uses a 320 CSS-pixel-wide presentation for ordinary vertical content; see [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Text-spacing overrides must work without clipping: line height 1.5× font size, paragraph spacing 2×, letter spacing 0.12× and word spacing 0.16×. See [text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).
- Tincta's 44 px coarse-input target is a product standard. It is distinct from WCAG 2.2 AA's 24 CSS-pixel minimum criterion and its exceptions; see [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Cold caches, slow APIs, blocked images, hydration, back navigation and reconnection must preserve a readable, styled shell. Functional claims with JavaScript unavailable must be honest; do not render an apparently usable client-only action without a fallback explanation.
- Initial-render layout shift target: CLS ≤ 0.1 in the stated local scenario. More strictly, routine button state changes MUST preserve dimensions within 1 CSS px at a fixed viewport/font. A low page CLS does not excuse a visible transient defect.

## 12. Governance and acceptance

The [quality gates](quality-gates.md) are mandatory for implementation work. Every new component or page records its reused components, tokens, supported states and relevant evidence. Documentation-only changes do not establish UI compliance.

Before changing a token, inspect every consumer, update the spec and component specimens, and verify all three apps affected by the change. Choose one canonical value; do not preserve conflicting defaults behind app names. Do not refresh screenshot baselines merely to make a failing job green.

An exception record must identify: requirement, exact component/route/state, reason, alternative behavior, accessibility impact, verification, owner and removal/review trigger. Existing vendor/OS boundaries above are recognized limitations; ordinary local styling convenience is not an exception. No blanket “legacy app” exemption. User-approved design changes update the normative spec; routine implementation decisions within it do not require repeated permission.

Completion language must distinguish source checks, local browser evidence, authenticated views, connected-wallet behavior, hosted deployment and real chain verification. Do not claim “flawless,” “fully accessible,” “all devices verified” or “pipeline enforced” without the corresponding evidence.

## Tincta Rewards subproject lockup · 2026-10-09

The approved quiet label identifies the current application as **Tincta Rewards**, a subproject of Tincta. In Launch branding, wrap the unchanged canonical wordmark in `RewardsBrand` from `@manekineko/ui/rewards-brand`. This approved subproject descriptor is the exception to the prohibition on adding a second name beside the logo; never recreate or alter the parent wordmark.

Use the shared 8 px gap and title-case “Rewards” label: system sans, 12 px/18 px, weight 500, no added tracking, 2 px vertical / 8 px horizontal padding, 3 px corners, #fafafa surface, #ddd border and #555 text. Dimensions scale in rem. Use 72 px desktop / 64 px mobile wordmarks; footers use only the 28 px TC glyph. The label is not a button. Home links are named “Tincta Rewards home”; standalone lockups are named “Tincta Rewards”. Parent-brand assets, favicons and artwork signatures remain Tincta. The parent Tincta landing page lives at `/` and uses the unmodified parent wordmark. Rewards keeps its complete landing experience at `/rewards`.

**X image override (2026-10-28):** Genesis, season and collection social-image headers use the canonical TC glyph alone, 56 px square at the existing 48 px / 44 px header origin in the 1600 × 900 frame. Use the generated path from `generate-tincta-brand.mjs`; remove the Open symbol and wordmark from these signatures. Both networks use the glyph; Sepolia test labels remain visible. This applies to newly generated previews and posts.

**Rewards landing and Web override (2026-10-28, extending the October 27 landing selection):** the user selected the canonical TC glyph plus unboxed uppercase **REWARDS** only. Remove the orange Open mark and long wordmark from the Rewards header/hero and Web headers, including docs. Use the shared `RewardsBrand` glyph variant: unchanged 32 px glyph, 12 px gap and the existing label token (12 px) at weight 600 with .13em tracking. The older `RewardsBrand` default remains for Launch; the parent landing retains its own identity. The Rewards footer continues to use the TC glyph alone. Parent, Rewards and Web navbars share a persistent 1 px line-token bottom border, including closed mobile navigation.

Scoped Rewards machine verification (2026-10-27, local): the production build, UI source contracts, UI harness typecheck, canonical brand parity and six machine-artwork parity checks passed. Landing unit tests passed 35 cases with one environment-dependent skip; the disposable-database newsletter setup test was also skipped. The machine plus existing Landing state suite passed 87 browser checks with 12 planned secondary-engine viewport skips. Header branding, section layout and parent-page regression coverage added 33 passes and six planned skips. Chromium, Firefox and WebKit cover static steps, six claim flights, a zero final prize-pool level, immutable NFT imagery, pause/resume, hidden/offscreen suspension, reduced motion, responsive layouts and 200% text. Existing pending, stale, retry, newsletter, navigation and footer checks passed. Desktop, phone and in-flight claim screenshots were inspected; 12 Landing hero baselines were refreshed for the intentional redesign. The machine generator is included in `ui:check`. No deployment, live-wallet transaction, real-device or manual screen-reader verification is claimed.

## Parent-brand landing · 2026-10-09

`apps/landing-page/app/page.tsx` now owns the parent Tincta page at `/`; the original Rewards experience is composed by `app/rewards/page.tsx` at `/rewards`. Parent navigation uses the canonical wordmark; its footer uses the TC glyph alone. The parent page presents the research thesis, a Rewards feature, and Morph/Assembly as research concepts without launch dates or invented progress. Existing newsletter and live-collection behavior stays with Rewards.

Parent presentation uses shared foundation tokens, buttons, icons, disclosures and footer text contracts. The app-scoped `studio.css` owns its layout. `components/research-art.tsx` draws decorative, static geometric studies using exact catalog palettes; these are not minted artwork or assertions about deployed project behavior. No remote images, fonts or data requests are required for the parent page.

User-directed parent hero update (2026-10-22, reconciled with the current compact scale on 2026-10-27): `/` uses a centered typographic statement, “Defined 100% onchain. Shaped by participation.”, with one supporting sentence and the shared project CTA. The former 36–72 px display exception was superseded by the 2026-10-24 compact scale; the current hero uses `--ui-hero` (24–28 px). The featured project currently shows the exact Genesis NFT preview, while Rewards uses its scoped TC + REWARDS lockup and Rewards machine hero. Text scales and wraps normally; no fixed hero height or hidden overflow is allowed. Owner: parent Landing presentation. Recheck wrapping, keyboard/contrast and 320 px/200% text reflow whenever the headline or scale changes; browser evidence is recorded with the scoped implementation.

User-directed first-view and navbar update (2026-10-25): the parent hero fills at least the current viewport below the 56 px minimum header, centering its copy horizontally and vertically. The research section and its separator begin below the initial viewport. Use a dynamic viewport minimum, intrinsic content height and the existing section padding so short screens and enlarged text scroll naturally without clipping. The parent header, including `/whitepaper`, pairs the canonical 24 px TC glyph on the left with the existing wordmark and an 8 px gap inside the single “Tincta home” link. Both SVGs are decorative within that named link. Rewards branding and footer glyphs keep their existing composition.

Scoped local verification: the existing parent, whitepaper and navigation browser suites passed 63 checks with 36 planned secondary-engine viewport skips. An additional 33 viewport checks across Chromium, Firefox and WebKit verified centering, the research section below the fold, glyph spacing and no overflow at 320–2560 px, including short landscape screens. Enlarged text remains scrollable in all three engines; a JavaScript-disabled Chromium check verified the first-view layout and glyph without hydration. Desktop and phone screenshots were inspected under ignored `test-results/hero-review/`; source policy, UI typecheck and generated asset parity passed. This static hero has no asynchronous state. Physical devices and manual screen-reader acceptance remain unverified; local evidence alone does not establish hosted delivery.

Parent copy direction (2026-10-22): the hero support reads “We build open systems where immutable code sets the rules—and participation creates what comes next.” The thesis, principles, project descriptions, closing, footer and metadata carry this focus through the page. Immutability refers to the deployed governing code and fixed collection terms. Participant actions and permitted operator transactions still follow that code; copy must not imply that all human operations cease or that every balance is inaccessible to operators. Morph and Assembly retain their research-concept status. The Rewards wording is grounded in the V10/V11 round contracts’ fixed terms and direct claim functions; this copy update changes no protocol behavior.

Scoped hero verification: `npm run landing:test` completed with 16 passes and two environment-dependent skips; Landing typecheck/build, `npm run ui:source`, and `git diff --check` passed. After rebuilding the Landing fixture, `UI_APP=landing npx playwright test tests/visual/studio.spec.ts` passed 15 checks with six planned secondary-engine viewport skips. Coverage includes five primary viewports, three browser engines, axe, keyboard/disclosure and Rewards navigation, breakpoint reflow, 200% text, text spacing, reduced motion and forced colors. Production screenshots were inspected at 1440, 390 and 320 px. Shared controls are reused unchanged; the parent hero has no asynchronous data states. Real devices, manual screen readers and hosted deployment were not verified for this update.

Verification: Landing source policy, typecheck, production build, generated-brand parity and UI-harness typecheck passed locally. Parent browser coverage in Chromium, Firefox and WebKit includes keyboard navigation, disclosure activation, round-trip navigation to Rewards, automated accessibility, 320/390/768/1280/1440 px layouts (secondary engines at 390/1440), breakpoint reflow, 200% text, text spacing, reduced motion and forced colors. Parent and Rewards route screenshots are maintained separately. Physical devices, manual screen-reader review and hosted deployment remain unverified for this change.

## Compact Web header and wallet management · 2026-10-24

User-directed Web shell refinement, updated 2026-10-24: `RewardsBrand` uses the shared 20 px Open symbol, 72 px desktop / 64 px mobile Ligature wordmark, 8 px gaps and a framed 12/18 px Rewards badge. All footers use the TC glyph alone. The Web header retains its 56 px minimum, 4 px vertical padding and 44 px brand target. Navigation uses the shared label type; account/menu controls use the shared 32/44 px targets. The header grows with enlarged text and navigation opens in normal flow. Network details remain in wallet management and transaction review.

`WebWalletMenu` composes the shared Radix dialog, Button, IconButton, TextAction, badge, icon and typography contracts. It uses canvas/surface/line/muted tokens, 3 px corners, shared card padding (20 px desktop / 16 px mobile as of 2026-10-27), 8/12/16 px gaps and natural height with internal scrolling. Connected accounts, selection, disconnect and updates come from Reown; no private shadow DOM is styled. Wallet-provider logos are replaced with the shared neutral wallet icon. Installed-wallet connection, WalletConnect QR and network selection remain vendor surfaces themed through supported APIs; external wallet prompts remain system owned.

Public documentation uses server-rendered flow diagrams, allocation figures and formula panels with selectable text, named figures, semantic lists/definitions and captions. Their palette, spacing and typography use the existing foundation tokens. Narrow figures stack without page overflow; formulas include plain-language definitions and explicit rounding/empty-case boundaries. Search indexes diagram and formula text. There is no diagram runtime, remote font or image dependency.


## Compact composition update · 2026-10-24

- Web and Launch Rewards headers retain the bordered, surface-filled Rewards badge at 12/18 px. Compact branding reduces the wordmark and Open symbol; it never strips badge framing. Parent headers retain the outlined wordmark alone.
- Landing desktop navigation uses equal flexible side tracks around the centered navigation. The right action and left logo may have different intrinsic widths without shifting the menu. Preserve the existing accessible mobile menu and its normal document flow.
- All public and operator footers use `FooterBrand` from `packages/ui`: canonical `/tincta-mark.svg`, 28 × 28 px, inside a named home link. Footer copy and links remain separate. The footer gap token is 96 px desktop / 64 px mobile, including compact variants.
- Superseded on 2026-10-27: the repeated public rules disclosure is replaced by a focused documentation link. Home retains the version-correct allocation summary and treasury purpose; claims, affiliates and holder rewards focus on their own task. Full rules remain in public documentation.
- Rewards Landing presents prize details before the collection explanations, then refunds followed by season holder rewards. The three overview examples show prize, affiliate and holder allocations under the same explicit assumptions. Holder calculations describe separate season pools, eligibility and limited claim slots; illustrative totals are never represented as funded balances.


## Component consistency and quieter pages · 2026-10-27

This user-directed refinement preserves the current brand, compact type scale, artwork, fluid shell and transaction behavior. It makes equal roles equal; it does not make every text element the same size.

- **Buttons:** all first-party filled, outlined, ghost and retry controls use the existing 13/18 px, weight-500 contract, with 6/12 px padding and 32 px minimum height (12/12 px and 44 px for coarse pointers). Icon buttons retain their distinct 7/13 px padding contract. Parent rows own the 12 px action gap. No panel may add margins to a button or change the font of a nested button label. Season-picker labels use the control role; their palette is content artwork.
- **Cards and forms:** protocol panels, holder pools, wallet pickers, collection cards, documentation cards/callouts and Landing panels use `--ui-card-padding`: 20 px desktop, 16 px below 600 px. Form groups and disclosures use parent layout gaps; fields retain their shared padding. Do not stack paragraph, field and button margins to create accidental spacing.
- **Type:** use exact line-height tokens: body 14/22 px, controls 13/18 px, captions/labels/footer 12/18 px. Navigation uses the shared label role. A necessary explanation remains readable body text; shorten or move it to documentation instead of shrinking it. Tables retain their 13/18 px role and 12 px cell padding.
- **Composition:** center public page headings and focused participation/claim regions within the page. Keep labels, forms and reading paragraphs aligned for scanning. Major sections use the rhythm in section 9, while related content keeps smaller token gaps. Documentation preserves a 68ch paragraph measure and allows wide diagrams. Shells and galleries retain the fluid width; no new global width cap is introduced.
- **Copy:** one clear heading, one short supporting thought and one main action per section. Avoid repeating the headline in a caption, repeating navigation as a row of buttons, or reproducing full documentation below every app task. Use specific links such as “Read the affiliate guide” and “Read the holder reward rules.” Home’s allocation summary links to the full documentation.
- **Material facts:** keep exact costs, gas exclusions, mint limits, eligibility, one-time rights, burns, deadlines, stale/read failures and unavailable states beside the decision they affect. Holder claims still disclose the first-5% limit, one claim per NFT, execution order and lack of a guaranteed payout. Planned V16 Genesis states first-ballot-only voting, ongoing affiliate eligibility subject to enrollment/referral rules, no mint deadline and two lifetime primary mints; it grants no prize, sponsored mint or season holder reward. Connected historical deployments retain their actual terms. Examples remain explicitly illustrative and not funded balances. Simplification never changes signing guards or financial meaning.
- **Evidence:** inspect computed controls in real consuming pages, including nested text, coarse input, open disclosures and recovery states. `tests/visual/consistency.spec.ts` covers the current route families; relevant existing state suites remain required. See [the scoped review record](consistency-review-2026-10-27.md) for executed checks and boundaries.
