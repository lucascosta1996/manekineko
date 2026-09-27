# Bots run notes 2 — GPT Astra Medium/High handoff

Date: **2026-09-27**. Product: **Tincta**. Repository: `manekineko`.

Model: **GPT-6 Astra** (`gpt-6-astra`; [official model reference](https://developers.openai.com/api/docs/models/gpt-6-astra)). **Ultra**, **Medium** and **High** below refer to the effort settings in this Codex app. The split is a task-allocation recommendation based on coupling and consequence of errors.

**Assignment and outcome — shared context**

Implement the user's second set of Airy Garden test notes: make the public apps compact and consistent, make wallet/reward interactions understandable, correct lifecycle and social reporting, enable a manual wallet rehearsal, restore creator-earnings visibility, and turn Launch into a clear operations dashboard.

The implementation is divided into two companion handoff files, grouped by the requested GPT Astra effort setting. This file includes the shared context and its assigned scope. Its preparation changed documentation only. It does not run another season, disclose wallet keys, send X posts, change hosted settings/data, deploy applications/contracts, or move funds. Prepare and validate the implementation and a concrete next-run plan before the separate live-operation step. Preserve unrelated worktree changes, including the current recovery/worker work.

The user reports that Airy Garden has now been tested successfully, with bugs and interruptions, and that all observed prizes were paid. Treat these as the latest user observations. They have **not** been independently verified while preparing this handoff. Older reports of paused execution are dated evidence, not proof that the run is still paused. Reconcile fresh state before diagnosis or operations; do not restart recovery from an old checkpoint.

**Read first and preserve — shared context**

- [Architecture](../architecture.md), [V10 permanent combinations](../permanent-combinations-v10.md), root `AGENTS.md`, and each affected app's `AGENTS.md`. Read the installed Next.js guides before implementation as those app instructions require.
- [First notes and six existing scopes](airy-garden-testnet-notes/README.md), [implementation report](airy-garden-testnet-notes/implementation-2026-09-27.md), [incident handoff](../airy-garden-first-collection-handoff-2026-09-27.md), and [live recovery guide](../airy-garden-live-recovery.md). Extend and repair the existing features; do not recreate them as parallel systems.
- V10 / `affiliate-v10`, `unique-rank-v6`, Eligibility V5 and Winner Credits V6 remain version-pinned. Preserve permanent Solidity-generated ticket numbers, VRF-based outcomes, current-holder prize rights, protected liabilities and historical versions.
- Preserve names, order, exact colors, artwork, stable identities, immutable exports, deployed deadlines and transaction/social journals. This request concerns surrounding UI and social graphics; it does not authorize changing deployed NFT SVGs.
- Ordinary new mint windows remain 1–24 hours, default 24 hours. The existing explicit one-collection, three-mint, 30-minute Sepolia refund scenario remains separate from the affiliate/sellout rehearsal.
- Keep Mainnet planning and Sepolia execution separate. Mainnet must not import wallet generation, rehearsal purchases or recycling. Do not seed hosted databases or put secrets in code, handoffs, logs or screenshots.

Useful identity anchors, to be verified against the current database and chain:

| Item | Recorded identity |
| --- | --- |
| Airy Garden two-collection run | `257c7ab9-9e56-4daf-b5db-917a05d15d1c` |
| Automation | `79b44791-5787-4a26-90db-86a06a286a3b` |
| Lunar Stone | `369e50fc-47f3-496f-938d-53e5ea0f9d02`; Sepolia `0xaeCf42388f3Df8A92279d68065920745B73Ad728` |
| Satin Echo | `2a7d8825-da7d-42e6-92b4-f15a34d78e27`; Sepolia `0x67b59F893C8de118b11F06689E174Cc744bfd612` |
| Superseded ten-step run, history only | `971a0f25-992c-4bde-ba50-c9afb9fe329d` |

The user mentions **“4 of the 4 prizes”**. Lunar Stone's earlier verified record had six awards. Resolve which collection and snapshot the four-award observation describes. Read each deployed `winnerCount`/award state; do not hard-code four or six, and do not dismiss the observation because the default is six. Airy Garden's intended active run contains two collections, regardless of the superseded ten-step history.

**Current source findings, not a live audit — shared reference**

These entry points were inspected during handoff preparation:

| Finding | Starting point |
| --- | --- |
| Mint allowance is an unstyled-looking disclosure next to purchase controls | `apps/web/components/affiliates/affiliate-mint-panel.tsx` |
| Both preview title and caption say “Illustrative artwork” | `apps/web/components/mint-experience.tsx` |
| Sponsored reward card contains “FOR PAST COLLECTION WINNERS” | `apps/web/components/winner-credits/winner-credit-mint.tsx` |
| Every ranked claim button shares one `busy` flag; feedback is rendered after the entire grid | `apps/web/components/prizes/ranked-awards.tsx` |
| Draw-progress section always renders “Claim your prizes” | `apps/web/components/draw-progress.tsx` |
| Featured collection selector returns only live/scheduled collections, otherwise `null`; Landing uses the reported empty message | `apps/web/lib/seasons/featured.ts`, `apps/landing-page/components/live-collection.tsx` |
| Web season fallback mentions upcoming collections without proving another step exists | `apps/web/components/seasons-experience.tsx` |
| Sepolia social image branding and generated alt text contain “Color study” | `packages/contracts/src/season-social-image.ts`, `packages/contracts/src/season-social.ts` |
| Multi-provider discovery already exists, including EIP-6963 | `apps/web/lib/affiliates/wallet-discovery.ts` |
| Earnings already has a read-only catalog/RPC reader; missing data requires diagnosis | `apps/launch/lib/creator-earnings-store.ts`, `apps/launch/lib/creator-earnings.ts` |
| Launch has header navigation and individual operations pages, but no requested dashboard/sidebar structure | `apps/launch/components/launch/launch-header.tsx`, `apps/launch/components/operations/collection-operations.tsx` |

These findings identify repair points, not a complete explanation of hosted failures. Establish current deployed revisions and reproduce reported behavior before claiming root cause.

**Ownership and coordination**

- [GPT Astra Ultra handoff](bots-run-notes-2-astra-ultra-2026-09-27.md) owns **U1–U6**: canonical lifecycle, wallet/signing behavior, X delivery correctness, manual Sepolia reservations, creator accounting and Launch synchronization.
- [GPT Astra Medium/High handoff](bots-run-notes-2-astra-medium-high-2026-09-27.md) owns **M1–M4**: shared compact design, mint/footer presentation, X graphics and the Launch dashboard shell. Use **Medium** for bounded styling/copy/template changes and **High** for shared accessible controls, responsive navigation and dashboard integration.
- Start with Ultra's current-state reconciliation and shared interfaces. Medium/High can implement independent visual work before that finishes, but integrate live state only against the agreed interfaces. Ultra owns behavioral changes in shared wallet, lifecycle and accounting components; Medium/High owns presentation without changing those semantics.
- Keep one integration owner and a shared implementation report. These documents do not start agents, require parallel work or authorize live operations. Cross-references to U1–U6 identify Ultra scopes; M1–M4 identify Medium/High scopes in the companion file.

**Assigned scope:** implement M1–M4 in this file. Consume the companion Ultra handoff’s state/data interfaces and behavioral fixes.

## Implementation scope — GPT Astra Medium/High

**Outcome:** deliver the compact, consistent visual system and a clear operations dashboard using [GPT Astra Ultra handoff](bots-run-notes-2-astra-ultra-2026-09-27.md)’s verified behavior. Use **Medium** for M2 and M3 after shared components are established, and **High** for M1 and M4 because they span apps, accessibility and navigation. If a visual change exposes a transaction, accounting or lifecycle defect, route the behavioral fix to its Ultra scope and continue independent presentation work.

### M1. Shared compact design across every app — High

Apply the same visual rules throughout Web, its public docs, Landing and Launch, including forms, drawers/dialogs, result cards, filters and responsive navigation. The indexer has no comparable user-facing shell. Preserve Tincta's existing white/black palette, geometric artwork and color hierarchy.

- Reduce navbar height/padding and the Tincta wordmark size. Use [Apple's website](https://www.apple.com/) as the user's reference for restrained navigation and spacing; retain Tincta's identity. The reference does not require copying Apple's oversized marketing headlines.
- Reduce exaggerated title, heading and button sizes. Establish shared typography, spacing and control tokens/components so future pages inherit the same design. Reasonable starting targets are 14–16 px body/control text, 18–24 px card/section headings, and 28–36 px page headings; these are implementation proposals to validate visually, not new fixed brand rules.
- Set **all app-owned buttons and button-like links to 3 px border radius**, including secondary, destructive, icon-only and dropdown triggers. Use compact padding and a small consistent size scale. Keep readable text, visible focus and usable touch targets; compact appearance must not create tiny tap targets.
- Inventory controls across all three apps, including SDK-controlled UI that is rendered inside the apps. Bring its configurable styling into the system or document an unavoidable third-party limit. External wallet-extension screens are outside the site's styling control.
- Use **one SVG icon library** across the apps, behind shared imports/wrappers. Choose and record one maintained library during implementation. Standardize stroke, optical size and arrow semantics; navigation, external-link and dropdown icons should come from that same set.
- Replace Unicode arrows/checkmarks used as UI icons, emoji, platform-dependent glyphs, browser disclosure markers and ad hoc icon drawings. Do not replace Tincta's brand artwork or ordinary textual mathematical symbols with icons. Decorative SVGs should be hidden from assistive technology; icon-only buttons need accessible names.
- Replace **every visible native HTML select** with a compact custom dropdown matching Tincta. Use an accessible implementation with a labeled trigger, selected/disabled states, keyboard navigation, Escape, focus restoration, typeahead where appropriate, and correct screen-reader semantics. A CSS-styled native select still invokes the native picker and does not satisfy this request.
- Verify dropdown scrolling, clipping, layering, long wallet/address labels, form validation and mobile interaction. Retain native form semantics internally if useful, but no visible control may unexpectedly open the browser's native select menu.

Initial native-select inventory (rerun across the entire repository before declaring completion):

- Web: `components/history/history-experience.tsx`, `components/nfts/nft-gallery.tsx`, `components/winner-credits/winner-credit-mint.tsx`, `components/affiliates/affiliate-experience.tsx`.
- Launch: `components/automations/automation-console.tsx`, `components/automations/season-runtime-panel.tsx`, `components/launch/prize-fields.tsx`, `components/launch/launch-console.tsx`.

**Acceptance:** compare representative pages at desktop, tablet and narrow mobile widths; confirm consistent 3 px button corners, compact hierarchy, no clipped controls/overflow and no emoji/native-select regressions. Test actual Safari/iOS and Android/browser behavior where available; desktop viewport emulation alone does not prove device rendering. Record any unavailable device checks.

### M2. Mint-page refinements and professional footer — Medium

#### Mint page

- Make **“Up to 20 mints per wallet.”** a small, clean disclosure with deliberate space before the wallet/mint button. Style its expanded text — **“Paid, referral and sponsored tickets share this allowance. Transfers and refunds do not reset it.”** — using the page's normal supporting-text scale, width and spacing. Preserve the cumulative cap semantics and wallet-specific remaining allowance.
- Keep one visible **“Illustrative artwork”** explanation. Remove the adjacent duplicate; add clear top spacing between the artwork card and the remaining caption. Keep the distinction between a sample and the minted token's actual permanent numbers accessible and accurate.
- Refine **“FOR PAST COLLECTION WINNERS”** / “Redeem your sponsored ticket.” into a compact secondary card with smaller text, comfortable spacing and a clear action/status. Preserve eligibility, gas responsibility and the lifetime limit of one redeemed sponsored NFT per wallet.
- Apply the shared compact button system to connect, mint, claim, quantity, refresh and wallet-selection controls, including loading and error states.

#### Footer

Build a restrained responsive footer with grouped links to the landing website, Web app, documentation, contacts, Telegram channel and existing official social destinations. Include a **Support** control with an explicit **“Support — coming soon”** placeholder panel/page; the user requested a simulation, not a functioning support backend. Do not simulate a successful support submission.

Use a shared link configuration and the correct environment origins. Reuse verified project destinations for contact/Telegram; if no destination exists, flag it as awaiting a URL rather than inventing an address or shipping a dead `#` link. Public footers should not expose private Launch controls. Launch can use a smaller footer consistent with its dashboard shell.

Starting files: Web `components/site-shell.tsx`, `components/site-navigation.tsx`, `components/mint-experience.tsx`, `components/winner-credits/winner-credit-mint.tsx`; each app's `app/globals.css`; Landing's page/shell; Launch's shell and brand components.

**Acceptance:** allowance details, artwork caption and reward card look balanced in collapsed/expanded, disconnected/connected and sold-out states. Footer destinations are environment-correct, keyboard accessible and free of fabricated URLs; Support clearly says it is forthcoming.

### M3. X graphics and alt text — Medium

- Remove **“Color study”** from newly generated X image templates and corresponding alt text. Preserve layout balance, collection colors/artwork and honest Sepolia labeling. Omit the unwanted heading or use neutral collection/season context; do not silently replace the separate test identity/account with production branding.

Preserve layout balance and inspect generated image output as well as text. Render every affected image template. U3 owns queued/frozen payload compatibility, deduplication and delivery history; coordinate any shared `season-social.ts` edits before changing that file. Do not rewrite confirmed posts or publish new posts during this work.

Starting files: `packages/contracts/src/season-social-image.ts`, generated alt text in `packages/contracts/src/season-social.ts`, and image rendering fixtures/tests.

**Acceptance:** no “Color study” remains in newly generated images/alt text, while Sepolia identity and exact collection colors/artwork remain accurate. Visually inspect every affected output; U3 separately validates announcement timing and delivery behavior.

### M4. Launch dashboard and navigation — High

Redesign [Launch seasons](https://manekineko-staging-launch.vercel.app/seasons) and the application shell into a compact dashboard. The user finds the current app confusing and overwhelming; adding another large card to `/seasons` is insufficient.

Proposed information architecture, to refine against the existing routes:

| Area | Main content |
| --- | --- |
| Dashboard home | Current network, active collection/phase, next real opening, unpaid rewards, creator funds available, synchronization or delivery issues needing attention |
| Seasons | Compact searchable/filterable list, collection progress, actual lifecycle; drill into a selected season |
| Collections | Drafts and deployed collection details with clear editing/frozen boundaries |
| Activity | Worker runs, transactions, X outbox, verification and recoverable errors; details on demand |
| Creator earnings | Existing canonical read-only accounting from U5 |
| Network settings | Separate network X profile/configuration and readiness |

- Add a persistent desktop sidebar, compact top context bar and usable mobile drawer. Keep sign-out/account access clear. Update authenticated home/login destinations, route allowlists, deep links and existing Active/Upcoming entry points coherently; preserve useful links with redirects or clear destinations.
- Render the shared **Ethereum Mainnet / Sepolia testnet** selector using U6’s network context. Preserve network in navigation/reloads/links and surface the agreed unsaved-edit protection. Keep cache partitioning, late-response handling and authorization semantics in the U6 implementation.
- Main screens should answer what is happening, what has finished and what needs action. Move raw configuration, frozen artifacts and diagnostic detail behind deliberate drill-down/disclosures. Reuse M1–M2's compact typography/buttons/icons/dropdowns.
- Consume U1/U6 lifecycle fields, U3 delivery status and U5 accounting without deriving competing status or financial rules in the view. Display observation block/time, refresh, stale/partial/error states and retry actions. Distinguish prepared artifacts, actual collection/season lifecycle, worker state and outstanding social/reward work.
- Show Airy Garden’s two actual collections and **Complete** only when U1/U6 supply that verified state. Preserve the superseded ten-step run as labeled audit history. Keep operational actions explicit and separate from navigation; page loads must remain read-only.

Starting files: `apps/launch/app/layout.tsx`, `components/launch/launch-header.tsx`, `components/automations/{automation-console,season-runtime-panel,network-social-panel}.tsx`, `components/operations/collection-operations.tsx`, `components/earnings/creator-earnings.tsx`, page/route wiring, navigation presentation and CSS. Coordinate shared navigation/runtime edits with U6.

**Acceptance:** navigate dashboard → Airy Garden → each collection → earnings/activity without losing network or context. Switching networks cannot mix responses/data or enable Mainnet execution. Fresh chain, database and public views agree; outages display staleness. Test authenticated routing, refresh/deep links, unsaved edits, completed versus prepared presentation and mobile sidebar/focus behavior. Integrate against U1/U3/U5/U6 evidence; representative/mock UI states alone do not prove hosted synchronization.

### Medium/High delivery order and integration

1. Inventory shared controls and implement M1 tokens/components/icons/dropdowns. Record shared interfaces before migrating pages.
2. Complete M2 mint/footer refinements and M3 graphics. Coordinate shared wallet components with U2/U4 and social files with U3 so presentation changes preserve behavior.
3. Build the M4 shell and responsive navigation, then integrate U1/U3/U5/U6 state after those interfaces are ready. Independent layout work can use clearly labeled fixtures while live integration remains pending.
4. Run affected packages' required type/build checks and meaningful interaction tests. Visually inspect representative app states and generated social images. Avoid implementation-mirroring tests for simple CSS.
5. Have the integration owner reconcile all 20 notes below and obtain Ultra's review of shared state/wallet/accounting behavior before declaring the combined implementation complete.

### Shared verification and implementation report

The implementation report must separate **source/tests**, **local browser visuals**, **database persistence**, **hosted authenticated UI**, **real wallet/device behavior**, **canonical chain verification**, and **confirmed X delivery**. Record remaining configuration/URL/device dependencies explicitly. A successful build or mocked provider is not proof of a working wallet popup, correct hosted funds, or a published post.

### Coverage of all 20 user notes — both handoffs

| # | User observation/request | Scope |
| --- | --- | --- |
| 1 | Oversized/crowded 20-mint disclosure and expanded text | M1, M2 |
| 2 | Smaller navbar/Tincta lettering; Apple reference; restrained headings | M1 |
| 3 | Standardize button border radius to about 3 px | M1 |
| 4 | Professional footer: landing, app, docs, contacts, Support placeholder, Telegram | M2 |
| 5 | Artwork caption spacing and duplicate “Illustrative artwork” | M2 |
| 6 | Compact, better-spaced past-winners card | M2 |
| 7 | Smaller consistent buttons throughout apps | M1, M2 |
| 8 | One icon library; consistent arrows; no browser-native UI icons | M1 |
| 9 | No icons rendered as emoji on mobile | M1 |
| 10 | Replace all visible native selects with compact custom dropdowns | M1 |
| 11 | Verify absence of contract pause and on-chain counter authority | U1 |
| 12 | Replace sold-out landing fallback with accurate processing state | U1; M1 styling |
| 13 | Remove “Color study” from X image posts | M3; U3 queued-payload compatibility |
| 14 | Claim/connect feedback and provider/account choice; evaluate WalletConnect | U2; M1 shared controls |
| 15 | Missing prizes-available X post despite reported 4/4 payments | U3; U1 award-count reconciliation |
| 16 | Access to winner/affiliate/buyer wallets; referral notification, attribution and commission test | U4, U2; M1 shared controls |
| 17 | Remove collection claim CTA once every prize is paid | U2, U1 |
| 18 | Two-collection Airy Garden incorrectly shows upcoming collections | U1, U6; M4 presentation |
| 19 | Creator earnings unavailable on staging Launch | U5; M4 presentation |
| 20 | Airy Garden stuck at prepared; clearer networks; complete Launch dashboard/sidebar redesign; synchronized data | U6, U1, U5; M4 dashboard |

Completion means these requirements have an implemented outcome and an honest acceptance result, or a clearly identified external dependency. Do not equate Airy Garden's user-reported successful run with resolution of every UX or integration issue above.
