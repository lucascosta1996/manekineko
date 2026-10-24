# V13 season holder rewards

Local implementation, 2026-10-24. This is a new contract graph, not an upgrade of V12 or an existing season. No public-chain deployment, hosted release or live wallet claim is established by this record.

## Fixed allocation and coverage

A successful draw allocates paid mint revenue as follows:

| Destination | Share | Availability |
| --- | --- | --- |
| Winning NFTs | 60% | Existing equal-prize claims after the draw |
| Qualified affiliates | 20% | Existing equal affiliate claims after the draw |
| Season holder pool | 8% | Locked until every planned collection in that season settles |
| Protocol treasury | 12% | Fixed operator wallet can withdraw after a successful draw |

The treasury supports current infrastructure and upcoming projects. Its spending is managed by the team, not restricted after withdrawal by the contract. Unallocated affiliate reserves and separate operational funding keep their independently labeled recovery rules. They are not holder funds.

The holder pool covers **5% of eligible NFTs**, rounded down, fixed in the contract. Only NFTs minted in successfully drawn collections in that season count. Winning NFTs qualify. Refundable collections contribute neither ETH nor eligible NFTs and preserve full mint-price refunds.

```
claimLimit = floor(eligibleNfts × 500 / 10,000)
rewardPerNft = floor(finalFundedPool / claimLimit) wei
```

For 10,000 eligible NFTs and 8 ETH, the first 500 NFT claims each receive 0.016 ETH. These numbers are illustrative, not fixed entitlements. The percentage counts NFTs, not wallets. There is no wallet cap. Onchain execution order determines the successful claims; transaction submission or a website review does not reserve a slot. Owning an eligible NFT does not guarantee a payout.

Only the current owner can claim, once per NFT. Transfers carry an unclaimed opportunity but never reset a completed claim. Approved NFT operators cannot claim on the owner's behalf. Claims are separate from winning-ticket prizes, affiliate earnings and the one-lifetime sponsored mint. There is no claim expiry. Integer division dust remains protected in the pool, with no administrator sweep.

## Dynamic season amounts

Only the 60/20/8/12 allocation percentages and 5% holder coverage are fixed. Community voting chooses each collection's mint price, supply, winner count and mint duration. Financial amounts use the selected terms and actual mint receipts; they do not assume a standard collection price, supply or season budget.

Each successful draw contributes exactly 8% of that collection's `totalMintRevenue` and adds its `totalMinted` to the season's eligible NFT count. The page reads these accumulated values from the contract. Pending or refundable collections do not inflate the funded balance. While the season is locked, the displayed slots and per-NFT amount are provisional and can change as more successful collections contribute. Once every collection settles, the final pool and eligible count determine the fixed claim amount. Claims reduce remaining slots and available ETH without recalculating a larger or smaller payout for later claimants.

For example, one season containing a successful 1,000-NFT collection at 0.01 ETH and a successful 2,000-NFT collection at 0.02 ETH accumulates 4 ETH for 3,000 eligible NFTs: 150 slots, each paying `floor(4 ETH / 150)` wei. A different season with 1,000 successful mints at 0.03 ETH accumulates 2.4 ETH: 50 slots of 0.048 ETH. Each season keeps separate accounting. Within a season, all qualifying claims receive the same amount even when individual NFTs had different mint prices.

## Contracts and invariants

- `ManekinekoRoundV13`: automatically calls `holderRewards.fund()` in the same transaction as successful draw finalization. Any failed funding reverts the finalization. Before reveal, all mint receipts remain in the round and reserved. After reveal, the 8% is held separately; existing prize, affiliate and execution reserves remain fully backed. Ordinary operator allocation becomes 1,200 basis points.
- `ManekinekoHolderRewardsV13`: immutable controller; no owner, withdrawal, pause or upgrade. Accepts the exact 8% only from an official revealed collection, once. Pool accounting is per season. Arbitrary donations cannot increase claim entitlements. Claims use checks/effects/interactions plus a reentrancy guard; rejected payouts roll back the slot and NFT flag.
- `ManekinekoSeasonControllerV13`: binds the holder contract once before catalog sealing. Records immutable first/last collection indices per season. Contiguous seasons contain at most ten collections, keeping settlement reads bounded. Existing permissionless preparation, voting deadlines and batched operator settlement remain intact.
- `ManekinekoWinnerCreditsV9`: recognizes V13 while retaining earlier version/algorithm pairs and lifetime ancestry. V12 and V13 targets both retain committed sponsorship protection during voting/minting and the opening-time eligibility rule.
- `ManekinekoRoundDeployerV13`: new immutable bytecode stores. V12 stores and exports are not rewritten. The new graph reuses Voting V12, Renderer V11 and the V12 timeout/executor policy under their actual names.

A season unlocks when every catalog collection in that season has revealed or become refundable. Unprepared, live, awaiting-randomness or unfinished-draw collections keep it locked. Refund availability counts immediately at its contract boundary; actually claiming refunds or prizes is unnecessary. Preparing the next season is unnecessary. An entirely refundable season ends with no eligible claims.

The round remains within Ethereum's runtime/initcode limits. V13 omits unused legacy getter/claim/withdraw aliases to accommodate the holder transfer; clients use `claimPrizeForRank` and `withdrawOperator`. V12 keeps its complete original ABI. Permanent artwork and number identity remain unchanged; scores still come from the existing VRF-derived draw.

## Website and configuration

`/holders` uses the shared verified reader and wallet transaction review/journal. Select a prepared collection to view its season pool and enter an NFT ID from that collection. The page distinguishes unconfigured, V12 without a pool, pending, locked, open, empty, exhausted, error and stale states. It shows accumulated ETH and settled-collection progress before unlock; estimated amounts are explicitly provisional. After unlock it shows the final per-NFT amount and remaining slots/ETH. No failed read is rendered as a zero balance.

Ownership, funded-collection eligibility, used claims, remaining slots and the exact amount are checked at a common verified block and again after review. Wallet-provider simulation and separate pool-code verification precede signing. The contract remains authoritative if another claim executes first.

`NEXT_PUBLIC_V13_*` pins explicitly select V13; V12 configuration and allocations retain their meaning. V13 additionally requires `HOLDER_REWARDS_CODE_HASH`. Launch supports independent Mainnet/Sepolia pins. Use browser-safe public RPCs only. Partial V13 pins fail closed. Never substitute V12 addresses or hashes.

`scripts/protocol-v13/verify-deployment.mts` checks the compiled graph, immutable values, code stores, catalog and voting choices, registry authority, VRF bindings, both pool/round allocations, season bounds, contributed funds, payout accounting and reserve backing. Its CLI requires independent RPC agreement at one finalized block. Like the V12 genesis verifier, it refuses historical migrations until prior authority retirement is independently verified.

For a disposable local node only: `npm run v13:deploy:local --workspace @manekineko/contracts`. This script refuses public networks. The V12 audit/rehearsal artifacts, executor and social tooling remain explicitly V12; a V13 public rollout needs its own reviewed manifest and operational integration. No catalog identities, Mainnet plans, saved database rows, deployed contracts or frozen exports were migrated by this work.

## Verification record

Checks completed locally:

- Full contract suite: **464 passing**, including V12 regression/rehearsals and the 17 new V13 cases. The final comment-only source cleanup was recompiled, re-exported and its 17 V13 tests rerun successfully.
- Dynamic-amount follow-up: **18 V13 tests passing** after adding an actual voting/mint/draw/claim regression with different prices, supplies and winner counts across three collections in two seasons. It verifies changing provisional amounts, final season totals, equal payouts across different mint prices, independent next-season accounting, exact treasury/affiliate/prize amounts, the production chain reader and claim transaction builder. Contracts typecheck passed. This follow-up changes tests and documentation only; the full 464-test result above predates the additional case.
- V13 coverage: exact allocation/reserves, locked/end boundary, equal payouts, first-5% exhaustion, current ownership, transferred used claims, winning NFTs, complete refunds, missing-entropy timeout, rejected payout rollback, reentrancy, multiple collections/seasons, integer rounding/dust, an entirely refundable season, atomic 12% settlement, actual-chain reader/claim construction, full compiled-graph verification and sponsored-mint/metadata independence.
- New round runtime: **24,140 / 24,576 bytes**. New controller, deployer, holder pool and credits registry also fit Ethereum runtime/initcode limits. Historical Solidity sources, ABIs/source exports, deployment records and V12 tooling were not modified.
- Web unit suite: **292 passing, 3 database-dependent skips**. Landing: **22 passing, 2 optional database/setup skips** across its two commands. Web, Landing, Launch and contracts typechecks passed. All three production builds passed; Web and Launch were rebuilt after the final shared claim-review change.
- UI source-policy and browser TypeScript checks passed. Production fixture builds passed for Web, Landing and Launch.
- Web/docs regression run: **207 passing, 42 planned viewport skips**. Final focused holder run: **42 passing, 12 planned secondary-engine viewport skips**. Existing Rewards Landing checks: **78 passing, 12 planned skips**; new holder-section checks: **9 passing, 6 planned skips**. Launch operator interface: **54 passing**. These are overlapping suites, not additive unique-test totals.

The holder page reuses shared Buttons, Field/Input, CompactSelect, Disclosure, confirmation, wallet picker and foundation tokens. No global token or brand asset changed. Chromium covered 320/390/768/1280/1440 px; Firefox and WebKit covered critical holder layouts at 390/1440 px. Checks include first pending paint without zero placeholders, locked/open/empty/exhausted states, failed pool-pin verification, retry, stale-read suppression, ownership checks, wallet rejection, pool exhaustion during review, keyboard disclosure, 200% text/text-spacing reflow, and axe scans. Exact transaction reviews were checked at 390×568 and desktop, with simulated wallet writes intercepted. Passing holder scenarios retain Playwright traces/video. Production-component screenshots were visually inspected on mobile, desktop and the short mobile confirmation view.

Local previews use fictional data: [holder overview](../test-results/v13-holders-preview.png), [mobile locked pool](../test-results/v13-holders-locked-390-chromium.png), [mobile claim review](../test-results/v13-claim-review-390-chromium.png). These files are generated test artifacts and are not deployment evidence.

Physical devices, manual screen-reader acceptance, actual connected-wallet transactions, hosted UI, database migration, public-chain deployment, independent contract audit and live Chainlink delivery were not performed. The new source is locally implemented and tested; V13 public release remains separate.

## Documentation and website explanation review · 2026-10-24

The parent Tincta page, Rewards landing sections and FAQs, public app explanations, holder panel, operator transaction descriptions, page metadata and all nine public guides now describe the applicable V13 rules. The copy explains the 60/20/8/12 allocation, treasury purpose, dynamic season amounts, successful-draw eligibility, first-5% execution-order claims, ownership and transfer rules, separate prize/affiliate rights, refunds and the settlement-based unlock. The parent page no longer says voted mint terms are fixed at deployment; they become final at the voting deadline. Illustrative totals remain labeled examples.

Repository entry points (`README.md`, `docs/README.md`, architecture, contracts, seasons and Launch guidance) point to this V13 record. Historical V12 allocations and older operational guides are explicitly scoped to their versions. No deployed contracts, saved terms, ABI exports, financial logic or historical records were changed by this explanation review. V13 remains marked pending public deployment.

Verification for this copy update:

- Documentation tests: **4 passing**, covering routes, anchors, search, economic boundaries and the documented read functions/summary fields against the actual ABIs. Changed Markdown file links resolve.
- Landing tests: **22 passing**, with **2 opt-in database/setup skips** across its two commands. No hosted signup or database write was performed.
- Web, Landing and Launch typechecks and production builds passed. UI source-policy checks and browser-harness typecheck passed. `git diff --check` passed.
- Broad browser run: **282 passing, 90 planned secondary-engine viewport skips**, covering all public guides, parent landing, Rewards pending/error/retry states and FAQs, holder states and operator reviews in Chromium, Firefox and WebKit. Primary layouts cover 320/390/768/1280/1440 px; secondary engines cover critical phone/desktop layouts.
- Final wording/table follow-up: **18 passing, 12 planned skips** after rebuilding the affected fixtures. A narrow-screen WebKit keyboard check exposed sideways-scrolling dependence in the original four-column example table; the final two-column comparison keeps the amounts together on phones. The final Web production build and documentation tests were rerun. Follow-up cases overlap the broad run and are not additive unique-test totals.

Production-component screenshots were inspected for the parent page, expanded mobile holder FAQ and final mobile holder guide. The existing tokens, controls and layouts are reused. Physical devices, manual screen readers, hosted pages and real wallet/chain transactions remain unverified by these local copy checks.
