# Two-prize seasons and fixed launch planning

V7 introduces the approved season economics and fixed-timing configuration. It is a new deployment version: existing contracts, artwork, prizes, affiliate terms and saved prepared artifacts stay on their original rules. This release does not deploy contracts or run an automation service.

## Editable economics

A collection defaults to 1,000 NFTs at 0.01 ETH (10 ETH at sellout), with the highest-ranked NFT entitled to 4 ETH and the second highest to 2 ETH. Two different token IDs win; one wallet can own both. Only the current holder of the corresponding winning NFT can claim its prize. Each claim has its own state, and protected unpaid awards cannot be withdrawn by the operator.

Growth defaults allocate 2 ETH to affiliates and 2 ETH gross to the operator. Standard defaults allocate 1 ETH to affiliates and 3 ETH gross to the operator. These are sellout amounts before gas, randomness, sponsorship, services and taxes, not net profits. Settings are immutable once a collection is deployed.

There are ten affiliate positions by default. Only affiliates who reach 100 paid referral tickets qualify. At sellout, all qualified affiliates receive the same amount:

```
common payout = min(affiliate pool / qualified count,
                    least qualifying referral revenue × payout cap)
```

The cap defaults to 30%, is configurable before deployment and protects against a small referral contribution receiving the whole pool. Four qualified affiliates in a 2 ETH pool receive 0.5 ETH each only if the cap permits it. With exactly 100 referrals each at 0.01 ETH, the common cap is 0.3 ETH each: 1.2 ETH paid and 0.8 ETH retained in the separately accounted growth reserve. In a 1 ETH pool the same four receive 0.25 ETH each. Zero qualified affiliates receive zero; the entire pool remains in the growth reserve. Sponsored mints do not count as paid referrals. Secondary sales do not fund these allocations.

Ordinary operator withdrawal excludes unpaid prizes, unpaid affiliate balances, refundable revenue and the growth reserve. The growth reserve has a separate explicit withdrawal function and event. This accounting distinction does not independently enforce how its recipient subsequently spends the funds.

Both winning holders can qualify for winner credits, subject to the existing one-redemption-per-wallet lifetime policy. A wallet winning both ranks does not get two lifetime redemptions. V3 of the shared credit registry reads the previous registry's redeemed state. Migrating from an immutable old registry also requires retiring its sponsorship funding and closing all old credit mint targets; it cannot be made to observe later V3 redemptions. Never fund both generations as parallel reward systems.

## One fixed clock per season

The launch console saves these per-season settings:

- `nextLaunchDelaySeconds`: default **3600** (one hour).
- `nextAnnouncementDelaySeconds`: default **1800** (thirty minutes).
- Anchor: the preceding collection's canonical on-chain sellout timestamp.
- Winner announcements: only after the verified draw.
- Missed launch: pause for operator review; never silently move the published time.

Example: sellout at 14:00 UTC means next announcement at 14:30 UTC and next mint opening at 15:00 UTC. Claiming the prize at 16:00 UTC does not change that schedule. The next contract can be prepared and deployed before 15:00 once the preceding draw is verified and its awards are fully reserved. The default affiliate enrollment window is 15 minutes; the resolver requires additional time to deploy and confirm before it starts. A 24-hour enrollment window cannot fit this example.

`startAt` is the first collection's fixed UTC opening. Subsequent `saleStartAt` values are resolved from confirmed sellouts, and mint deadlines count from that scheduled sale start, not deployment. Future records remain drafts until a real opening time, reviewed registries, authority addresses and funding are supplied. The legacy completion-based interval is zero and unused in this mode.

A sold-out post cannot truthfully name winners before VRF fulfillment and finalization. The planned sequence is therefore:

1. After finalized sellout: sales and supply statistics, with results pending.
2. After verified draw: both winning NFT IDs, scores and awards.
3. At sellout + announcement delay: next collection name and absolute UTC opening time, subject to readiness.
4. At the fixed opening: activate the fully verified, funded collection.

If draw, deployment, enrollment or required announcements cannot meet the fixed schedule, the future runner must pause. Ethereum transactions are included in blocks, so a published opening is an on-chain timestamp threshold, not a guarantee of a transaction appearing at an exact wall-clock second. The planning gate permits at most 60 seconds of activation inclusion delay, only when readiness was confirmed before the fixed opening; after that it pauses. This does not change the advertised opening or mint deadline.

## Implementation boundaries

- **Contracts/shared package:** versioned V7 configuration, two distinct uniformly selected winning IDs, per-rank claims, equal qualified affiliate accounting, scheduled mint opening, protected liabilities and updated registry versions.
- **Indexer/database:** normalized ranked awards including unclaimed prizes; canonical sellout/reveal timestamps; partial claims; direct contract transactions and reorganization handling. Migration 019 adds V7 data without rewriting historical collections.
- **Launch app:** Growth/Standard presets, individual settings, fixed season delays, announcement templates, draft conversion, reviewed artifacts and validation. Migration 020 extends version/timing validation and adds immutable revision-bound schedule records and deduplicated future action intents.
- **Public web:** version-aware collection results, both awards and holder claims, qualification progress/equal affiliate payouts and V3 winner-credit handling.

`season-timeline.ts` is pure planning code, with tests for fixed dates, missing draw/reserve evidence, missed deadlines, template validation and announcement gates. The intent tables have no dispatcher. Saving a plan does not deploy, activate, sign or post. The future executor must bind each schedule to its exact prepared artifact, canonical predecessor deployment and finalized sellout block; reject reorged evidence; enforce paused-state stickiness; and recheck exact contract configuration, funds, permissions and receipts before every action. X credentials and blockchain signing keys remain outside this UI and these plan tables.

## Next automation phase

Implement a restricted machine identity, signer service, durable worker and receipt recovery; canonical schedule/predecessor binding; funding and gas limits; VRF finalization; X OAuth and weighted text validation; idempotent post receipts; user-visible pause/retry controls; and monitoring. A failed or ambiguous request must be reconciled before retrying a transaction or public post. Winner posts use verified results rather than cached mint-time estimates. Public announcements must not expose unpublished drafts or secrets.

Before Sepolia rollout, deploy and verify the new V7 factory, eligibility V2 and credit V3 registries, set the independently verified factory/registry runtime hashes, apply migrations and grants, register the new collection and run a complete two-prize rehearsal. Current V5/V6 deployments do not acquire these behaviors by updating the application.

For an active V3 winner-credit registry with a predecessor, configure `WINNER_CREDITS_PREVIOUS_ADDRESS_<chainId>` and `WINNER_CREDITS_PREVIOUS_CODEHASH_<chainId>` alongside the active `WINNER_CREDITS_ADDRESS_<chainId>` and `WINNER_CREDITS_CODEHASH_<chainId>`. The public reader verifies both contracts at the same pinned block. Do not copy hashes between registry versions.


## Local implementation verification

The local database now contains the 22 imported seasons and 216 collections as editable V7 drafts, preserving their names, colors and identities. The initial economic plan uses 76 Growth and 140 Standard collections; later seasons can be tuned after the pilot. No first opening is scheduled and publishing is disabled. The conversion keeps a local pre-change snapshot and audit revisions, and rerunning it does not reset subsequent V7 edits.

Verification covered contract claims and reserves, app typechecks/builds, authenticated launch APIs, isolated PostgreSQL migrations, partial award claims, canonical indexing/reorgs/refunds, ranked lifetime-credit discovery, and versioned offline deployment/registration tools. The local migrations are applied; staging and Mainnet are unchanged. A connected-wallet Sepolia V7 rehearsal and independent security review are still separate release gates.

Offline V7 preparation routes to `V7_CONFIG_PATH` and `V7_AFFILIATE_ELIGIBILITY_ADDRESS`. The registry operations tools support explicit eligibility deployment `--version v2` and winner-credit deployment `--version v3`; these produce unsigned operations. Completed historical V6 NFTs can be registered as eligibility sources using `legacy --version v2 --source-version v6`. The staging collection synchronizer recognizes V7, verifies its immutable terms and leaves state/award ingestion to the canonical indexer rather than writing a legacy winner archive.
