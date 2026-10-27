# V16: Genesis utility, sellout gate and affiliate allocation

## Decision · October 27, 2026

V16 uses one ERC-721 contract for Genesis and the complete paid collection lifecycle:

- 1,000 free NFTs, with **two lifetime primary mints per wallet**. Transfers never restore the mint allowance. A wallet may receive additional NFTs by transfer.
- **No Genesis mint deadline.** The first season waits indefinitely until all 1,000 NFTs mint. There is no timeout, empty-sale fallback, operator bypass or permissionless skip.
- The final Genesis mint opens the first paid ballot for the full configured voting duration. Paid minting opens only when that ballot ends.
- First-collection affiliate enrollment requires a currently owned Genesis NFT. Every later collection, including later seasons, accepts Genesis **or** an eligible earlier successfully revealed paid NFT.
- Genesis voting remains first-ballot-only. Each NFT has one vote for its current owner; an unused vote follows ownership and a used vote cannot be renewed by transfer. Later ballots still use paid-NFT ownership checkpoints.
- Every paid collection offers **3–8 distinct complete voting packages**. A deployment with fewer than three options is rejected.
- After a successful draw with no qualifying affiliates, the entire 20% affiliate allocation joins the operator's 10% treasury, making 30% withdrawable through the treasury bucket. Prize and holder allocations remain 60% and 10%.

The cap requires at least **500 distinct minting wallets** to sell out. It does not establish 500 distinct people, continuing holders or future paid buyers. The first season never starts if Genesis does not sell out.

## Voting packages

The constructor takes the ballot packages once. The contract rejects fewer than three, more than eight, or any duplicate package. Every paid collection and season in that deployment uses the same immutable menu. Voting selects one complete package; it does not set each term independently. Option 1 remains the no-vote fallback, and the lowest-numbered tied option wins. Votes cannot change after the ballot closes.

The deployed Sepolia constructor and local tests use [`apps/contracts/config/v16-ballot.ts`](../apps/contracts/config/v16-ballot.ts):

| Term | Option 1 | Option 2 | Option 3 |
| --- | --- | --- | --- |
| NFT price | 0.01 ETH | 0.02 ETH | 0.01 ETH |
| Supply | 1,000 | 2,000 | 1,000 |
| Equal prizes | 6 | 4 | 10 |
| Paid mint window | 1 hour | 24 hours | 24 hours |
| Each prize after sellout and a successful draw | 1 ETH | 6 ETH | 0.6 ETH |

These three packages are frozen in the new Sepolia deployment. The one-hour ballot duration is separate from each paid mint window. Historical deployment manifests remain unchanged.

The ten-collection rehearsal now records votes for all three packages in every ballot: 60/20/20 Genesis votes for collection 1, and 600/200/200 paid-NFT snapshot votes for subsequent collections. Option 1 wins each of these conservation scenarios, preserving their eight sellouts, two refunds and original accounting totals. Separate contract cases exercise winning Options 2 and 3 through sellout, draw and every equal prize claim.

## Implementation and funding

[`ManekinekoV16.sol`](../apps/contracts/contracts/ManekinekoV16.sol) contains Genesis, the paid catalog, voting, affiliates, draws, claims, refunds, sponsorship and season holder rewards at one ERC-721 address. [`ManekinekoArtworkV16.sol`](../apps/contracts/contracts/ManekinekoArtworkV16.sol) compiles into that runtime and is not a separate deployment. Global token IDs are `(collectionId << 17) | serial`; Genesis is collection 0. Displayed local NFT numbers must be translated before ERC-721 calls. Each paid NFT has a permanent four-number identity before VRF; scores and winners remain separate contract state.

`sealCatalog()` requires `preparationCost()` in operating funds. It reserves collection 1's execution/sponsorship budgets and funds its Chainlink subscription, but leaves both `round(1).voteStart` and `saleStart` at zero. `prepared == 1` means its resources are reserved; it does **not** mean the first season or ballot has opened. Genesis opens at `genesisStartsAt` with no end timestamp.

`mintGenesis()` mints one NFT per call. `primaryMints(0, wallet)` counts cumulative primary mints against `GENESIS_MAX_MINTS_PER_WALLET == 2`. On the 1,000th mint, the same transaction records `genesisSoldOutAt`, sets collection 1's ballot start to that timestamp and its sale start to that timestamp plus `settings.votingDuration`, and emits `GenesisVoteOpened`. It needs no subsequent operator, keeper, funding or Chainlink call to open voting. A rejecting NFT receiver rolls back the last mint and the entire opening; reentrant voting is rejected.

Until sellout, `mintDeadline(1)` is zero, `refundsAvailable(1)` is false, minting/enrollment/voting are closed and `prepareNext()` cannot advance. The first collection's reserved sponsorship/execution funds and subscription cannot be withdrawn as expired funds. Only unallocated operating funds remain withdrawable. If Genesis never sells out, those first-collection reserves remain committed. This is intentional: no cancellation or recovery deadline can bypass the sellout gate.

V16 removes `GENESIS_VOTING_DELAY`, `genesisVotingDeadline` and `GenesisVoteAdvanced`. `GenesisOpened` carries only the start timestamp. The collection-1 preparation event has zero vote/sale timestamps; clients must wait for the sellout and `GenesisVoteOpened` rather than displaying an epoch-derived deadline.

## Affiliate rules

`enrollAffiliate(collectionId, slot, sourceToken)` uses the actual global ERC-721 token ID, including Genesis IDs `1..1000`. The former `sourceToken == 0` first-collection exception is removed.

Eligibility is checked at enrollment. Genesis works in every target collection and season. A paid source must be from an earlier internal collection with a finalized successful draw; unsold, refundable, unfinalized and current/future paid sources do not qualify. There is no automatic import of historical external NFTs.

Existing limits remain: ten slots, one enrollment per wallet per collection, and one admission per NFT per target collection. Transferring a used source cannot create a second admission in that collection. Its eligibility is reusable in the next collection or season. Voting and affiliate-use tracking are independent.

Enrollment and earned affiliate rewards remain with the enrolling wallet after a source NFT transfer. Ownership alone does not create an ETH claim. At least one qualifying attributed paid referral is still required; the 20% pool is shared equally among qualifiers after a successful draw. Genesis itself has no prize, sponsored-mint credit or season holder reward entitlement.

### No qualifying affiliate

If `round(id).qualified == 0`, including no enrollment or enrolled affiliates with no paid referrals, a successful draw allocates **30%** of mint revenue to the operator treasury. `withdrawBucket(id, 0, amount)` uses this combined allocation and cumulative `treasuryWithdrawn`; bucket 1 has **zero** allocation, so the same 20% cannot be withdrawn twice. Funds remain inside the contract until the operator withdraws them; there is no automatic wallet transfer.

With at least one qualifier, treasury remains **10%**, qualifiers keep their equal shares of the **20%** pool, and bucket 1 retains only division dust, tracked by `growthWithdrawn`. Prize and holder allocations remain **60%** and **10%** in both cases. Neither bucket is available before draw finalization or after an unsold/randomness-timeout refund outcome. Refund principal, unpaid prizes and holder funds cannot be swept into treasury.

The public explanation leads with Genesis's two utilities: first-collection voting and affiliate enrollment across all collections and seasons. It explains that sharing a referral URL can earn real ETH, while preserving enrollment, paid-mint, sellout and successful-draw conditions.

## Deployed integration and verification · October 28, 2026

V16 is deployed and source-verified on Sepolia at `0x673D155f884976bb42eab2F1F11b381dc4d8D26A`, with all 216 catalog entries. Genesis remains unsealed and unminted; the rehearsal is prepared but not started. Mainnet remains unconfigured. See the [release record](sepolia-v16-release-2026-10-28.md) and [manual rehearsal workflow](sepolia-v16-rehearsal.md).

Web and Launch use dedicated V16 single-address read/write adapters, zero-schedule Genesis waiting, cumulative two-mint allowances, current-owner Genesis votes, explicit affiliate source collection/NFT inputs, direct winner/sponsored/refund claims and collection-aware holder rewards. Every signing review rechecks the contract pin, chain, collection ID and current terms. Migration 036 adds separate collection-ID-aware NFT mirror tables and retains historical projections. No historical deployment is relabeled, and the paused V14 rehearsal stays paused.

The independently deployed runtime is 39,442 bytes, creation code 42,103 bytes before arguments, compiled with Solidity 0.8.37, optimizer runs 1, via IR and Cancun instructions. Local EDR models relax the old size ceiling; actual Sepolia deployment and two-RPC code/state verification are separate evidence. The ABI and exact source exports are `@manekineko/contract-abi/protocol-v16` and `protocol-v16-source`.

Current local verification: 29 contract/adapter tests, including the ten-collection conservation rehearsal and real single-address application/mirror calls; 5 runner guard tests; all 7 isolated PostgreSQL mirror tests; application typechecks and builds. The ten-collection model includes 500 Genesis wallets, eight sellouts, two refund collections, 48 prizes, six refunds and 400 holder claims totaling 8 ETH. Chainlink is mocked in that local model. Browser captures use real local V16 bytecode/state and the published 216-entry catalog. They are not evidence of a live Sepolia vote or claim.

Live claims, genuine V16 VRF fulfillment, the complete 216-collection runner, user wallet interactions and final error reconciliation remain pending until the user starts the rehearsal.
