# V13 season holder rewards

Implemented locally on 2026-10-24; the revised 60/20/10/10 graph was [deployed and verified on Sepolia on 2026-10-25](sepolia-v13-release-2026-10-25.md). This is a separate test genesis, not an upgrade or migration of V12 or an existing season. No collection is prepared, no live V13 claim has run, and Mainnet remains unconfigured. The dated local verification sections below retain their original evidence boundaries.

**Allocation revised 2026-10-25:** the user selected 60/20/10/10. The rules and examples below reflect that revision; holder coverage remains 5%. Earlier verification results below describe their dated source revision, not verification of this change. The separate Sepolia release record supplies the newly compiled and independently verified runtime pins.

## Fixed allocation and coverage

A successful draw allocates paid mint revenue as follows:

| Destination | Share | Availability |
| --- | --- | --- |
| Winning NFTs | 60% | Existing equal-prize claims after the draw |
| Qualified affiliates | 20% | Existing equal affiliate claims after the draw |
| Season holder pool | 10% | Locked until every planned collection in that season settles |
| Protocol treasury | 10% | Fixed operator wallet can withdraw after a successful draw |

The treasury supports current infrastructure and upcoming projects. Its spending is managed by the team, not restricted after withdrawal by the contract. Unallocated affiliate reserves and separate operational funding keep their independently labeled recovery rules. They are not holder funds.

The holder pool covers **5% of eligible NFTs**, rounded down, fixed in the contract. Only NFTs minted in successfully drawn collections in that season count. Winning NFTs qualify. Refundable collections contribute neither ETH nor eligible NFTs and preserve full mint-price refunds.

```
claimLimit = floor(eligibleNfts × 500 / 10,000)
rewardPerNft = floor(finalFundedPool / claimLimit) wei
```

For 10,000 eligible NFTs and 10 ETH, the first 500 NFT claims each receive 0.02 ETH. These numbers are illustrative, not fixed entitlements. The percentage counts NFTs, not wallets. There is no wallet cap. Onchain execution order determines the successful claims; transaction submission or a website review does not reserve a slot. Owning an eligible NFT does not guarantee a payout.

Only the current owner can claim, once per NFT. Transfers carry an unclaimed opportunity but never reset a completed claim. Approved NFT operators cannot claim on the owner's behalf. Claims are separate from winning-ticket prizes, affiliate earnings and the one-lifetime sponsored mint. There is no claim expiry. Integer division dust remains protected in the pool, with no administrator sweep.

## Dynamic season amounts

Only the 60/20/10/10 allocation percentages and 5% holder coverage are fixed. Community voting chooses each collection's mint price, supply, winner count and mint duration. Financial amounts use the selected terms and actual mint receipts; they do not assume a standard collection price, supply or season budget.

Each successful draw contributes exactly 10% of that collection's `totalMintRevenue` and adds its `totalMinted` to the season's eligible NFT count. The page reads these accumulated values from the contract. Pending or refundable collections do not inflate the funded balance. While the season is locked, the displayed slots and per-NFT amount are provisional and can change as more successful collections contribute. Once every collection settles, the final pool and eligible count determine the fixed claim amount. Claims reduce remaining slots and available ETH without recalculating a larger or smaller payout for later claimants.

For example, one season containing a successful 1,000-NFT collection at 0.01 ETH and a successful 2,000-NFT collection at 0.02 ETH accumulates 5 ETH for 3,000 eligible NFTs: 150 slots, each paying `floor(5 ETH / 150)` wei. A different season with 1,000 successful mints at 0.03 ETH accumulates 3 ETH: 50 slots of 0.06 ETH. Each season keeps separate accounting. Within a season, all qualifying claims receive the same amount even when individual NFTs had different mint prices.

## Contracts and invariants

- `ManekinekoRoundV13`: automatically calls `holderRewards.fund()` in the same transaction as successful draw finalization. Any failed funding reverts the finalization. Before reveal, all mint receipts remain in the round and reserved. After reveal, the 10% is held separately; existing prize, affiliate and execution reserves remain fully backed. Ordinary operator allocation becomes 1,000 basis points.
- `ManekinekoHolderRewardsV13`: immutable controller; no owner, withdrawal, pause or upgrade. Accepts the exact 10% only from an official revealed collection, once. Pool accounting is per season. Arbitrary donations cannot increase claim entitlements. Claims use checks/effects/interactions plus a reentrancy guard; rejected payouts roll back the slot and NFT flag.
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
- V13 coverage: exact allocation/reserves, locked/end boundary, equal payouts, first-5% exhaustion, current ownership, transferred used claims, winning NFTs, complete refunds, missing-entropy timeout, rejected payout rollback, reentrancy, multiple collections/seasons, integer rounding/dust, an entirely refundable season, atomic treasury settlement, actual-chain reader/claim construction, full compiled-graph verification and sponsored-mint/metadata independence.
- New round runtime: **24,140 / 24,576 bytes**. New controller, deployer, holder pool and credits registry also fit Ethereum runtime/initcode limits. Historical Solidity sources, ABIs/source exports, deployment records and V12 tooling were not modified.
- Web unit suite: **292 passing, 3 database-dependent skips**. Landing: **22 passing, 2 optional database/setup skips** across its two commands. Web, Landing, Launch and contracts typechecks passed. All three production builds passed; Web and Launch were rebuilt after the final shared claim-review change.
- UI source-policy and browser TypeScript checks passed. Production fixture builds passed for Web, Landing and Launch.
- Web/docs regression run: **207 passing, 42 planned viewport skips**. Final focused holder run: **42 passing, 12 planned secondary-engine viewport skips**. Existing Rewards Landing checks: **78 passing, 12 planned skips**; new holder-section checks: **9 passing, 6 planned skips**. Launch operator interface: **54 passing**. These are overlapping suites, not additive unique-test totals.

The holder page reuses shared Buttons, Field/Input, CompactSelect, Disclosure, confirmation, wallet picker and foundation tokens. No global token or brand asset changed. Chromium covered 320/390/768/1280/1440 px; Firefox and WebKit covered critical holder layouts at 390/1440 px. Checks include first pending paint without zero placeholders, locked/open/empty/exhausted states, failed pool-pin verification, retry, stale-read suppression, ownership checks, wallet rejection, pool exhaustion during review, keyboard disclosure, 200% text/text-spacing reflow, and axe scans. Exact transaction reviews were checked at 390×568 and desktop, with simulated wallet writes intercepted. Passing holder scenarios retain Playwright traces/video. Production-component screenshots were visually inspected on mobile, desktop and the short mobile confirmation view.

Local previews use fictional data: [holder overview](../test-results/v13-holders-preview.png), [mobile locked pool](../test-results/v13-holders-locked-390-chromium.png), [mobile claim review](../test-results/v13-claim-review-390-chromium.png). These files are generated test artifacts and are not deployment evidence.

Physical devices, manual screen-reader acceptance, actual connected-wallet transactions, hosted UI, database migration, public-chain deployment, independent contract audit and live Chainlink delivery were not performed. The new source is locally implemented and tested; V13 public release remains separate.

## Documentation and website explanation review · 2026-10-24

The parent Tincta page, Rewards landing sections and FAQs, public app explanations, holder panel, operator transaction descriptions, page metadata and all nine public guides now describe the applicable V13 rules. The copy explains the allocation, treasury purpose, dynamic season amounts, successful-draw eligibility, first-5% execution-order claims, ownership and transfer rules, separate prize/affiliate rights, refunds and the settlement-based unlock. The parent page no longer says voted mint terms are fixed at deployment; they become final at the voting deadline. Illustrative totals remain labeled examples.

Repository entry points (`README.md`, `docs/README.md`, architecture, contracts, seasons and Launch guidance) point to this V13 record. Historical V12 allocations and older operational guides are explicitly scoped to their versions. No deployed contracts, saved terms, ABI exports, financial logic or historical records were changed by this explanation review. V13 remains marked pending public deployment.

Verification for this copy update:

- Documentation tests: **4 passing**, covering routes, anchors, search, economic boundaries and the documented read functions/summary fields against the actual ABIs. Changed Markdown file links resolve.
- Landing tests: **22 passing**, with **2 opt-in database/setup skips** across its two commands. No hosted signup or database write was performed.
- Web, Landing and Launch typechecks and production builds passed. UI source-policy checks and browser-harness typecheck passed. `git diff --check` passed.
- Broad browser run: **282 passing, 90 planned secondary-engine viewport skips**, covering all public guides, parent landing, Rewards pending/error/retry states and FAQs, holder states and operator reviews in Chromium, Firefox and WebKit. Primary layouts cover 320/390/768/1280/1440 px; secondary engines cover critical phone/desktop layouts.
- Final wording/table follow-up: **18 passing, 12 planned skips** after rebuilding the affected fixtures. A narrow-screen WebKit keyboard check exposed sideways-scrolling dependence in the original four-column example table; the final two-column comparison keeps the amounts together on phones. The final Web production build and documentation tests were rerun. Follow-up cases overlap the broad run and are not additive unique-test totals.

Production-component screenshots were inspected for the parent page, expanded mobile holder FAQ and final mobile holder guide. The existing tokens, controls and layouts are reused. Physical devices, manual screen readers, hosted pages and real wallet/chain transactions remain unverified by these local copy checks.


## Allocation revision and verification · 2026-10-25

The current undeployed V13 allocation is **60% prizes / 20% affiliates / 10% season holders / 10% protocol treasury**. Both holder and treasury allocations are 1,000 basis points. The round transfer, holder funding validation, controller binding check, wallet policy verification and deployment verifier use the same values. Source exports were regenerated for the three changed contracts; their ABIs are unchanged. Older contracts, exported sources, runtime pins, frozen rehearsal artifacts and catalog identities were preserved.

The 5% holder claim coverage and all eligibility, season completion, current-owner, transfer, dust and refund rules remain intact. A ten-collection example at 1,000 NFTs and 0.01 ETH each now contributes 10 ETH to its season pool, giving 500 claims of 0.02 ETH. The 216-collection landing illustration shows 216 ETH for holders across separate season pools. Public guides, formula/allocation diagrams, metadata, parent/Rewards landing, FAQs, Web, Launch review descriptions and repository entry points were reconciled.

Local verification for this revision:

- Full contract suite: **467 passing**, including all **18 V13 cases** and the complete V12 two-season/20-collection regression rehearsal. Assertions verify the exact four allocations and 100% total, equal season payouts under different voted terms, protected refunds and liabilities, rejection of the former treasury amount, compiled deployment-graph verification, ownership/claim limits and integer dust.
- Web unit tests: **297 passing, 3 database-dependent skips**. Landing: **24 passing, 2 optional database/setup skips** across its two commands. Launch: **195 passing, 6 database-dependent skips** across its two commands. No hosted database writes were made.
- Web, Landing, Launch and contracts typechecks passed. All three production builds and isolated production fixture builds passed. UI source-policy, UI typecheck and `git diff --check` passed.
- Browser coverage: **305 passing, 94 planned viewport skips** across Chromium, Firefox and WebKit. The first run had 195 passes and six screenshot differences from the intended holder-total, allocation and payout text changes. All six diffs were visually reviewed, their exact baselines updated, and the six checks passed on rerun. The additional guide/FAQ run passed 104 checks. These are distinct passing cases; retries are not counted twice.
- Browser checks include the changed allocation grid, 216 ETH catalog example, 10 ETH season example, 0.02 ETH claim review, all nine public guides, holder pending/locked/open/empty/exhausted states, rejected obsolete holder allocation, retry, stale reads, ownership, wallet rejection, first-paint stability, keyboard behavior, enlarged text, overflow and axe checks. Chromium covers 320/390/768/1280/1440 px for the holder and guide pages; Firefox/WebKit cover critical phone/desktop states. The 390×568 claim review was also checked. Wallet writes were intercepted.
- The compiled round runtime is **24,115 / 24,576 bytes**. The holder vault, controller and deployer also fit runtime/initcode limits. All changed Solidity sources match their regenerated source exports.

The reviewed mobile calculation and desktop reward examples are under `test-results/allocation-2026-10-25/`; guide screenshots, baseline diffs and the initial browser result are retained there. These are ignored local QA artifacts. No public-chain deployment, hosted release, real wallet transaction, physical-device acceptance or independent contract audit is established by these checks. Fresh compiled and independently verified V13 runtime pins are required for public rollout.
