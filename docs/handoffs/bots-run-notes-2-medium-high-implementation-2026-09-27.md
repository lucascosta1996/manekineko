# Bots notes 2 — M1–M4 implementation

Implemented the assigned [Medium/High scope](bots-run-notes-2-astra-medium-high-2026-09-27.md) against the existing U1–U6 worktree. Existing recovery, wallet, lifecycle, accounting, worker and database work was preserved. This change is local source only: it does not deploy, update hosted configuration/data, run a season, disclose wallets, send X posts or move funds.

## Delivered

**M1 — shared compact UI.** New `@manekineko/ui` workspace package contains shared tokens, Lucide icons, a Radix Select wrapper, Radix Dialog exports, safe public-link configuration and the public footer. Web (including docs), Landing and Launch import the shared stylesheet and app-specific compact layouts. App-owned buttons and button-like links use 3 px corners; coarse-pointer controls have at least 44 px height. Typography, navigation/wordmarks, padding and supporting content are reduced while preserving geometric artwork and exact palette colors.

All visible native selects in the repository's TSX were migrated: history sorting, NFT status/network, sponsored credits, qualifying NFTs, duration units, allocation presets, factory/deadline modes, saved templates and social previews. New dashboard filters/network selection use the same control. The wrapper retains option declarations, labels, disabled states, required form semantics, keyboard navigation, typeahead, scrolling, portal positioning, Escape and focus restoration. Its value callback is documented in [the UI package](../../packages/ui/README.md). Radix's hidden form selects intentionally remain.

Navigation, disclosure, quantity, refresh, prize, search and other UI glyphs now use Lucide. Existing brand/artwork SVGs and mathematical notation remain intact. Final source inventory found no visible `<select>` tags or the replaced Unicode UI glyphs in app TSX. Native date/time inputs and browser confirmation prompts remain their existing controls; the handoff's custom-picker requirement concerns selects.

**M2 — mint and footer.** The cumulative allowance is one small disclosure, with the exact expanded explanation and independent wallet allowance/refresh preserved. Artwork has one “Illustrative artwork” caption with spacing; the card's other label is “Artwork preview.” The past-winner card is a smaller secondary card retaining eligibility, the lifetime redemption rule and gas responsibility. Shared controls apply to the existing wallet/mint/claim presentation without changing signing or entitlement rules.

Web and Landing share grouped Explore/Connect/Support navigation. Their own app/docs/website links use relative paths; cross-app destinations use the matching configured environment. Contact, Telegram and X have no invented fallback. Missing configuration displays “Awaiting URL.” The Support modal explicitly says **“Support — coming soon”**, contains no submission form and cannot simulate a successful ticket. Launch has a small private workspace footer.

**M3 — social images.** Newly built Sepolia messages and images use neutral “Sepolia collections” instead of “Color study.” SEPOLIA TEST / TEST ETH and SEPOLIA labels remain. Names, colors, geometry, event meaning and payment data are preserved. All nine event templates were rendered for each network (18 PNGs) and both contact sheets were visually inspected. No stored payload, confirmed post, uploaded media or delivery journal was rewritten. Existing outbox behavior and compatibility tests passed.

**M4 — Launch dashboard.** `/dashboard` is the authenticated home/login default. `/activity` and `/settings` are authenticated routes. Every workspace page uses the persistent desktop sidebar, compact network context bar and focus-contained mobile drawer. Existing Collections, Seasons, Earnings, Active/Upcoming and legacy Automations routes remain useful; route allowlists preserve supported network/season deep links.

The dashboard consumes the existing `OperationsReport`, `operationPresentation`, `operationSeasonSummaries`, `EarningsReport`, `RuntimeSnapshot`, URL network hook and generation-checked query hook. It shows observed collections, actual sequence counts, future saved openings, unpaid prizes, current creator funds, canonical block/time and worker/social attention. Partial/unavailable accounting remains distinct from zero; chain observations expire through the existing canonical lifecycle functions. Dashboard refreshes/page loads are GET-only. No Mainnet execution capability was added.

Seasons now has search/filtering, concise saved-season cards, chain lifecycle separate from the immutable prepared artifact, and deliberate disclosures for frozen configuration, timing, rewards and rehearsal tools. Network X settings have their own destination. The settings editor reports unsaved changes to the shell, guards network changes/reload/leaving, and blocks switching during a pending save. Existing season/collection unsaved-change protections remain. Dashboard collection links target individual deployed/upcoming cards. Superseded sequences remain labeled audit history.

## Validation and limits

| Boundary | Result |
| --- | --- |
| Source / types / build | Web, Launch and Landing typechecks and production builds passed. Final Launch build includes the new authenticated routes and legacy redirect. `git diff --check` passed. Temporary QA routes were removed before builds. |
| Regression tests | Web: 276 passed / 3 database tests skipped, plus 2 new footer-link tests passed separately. Launch: 190 passed / 6 database tests skipped, plus 4 preparation tests passed. Landing: 15 passed / 1 DB test skipped; separate newsletter setup DB test skipped. Social rendering/outbox: 15 passed. Route/link focused checks: 6 passed (overlap with the preceding totals). No hosted environment was used for fixture writes. |
| Local browser visuals | Chromium checked dashboard, season editor, settings, mint/allowance/reward, docs, footer/support and Landing. Desktop 1440 px, tablet 768 px and narrow 390/320 px layouts were inspected. Representative pages had no horizontal overflow. Local fixture screenshots are in `.private/bots-notes-2-ui/`. The public Seasons unavailable response with DATABASE_URL disabled is an outage view, not live season validation. |
| Local browser interactions | Passed network isolation in fixture responses, completed two-collection rendering, filtering, dropdown keyboard/disabled/long-label/scroll behavior, Escape/focus restoration, mobile drawer, support focus containment, required select validity, computed 3 px app-button corners and 44 px coarse-pointer targets. Editing a network profile and canceling a network switch retained the selected network. Final browser runs had no page errors. |
| Generated social visuals | All 9 events × 2 networks rendered; Sepolia labeling and exact palette order retained. Mainnet and Sepolia contact sheets inspected. No post sent. |
| Database persistence | No hosted schema, data or grant changes. Existing U-scope migration and persistence boundaries are unchanged. Database-dependent tests were skipped in this run, not counted as passes. |
| Hosted authenticated UI | New source is not deployed or authenticated-hosted-browser verified. Anonymous local `/dashboard?chainId=11155111` correctly redirected to login with its destination retained. The existing [U5/U6 report](bots-run-notes-2-launch-implementation.md) contains its separately dated hosted evidence. |
| Canonical chain | No new chain audit was performed by M1–M4. The dashboard uses the U1/U6 readers; the companion report's completed two-collection observation is historical evidence, not a new observation from this UI work. |
| Wallets / real devices | No real wallet popup, signing, mint, claim, actual Safari/iOS or Android-device test. Viewport and touch emulation are explicitly local browser checks. |
| X delivery | None performed. See the [U3 worker report](bots-run-notes-2-worker-implementation.md) for its independent outbox evidence. |

## Configuration and remaining acceptance

Public cross-app footer variables are documented in Web/Landing `.env.example`: `NEXT_PUBLIC_LANDING_URL`, `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_CONTACT_URL`, `NEXT_PUBLIC_TELEGRAM_URL`, `NEXT_PUBLIC_X_URL`. Existing Web `AFFILIATE_PUBLIC_ORIGIN` and Landing `NEWSLETTER_PUBLIC_ORIGIN` are reused where applicable. Contact, Telegram and official X destinations need supplied/verified URLs; no hosted variables were changed.

WalletConnect AppKit is themed through its public API (light palette, black accent, common font, reduced master radius). Its shadow UI uses scaled vendor radii/icons/logos; the public API does not guarantee exactly 3 px for every internal control or replace its icon set with Lucide. External wallet screens are outside app styling. This limitation is explicit in the UI package documentation.

Before hosted acceptance, deploy the reviewed combined implementation and satisfy the U1/U3/U5/U6 deployment prerequisites, including their separately scoped observation migration if required. Then verify authenticated Dashboard → Airy Garden → both collection cards → Earnings/Activity, network reload/deep links, outages and unsaved edits against real observations. Complete actual device/wallet acceptance separately. The companion manual rehearsal plan remains the authority for any future live test; this UI change does not authorize one.

## Coverage of the twenty notes

| Notes | Outcome / owner |
| --- | --- |
| 1–10 | M1/M2 implemented locally: compact disclosure, navigation/typography, corners, footer/support, artwork caption, reward card, shared controls/icons and custom dropdowns. URL/device/SDK limits above remain explicit. |
| 11–12 | U1 lifecycle/counter/featured-state source retained; compact public presentation consumes it. No new contract or hosted claim. |
| 13 | M3 templates and alt text implemented and rendered; U3 owns frozen payloads/delivery. |
| 14 | U2 wallet/claim behavior preserved; M1 supplies presentation and SDK theme. Real wallet acceptance remains separate. |
| 15 | U1/U3 actual award-count and social evidence remain in their companion report; M4 displays separate delivery observations. |
| 16 | U4 manual wallet/referral work remains separate; no key export or rehearsal here. |
| 17 | U2/U1 conditional claim presentation retained; no new payment inference. |
| 18–20 | M4 dashboard/sidebar/settings/search/deep links consume U1/U5/U6 canonical lifecycle/accounting interfaces. Two actual collections and Complete were tested with clearly local fixtures, not claimed as a fresh hosted audit. |

The combined twenty-note live acceptance is not claimed complete. M1–M4 source implementation and local verification are complete with the external dependencies above. No separate Ultra-agent review was started by this task; behavioral source and the companion U-scope evidence were reviewed locally during integration.
