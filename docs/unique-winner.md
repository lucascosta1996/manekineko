# Unique combinations, scores and the configured winners

V10 separates a permanent NFT identity from its later draw result. It inherits V8/V9's configured **1–10 distinct winning NFTs**, default six. This document explains those deterministic guarantees separately from the VRF/Keccak assumptions used to select winners. V10 contracts and application/runtime integration are locally implemented; this does not mean a deployment or live rehearsal is complete. See the [V10 handoff](permanent-combinations-v10.md).

## V10 permanent combination proof

For an immutable collection supply `N <= 65,536`, each assigned token ID has a distinct input `tokenId - 1` in the 16-bit domain. [ScrambledRank](../apps/contracts/contracts/libraries/ScrambledRank.sol) applies a four-round Feistel permutation using a fixed collection key. Every round `(L,R) -> (R,L XOR F(R))` is invertible, even if hash outputs collide; their composition is therefore one-to-one. Splitting the resulting code into four hexadecimal digits and adding one produces ordered numbers `A/B/C/D` in `1..16`.

Consequently, no two tokens in that collection share the same complete ordered combination. A digit may repeat inside a combination, and another collection may use the same combination. No buyer-supplied number or seed is needed. The key and combinations are public and predictable; they establish identity, not randomness or a score.

## V8–V10 distinct-winner and unique-score proof

[MultiAwardRank](../apps/contracts/contracts/libraries/MultiAwardRank.sol) samples an ordered selection of `K` distinct token IDs from supply `N`, where `1 <= K <= min(10,N)`. Its sample space has size `N × (N-1) × ... × (N-K+1)`. At each selection step, an ordinal is mapped into the remaining IDs, excluding the already selected IDs. Thus the completed selection contains exactly `K` different NFTs.

For winning IDs `w[1] ... w[K]` in selected order:

```text
score(w[rank]) = N - rank + 1
score(losingTokenId) = losingTokenId - count(winning IDs below losingTokenId)
```

The first formula assigns winners the distinct top scores `N-K+1 ... N`. Removing the winners from ascending token order assigns losers each score `1 ... N-K` once. Those ranges are disjoint, so every token has a unique final score and exactly the configured `K` tokens occupy the prize ranks. With `N=1,000` and `K=6`, winning scores are 1,000 through 995 and losing scores are 1 through 994. Six winning NFTs may belong to fewer than six wallets.

This proof applies after the one post-sellout draw has finished. An unsold refunded collection has no draw winners, and an unfinished VRF/finalization process has no confirmed outcome. Winner selection is random under the existing VRF/Keccak assumptions; losing scores are assigned in token order, not uniformly shuffled.

V8/V9 encode the final score into their displayed combination after finalization. V10 instead encodes token identity at mint; `scoreCombination(numbers)` recovers the NFT and reads its draw-derived score. The simple packed-number formula in the historical V2 section below is not a V10 score formula. V10 metadata contains only permanent identity/artwork and excludes final scores and changing prize status.

The contract uses bounded rejection sampling rather than a naive modulo conversion, binds the candidate stream to the recorded VRF word and immutable collection inputs, and prevents rerolls or caller-selected counters. Deterministic uniqueness holds for every valid completed selection. Fairness still depends on the entropy and cryptographic assumptions; finite-seed expansion is not an information-theoretic promise of exact probabilities for arbitrary supply/count values. See [randomness and funding](blockchain-randomness.md).

Local V10 regressions cover identity, draw, claims, permanent metadata and registry lineage; the [verification record](permanent-combinations-v10.md#verification-boundary) distinguishes those results from local runtime integration and pending live qualification.

## Historical single-winner designs

The following V1/V2 proofs and test records describe their named versions. They do not define current V10 numbers, the default winner count, claim rules or deployment status.

### Legacy V1 round: unique winner already guaranteed

For any successfully revealed collection of 1 to 65,536 NFTs, the existing `ManekinekoRound` assigns distinct complete scores. This includes the requested supplies of 1,000 and 2,000.

The proof follows the implemented arithmetic:

1. Each token has a distinct token ID.
2. The four Feistel rounds are a permutation: each step `(L,R) -> (R,L XOR F(R))` can be inverted. Therefore distinct IDs produce distinct 32-bit combination codes for every seed, even if individual hash outputs collide.
3. The final score is `subtotal * 2^32 + combinationCode`, where `subtotal = a*b + c*d` and `0 <= combinationCode < 2^32`.
4. Equal final scores would have equal remainders modulo `2^32`, hence equal combination codes. Distinct NFTs cannot satisfy that condition.
5. A finite, nonempty set of distinct scores has exactly one maximum.

For example, `(1,1,1,2)` and `(1,1,2,1)` both have arithmetic subtotal 3, but their codes are 1 and 256. Their final scores are 12,884,901,889 and 12,884,902,144. These are illustrative tuples, not a prediction of a particular collection's assignments.

`settle()` must finish scanning the entire collection before prize distribution is possible. The greatest score during a partial scan is provisional. The owner-only payment function records payment atomically and rejects a second successful payment. Entitlement follows the current owner of that one winning token. A cancelled/refunded collection has no prize winner; this guarantee describes completed draws, not a promise that every round will complete.

This proof establishes uniqueness. It does not certify the current blockhash source or the small-domain Feistel mapping as fair production randomness.

### V2 scoring implementation

For a game with exactly one prize, a full random shuffle is unnecessary. An alternative is to assign the integers `1..N` once each using a rotation:

```text
N      = fixed collection supply
offset = random integer in [0, N-1], fixed only after sales close
score(tokenId) = 1 + ((tokenId - 1 + offset) mod N)
winningTokenId = N - offset
```

| Collection size | Assigned scores | Highest score | Number of winning NFTs |
| --- | --- | --- | --- |
| 1,000 | Each integer from 1 to 1,000 exactly once | 1,000 | 1 |
| 2,000 | Each integer from 1 to 2,000 exactly once | 2,000 | 1 |

Addition modulo `N` is invertible, so scores are unique for every valid offset. Each ticket becomes the winner for exactly one of the `N` possible offsets. **If the offset is uniform**, a ticket's winning probability is `1/N`, and any `k` distinct tickets have combined winning probability `k/N`. This is a mathematical property of the mapping, conditional on the offset distribution.

This is a random rotation, not a uniformly random permutation of every ranking. Scores are correlated, and revealing one score reveals the offset. It is appropriate only for the specified single-prize, sealed-until-sellout design. Additional prize tiers or partially revealed sales require a new analysis.

Four numbers still encode the result. Split `score-1` into four hexadecimal digits, then add 1 to each digit to obtain `a,b,c,d` in `1..16`:

```text
score = 1 + (a-1)*4096 + (b-1)*256 + (c-1)*16 + (d-1)
```

For example, the maximum score 1,000 has combination `(1,4,15,8)`; the maximum score 2,000 has combination `(1,8,13,16)`. Every score has exactly one four-number encoding. SVG rendering and score reconstruction can remain fully on-chain.

`UniqueRank.sol` is a pure-math library integrated into the separate `ManekinekoRoundV2`. `UniqueRankHarness.sol` exposes its functions only for local tests. The V2 round authenticates VRF fulfillment and fixes the offset before exposing combinations. The Web/History/database support the immutable `unique-rank-v2` algorithm version; V1 collections retain their original formula. There is no live V2 deployment or persistent V2 demo record yet.

### V2 offset without modulo bias

For a uniformly random 256-bit word, simple `% N` introduces a tiny bias when `N` does not divide `2^256`. The library exposes a bounded rejection primitive:

```text
threshold = 2^256 mod N
if word < threshold: reject this candidate
otherwise: offset = word mod N
```

The accepted range has a length divisible by `N`. Conditional on a uniform word and acceptance, each offset has exactly the same number of preimages. The function performs one attempt with no loop. For `N=1`, offset zero is valid; zero-valued words are also valid for power-of-two supplies.

A consumer must bind the seed and all retry rules before the seed is known. It cannot expose a caller-selected word, offset or retry counter; let an owner skip accepted candidates; make a new oracle request after observing an outcome; or switch to another source. If deterministic Keccak expansion is chosen for the extraordinarily rare rejected candidate, uniformity then depends on the cryptographic model of that expansion. Rehashing a fixed seed is not new independent entropy. A finite 256-bit seed with an always-terminating deterministic mapping cannot provide literally exact `1/N` probabilities for supplies such as 1,000 and 2,000, since neither divides `2^256`.

The candidate guarantees a unique maximum for all valid inputs, regardless of those probabilistic assumptions. It does not claim to solve entropy availability or manipulation.

### Historical V2 entropy decision

The approved V2 integration uses one Chainlink VRF v2.5 request after sales close, with on-chain proof verification and the result permanently bound to the collection. This explicitly changes the original no-external-provider requirement. VRF generation/fulfillment is external; artwork, ranking, winner verification and prize accounting remain on-chain. [VRF overview](https://docs.chain.link/vrf), [Ethereum support](https://docs.chain.link/vrf/v2-5/supported-networks)

The integration must prohibit rerolls and input changes, authenticate the coordinator, use an appropriate confirmation policy and keep fulfillment small. Compute the offset and ranking outside the callback if necessary, with deterministic progress. Provider availability, request funding, payout recovery and independent security review remain necessary. [VRF security requirements](https://docs.chain.link/vrf/v2-5/security)

Ethereum RANDAO has residual validator influence; V2 uses the approved VRF provider instead. Changing the ranking cannot remove that influence. The existing future blockhash source must not be described as production-secure merely because it produces a unique winner. [Ethereum RANDAO security considerations](https://eips.ethereum.org/EIPS/eip-4399#security-considerations)

### Historical V1/V2 verification scope

`apps/contracts/test/UniqueWinner.ts` exercises the existing round with 1, 1,000 and 2,000 NFTs: all published combinations and scores, exactly one maximum, partial settlement, independent winner comparison, holder transfer, one 50% payout and duplicate-payout rejection.

`apps/contracts/test/UniqueRank.ts` exercises the ranking library and rejection primitive. `apps/contracts/test/ManekinekoRoundV2.ts` exercises the integrated V2 VRF lifecycle, delayed claims and one-winner payout. These tests establish implementation properties for the cases checked. The algebra above supplies the all-valid-input uniqueness argument; neither local tests nor the algebra constitutes an independent audit or a randomness-provider integration test.

Earlier isolated validation on 2026-09-10 passed 50 tests. Integrated V2 validation now passes 80 contract tests, including both versions' full-collection lifecycle cases, ranking-library cases and simulated Ethereum network-binding checks. Solidity compilation used the pinned 0.8.37 compiler and Cancun target. These are local simulated-chain results, not Mainnet or Sepolia deployment evidence.
