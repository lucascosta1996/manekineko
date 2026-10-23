# V12 public participation workflow

Local UI implementation, 2026-10-23. This supersedes the public route composition in the October 22 operator handoff. It does not deploy V12, change immutable rules, seal a catalog, fund a wallet, start the rehearsal, or send X posts.

## Public routes

| Route | Purpose |
| --- | --- |
| `/` | Current season/collection, Vote → Mint → Draw → Claim/Refund progress, and the current action centered on the page |
| `/claims` | All winning NFT IDs, full current holder addresses, exact prizes and claim status; prize claims, refunds, draw recovery/finalization and sponsored redemption where applicable |
| `/affiliates` | Enrollment, qualifying NFT fields, collection-bound referral links/copy, and affiliate reward claims |
| `/docs` | Current explanations of voting, collections and protected rewards |

The home page follows the latest prepared round unless a referral URL explicitly selects an earlier collection. Earlier selection is labeled and has a return-to-current action. Rewards and affiliates support selecting any prepared collection. Names and economics come from the verified round; no database determines availability.

`/collections` and `/vote` redirect to `/`, preserving query parameters. `/prizes` redirects to `/claims`. Other retired workflows keep their redirects and HTTP APIs remain 410. Returning home during client navigation clears an earlier collection/referral selection; selecting a different collection removes the old referral code. Query synchronization uses a small Suspense boundary without suspending the page shell.

## Stage behavior

- Before preparation/configuration: an explicit preparation state, no simulated balances, votes or mint controls.
- Voting: published option packages, exact price, supply, equal prize count, mint duration and votes. Snapshot/source-group rules and dates are in a disclosure. Fifteen-minute rehearsal options display in minutes rather than as zero hours.
- Minting: final terms, minted/supply counts, remaining wallet allowance, quantity validation, exact total excluding network fees, and the existing reviewed mint transaction. Referral and sponsored-ticket inputs are secondary disclosures.
- Draw: a simple explanation of the current request/randomness/finalization stage and the relevant countdown. Rewards links to the full draw/claim page. Request retry and permissionless funded finalization remain available there.
- Claims: every winning NFT and its **current holder** address are shown, with claimed/unclaimed state. This is not a fabricated original-recipient history; a claimed NFT may subsequently transfer. Earlier unclaimed prizes remain accessible.
- Refund: the full-price refund action replaces minting only when the contract reports the refundable phase. A browser countdown cannot change eligibility.

Mint price/supply floors, 60/20/20 allocation, affiliate qualification/equal sharing, wallet mint limit, snapshot voting, immutable cutoff, funded execution, recipient protections and durable transaction recovery are unchanged. The shared reader and signing path are retained. Disconnected, pending, initial error, stale, recovery and unknown-submission states remain distinct. Last-known data cannot authorize signing. Legacy voting deposits remain withdrawable through the disclosed vault controls after voting closes.

## Presentation and implementation

The UI retains the approved C/Ligature + Open Rewards lockup and shared `packages/ui` tokens, Button, Field/Input, Radio, Select, Disclosure and confirmation dialog. No new brand geometry or remote images/fonts were introduced. `packages/protocol/src/public-workspace.tsx` owns the public composition; its stylesheet is scoped to `.public-workspace` and public layout classes. `experience.tsx` keeps the existing wallet, fresh-read, exact-review, simulation and durable submission journal around the public panels and Launch workspace. `CollectionTiming` has an opt-in compact public rendering; Launch retains its full timing rendering.

The active action is centered, with a quiet lifecycle strip, persistent Rewards/Affiliates navigation and concise stage copy. Repeated explanations were moved into disclosures. Mainnet catalog names, stable IDs, exact colors and permanent NFT artwork were not changed. The frozen two-season runner remains independent of Web development/rebuilds.

## Verification and boundaries

Executed locally:

- Web unit tests: **290 passed, 3 database-dependent skips**. No staging fixtures were seeded.
- Protocol/operator tooling unit tests: **25 passed**.
- Web and Launch production builds passed; Web/visual harness type checks passed.
- Brand generation parity: **55 artifacts verified**. UI source contract checks passed.
- Public protocol/home/docs browser coverage: **162 unique passing checks**, with **30 intentional secondary-engine viewport skips**, across the full run and the focused stale-state rerun. The rerun waits for the connected wallet's fresh read before simulating an outage; a Next route-announcer was excluded from the application alert assertion.
- Web shell/brand/resilience plus final mint render: **33 passed**, including navigation breakpoints, coarse targets and 200% text reflow.
- Launch regression: **54 passed**, including settlement, funded draw execution, wallet rejection/recovery and immutable timeout layouts.
- Main local app route smoke: `/`, `/claims`, `/affiliates` return 200; `/vote` and `/collections` preserve collection/referral query parameters in 307 redirects; `/prizes` preserves the selected collection into `/claims`; retired `/api/collections` returns 410.

Browser fixtures import production components with isolated RPC responses and simulated wallets. All writes are intercepted; simulated signatures are rejected. Coverage includes exact mint value/referral calldata, immutable ballot review, current-holder prize claims, paid-prize guards, earlier collection selection, enrollment/referral copy affordance, source-vault access, phase changes, no-round/undeployed states, pending/stale/retry, 320/390/768/1280/1440 layouts, keyboard/mobile navigation, coarse controls, 200% text/spacing and forced colors. Axe scans cover the changed stages. Desktop and mobile screenshots were visually reviewed.

Environment: macOS 15.4.1 arm64, Node 22.20.0, Playwright 1.58.2; Chromium 145.0.7632.6, Firefox 146.0.1, WebKit 26.0; system fonts, en-US, UTC. The harness records the environment in `test-results/visual-environment.json`; screenshots retain their engine/device capture scale.

Evidence is under `test-results/` (`v12-home-*.png`, `v12-public-*.png`, and `v12-home-mint-preview.png`), with detailed test logs saved locally under `/tmp/tincta-*-browser.log`. These are local evidence artifacts, not hosted deployment records or a claim that CI ran. The dev preview is `http://127.0.0.1:4323/`; it honestly shows preparation until a verified V12 deployment is configured. The in-app browser preview was inspected separately.

Physical iOS/Android devices, manual screen-reader review, hosted deployment, a real connected wallet, live mint/claim/refund execution and the public Chainlink rehearsal remain unverified. This work does not establish Mainnet readiness. Existing audit/catalog/executor release gates remain in the protocol readiness record.
