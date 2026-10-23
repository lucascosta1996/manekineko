# V12 operator interface and route replacement

**Public UI supersession (2026-10-23):** the route inventory below describes the initial replacement. Public participation is now unified at `/`, with dedicated `/claims` and `/affiliates` pages. `/collections` and `/vote` redirect home; `/prizes` redirects to `/claims`. Launch remains `/dashboard`. See [the current public workflow](v12-public-workflow-2026-10-23.md).

**Subsequent policy update:** [72-hour randomness timeout and funded execution](v12-draw-failure-policy-2026-10-22.md) supersedes this record’s no-timeout/affiliate-vesting/timer behavior and adds 0.01 ETH to preparation costs. Earlier test counts below describe their original revision.

Local implementation checkpoint, 2026-10-22. This replaces the prior database/worker page workflows. It does not deploy V12, upgrade any existing contract, change a frozen identity, persist database drafts, send X posts or authorize a public-chain transaction.

**Subsequent settlement refinement:** the primary action now combines finalization, the ordinary operator withdrawal and next preparation. Countdown semantics and the additional contract/UI checks are recorded in [single-signature settlement](v12-single-signature-settlement-2026-10-22.md). Earlier check counts below remain the route-replacement checkpoint.

## Active interfaces

Launch has one operational page, `/dashboard`, with independent Mainnet and Sepolia selection. Its left column shows actionable contract transactions; its right column shows the sealed season/collection catalog and current onchain position. Search and collection selection let the operator inspect remaining settlement actions for earlier collections. Prepared historical entries are not labeled paid without checking their state.

The queue includes exact preparation funding shortfalls, deterministic next preparation, failed VRF request retries, bounded draw finalization, ordinary operator withdrawals and separately labeled unused affiliate/VRF/sponsorship/operating fund recovery. The draw-request state also offers an exact-amount VRF funding review. Operator withdrawals always target the immutable operator wallet and are disabled for a different connected account. No activation, pause, mutable economics or worker toggle exists.

Voting and minting deadlines need no operator signature. A pending transaction still requires someone to submit it and pay gas. A wallet prompt appears only after review; WebSocket notifications and polling refresh the display without signing anything.

Public Web serves `/collections`, `/vote` and the updated `/docs` guides. The collection page contains minting, affiliate enrollment/claims, prize claims, refunds and sponsored redemption. The voting page shows contract options, snapshot eligibility and ballots. Names/artwork are committed in the catalog; economic choices remain governed by the V12 contracts. The immutable 0.01 ETH price floor, 1,000 supply floor and 60/20/20 allocation remain unchanged by this interface work.

Landing reads verified V12 state through Web `/api/protocol/status`. Its catalog totals are explicitly minimum-term examples, not collected balances or promised winnings; the affiliate allocation is consistently 20%.

## Retired routes

| Application | Retired workflow pages | Replacement |
| --- | --- | --- |
| Launch | login, activity, settings, seasons, launch editor, automations, active collection, upcoming collection, earnings | Redirect to `/dashboard` |
| Web | mint and its affiliate/contract details, seasons and season details, history, my NFTs, NFT detail, prizes, operations | Redirect to `/collections` |

Their former HTTP APIs return **410 Gone**, including mutation methods. Launch no longer mounts password authentication, database drafts or privileged worker handlers. Historical `/api/nfts/[collectionId]/[tokenId]` remains a read-only metadata compatibility endpoint. Old internal source adapters and their version-specific tests remain available for historical audits; they are not production page entry points.

The production Next route output was inspected. Thirty-three local production HTTP checks covered 18 retired-page redirects, eight retired API method calls, six active pages and the unconfigured chain-status endpoint.

## Shared chain reads and wallet review

`packages/protocol` owns the shared reader, experience, wallet connection, operator queue and catalog tree. Existing Web imports re-export the shared implementations to preserve older unit-test coverage without duplicating signing code.

Reads use one verified block and controller runtime pin. A stale or failed refresh retains an explicitly labeled last snapshot and disables signing. The sealed catalog cache checks its anchor block against reorgs. Network changes remount the experience and do not carry the selected wallet or pending action to another network.

Transactions are rebuilt from fresh chain state and simulated through the selected wallet RPC after review. Changed terms, action, amount or collection require another review. A per-wallet browser lock prevents concurrent tabs from prompting for the same journal. The journal saves destination, calldata, exact value, account, network and nonce before submission. Explicit rejection unlocks; uncertain submission stays locked across reloads. A supplied recovery hash must match the complete saved intent before receipt reconciliation.

If the browser lacks the locking or durable storage capability, signing fails closed. The UI does not contain a server signing key.

## Mainnet and testnet catalog preparation

`apps/launch/catalog/mainnet.json` and `sepolia.json` each contain **22 seasons and 216 collections**. Mainnet names and color order follow `seasons.json` and `collection-names.json`. The new Sepolia V12 plan uses independent season IDs and names such as Aster Study / Aster Atlas, with the same season sizes and artwork colors. It does not overwrite the previously persisted V10 mock seasons or rename existing contracts.

When no deployment is configured, Launch labels these entries **Not deployed**, displays no executable signatures and distinguishes preparation plans from chain state. Once configured, the displayed catalog comes from the controller, not these fallback files or a database.

**Migration reconciliation is still required.** The attempted read-only staging export failed with SQLSTATE 53000 (database resource unavailable). The checked-in Mainnet IDs follow the current canonical import namespace; an older local backup contains different IDs. Neither source is proof of the current saved catalog. Do not upload or seal a migration catalog until the actual saved identities/symbols/text colors are reconciled. Preserve existing IDs and frozen exports; do not silently regenerate them to satisfy a validator. The current canonical-ID validation deliberately rejects a mismatched saved export and must be reviewed against that evidence before migration.

`scripts/protocol-v12/export-catalog.mjs` is a read-only verification/export tool. It refuses to overwrite differing catalog files. `catalog-input.mjs` converts the local planning catalog to offline preparation input; it does not broadcast. Both network conversions were checked: 216 entries and 22 calldata batches each. Example:

```sh
node scripts/protocol-v12/catalog-input.mjs sepolia CONTROLLER options.json review.json
```

`options.json` is the reviewed array of economic packages, with exact integer strings for supply, wei price, winner count and duration seconds. Initial deployment, registry ancestry, source registration, catalog upload and sealing remain separately reviewed deployment work; they are not represented as ordinary between-collection signatures.

## Deployment configuration

Launch `.env.example` documents independent `NEXT_PUBLIC_V12_MAINNET_*` and `NEXT_PUBLIC_V12_SEPOLIA_*` controller, runtime hash, HTTPS RPC and optional WSS pins. Public endpoints must be suitable for browser exposure. The optional WalletConnect project must allow the actual Launch origin. Launch needs no database, password login or private signer configuration for V12.

Web uses its selected network's public deployment configuration. Until pins are present it renders an honest unconnected state. Setting pins is not a substitute for deployment verification. X remains a separate read-only observer/outbox and cannot block a deadline or alter the pending contract actions.

## Verification

- Production builds: Launch, Web and Landing passed locally.
- V12 contract suite: 16 passed, including the actual deployed-contract reader and sealed-catalog cache integration.
- Protocol preparation/operator/configuration/catalog tests: 10 passed.
- Web unit tests: 290 passed, three database-dependent skips.
- Launch unit tests: 190 passed, six database-dependent skips; preparation tooling: five passed.
- Landing unit tests: 17 passed; two opt-in database/setup checks skipped.
- UI source policy and visual TypeScript checks passed. Full local browser suite: **330 passed, six intentional Studio viewport/browser skips**. Focused V12 coverage comprises 33 Launch and 39 public Web checks. Launch tests cover exact operator proceeds, wrong wallet, rejection, uncertain submission restoration, draw funding, invalid pins and planned-state truthfulness. Chromium, Firefox and WebKit checks include responsive layouts, accessibility, keyboard behavior, coarse pointers, 200% text size and text-spacing reflow. Approved brand/artwork generation checks also passed.
- Legacy-page browser specimens were moved to `.legacy.ts` because their production routes were removed. Current-route tests replace them; historical screenshot files are retained. Landing baselines were updated only for the reviewed example/voting copy. After the final headline removed the obsolete 6 ETH cap, all **63 Landing browser checks** passed again and its production build passed. A build alone is not visual acceptance.

Hosted deployment, an actual connected wallet, live Chainlink delivery, database catalog reconciliation and public-chain operation remain unverified. Earlier full-contract-suite evidence is recorded in the separate implementation checkpoint; no Mainnet readiness is inferred from local mocks.
