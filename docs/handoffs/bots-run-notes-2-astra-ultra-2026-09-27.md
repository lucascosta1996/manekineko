# Bots run notes 2 — GPT Astra Ultra handoff

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

**Assigned scope:** implement U1–U6 in this file. Use the companion Medium/High handoff for presentation dependencies.

## Implementation scope — GPT Astra Ultra

**Outcome:** establish correct state and transaction behavior, then hand documented interfaces and evidence to [GPT Astra Medium/High handoff](bots-run-notes-2-astra-medium-high-2026-09-27.md). Keep the real wallet flow functional here; shared visual polish comes from M1–M2.

### U1. Contract authority, counters and consistent lifecycle presentation

#### Verify the no-pause requirement and on-chain counters

Audit the **actual deployed** V10 ABI/runtime and inherited/dependent contracts, not only a UI control or a text search. State whether any authority can pause minting, claims or relevant dependencies, and list material administrative gates separately.

The inspected round source has one-way owner activation, immutable `saleStartAt`/`mintDeadline`, `block.timestamp` checks, `totalMinted`, refund-adjusted `totalSupply()`, and expired-round cancellation. This is not a complete deployed permission audit. Distinguish a paused **worker** from a paused **contract**. No pause switch does not mean there is no owner authority, activation/funding requirement or external dependency. Preserve valid expiry/refund behavior. If an actual prohibited pause capability exists, report its reach and a prospective versioned remedy; a frontend edit cannot remove it from a deployed contract.

Interpret “counter” as covering both the mint/supply count and the countdown, so neither question is lost:

- Sold/remaining quantities derive from verified on-chain state with the correct version semantics; do not confuse cumulative primary mints with circulating supply after refund burns.
- The browser animates time remaining from verified contract timestamps and a chain-time observation; contract execution uses block time. Do not describe each screen tick as an on-chain transaction/read. Resynchronize on refresh, tab resume and relevant events; test device clock skew and stale RPC data.
- Before deployment, a published planned schedule is explicitly a schedule, not an on-chain deadline. Crossing an opening time is not proof of deployment or activation. Pausing a worker or reloading the page never resets or extends deployed time.

#### Landing hero and season completion

Replace the sold-out fallback **“The next collection will appear after its announcement.”** with state-aware content. The user's suggested processing copy is **“Latest collection prizes and winners are being processed”**. Use it only while that processing is actually pending.

| Verified state | Required presentation |
| --- | --- |
| Mint active | Current collection, actual remaining supply and verified deadline |
| Sold out / draw pending | Processing message and link to latest collection/draw progress |
| Draw finalized, unpaid prizes exist | Winners/results and prizes available to their current holders |
| All prizes paid | Paid/completed message and results/history; no collection claim CTA |
| A real next collection is announced | Its actual schedule and link, with accurate readiness status |
| Season's real collection sequence is finished | **Season complete**, actual completed/total collection count, results |
| Observation unavailable/stale | Explicit last observation/unavailable feedback; no invented zero, active clock or completion |

Agree one lifecycle/read model across Web, Landing, Launch, indexing and worker projection. Define precedence when a season has both a completed collection and a published upcoming collection. Avoid replacing one misleading empty string with a permanent processing message.

For Airy Garden, reconcile the actual two-step run and both collections. Do not generate upcoming slots from a ten-color/default catalog or the superseded run. Mark the season complete once its actual collection lifecycle is terminal; show any outstanding prizes/commissions or social work separately. **Season complete**, **all rewards paid**, and **worker finished** are different facts. Do not leave a finished sequence looking upcoming because a commission is unclaimed or a supplemental X post failed.

Starting files: `packages/contracts/src/lifecycle.{ts,css}`, Web `lib/seasons/{featured,model,activity,schedule,schedule-repository}.ts`, `components/{seasons-experience,announced-season,collection-activity,draw-progress}.tsx`, `/api/seasons/featured`, Landing `/api/live-collection` and `components/live-collection.tsx`, plus Launch runtime/operations readers.

**Acceptance:** table-driven coverage of live → sold out → draw → claimable → paid, a two-collection finished season, a genuinely upcoming collection, expired/refundable collection, stale observations and mismatched worker/database state. Verify the timer across reload, clock skew and worker downtime. Record deployed contract evidence with chain/address/block/hash and audit conclusions.

### U2. Wallet selection, prize feedback and paid-state actions

Rework the journey as a connected flow, not a collection of unrelated connect buttons. Cover minting, ranked prize cards, `/prizes`, affiliates and sponsored rewards with consistent provider/account presentation.

- Let the user choose an available wallet provider, including MetaMask and Trust Wallet where available, then choose among accounts that provider actually authorizes. Display the active wallet, abbreviated address and network with a clear switch action. Do not infer accounts the wallet has not exposed.
- Reuse the existing provider discovery/account-picker work. Evaluate **WalletConnect** for QR/mobile/deep-link sessions and implement it if it is the appropriate supported way to deliver the requested mobile wallet flow. This is the user's suggested solution, not a mandate to discard functioning injected-wallet support. Document the choice, configuration requirements and verified wallet/device coverage using current official integration documentation.
- Handle account/network changes, disconnects, canceled requests, unavailable providers and expired sessions. Invalidate stale eligibility/claim state when wallet identity changes; never sign through a different provider/account than the one shown.
- Give immediate, visible feedback near the selected prize or in an accessible dialog/toast. A nonwinning wallet should see a clear message such as **“This wallet does not hold this winning ticket. Switch wallets to claim.”** Include the ticket reference and switch-wallet action. Distinguish already paid, draw pending, wrong network and unavailable verification from an ineligible wallet.
- A winning holder should see the amount, selected account, transaction stage and **“Confirm in your wallet”** when a request is actually pending. On mobile, offer the supported wallet-opening action if needed. Show rejection/revert/confirmation and a transaction link. Never promise that a wallet popup opened when the app cannot establish that.
- Track the active operation by prize/account. Other buttons may be disabled to prevent concurrent signing, but they must not all display “Checking wallet…” as if each were processing. Keep pending transaction recovery durable across refreshes and never resubmit automatically after an ambiguous response.
- Before submission, freshly verify the chain, runtime/version, winning token, current ownership, amount and unpaid state; preserve simulation and explicit holder signatures. Wallet connection alone must not silently submit a claim.
- Refresh after a confirmed claim, including the local card, collection totals and prize hub, while handling indexing lag honestly. A confirmed paid prize must lose its claim action. When **all this collection's prizes are paid**, remove the collection-level “Claim your prizes” CTA; show “All prizes paid” plus results/payment-history access. Keep the global prize-discovery destination available for other collections.

Starting files: `apps/web/components/prizes/{ranked-awards,prize-hub}.tsx`, `components/draw-progress.tsx`, `lib/prizes/{wallet,model,repository}.ts`, `lib/affiliates/{wallet,wallet-discovery}.ts`, and existing affiliate/NFT account pickers.

**Acceptance:** exercise disconnected user, wrong wallet, multiple providers/accounts, correct holder, transfer of the winning NFT before claim, wrong network, rejection, pending/ambiguous receipt, confirmed claim and all-paid state. Include a wallet with multiple winning NFTs. A transfer changes current claim rights but must not attribute an earlier payout to the new holder. Simulated provider tests and real extension/mobile checks must be reported separately.

### U3. Timely reward announcements and durable X delivery

- Do not rewrite confirmed posts, frozen payloads or their deduplication identities. Handle already queued graphics through an explicit compatible migration/review path, preserving delivery history; inspect generated image output as well as text.
- Diagnose why no visible prizes-available post appeared by the time the user saw all four prizes claimed. Inspect canonical draw/claim events, persisted observation, event creation, outbox gating, media processing, supplemental failure handling, configured network/account and actual confirmed post IDs. Do not infer billing/permission causes from the earlier 403 alone.
- A verified draw making prizes claimable should create a durable **prizes available/results** announcement promptly, without waiting for a claim or for all prizes to be paid. Make event detection and enqueue timing measurable against the configured worker polling/confirmation intervals.
- Keep prize availability, individual payment receipts and all-paid/season-completion summaries distinct. If delivery is delayed until all prizes are paid, the eventual copy must reflect the current paid state rather than incorrectly inviting claims. The earlier eligibility transition should still be traceable in the event history.
- Reconcile pending social work after the sale/run is otherwise complete. A failed individual winner reply must not suppress the primary results announcement, public state refresh, claims or the next authorized step. Preserve required announcement/activation gates.
- Preserve at-most-once effects through durable identities and exact ambiguous-delivery reconciliation. Persist sanitized failure reasons, retries and next action; show delayed/failed delivery in Launch. Do not blind-repost on restart or retitle an already confirmed post.

Coordinate new image/alt-text changes with M3. Ultra owns compatibility decisions for queued/frozen payloads, event identity and delivery; M3 owns newly generated artwork presentation.

Starting files: `packages/contracts/src/season-social.ts`, `scripts/season-runner/{runner,outbox,social,social-image}.ts` and their tests; Launch runtime activity/outbox data.

**Acceptance:** test draw finalization before any claim, rapid claims before the next tick, all-paid before delivery, supplemental 403, ambiguous success and restart. A local mock proves scheduling/idempotency behavior; only confirmed X post IDs prove live delivery. No X posting is performed merely to prepare this handoff or its implementation. Coordinate generated-image checks with M3.

### U4. Next Sepolia script: manual winner and affiliate workflow

Extend the next rehearsal to give the user **three distinct usable wallet roles** and time to interact through the app. Reuse the separate Sepolia entry point and encrypted wallet vault. Prepare a reviewed run plan and import instructions, not private keys in this document or a public UI.

| Role | Required access and setup | User-visible test |
| --- | --- | --- |
| Winning NFT holder | Select a real winning holder **after** the verified VRF draw; retain its winning token, unpaid prize and gas for the user | Import/connect, see eligibility and wallet prompt, claim, then see payment/history and removed CTA |
| Affiliate | A distinct wallet with genuine eligibility from the applicable registry/history and enough gas | Enroll during the actual window, obtain referral link, receive referral-use notification, inspect commission and claim when available |
| Referred buyer | A different wallet with mint funds/gas and remaining lifetime collection allowance | Open the referral URL, verify affiliate attribution, mint, see the receipt and reward attribution |

- Provide public role addresses, chain, collection/run IDs, relevant NFT IDs and tested step-by-step wallet import/network instructions in a sanitized run sheet. Deliver only the selected test-wallet access through a private local export/import mechanism with restrictive permissions; do not export the entire vault or send key material to Launch, Git, chat, screenshots or logs. Inspect and use the existing custody boundary. No wallet access/export happens while preparing this handoff.
- A winner cannot be guaranteed in advance with real VRF. Choose an actual post-draw winner and withhold the bots' claim/sweep for that role. A previously paid winning wallet may demonstrate payment history but does not satisfy an unpaid-prize claim rehearsal.
- Add a durable manual-checkpoint/role reservation so automatic minting, claims, transfers and treasury recycling do not consume the user's test actions or gas. Resume must preserve those reservations. Plan supply/allowance and bot completion around the manual buyer so the collection can actually sell out without exceeding caps.
- Give the affiliate the full enrollment window; validate eligibility and admission through the real flow. Do not reset bootstrap, manufacture eligibility, bypass bot verification or silently transfer an eligibility NFT. Any preparation transaction must be included in the concrete run plan.
- When a buyer arrives through a valid referral URL, show the verified affiliate wallet before signing, for example **“This mint counts toward the affiliate rewards of 0x….”** Explain that commission follows the collection's qualification/sellout rules; it is not necessarily an immediate per-mint payment. Resolve the URL/slot to the actual on-chain enrolled wallet, show the full address on inspection, and handle invalid/expired/self-referral cases according to contract rules. Do not silently drop a referral into a direct mint.
- Notify the connected affiliate **inside the app** when a confirmed referral is attributed to that wallet. Keep referral count/activity and qualification visible after reconnect; deduplicate notifications using canonical event identity and handle reorgs. This request does not require email, push or Telegram delivery.
- At sellout and the actual contract-defined availability point, show the accrued/claimable commission and an explicit claim flow. Distinguish qualified, accrued, available, pending and paid states; demonstrate that claim value matches the equal-share/cap rules.
- Prepare funding/gas limits, expected transactions/events, manual pause/resume instructions and completion evidence. Keep this sellout scenario separate from the earlier three-mint refund scenario. Mainnet must reject these controls before touching rehearsal services or keys.

Starting files: `scripts/season-runner/{sepolia,sepolia-wallets,sepolia-scenarios,runner,chain-transactions}.ts`, existing scenario tests, Web affiliate/mint components and wallet/account readers. Coordinate closely with U2; a bot-only claim is not acceptance for the user's manual wallet journey.

**Acceptance:** the user can obtain access to all three roles and complete the real app interactions. Capture sanitized transaction hashes for enrollment, referred mint, prize and commission claims, UI feedback and final balances/rights. Until that separately authorized live test occurs, report the flow as implemented/tested locally and live acceptance pending.

### U5. Creator earnings visibility and accounting correctness

Investigate the user's failure at [Launch staging earnings](https://manekineko-staging-launch.vercel.app/earnings). This is a repair of an existing read-only feature, not a request to put wallet keys or signing into Launch.

- Reproduce with authenticated access and the intended **Sepolia** selection; also check Mainnet's legitimately empty state. Record the deployed version, selected network and sanitized UI/API failure.
- Trace `/api/launch/earnings?chainId=11155111`, database deployment/catalog registration, restricted read grants, `LAUNCH_EARNINGS_RPC_URL_11155111`, RPC chain/access, supported contract versions and owner/round/runtime checks. The current reader joins registered deployed collections; a deployed round missing from that catalog must be diagnosed explicitly.
- Include both actual Airy Garden deployments and eligible archived/retired deployments for balance discovery. Public listing visibility is not evidence that no funds remain.
- Show actual contract balance, ordinary withdrawable proceeds, released growth reserve, unpaid prizes, outstanding commissions and refund/other protected liabilities distinctly at a consistent verified block. Claimed prizes and protected funds are not creator earnings. Separate funds still available from historical withdrawals; zero after withdrawal is different from a failed read.
- Show chain, contract, owner, observation block/time, stale/partial results and a useful retry action. Do not replace missing RPC/configuration/indexing/permissions with zero or a blank screen. Totals must state whether they exclude failed reads.
- Fix source/configuration expectations and document any required hosted change precisely. Preserve authentication, minimal DB grants and the read-only boundary. No withdrawal, key entry or automatic treasury sweep belongs in this UI request.

Starting files: `apps/launch/app/earnings/page.tsx`, `app/api/launch/earnings/route.ts`, `components/earnings/creator-earnings.tsx`, `lib/creator-earnings{,-store}.ts`, and associated tests.

**Acceptance:** authenticated Sepolia data reconciles with canonical on-chain balances, owner and liabilities; Mainnet remains separate; unavailable and partial reads are explicit. Anonymous access remains denied. Local tests, hosted authenticated behavior and live balance verification are separate evidence items.

**Presentation dependency:** provide M4 with the canonical accounting fields, partial/stale/error states and retry behavior. M4 may restyle the earnings view; accounting derivation and read/auth boundaries remain owned here.

### U6. Launch network isolation and synchronized state

Own the data, network-isolation and lifecycle behavior used by M4’s Launch dashboard. Keep the shell and visual redesign in M4.

- Use one prominent **Ethereum Mainnet / Sepolia testnet** selector across the dashboard, seasons, collection operations and earnings. Preserve network in navigation/reloads and relevant links. Partition caches/queries by chain and discard late responses from the previous network. Keep unsaved-edit protection, auth/origin checks, and staging's Mainnet planning-only restrictions.
- **Prepared** is an artifact/workflow state, not the season's latest chain lifecycle. Show planning, worker and chain states separately where useful, with the actual current lifecycle dominant. Reconcile why Airy Garden remains prepared; do not relabel its immutable prepared artifact or merely patch one database status to hide the discrepancy.
- Define field-level authority: saved plans/artifacts for intended configuration, registered canonical contracts for lifecycle/rights/balances, confirmed events for receipts, worker store for execution status, X outbox for delivery, and database projections for discoverability. Preserve original and approved recovery dates in the audit.
- Repair ingestion/reconciliation/cache invalidation as necessary so events update all views without a manual data rewrite. Use bounded refresh or the existing event mechanism, last-successful observation time/block, manual refresh and visible stale/error states. “Always synchronized” means honest observed state with recovery; no system can guarantee instantaneous data through an RPC/indexer outage.
- Read-only page loads must not run the worker, publish posts, rewrite schedules, prepare a deployment or submit a transaction. Keep operational actions explicit and visibly separate from navigation.
- Airy Garden should show two actual collections and **Complete** when fresh evidence meets U1's rule. Preserve the superseded ten-step run as labeled audit history. Show pending social work or unclaimed commissions separately without inventing upcoming collections.

Define and implement the shared network context/query contract, authenticated route boundaries and navigation targets before M4 wires the shell. Preserve account/sign-out behavior, origin checks, unsaved-edit protection and supported deep links. M4 implements the sidebar, selector presentation and route wiring against this contract.

Starting files: `apps/launch/lib/{launch-navigation,season-runtime,season-runtime-store,season-runtime-preview}.ts`, operations APIs, chain-scoped query/cache logic and existing runtime/operations components. Coordinate layout/header/navigation edits with M4.

**Acceptance:** switching networks cannot mix responses/data or enable Mainnet execution; late responses from the previous network are discarded. Fresh chain, database and public views agree; outages display staleness. Cover prepared versus terminal lifecycle, two actual Airy Garden collections, authenticated route/deep-link boundaries and page-load side effects. M4 verifies the final dashboard journey and mobile navigation.

### Ultra delivery order and handoff

1. Reproduce and record current hosted/state discrepancies using read-only evidence. Establish actual collection prize counts and completion; inspect current deployment/source differences.
2. Define and implement U1/U6 lifecycle fields, authority, network context and stale/error semantics. Give [GPT Astra Medium/High handoff](bots-run-notes-2-astra-medium-high-2026-09-27.md) the interface/type locations, representative states and navigation contract.
3. Complete U2 wallet/claim behavior and U5 creator earnings, including explicit unavailable/partial states. Reconcile projections rather than masking stale state with copy.
4. Complete U3 event timing/outbox observability, coordinating queued-payload compatibility with M3. Preserve already delivered history.
5. Complete U4 using the wallet and affiliate flows. Present the concrete next run, private access procedure, funding caps and manual steps for the separate execution decision.
6. Run focused behavior tests and required type/build checks for affected packages. Use an isolated database for SQL tests. Hand over sanitized findings, changed interfaces/files, regression results and pending external dependencies. Review [GPT Astra Medium/High handoff](bots-run-notes-2-astra-medium-high-2026-09-27.md)'s integration for wallet, accounting, lifecycle and network regressions.

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
