# V10 permanent NFT combinations: contract and agent handoff

**Latest staging update — 2026-09-22 UTC:** migrations 025/026 and Web/Launch/Indexer are deployed and hosted reads were verified. See [the application release record](staging-v10-release.md). V10 registries/contracts, season-worker activation and the V10 live rehearsal remain pending. Earlier local-only verification below remains dated evidence.


**Status: local contract and full runtime integration, 2026-09-21.** V10 is implemented across Web collection reads/transactions, Launch, database migration 026, indexer, season automation and deployment preparation. New editable defaults and `launch:prepare:current` target V10. Explicit V9 execution/recovery and frozen V8/V9 exports retain their original version. That local integration did not change staging. The later user-authorized application release is recorded above; V10 registry/contract deployment and live rehearsal remain pending. Existing V8/V9 contracts and historical outcomes are unchanged.

Read [architecture.md](architecture.md) for system-wide invariants and the dated live snapshot. This file records the V10 decision and the work a later agent must complete; it is not public product copy or a deployment runbook.

## Decision

V10 mints each NFT with its finished four-number identity and artwork. Solidity generates the numbers from the token ID and a fixed collection key. A separate, single Chainlink VRF request after sellout still determines the winners and final scores. Numbers identify a ticket; they do not encode its eventual score.

Metadata and SVG exclude changing score, award, prize and lifecycle fields. They therefore need no post-draw cache refresh. Blockscout or another explorer can index the permanent numbers on its first successful read. This removes the stale-Sealed transition that affected the historical V8 NFT; it does not guarantee an explorer's indexing speed or support for data-URI SVG images.

The existing [V8/V9 refresh queue](nft-metadata-refresh.md) is a separate local implementation whose staging activation was deferred by the user. It remains useful for historical versions. Do not deploy it as an implied part of V10. Discovery, claiming and processing explicitly exclude V10; its permanent metadata must never pass through the revealed-Score decoder.

## Version and source map

| Component | Marker / source |
| --- | --- |
| Round | `affiliate-v10`, [ManekinekoRoundV10.sol](../apps/contracts/contracts/ManekinekoRoundV10.sol) |
| Algorithm | `unique-rank-v6`; existing [MultiAwardRank.sol](../apps/contracts/contracts/libraries/MultiAwardRank.sol) winner selection and score allocation |
| Factory and creation helper | [ManekinekoFactoryV10.sol](../apps/contracts/contracts/ManekinekoFactoryV10.sol), [ManekinekoRoundDeployerV10.sol](../apps/contracts/contracts/ManekinekoRoundDeployerV10.sol) |
| Renderer | [ManekinekoRendererV10.sol](../apps/contracts/contracts/ManekinekoRendererV10.sol) |
| Combination encoding | `solidity-permutation-v1`, [ScrambledRank.sol](../apps/contracts/contracts/libraries/ScrambledRank.sol) |
| Artwork marker | `tincta-v3` |
| Eligibility registry | `affiliate-eligibility-v5`, [ManekinekoAffiliateEligibilityV5.sol](../apps/contracts/contracts/ManekinekoAffiliateEligibilityV5.sol) |
| Winner reward registry | `winner-credits-v6`, [ManekinekoWinnerCreditsV6.sol](../apps/contracts/contracts/ManekinekoWinnerCreditsV6.sol) |
| Additive term parser | [v10-config.ts](../packages/contracts/src/v10-config.ts); keeps V9 terms and fixed `maxMintsPerWallet: "20"` |
| Shared exports | Versioned `round-v10`, `factory-v10`, `renderer-v10`, `round-deployer-v10`, `affiliate-eligibility-v5`, `winner-credits-v6` and source exports in `@manekineko/contract-abi` |

The algorithm marker changes because decoding four numbers no longer directly returns a score. It does not mean the six-winner sampling method was replaced. Historical V8/V9 continue to use `unique-rank-v5` and their existing score-encoding semantics.

## Identity generated entirely in Solidity

For an assigned token ID from 1 through the immutable supply:

```text
key = keccak256(abi.encode(
  keccak256("MANEKINEKO_PERMANENT_COMBINATION_V1"),
  chainId, collectionAddress, roundId, seasonId, maxSupply
))
code = ScrambledRank.encode(tokenId - 1, key)
numbers = ScrambledRank.numbers(code)
```

The key is fixed during construction and readable before the sale through `combinationKey()`. The four-round Feistel permutation is bijective over the complete 16-bit domain. Distinct token IDs within a collection therefore have distinct ordered combinations; the four digits each range from 1 through 16 and encode 65,536 possibilities. Individual digits may repeat within one combination. Different collections may have the same four-number combination; always include collection identity when looking up an NFT.

No mint function accepts numbers, a combination key, a seed or caller-supplied randomness. Direct, referral and sponsored mint paths assign the next token ID and share the same mint restrictions. There is no per-mint VRF fee or waiting period. A buyer can predict and prefer the artwork of an upcoming token ID, but cannot learn its winning status before the later VRF draw. The public permutation is neither encryption nor an entropy source, and secrecy of this key is not a security assumption.

## Draw and unchanged V9 invariants

The sale must sell out before the one VRF request. Its authenticated callback stores the word; `finalizeDraw(attempts)` then advances the same bounded rejection-sampling procedure inherited from V9. The V10 draw domain is `MANEKINEKO_MULTI_AWARD_RANK_V6`. Callers cannot supply a replacement word, reroll a successful request or choose winners through batch size.

For supply `N` and configured winner count `K`, the contract samples exactly `K` distinct token IDs without replacement, once finalization completes. `K` remains configurable from 1 to 10, bounded by the supply; the launch default remains six. Six winning NFTs can belong to fewer than six wallets. Winners receive scores `N` down to `N-K+1`; losing IDs receive the other unique scores in token order. This is unbiased winner selection under the existing VRF/hash assumptions, not a full random shuffle of all losing scores.

V10 retains:

- The 20-ticket per-transaction and cumulative 20 primary mints per recipient limits, including gifts, referrals and sponsored mints. Transfers and refunds do not reset the allowance.
- Equal prizes, holder-only claims, independent rank claims and protection of unpaid prize liabilities.
- Qualified equal affiliate sharing, payout caps, growth reserve separation and full-price sponsored funding.
- One redeemed sponsored NFT per wallet lifetime across the supported registry lineage.
- Sellout transfer locks until finalization, continued locks for unpaid winning NFTs, and losing NFT transfers after finalization.
- Unsold expiry/refunds and burn-on-refund. A sold-out collection still cannot use an expiry refund to discard a delayed VRF draw.
- Existing enrollment timing, canonical factory registration, immutable reviewed terms and appearance rules.

## Public read API and metadata contract

| Call or field | Before draw finalization | After draw finalization |
| --- | --- | --- |
| `combinationKey()` | Fixed public key, including before mint | Same key |
| `combination(tokenId)` | Existing NFT's numbers/code; `result = 0` means no final score | Identical numbers/code plus final score |
| `tokenIdForCombination(numbers)` | Decodes the identity and requires an existing minted NFT | Same identity lookup |
| `score(tokenId)` | Reverts `RevealNotAvailable` for an existing NFT | Unique final score |
| `scoreCombination(numbers)` | Reverts `RevealNotAvailable` | Decodes existing NFT identity and returns its final score |
| `tokenURI(tokenId)` | Finished permanent JSON/SVG from mint | Byte-identical JSON/SVG |
| `revealed`, `phase`, awards and claims | Authoritative lifecycle state; numbers do not imply reveal | Authoritative finalization/settlement state |

Identity reads reject nonexistent and refunded/burned tokens. `scoreCombination` also rejects invalid digits or combinations outside the collection/existing NFT set after finalization. Score zero is a compatibility sentinel in `combination`, not a settled losing score; actual scores start at one. Clients must use the reveal state or strict score getter to distinguish pending results.

V10 JSON contains immutable collection/season appearance and version fields, a data-URI SVG image and numeric `A`, `B`, `C`, `D`, and `Combination code` traits. It has no `Score`, `Award Rank`, `Prize`, `Status`, winner badge or Sealed/Revealed label. The description explains how to verify a score after the draw. SVG retains the season/collection identity, color and geometric motifs and labels the permanent combination code.

Metadata stays byte-identical through later mints, sellout, raw VRF fulfillment, draw finalization, all claims, transfers and unsold cancellation, for as long as the token exists. Refund burning makes its `tokenURI` unavailable rather than changing the NFT into refund artwork. V10 retains ERC-4906 interface compatibility, but draw and cancellation do not emit metadata updates because those actions change no metadata.

Do not add score, win/claim status, owner, sale phase or a state-dependent external URL to the permanent metadata later. Such an addition would recreate the cache-refresh dependency. First-party UI can show these changing facts separately using canonical chain state.

## Registry lineage and migration requirements

Deployed Eligibility V4 and Winner Credits V5 do not support the V10 version/algorithm pair. They are immutable; adding V10 ABIs cannot change them. New registry source is necessary even though V10's prize/affiliate economics are inherited from V9.

Eligibility V5 accepts the exact V10 pair for new registered targets and preserves prior supported versions. Completed V6–V9 collections can be imported as source-only history even when bound to their historical registry. Such imports cannot reopen enrollment or consume a fresh first-collection bootstrap. Verify trusted factory code hashes, immutable collection/algorithm identity, source completion, ordering and ownership. Import the relevant completed history before admitting a new V10 target so a registry upgrade does not create another unrestricted bootstrap.

Winner Credits V6 recognizes V10 multi-award sources/targets and can reference previous Winner Credits V2–V5 for lifetime-use checks. Before creating/funding a new canonical registry, preserve the legacy root and prior registry identity, retire old funded mint destinations and recover only operator-owned unused sponsorship under the reviewed migration procedure. The V6 constructor rejects a prior registry with remaining sponsor balance. Old registries cannot observe new redemptions, so do not later fund an old destination and accidentally enable a second lifetime redemption.

Historical source registration for credits is rewards-only where appropriate; it must not reopen a previously active collection as a new sponsored mint target. Prize rights stay with the winning NFT holder recorded at claim, not the payout recipient. Test two-way lineage expectations explicitly: previous redemptions block V6 redemption, while operational retirement prevents going back to an older registry after a V6 redemption.

The Sepolia [V9 registry setup record](sepolia-v9-registry-setup.md) remains valid historical evidence. Its deployed V4/V5 addresses/hashes must never be labeled V5/V6. A future V10 migration needs its own reviewed private configuration/journal, runtime pins, database settings and verification using the integrated version-aware tooling. The setup command requires `contractVersion: "affiliate-v10"` in its private setup JSON for V10; omitting it preserves historical V9 setup/recovery. Use a separate V10 journal and its exact new pins. Mainnet has its own separate lineage/bootstrap decision and is not configured by Sepolia work.

## Integration status and remaining checklist

### Implemented locally

- **Shared interfaces and previews:** explicit V10 artifacts/parser plus `permanent-combinations` helpers derive the constructor key, encode token identity and decode numbers to token ID. Permanent previews omit draw state. Predeployment artwork is an illustrative sample because the eventual deployed address/key is not yet known.
- **Web:** versioned mint, contract-source, gallery/detail/history, verification, eligibility and winner-credit paths support V10. Numbers appear from mint. Pending score is `null`; strict final-score reads, award ranks and holder claims remain separate. Permanent metadata validation requires only the five numeric identity traits and rejects mutable score/status/prize traits. V8/V9 retain their sealed/revealed behavior.
- **Database and indexer:** additive migration [026](../database/migrations/026_permanent_combinations_v10.sql) accepts exact `affiliate-v10` / `unique-rank-v6` terms and prepared homogeneous V9/V10 runs. Old finalized exports, hashes, catalog identities and staging Mainnet-draft restrictions remain unchanged. Canonical indexer readers use V10 ABIs and independent factory/version/hash pins, verify the deployment-derived key, decode winner identity separately from finalized score, and rebuild orphaned awards atomically. The indexer does not infer settlement from visible numbers. Per-token gallery identities are verified by canonical contract reads; no redundant off-chain number generator is a mint input.
- **Launch:** V10 is the new editable default, with exact manifest validation, reviews, previews and estimates. Saved V9 drafts keep their version until a deliberate revisioned edit; finalized exports are immutable. Neither individual nor sponsored minting accepts user-supplied numbers/seeds.
- **Preparation/deployment:** `launch:prepare:current` and generic deployment shortcuts target V10. The V10 parser, constructor/runtime/renderer checks, split creation code, source verification and private resumable deployment journals are versioned. The season worker separately encrypts its durable journal state. Explicit V9 commands remain available; a V9 manifest cannot pass V10 preparation.
- **Season worker and registries:** a prepared artifact selects an exact V9 or V10 policy, including algorithm, factory/round/renderer, Eligibility V4/V5 and Winner Credits V5/V6. V10 registry setup supports reviewed completed V6–V9 sources and previous lifetime-use lineage. Historical source imports finish before any new target can consume bootstrap. The worker continues one sellout VRF request and bounded finalization; announcements explain permanent numbers separately from results. Fifty-wallet rehearsal and fund recycling remain Sepolia-only.
- **Explorer refresh:** V5–V9 queue discovery and revealed-Score verification remain version scoped. V10 never needs a draw-triggered cache refresh and is explicitly excluded. External first indexing/rendering remains outside the protocol's control.

### Remaining live qualification

1. **Staging database/application step complete (2026-09-22 UTC):** migrations through 026, restricted grants and Web/Launch/Indexer deployment are verified in [the release record](staging-v10-release.md). The historical metadata queue is active. Other environments require their own reviewed migration; never seed hosted fixtures.
2. Deploy and verify Eligibility V5 / Winner Credits V6, preserving eligible history, the legacy Merkle root and all previous lifetime redemptions. Retire every previously registered destination that could still mint; zero sponsor balance alone is insufficient because registries can be funded again. Old registry governance must remain retired and must not register new mintable targets after migration. Install exact new pins only after canonical runtime/provenance checks; never relabel deployed V4/V5 addresses.
3. Activate and qualify the persistent worker. Staging Web/Launch/Indexer are deployed; configure new mixed-version factory pins and provider filters after the V10 contracts exist so old claims stay covered. Configure the X test account and verify authenticated persistence and account identity before enabling delivery.
4. Prepare a fictional Sepolia V10 season and separately authorize its reviewed full spending budget. Verify first-mint metadata externally, byte-identical metadata after real VRF/claims, all six holder claims, cap exhaustion across mint paths, historical eligibility/lifetime credits, mixed-version indexing, connected-wallet flows, hosted pages and a separate unsold-refund case. A local source/test pass is not a live rehearsal.
5. Qualify Mainnet independently: registry lineage/bootstrap, ownership/key custody, funding, monitoring/recovery, external explorer support, full acceptance and independent contract/security review. Mainnet draft planning in staging does not authorize preparation or execution there.

## Verification boundary

Initial contract-only verification completed on 2026-09-21:

- `npm run test --workspace @manekineko/contracts -- --no-compile`: **385 passed, no failures or skips**. Coverage includes the V10 round, permanent metadata lifecycle, registry lineage, configuration, default/production compiler bytecode parity, and the existing exhaustive 65,536-code permutation regression. Test sources include [RoundV10.ts](../apps/contracts/test/RoundV10.ts), [NftMetadataV10.ts](../apps/contracts/test/NftMetadataV10.ts), [RegistriesV10.ts](../apps/contracts/test/RegistriesV10.ts) and [V10Config.ts](../apps/contracts/test/V10Config.ts).
- `npm run export --workspace @manekineko/contracts`: passed, including all six new component ABI/source exports and EVM deployment-size checks. V10 round runtime is 23,668 bytes against the 24,576-byte limit; factory creation bytecode is 48,033 bytes, plus 32 constructor-argument bytes, against the 49,152-byte initcode limit. Keep these checks mandatory as remaining space is limited.
- `npx tsc --noEmit` in `apps/contracts`: passed.
- SHA-256 comparisons confirmed **132 historical Solidity and shared ABI/source files unchanged**.
- A local SVG produced by the actual V10 renderer was rasterized and visually inspected for permanent numbers and labels. This verifies local artwork output, not external explorer or hosted browser behavior.

V10 verification is local unless a later dated entry explicitly records a deployment. Local compilation, tests and generated ABI/source exports do not prove database persistence, hosted compatibility, connected-wallet behavior, real VRF fulfillment or explorer rendering. The original contract implementation and public-copy refresh performed no runtime integration. The later local runtime integration is recorded below; neither stage performed a live migration, deployment or connected-wallet rehearsal.

Public architecture follow-up on 2026-09-21: Web tests passed **247 of 249**, with two environment-dependent skips and no failures; Web typechecking passed and the production build generated all 14 documentation routes. Landing typechecking and its production build passed. Read-only local browser review covered the documentation overview, permanent-combination search/navigation to the randomness guide, My NFTs help, Seasons, Landing hero/body and the historical Cinder Study V8 mint-page comparison FAQ. Historical artwork/rules stayed intact, and inspected Web/Landing pages showed no console errors. No wallet connection, transaction or live V10 explorer flow was exercised. These are public content/rendering checks, separate from the contract results above and from the V10 runtime integration that followed.

### Local runtime integration verification (2026-09-21)

- Full current Solidity suite: **386 passed**, including permanent identity/metadata, registry lineage and byte-exact shared TypeScript identity/SVG parity against Solidity for token IDs 1, 7 and 20. Contracts build and TypeScript checks passed; the parity cases are included in that total.
- Season worker: **68 tests passed, zero skips**, including isolated persistence/grants/registration, exact V9/V10 policies, complete V6 predecessor retirement checks and a blocked replay when an old destination becomes mintable; typechecking passed.
- Operations/preparation/staging/retirement: **95 tests passed, zero skips**, with the historical eligibility database checks enabled. The retirement helper checks every ledger in the previous-registry lineage before V10 setup/unsigned operations; all previous targets must be permanently closed to minting. V10 worker preflight, writes and persisted replay also recheck that lineage. An eligibility regression verifies that a prior V4 registry alone prevents reopening bootstrap in an empty V5 ledger.
- Indexer: **78 tests passed, zero failures/skips**, including isolated PostgreSQL migrations, restricted roles, canonical snapshots, six independent V10 awards/claims, refunds, reorganization cleanup, mixed V8/V9/V10 pins and explicit V10 refresh-queue exclusion. Typechecking and production build passed.
- Migration [verification script](../scripts/verify-v10-database.mjs): full ordered migration chain through 026; unchanged V8/V9 finalized artifacts/hashes and catalog plans; strict V10 cap/algorithm validation; homogeneous V9/V10 prepared runtime binding; staging Mainnet restriction; immutable collection terms, affiliate admission and award invariants. Historical V9 migration verification also passed.
- Staging catalog admission helper: **37 tests passed**, including V10 manifest/cap/version checks and refusal to insert ranked results into the legacy archive. No staging database was contacted.
- Web: **263 tests passed, zero skips**, including isolated SQL fixtures; typechecking and production build passed. Launch: **185 tests passed, zero skips**, including isolated persistence/permission checks; typechecking and production build passed.
- Isolated local browser checks confirmed authenticated Launch V10 defaults, permanent artwork with its illustrative-number caveat, six prizes, the 20-mint cap and Credits V6 guidance. A fictional Web collection rendered permanent numbers while its draw was pending and kept unverified minting disabled. Public documentation retained the live-rollout boundary. A V10-specific FAQ heading was corrected, focused checks passed and Web typechecking passed again. The temporary servers and browser database were removed; these were not hosted or connected-wallet checks.
- Database verification used a separate disposable local PostgreSQL 16 container on port 54339 with explicit test URLs. The existing port 54329 was an SSH listener and was deliberately excluded. No environment file pointing to staging was loaded for test writes, and no hosted fixtures, migration, grants or production records were changed.

These tests establish local behavior and storage boundaries. Hosted UI, live registry/contract deployment, wallet transactions, real VRF, X delivery and external V10 explorer rendering remain unverified.
