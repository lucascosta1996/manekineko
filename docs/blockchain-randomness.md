# Blockchain, permanent numbers and randomness

**Architecture reference: 2026-09-21.** V10 (`affiliate-v10`, `unique-rank-v6`) is implemented locally across contracts, Web, Launch, database migration 026, indexer, season worker and deployment tooling. No live V10 database/registry rollout, contract deployment or VRF rehearsal is recorded. Read the [system architecture](architecture.md) and [V10 handoff](permanent-combinations-v10.md) for exact version and verification boundaries.

## Selected architecture

- Ethereum Mainnet is the production target; Sepolia is the integration-test network.
- Solidity assigns each V10 NFT a permanent ordered combination of four numbers when it mints. The caller supplies neither numbers nor a seed.
- One Chainlink VRF v2.5 request after sellout determines the winning NFTs and final scores. There is no request or oracle wait for each mint.
- The configured winner count is 1–10 distinct NFTs, default six. One wallet may own several winners.
- Contract-generated JSON and SVG contain the permanent identity and artwork. Scores, prizes and claim state are separate contract reads; they never change this metadata.

## Identity is separate from the draw

V10 derives a fixed public key from its deployment identity and applies the bijective [ScrambledRank](../apps/contracts/contracts/libraries/ScrambledRank.sol) permutation to `tokenId - 1`. The resulting 16-bit code is displayed as four digits in `1..16`, providing 65,536 possible ordered combinations. Different token IDs within the same collection cannot collide; individual digits may repeat. A collection address is still needed because different collections may share a combination.

These combinations are predictable. They provide a stable ticket identity, not secret entropy or an advance score. Solidity assigns sequential token IDs on every mint path; the buyer cannot submit a combination or random seed. A fixed formula for numbers therefore does not reveal which NFTs will win the later draw.

The distinction is visible in the API: `combination(tokenId)` returns permanent numbers immediately, with a score-zero sentinel while results are pending. `score(tokenId)` and `scoreCombination(numbers)` require completed draw finalization. `tokenIdForCombination(numbers)` recovers an existing NFT's identity. See the [API table](permanent-combinations-v10.md#public-read-api-and-metadata-contract).

## One immutable draw after sellout

Each round creates and owns its VRF subscription and registers itself as the sole consumer. `fundRandomness()` supplies a separate native-ETH budget; it is not mint revenue. Activation requires a funded subscription, but a nonzero balance alone does not prove the budget covers fulfillment under future gas conditions.

The final mint closes sales before receiver callbacks. A later permissionless `requestRandomness()` records one successful request. A reverted request can be retried because it created no request; an accepted request cannot be replaced or rerolled. The authenticated coordinator callback only stores the word, keeping rendering, selection and payouts outside the callback.

Anyone can then call bounded `finalizeDraw(attempts)`. The contract processes its deterministic candidate stream in order, binding the VRF word to the chain, collection and frozen draw terms. Callers cannot supply another seed, offset or counter or skip an accepted candidate by choosing a batch size.

[MultiAwardRank](../apps/contracts/contracts/libraries/MultiAwardRank.sol) uses rejection sampling over ordered selections without replacement. For supply `N` and configured count `K`, it selects `K` distinct NFTs and assigns them scores `N` down to `N-K+1`. Other tokens receive the remaining unique scores in token order. This guarantees the configured number of winners once finalization completes; it is not a full random shuffle of every losing score. See [the uniqueness proof](unique-winner.md).

Uniqueness is deterministic. Selection fairness depends on the VRF and Keccak cryptographic assumptions, authenticated fulfillment and fixed request inputs. A finite 256-bit seed does not provide an information-theoretic guarantee of exactly equal probabilities for every arbitrary sample-space size. Funding and provider availability remain operational dependencies. The fixed coordinator and gas lane cannot be replaced through an owner setter.

## Metadata and claims

V10 metadata has its numbers and finished artwork from mint, with no Score, Award Rank, Prize, changing Status or winner badge. The `tokenURI` stays byte-identical through sellout, VRF fulfillment, finalization, claims, transfers and unsold cancellation while the NFT exists. Refunding burns the NFT, after which its URI is unavailable. This removes the sealed-to-numbered cache transition, while external explorers still control initial indexing and SVG support.

After finalization, only the current holder of each winning NFT can claim that rank's prize. There is no owner-triggered substitute payout. Losing NFTs unlock at finalization; unpaid winning NFTs stay locked until their own claim. Reserved prize, affiliate and growth liabilities remain protected. `Complete` means all configured prizes have been claimed, while readiness for the next collection can occur earlier when the finalized liabilities are fully funded.

Unsold expired collections allow current holders to burn tickets for the original mint-price refund. A sold-out collection cannot cancel or switch randomness because fulfillment is late. Permanent numbers do not remove the need to fund, monitor and finalize the draw.

## Version and verification boundaries

V8/V9 instead derive their displayed numbers from the final scores. Their sealed metadata changes at finalization and emits an ERC-4906 update; an explorer may still keep a stale copy. Their [refresh recovery](nft-metadata-refresh.md) remains separate and local at the user's request. Existing deployed collections cannot acquire V10 behavior from a website change.

V1 used a future block hash. V2–V6 used earlier single-winner VRF/score designs; V7 introduced two unequal prizes, and V8 introduced configurable equal prizes. Their source, deployment guides and immutable terms retain those meanings. In particular, the V2 owner-payout and delayed-claim rules are historical, not V10 rules.

V10 contract tests and exports are locally qualified as recorded in its [handoff](permanent-combinations-v10.md#verification-boundary). A future release still needs live database and compatible registry migration, hosted rollout, a funded Sepolia rehearsal, external initial-artwork checks, and independent security qualification before Mainnet. Source support and public copy are not deployment evidence.

Primary provider references: [VRF overview](https://docs.chain.link/vrf), [supported networks](https://docs.chain.link/vrf/v2-5/supported-networks), [security requirements](https://docs.chain.link/vrf/v2-5/security), [billing](https://docs.chain.link/vrf/v2-5/billing).
