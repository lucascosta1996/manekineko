# Six equal prizes and versioned season launches

> Historical V8 design record. For current V10 defaults, deployment status and migration gaps, read [the architecture handoff](architecture.md). V8 was subsequently deployed and rehearsed on Sepolia; its original 100-referral threshold remains immutable. New editable defaults are now one referral, and V9 adds the cumulative 20-mint limit. The defaults and original release checklist below describe the V8 implementation milestone.

V8 changed new collection configurations to six equally paid winning NFTs by default. It is a separate deployment version; V7 and older deployed contracts, prepared artifacts and historical outcomes retain their original meaning. This document supersedes V7 only for V8 launches. Its original implementation alone was not deployment or independent audit evidence.

## Version and configuration boundary

| Component | New version |
|---|---|
| Round, factory and renderer | `ManekinekoRoundV8`, `ManekinekoFactoryV8`, `ManekinekoRendererV8` |
| Contract / algorithm identifiers | `affiliate-v8` / `unique-rank-v5` |
| Affiliate ownership eligibility | `ManekinekoAffiliateEligibilityV3` / `affiliate-eligibility-v3` |
| Lifetime winner credits | `ManekinekoWinnerCreditsV4` / `winner-credits-v4` |
| Shared configuration parser | `@manekineko/contract-abi/v8-config` |
| Database extension | `021_equal_awards_v8.sql` |

V8 replaces V7's `secondPrizeBps` with immutable `winnerCount`. Valid counts are 1–10, supply must cover every winner, and the positive total `prizeBps` must divide evenly by the count. The parser rejects the old second-prize field in a V8 configuration. Existing V7 parsing and ABI exports remain separate.

The default is 1,000 NFTs at 0.01 ETH with `prizeBps=6000` and `winnerCount=6`. Sellout revenue is 10 ETH and each of six winning NFTs has a 1 ETH award. Growth reserves 2 ETH for affiliates and 2 ETH gross for the operator; Standard reserves 1 ETH for affiliates and 3 ETH gross for the operator. These figures precede chain fees, sponsorship, services and taxes. Price or supply changes recalculate the ETH amounts; V8 does not promise a fixed 1 ETH award independently of those settings. See the [economic plan](economics/1000-ticket-economic-plan.md).

## Draw, scores and independent claims

One authenticated Chainlink VRF result determines the ordered set of winning token IDs. Rejection sampling maps a domain-separated deterministic candidate into the falling-factorial space `N × (N−1) × … × (N−K+1)`. Mixed-radix selection picks from remaining token IDs without replacement. This avoids modulo bias and the adjacent-winning-ID correlation of simply awarding successive positions in a rotation.

The VRF callback stores entropy; bounded finalization advances a deterministic cursor and atomically sets all winning ranks on acceptance. Callers cannot choose new entropy, reroll, change draw inputs or obtain a different result by choosing a transaction timestamp. The construction relies on the VRF and cryptographic hash assumptions. It is not a complete random shuffle of all losing tickets: winning scores are `N` down to `N−K+1`, and nonwinning tokens receive the remaining unique scores in token order. The reversible presentation permutation still supplies varied four-number combinations.

For six winners out of 1,000 tickets, every ticket has a 0.6% chance of any award and 0.1% of each specific rank. One wallet can own several winning NFTs and receive their combined prizes.

The ranked interface extends the V7 shapes to ranks 1 through `winnerCount`:

- `awardCount`, `winningTokenIds(rank)`, `prizeAmountForRank(rank)` and `prizeClaimed(rank)` expose each award.
- `claimPrizeForRank(rank, recipient)` requires the current holder of that winning NFT. An NFT-approved operator or collection owner cannot claim on that holder's behalf.
- `AwardDetermined` and `AwardClaimed` events identify each rank and amount. SVG metadata includes the award rank and prize amount in wei.
- `claimedAwardCount` and `prizePaidAmount` track settlement. The legacy aggregate `prizePaid` becomes true only after all configured awards are paid; rank-one legacy fields retain their primary-award meaning.

Claims are available after reveal and are independent. A failed recipient or unclaimed award does not block another holder. Tokens lock at sellout until reveal; an unpaid winning NFT stays locked until its own claim. Once paid it can transfer as a collectible without an outstanding prize entitlement. Ordinary operator withdrawal cannot consume remaining prize reserves, affiliate balances, the growth reserve or refundable receipts.

`readyForNextRound` depends on verified reveal and fully backed liabilities, not all holders having claimed. Thus an unattended wallet cannot indefinitely prevent the next collection while its own unpaid prize stays protected. An unsold expired collection follows the refund path, without affiliate or prize awards.

## Affiliate and lifetime-reward rules

The V7 qualified-equal affiliate model remains unchanged. Defaults are ten positions, a minimum of 100 paid attributed referrals and a 30% payout cap. At sellout:

```
common payout = min(affiliate pool / qualified count,
                    lowest qualifying referral revenue × payout cap)
```

Only qualifiers share, all receive the same amount, and sponsored credits do not count as paid referrals. A 2 ETH pool with four qualifiers pays 0.5 ETH each only if their referrals satisfy the cap; at exactly 100 referrals each it pays 0.3 ETH each and leaves 0.8 ETH in the growth reserve. Ordinary operator withdrawal excludes that reserve. A distinct owner withdrawal after reveal records its release; downstream treasury spending is not contract-enforced.

Eligibility V3 supports new V8 targets and version-compatible earlier collections. Completed V5/V6/V7 collections can be imported as historical ownership sources; the setup must seed existing protocol history before opening a new bootstrap collection. Registry checks do not establish unique human identity.

Winner-credit V4 handles all supported award ranks, including `creditsForAward`, `claimAwardCredit`, `redeemAward` and `claimAndRedeemAward`. The beneficiary is the settled NFT holder, not the optional ETH recipient. All wins share a one-redemption-per-wallet lifetime policy. A wallet winning six NFTs does not receive six lifetime free mints. The source earning time for V7/V8 is its immutable reveal time, so a delayed prize claim does not make a properly later registered collection ineligible merely because it was prepared before that claim.

The V4 constructor accepts an optional previous V2 or V3 registry and requires zero sponsorship balance there. For V3 it reads the inherited lifetime predicate, preserving spent V2 rewards as well as V3-local redemptions. **Migration must permanently retire sponsorship funding and available sponsored mint targets on every older registry in the lineage.** Immutable old contracts cannot observe a later V4 redemption; funding old and new generations in parallel could allow the lifetime limit to be bypassed. Constructor checks alone do not enforce permanent retirement.

## Fixed season timing and future automation

The V7 timing policy continues: at most ten collections per season, a default one-hour next-launch delay and a thirty-minute next-announcement delay, both anchored to the predecessor's canonical sellout timestamp. The first collection requires an explicit UTC opening. Default affiliate enrollment is fifteen minutes; preparations need enough lead time to deploy and confirm before enrollment begins.

A draft `saleStartAt=0` is an unresolved planning sentinel, not a deployable opening. Preparation must bind an actual timestamp. The on-chain mint deadline is scheduled opening plus mint duration. Activation and minting cannot occur before `saleStartAt`; enrollment closes at that timestamp even if an activation transaction is delayed.

The next contract can be prepared after the predecessor reveals and its liabilities are fully funded. All six claims need not finish first. A sellout post can announce sales statistics with results pending; a winners post requires verified final results. A future worker must pause if draw, deployment, funding, enrollment or announcement readiness cannot meet the fixed schedule. The planner permits at most sixty seconds of activation inclusion delay only with readiness confirmed before the opening; it never moves the advertised opening or deadline.

The current launch UI, revision-bound schedules and deduplicated intents provide configuration and planning. They do not dispatch X posts, hold a signing service or run an autonomous launch worker. That future service still needs restricted credentials, canonical block/reorg checks, exact artifact binding, funding/gas limits, receipt reconciliation, idempotent public posting, pause controls and monitoring.

## Local validation and rollout gates

Migration 021 has been applied to the local development database. The 22 imported seasons and their 216 editable collection drafts were converted to six 1 ETH prizes with a private pre-change backup and revision/audit records. The authenticated launch API verified every collection's count and amount, plus the original JSON order, names and colors. Affiliate economics and season timing were preserved. This did not migrate staging or deploy contracts. `scripts/upgrade-season-drafts-v8.mjs` is restricted to those imported local drafts and skips already converted seasons without resetting later tuning.

Local validation for this contract change passed the full **349-test contract suite**, including fourteen focused V8 tests, plus contract TypeScript checking and ABI/source generation. The new tests cover six distinct winners and 1,000 unique scores, exact equal amounts, exhaustive small ordered draws and rejection boundaries, counts from one to ten, holder-only claims, same-wallet awards, failed recipients, reentrancy, transfer locks, liabilities, refunds, forged/repeated VRF fulfillment, rollover before claims, rank-six rewards and prior-registry lifetime history.

The compiled round runtime is 23,082 bytes and factory initialization code is 44,372 bytes under the pinned compiler profile, below their applicable size limits. These measurements are bytecode checks, not a Mainnet gas-cost estimate. Tests are local evidence, not connected-wallet or independent audit evidence.

Before any V8 release:

1. Review the V8 deployment artifact and configuration, immutable renderer/deployer components, exact start and deadline, authority addresses and treasury funding. Preserve existing V7 prepared artifacts; upgrades apply only through an explicit new draft/revision path.
2. Apply and verify migration 021 with the prior migration chain and appropriate grants. Validate version-aware award counts, all ranked events, partial claims, refunds and canonical indexing, including transactions sent directly through explorers.
3. Deploy and verify the V8 factory, eligibility V3 and winner-credit V4 on Sepolia. Configure independently checked addresses and runtime hashes; do not reuse hashes from older versions. Eligibility pins use `AFFILIATE_ELIGIBILITY_V3_ADDRESS_<chain>` and `AFFILIATE_ELIGIBILITY_V3_CODEHASH_<chain>`.
4. Complete and verify reward-lineage retirement before using V4. Canonical credit pins remain `WINNER_CREDITS_ADDRESS_<chain>` and `WINNER_CREDITS_CODEHASH_<chain>`, with `WINNER_CREDITS_PREVIOUS_ADDRESS_<chain>` and `WINNER_CREDITS_PREVIOUS_CODEHASH_<chain>` for a predecessor. For a V4 → V3 → V2 lineage the web reader also requires `WINNER_CREDITS_ANCESTOR_ADDRESS_<chain>` and `WINNER_CREDITS_ANCESTOR_CODEHASH_<chain>` for V2. Check every ancestor's retired sponsorship/targets, not only the immediate predecessor's balance.
5. Register the new collection and historical eligibility sources, fund full-price sponsorship deliberately, and rehearse all six holder claims, a delayed claimant, same-wallet prizes, qualified affiliate payouts, unsold refunds, external NFT views and sponsored redemption across the application and indexer.
6. Obtain independent contract and economic review before Mainnet; separately qualify the eventual automation and public-posting service before enabling it.

The versioned V8 deployment script is read-only by default and requires explicit broadcast mode and a journal for spending transactions. Sample configuration placeholders are deliberately not deployment-ready. No live registry migration, collection deployment or public posting is implied by source changes or generated artifacts.

The [V7 implementation record](season-v7-implementation.md) remains the historical two-prize design. Its four/two ETH awards and V2 eligibility/V3 credit registries must not be reinterpreted as V8's six equal prizes or newer registry versions.
