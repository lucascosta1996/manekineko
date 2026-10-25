# V13 Sepolia release · 2026-10-25

The user authorized the five-app release and a fresh V13 Sepolia deployment with **60% prizes / 20% affiliates / 10% season holders / 10% protocol treasury**. The graph below is deployed and independently verified at finalized block **11991095** (0x1ef9faf18f196b99faab0f4f79fabe609451eaa677a38a7d270a1ce3213fa78b). Source revision: `8f5ad3c7025ad99c2f5f25e8e13b8ae2996afa6d`.

This is a separate **Sepolia test genesis**, not an upgrade or migration of historical deployments. Older contracts, registry history, frozen exports and completed seasons were not modified or imported. Its new registry starts with zero prior registry/root, and first-collection bootstrap is enabled only within this independent test graph. Mainnet remains unconfigured.

## Deployed graph

| Contract | Sepolia address |
| --- | --- |
| ManekinekoSeasonControllerV13 | [0x479198a1dc89E4DDF856077d04AA49C661C197C4](https://sepolia.etherscan.io/address/0x479198a1dc89E4DDF856077d04AA49C661C197C4) |
| ManekinekoHolderRewardsV13 | [0x0348fB2cd1cBD16C29fc270189f0408412203d29](https://sepolia.etherscan.io/address/0x0348fB2cd1cBD16C29fc270189f0408412203d29) |
| ManekinekoVotingV12 | [0x84e6c608D9cd98C4fa4A36f770b06dF6A38AC547](https://sepolia.etherscan.io/address/0x84e6c608D9cd98C4fa4A36f770b06dF6A38AC547) |
| ManekinekoRendererV11 | [0x6e7bdbc038750fF55cF613183c3a2a076f4D0e72](https://sepolia.etherscan.io/address/0x6e7bdbc038750fF55cF613183c3a2a076f4D0e72) |
| ManekinekoWinnerCreditsV9 | [0x552972a6eabFD4fC2F0D592eA64863724189e305](https://sepolia.etherscan.io/address/0x552972a6eabFD4fC2F0D592eA64863724189e305) |
| ManekinekoRoundDeployerV13 | [0xFE058d499ab0177D5f01C6Eb29F55c06fbF2467b](https://sepolia.etherscan.io/address/0xFE058d499ab0177D5f01C6Eb29F55c06fbF2467b) |
| ManekinekoV13CodePart | [0xb06764289a9203B576BA8C03993599119540704a](https://sepolia.etherscan.io/address/0xb06764289a9203B576BA8C03993599119540704a) |
| ManekinekoV13CodePart | [0x0f0cD036324cbF467aa20f3E91Aa6A47e5942381](https://sepolia.etherscan.io/address/0x0f0cD036324cbF467aa20f3E91Aa6A47e5942381) |

Operator: `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223`. The [public deployment manifest](deployments/sepolia-v13-2026-10-25.json) contains runtime hashes, compiler/build verification hashes, exact catalog/options/settings, canonical transaction receipts and the common-block verification result. Authenticated RPC endpoints, credentials and signed deployment journals are excluded.

The six executable contracts are source-verified on Etherscan. The two code-part addresses contain constructor-returned data rather than a standard executable runtime; Etherscan source matching rejected those data blobs. The full-graph verifier independently matched both blobs byte-for-byte against the exact compiled V13 round creation code. No collection round has been created, so there is no live round address or round-specific explorer verification yet.

## Frozen test configuration

- The complete checked-in Sepolia catalog is sealed: **22 fictional seasons / 216 collections**. Existing season IDs, names, collection order, symbols and hex colors are preserved. No Mainnet catalog identity was copied or modified.
- The two economic options are carried unchanged from the reviewed V13 local deployment package: **1,000 NFTs at 0.01 ETH, six equal prizes, one-hour mint window**, or **2,000 NFTs at 0.02 ETH, four equal prizes, 24-hour mint window**. These are immutable Sepolia test choices, not a change to ordinary editable draft defaults.
- Voting lasts one hour and starts 60 seconds after preparation. VRF uses the fixed Sepolia coordinator/lane, 64 confirmations and 200,000 callback gas. Per-collection preparation reserves 0.01 test ETH for randomness and 0.04 test ETH for sponsored mints, plus the existing separate executor reserve.
- Holder allocation is 1,000 basis points; first-come coverage remains 500 basis points. The stored round creation code fixes the treasury allocation at 1,000 basis points. All prize, affiliate, refund, ownership, dust and season-unlock rules retain their reviewed behavior.
- The registry approves only this controller and factory approvals are sealed. The holder vault and round deployer are permanently bound before the catalog seal.
- **Zero collections are prepared.** The controller has no operating balance. This release did not call `prepareNext`, start voting/minting, request VRF, run a buyer rehearsal, or activate a lifecycle executor/social worker. Future preparation requires a separate funded transaction and starts the immutable schedule.

Deployment used 31 confirmed transactions, two confirmations before each dependent write, a 5 gwei fee ceiling and a 0.02 test ETH aggregate cap. Actual deployment gas cost: **0.000044716566565656 Sepolia ETH**. The user's 0.05 test ETH funding transaction is `0x4d47563ff70803ebe377842504874a7e2fdd417606393b3f548a29ee883cfc8c`; unused ETH remains in the deployment wallet. No funds were sent to the controller or a mint/claim pool.

## Verification and hosting

Two independent RPC hosts agreed on the complete graph at one common finalized block. Verification checked deployed runtimes/private immutables, the exact round creation stores, all 216 catalog entries, voting choices, registry authority/sealing, VRF bindings, holder policy, season boundaries, empty pool accounting and zero prepared rounds. The production protocol reader and holder-policy reader also passed against the public browser RPC. Source verification is separate evidence from this graph verification and from an independent security audit.

The allocation source release reached Ready on all five Vercel projects, with matching Git SHA and stable aliases: parent Tincta, Rewards Landing, Web, Launch and Indexer. Live parent/Rewards pages and allocation/holder guides passed desktop and mobile content/overflow checks, and rendered screenshots were inspected. After graph verification, Web and Launch were configured with explicit Sepolia V13 controller/holder runtime pins; Mainnet pins stay absent. The Indexer mirror was configured with the verified controller at its creation block, preserving the historical indexer configuration. All release builds must consume these verified environment values; an environment update alone does not prove hosted activation.

Local validation is recorded in [the allocation revision](season-holder-rewards-v13.md#allocation-revision-and-verification--2026-10-25): 467 contract tests, all app tests/builds/typechecks and 305 focused browser checks passed. Remaining release checks added 73 passing Indexer tests (9 database-dependent skips), 35 winner-credit tests and 11 eligibility tests (1 optional skip), plus Indexer build/typecheck, season tooling typecheck and a full unchanged-export check. Real V13 mints, VRF delivery, claims and a complete public-chain season rehearsal have not run.

The first GitHub Checks run exposed an older V12 fixture-clock dependency: after the long suite, its restored block could be more than 180 wall-clock seconds old. Commit `a5fb577` pins only that test's clock to its fixture block and explicitly verifies rejection at 181 seconds; the production freshness guard is unchanged. All 37 V12 cases and the contracts typecheck passed, and Checks was retriggered.

Full [Visual UI contracts CI](https://github.com/lucascosta1996/manekineko/actions/runs/40195112919) is **not green**: 699 passed, 176 skipped and 10 failed. Eight screenshot cases also failed on the preceding `544d65d` main revision; two Firefox interaction assertions timed out. Both Firefox cases passed when rerun locally against the production fixtures. This is separate from the passing focused allocation checks and live browser verification; no broad CI pass is claimed.

The subsequent [test-readiness follow-up](sepolia-v13-test-readiness-2026-10-25.md) records the funded test wallet, V13 worker repairs, corrected social previews and wallet connection checks.
