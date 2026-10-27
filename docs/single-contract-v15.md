# V15: one Tincta contract

**Local successor:** [V16](genesis-utility-v16.md) supersedes this version's Genesis timing, wallet cap and affiliate eligibility. The V15 source and evidence below remain historical and unchanged by that new implementation.

## Decision and release boundary · October 26, 2026

The user selected **all NFTs, voting and rewards in one contract**. The local implementation is `ManekinekoV15`: Genesis, paid NFTs, catalog, ballots, affiliate accounting, prizes, perpetual refunds, sponsored mints and season holder funds occupy one address and storage space. `ManekinekoArtworkV15` is an abstract source compiled into that runtime, not another deployment. Ranking/permutation libraries are inlined. There is no proxy, delegatecall, factory, external renderer or separate Tincta vault.

Chainlink's proof-verifying coordinator remains external. It receives separately funded randomness budgets, never participant receipts. Each collection has a separate coordinator subscription/request; the single consumer authenticates and routes callbacks.

**Local implementation and model tests are not a V15 deployment or app release.** Hosted apps, workers and pins remain V14. V15 needs versioned client/indexer/worker adapters and exact source-publication/deployment verification before release. Existing V14 NFTs cannot be rewritten into the new address. No automatic migration, remint, airdrop or V15 transaction has occurred.

## Identity and rules

- Collection `0` is Genesis: 1,000 free NFTs, one primary mint per wallet, first paid ballot only, no financial reward rights. The first ballot opens at Genesis sellout or 24 hours after opening, whichever happens first. Unsold Genesis NFTs remain mintable indefinitely, even after that ballot closes.
- Paid collections use IDs `1..256`, preserving catalog season IDs, order, names, colors and the ten-collection season limit.
- ERC-721 ID: `(collectionId << 17) | serial`. Local serials are `1..65,536`, or `1..1,000` for Genesis. `tokenLocation` and `tokenId` expose this collision-free mapping. Artwork retains local numbering; all NFTs share the name `Tincta Rewards` at contract level.
- Genesis votes use token IDs and current ownership. Each NFT can vote once during the first ballot, including an NFT minted after the ballot starts. An unused vote follows a transfer; a used vote never resets. Later ballots retain collection/wallet ownership checkpoints: only successfully revealed paid NFTs qualify for later voting and affiliate enrollment, and post-snapshot transfers cannot duplicate those votes.
- Genesis artwork matches the approved preview byte-for-byte; its description explains current-owner voting, late mints and the end of voting rights. Paid artwork retains geometric motifs, colors, permanent four-number identity and absence of mutable results; new metadata correctly identifies V15.

### Genesis opening and voting

The operator funds at least `preparationCost()` through `fundOperating()` before sealing. `sealCatalog()` atomically opens Genesis, reserves the first collection's budgets, funds its VRF subscription and prepares collection 1 with `voteStart = genesisVotingDeadline`. An unfunded seal reverts completely, so Genesis cannot open with an unprepared ballot. At the scheduled start, voting becomes available by the contract's timestamp checks without a keeper or another operator transaction.

The 1,000th mint records `genesisSoldOutAt`. If voting has not started, that same mint sets collection 1's `voteStart` to the sellout timestamp and `saleStart` to that timestamp plus the full configured voting duration, emitting `GenesisVoteAdvanced`. The final minter is eligible. A sellout during or after voting never restarts, extends or changes that ballot.

`genesisVotingDeadline` is the latest voting start, **not a mint expiry**. Clients must use `round(1).voteStart` and `.saleStart` for the actual ballot window and supply for Genesis mint availability. The user explicitly chose to let late minters vote while the first ballot is open. `castGenesisVote(choice, tokenIds)` requires current ownership, consumes each token's vote once and rejects duplicate IDs atomically. It is separate from paid snapshot `castVote`; Genesis source `0` is rejected by that function. `votingPower(1, wallet, 0)` exposes usable votes during the ballot, while `genesisUnusedVotes` is the raw unused-token count and is not an availability check.

Genesis minting after the first vote closes creates a collectible with no remaining vote, financial entitlement or right to participate in later ballots. Later votes require successfully revealed paid-season NFTs. `prepareNext()` now starts with collection 2; all later collection timing and settlement rules remain unchanged.

Mint receipts remain fully reserved until draw or refunds. Successful collections allocate 60% prizes, 20% qualified equal affiliates, 10% season holders and 10% treasury. Unallocated affiliates have a separate growth bucket. Withdrawals name a permitted bucket and cannot take another collection's receipts, prizes or holder funds.

`accountedBalance` tracks all internal buckets, including operating funds. Internal reallocations do not reduce it; actual payouts and operating transfers to Chainlink do. Donations cannot enlarge claims or operator allocations. The 20-per-recipient mint cap, exact quotes, single sellout request, authenticated entropy, bounded unique-rank-v6 draw, winning-holder claims and transfer locks remain. Voting closes into minting without another signature.

Unsold expiry or missing entropy at the three-day cutoff permits full mint-price refunds **forever**, including after later collections start. Late entropy cannot revive the collection. Burning a refund NFT restores neither mint allowance nor sponsored rights.

Holder claims remain current-owner-only, once per eligible NFT, after every collection in its season settles. The first `floor(eligible NFTs / 20)` claims share actual funded rewards. Genesis/refundable collections contribute nothing; there is no holder sweep. A winning holder recorded at prize payment may redeem one sponsored NFT in a later collection per lifetime, at full price from sponsorship funds. This fresh deployment does not silently import historical external NFTs or credit registries.

## Network and verification boundaries

Current runtime: **38,815 bytes**. Creation bytecode: **41,474 bytes** before constructor arguments. Compiler: Solidity 0.8.37, optimizer runs 1, via IR, Cancun instructions. It exceeds the original 24,576-byte EIP-170 runtime limit.

[EIP-7954](https://eips.ethereum.org/EIPS/eip-7954) raises runtime/initcode bounds to 65,536/131,072 bytes. The [Ethereum Foundation's October 16 update](https://blog.ethereum.org/en/2026/10/16/glamsterdam-hoodi-announcement) records October 6 activation on Sepolia and says Mainnet activation is not yet decided. **Mainnet deployability remains unqualified.** Compiler warnings describe the original limit, not actual network activation.

**Historical estimate for the earlier 37,251-byte revision, before the Genesis timing change:** one read-only Sepolia deployment estimate accepted its payload at block 11,995,687: **60,326,889 gas**, below its 200,000,000 block limit. No transaction was signed/broadcast. Two other endpoints rejected at their own **50,000,000 gas request cap**; they are not successful independent simulations. The updated bytecode has not been estimated on Sepolia. The earlier estimate does not qualify this revision for deployment, finality or source verification.

Installed EDR supports through Osaka, not Glamsterdam. `hardhatV15Model` is an isolated Cancun semantic model with its old size ceiling disabled and explicit 64 KiB/128 KiB artifact assertions. It does not model Glamsterdam gas repricing. Historical networks keep normal limits; live deployment and callback gas checks remain required.

`npm run protocol:v15:test` passed 20 tests after the Genesis timing change: funded opening/rollback, scheduled start without a keeper, early sellout including the final minter, rejected-final-mint rollback and callback reentrancy protection, full voting duration, sellout during/after voting without extension, late mint eligibility, transferable unused votes without double voting, artwork/allowance, IDs/quotes, paid snapshots, eligibility, allocations, alternative voted prices/prize counts, transfer locks, authenticated entropy, both ten-year refund paths, late callbacks, payment rollback and sponsored rights. The full local 50-wallet season exercised eight sellouts, two three-mint refunds, 48 prizes, six refunds and 400 holder claims totaling 8 ETH. Two refunds remained outstanding through later collections. Independent bucket arithmetic reconciled actual ETH after every collection; liabilities ended at zero after recoveries. The Tincta contract nonce remains one after all ten collections: no Tincta child contracts are created.

The complete contract regression suite passed **495 tests** on the preceding revision (`npm run test --workspace @manekineko/contracts -- --no-compile`); it has not been rerun for this Genesis-only change. Current build, contract TypeScript and full ABI/source export passed. Historical deployed Solidity and tracked exports remain unchanged. These local checks are not an independent security audit, and mocked randomness is not live Chainlink evidence.

## Integration work before any release

V15 is not a version-string substitution in existing adapters. `packages/protocol`, Web and Launch need collection-ID-aware reads and transaction builders for the single address. Every quote, cache, ownership query and signing review must bind both the protocol address and the internal collection ID. Sponsored claims use a global source token ID; holder/prize/refund calls use global token IDs. Never pass a displayed local serial directly as a paid ERC-721 token ID.

The Genesis adapter must use token-based vote submission, read the actual first-ballot schedule, handle `GenesisVoteAdvanced`, and distinguish a sold-out mint from closed voting. The opening action must fund the first preparation before sealing. Indexers/workers must recognize collection 1 as prepared at sealing rather than submit a duplicate preparation. Public copy must say that a mint after voting closes has no remaining voting rights; the existing deployed V14's expiry/snapshot copy remains true for V14 only.

The current NFT mirror keys a collection by chain/address. It needs an additive collection-ID dimension and global-token/local-serial distinction before it can index V15's multiple editions at one address. Preserve historical rows and public URLs. UI should continue to display seasons and collections separately while linking them to the same verified contract.

The new deployment/publication path must verify one executable runtime and its constructor immutables, the exact catalog/terms and source, then qualify live gas and VRF callback execution under current Sepolia rules. No legacy graph-verification exception or multiple-address manifest should be reused. Mainnet remains unconfigured.

A new frozen rehearsal and recovery journal must use the same fixed recovery address, protect the operator baseline, account for prior bank/buyer spending and bind V15 IDs/actions. The existing V14 binary cannot drive this ABI. These integration/release steps are not implemented by the local contract/tests above.

## V14 pause and funds

V14's runner exited **2026-10-26 03:55:56 UTC / 11:55:56 Asia/Shanghai** while waiting for Genesis. It completed 50 rehearsal mints and no paid collection. A private pause marker and launcher guards now prevent restart. The immutable onchain deadline cannot pause.

Two RPCs agreed at block **11,995,688**: zero paid collections, 51 Genesis NFTs including the user's #1, and **19.999993568736926356 Sepolia ETH** liquid across the original bank and 50 buyers. The difference from 20 ETH is prior gas. Encrypted wallets and signed journals remain private and preserved. Recovery stays fixed to `0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145`.

A future V15 rehearsal must account for these used wallets/balances. It must not use the old “unused V13 wallets” adoption path or resume frozen V14 code. Deployed contracts, terms and finalized manifests remain unchanged.
