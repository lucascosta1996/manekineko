# V14 Sepolia release · October 26, 2026 (Asia/Shanghai)

A fresh V14 graph is deployed. The full runtime, immutable bindings, 22-season / 216-collection catalog and financial settings agree across two independent RPCs at finalized block **11992265**. All seven executable components have publicly readable source and ABI. Five are exact-verified on Etherscan; the unchanged Credits V9 and Renderer V11 inherit Etherscan Similar Matches and are additionally exact-verified on Sourcify, including creation bytecode and constructor arguments.

| Contract | Etherscan source | Exact verification |
| --- | --- | --- |
| ManekinekoSeasonControllerV14 | [0xccaA796a3DB877647670fe0AEB077488840B798B](https://sepolia.etherscan.io/address/0xccaA796a3DB877647670fe0AEB077488840B798B#code) | [etherscan-exact](https://sepolia.etherscan.io/address/0xccaA796a3DB877647670fe0AEB077488840B798B#code) |
| ManekinekoHolderRewardsV13 | [0x4e7A3B6EFb15aA06ECb84430ef390dc5E0C0C406](https://sepolia.etherscan.io/address/0x4e7A3B6EFb15aA06ECb84430ef390dc5E0C0C406#code) | [etherscan-exact](https://sepolia.etherscan.io/address/0x4e7A3B6EFb15aA06ECb84430ef390dc5E0C0C406#code) |
| ManekinekoVotingV14 | [0x1aE1D4091721021bA68EdBED190c4A982649B128](https://sepolia.etherscan.io/address/0x1aE1D4091721021bA68EdBED190c4A982649B128#code) | [etherscan-exact](https://sepolia.etherscan.io/address/0x1aE1D4091721021bA68EdBED190c4A982649B128#code) |
| ManekinekoGenesisV14 | [0xb6fC90Bc5F6Cd69BB210A96027B84dDB9976d2Dc](https://sepolia.etherscan.io/address/0xb6fC90Bc5F6Cd69BB210A96027B84dDB9976d2Dc#code) | [etherscan-exact](https://sepolia.etherscan.io/address/0xb6fC90Bc5F6Cd69BB210A96027B84dDB9976d2Dc#code) |
| ManekinekoRendererV11 | [0x527Ab7d0c10EFb5b2EE0d4EB90E8336d50C3097A](https://sepolia.etherscan.io/address/0x527Ab7d0c10EFb5b2EE0d4EB90E8336d50C3097A#code) | [sourcify-exact](https://sourcify.dev/server/v2/contract/11155111/0x527Ab7d0c10EFb5b2EE0d4EB90E8336d50C3097A?fields=all) |
| ManekinekoWinnerCreditsV9 | [0x0786FCEF295499583384297B643472B162a5713B](https://sepolia.etherscan.io/address/0x0786FCEF295499583384297B643472B162a5713B#code) | [sourcify-exact](https://sourcify.dev/server/v2/contract/11155111/0x0786FCEF295499583384297B643472B162a5713B?fields=all) |
| ManekinekoRoundDeployerV13 | [0x078ce6Be884aDd4e4d5fA19809e149b3bad6EDD0](https://sepolia.etherscan.io/address/0x078ce6Be884aDd4e4d5fA19809e149b3bad6EDD0#code) | [etherscan-exact](https://sepolia.etherscan.io/address/0x078ce6Be884aDd4e4d5fA19809e149b3bad6EDD0#code) |

The two STOP-prefixed CodePart addresses are byte storage, checked byte-for-byte by the graph verifier; they are not labeled executable source-verified contracts. Full evidence and deployment receipts are in the [public manifest](deployments/sepolia-v14-2026-10-26.json). It excludes authenticated endpoints, keys and signed private journals.

Genesis opened at **2026-10-25T17:08:24.000Z** and closes at **2026-10-26T17:08:24.000Z**. The first paid ballot cannot be prepared before the full window ends. Rules: 1,000 free NFTs, one lifetime mint per wallet, gas only, first paid ballot only, no financial entitlements. Paid collections retain the 60% / 20% / 10% / 10% allocation and their actual V13 templates.

Deployment consumed **0.000046990806291631 Sepolia ETH** from the separately funded operator. No ETH was taken from the 20 ETH rehearsal bank for deployment. At this verification snapshot, no paid collection had been prepared.

The first-season buyer run is described in the [V14 rehearsal runbook](sepolia-v14-buyer-rehearsal.md). It uses fresh V14 runtime/state with the original encrypted, unused bank and 50 buyers. Its final recovery address is **0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145**. Gas and actual Chainlink costs cannot be recovered. Local rehearsal success is separate from live completion.

Migration 034 was tested in an isolated local PostgreSQL database and applied to the identity-verified Sepolia staging database. It admits V14 controller records without rewriting existing rows. The paid gallery recognizes the real V13 round / V11 renderer lineage; Genesis remains separate.

Validation: full **npm run check** passed, focused V14/financial/mirror tests passed, source-publication and frozen-runner tests passed, and 21 Opera checks passed for the mint panel, fixed loading geometry, public guide and both landing pages. Eight additional Opera checks passed for permanent-refund copy and timer removal; both refund paths passed ten-year delay regression tests. Database-dependent cases skipped by the standard suite are not represented as executed. Hosted deployment and the live rehearsal status are recorded separately after release.
