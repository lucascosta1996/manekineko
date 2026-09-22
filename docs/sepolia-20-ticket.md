# First Sepolia collection: deployment and qualification

Updated on 2026-09-17. Test-wallet funding, configuration finalization, the V5 contract deployment, its 0.30 Sepolia ETH VRF subscription funding, source verification and publication to the web database are confirmed. Minting, real VRF fulfillment and prize settlement have not been exercised.

## Finalized launch record

- Console: [staging launch](https://manekineko-staging-launch.vercel.app/).
- Label: **Sepolia 20-ticket qualification**.
- Configuration: `3342c115-3d41-4cb4-be45-fa103178f0ff`, finalized revision **4**.
- SHA-256 content hash: `edec9510ddf4368c2e3164858111176441575c73deaba4e78e0f695af09a0055`.
- The authenticated record, downloaded export and offline prepared configuration have matching hashes.
- Local artifacts: `.vercel/sepolia-20-ticket/launch-export.json`, `expected-hash.txt`, `launch-record.json`, and `cli/round-v5.json` with `cli/deployment-plan.json`.

| Term | Value |
| --- | --- |
| Network / contract | Ethereum Sepolia (`11155111`), V5 shared affiliate pool |
| Name / symbol | Manekineko Sepolia 20-ticket rehearsal / NKO20 |
| Supply / ticket price | 20 / 0.0001 Sepolia ETH |
| Winner prize | 50%: 0.001 ETH at sellout |
| Affiliate pool | 10%: 0.0002 ETH, shared by referral sales |
| Affiliate positions | 20; three test affiliates planned |
| Mint lifetime | 24 hours from the anchored deployment configuration timestamp, including deployment and enrollment |
| Planned enrollment window | 1 hour |
| Initial sale state | Inactive; owner must activate after enrollment |
| VRF | 64 confirmations, 200,000 callback gas |
| Separate VRF reserve | 0.30 Sepolia ETH; actual charges depend on fulfillment |
| Owner / deployment signer / factory owner | `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223` |
| Separate enrollment signer | `0xE995671cdF0110D51F9dF6D079B363879009976F` |

Read-only preflight at block `11726691` passed: the live coordinator and gas lane matched the reviewed configuration, bytecode sizes were within Ethereum limits, and the deployment wallet held 0.5 ETH. The conservative deployment-gas allowance was `0.041400324695922714` ETH at the returned maximum-fee estimate, plus the separate 0.30 ETH VRF reserve. Fees can change; rerun preflight before broadcasting and keep the maximum transaction fee at or below 5 gwei. The helper runtime is 24,493 bytes, so contract changes require another size check.

## Confirmed deployment

The version-2 journal `.vercel/sepolia-20-ticket/deployment-journal.json` reached `funded-enrollment-open`. Each of the three transactions has a successful confirmed receipt. The independent registration preview pinned block **11726816** and matched the factory, helper, renderer and round runtimes, immutable constructor terms, canonical deployment receipts and finalized export.

| Contract | Sepolia address |
| --- | --- |
| Factory | [`0xfF48d290d0dEbbF676831d589567D1Ed70C4BdB1`](https://sepolia.etherscan.io/address/0xfF48d290d0dEbbF676831d589567D1Ed70C4BdB1) |
| Collection | [`0xAfFd7dc1B6A0D8974040F3216316240B724715A9`](https://sepolia.etherscan.io/address/0xAfFd7dc1B6A0D8974040F3216316240B724715A9) |
| Renderer | [`0x8F3B81E034A9d92B9Ddd23388F7348790CB72Dee`](https://sepolia.etherscan.io/address/0x8F3B81E034A9d92B9Ddd23388F7348790CB72Dee) |
| Round deployment helper | [`0xce6fE72Cc55B13c96bE06dc19489a7d4634e4317`](https://sepolia.etherscan.io/address/0xce6fE72Cc55B13c96bE06dc19489a7d4634e4317) |

| Transaction | Block | Actual transaction gas cost |
| --- | --- | --- |
| [Deploy factory, renderer and helper](https://sepolia.etherscan.io/tx/0xa3e2a692f6c6f04a447a9205da13bb3a83be8ee9922b07ca6e085d1eb3195adf) | 11726807 | 0.00734343242641485 ETH |
| [Create 20-ticket round](https://sepolia.etherscan.io/tx/0x90274004568f4b3314466f7b32573a41e69c5f804c867885473315f2b4a3e863) | 11726809 | 0.004576187628447954 ETH |
| [Fund randomness subscription](https://sepolia.etherscan.io/tx/0xbd2e1b050cc95f59c4e2e1e23cdd5b2c2065cdbd6ad336ea1fc80fe99e83c199) | 11726812 | 0.000082806987907654 ETH |

Actual deployment/funding transaction gas totals **0.012002427042770458 Sepolia ETH**, calculated from receipt `gasUsed × gasPrice`. The separate **0.30 ETH** subscription deposit remains a VRF reserve, not a consumed randomness fee. Subtracting both from the earlier reconciled deployer balance gives **0.087888644520010542 ETH**. A separate confirmed RPC read at block **11726878** verified that deployer balance and the subscription’s full **0.30 ETH** native reserve, with zero randomness requests; see `.vercel/sepolia-20-ticket/sepolia-post-deployment-balances.json`.

The dedicated subscription ID is `103058561048376410383872347119185591978055392290283064210153112727896766115860`. The round owns the subscription and is its only registered consumer. The preview found **pending activation**, **0/20 minted**, and **no randomness request or winner**. The immutable deadline is **2026-09-18 23:02:24 UTC** (20:02:24 São Paulo), including enrollment; deployment does not extend it. The first collection was created at 2026-09-17 23:03:24 UTC.

## Source verification and web publication

All four contracts are source-verified on Sepolia Etherscan with Solidity `0.8.37+commit.f401782d` and optimizer 200. The renderer, helper and round have an explicit Cancun target. The first factory Etherscan submission omitted that target, and Etherscan would not replace the accepted record. Independent [Sourcify verification](https://sourcify.dev/server/repo-ui/11155111/0xfF48d290d0dEbbF676831d589567D1Ed70C4BdB1) establishes **exact creation and runtime matches** for the deployed factory with **Cancun** explicitly recorded. Evidence is retained in `explorer-verification.json` and `sourcify-verification.json` in the private rehearsal directory.

The real collection and initial snapshot were registered under the finalized UUID, and the affiliate program is enabled with the verified factory address and runtime hash pinned in local and Vercel configuration. The former local database’s two undeployed demo catalog records and eight mock history records were removed through scoped cleanup; the staging database contains one real collection and no fabricated history outcomes.

The protected [hosted web app](https://manekineko-staging-web.vercel.app) is published and passed eight HTTP/API checks: its [Collections section](https://manekineko-staging-web.vercel.app/mint) contains the real collection, [History](https://manekineko-staging-web.vercel.app/history) shows it as in progress with zero completed outcomes, the [collection page](https://manekineko-staging-web.vercel.app/mint/3342c115-3d41-4cb4-be45-fa103178f0ff) resolves, and the old mock URL returns 404. The affiliate API returns verified Ethereum state with `canEnroll=true` and `canMint=false`. These checks establish live server readiness; actual wallet enrollment and Turnstile completion remain the next qualification step.

Publication evidence is in `.vercel/sepolia-20-ticket/registration.json`, `removed-local-mocks.json` and `hosted-web-verification.json`. Local web development uses the same restricted staging database. See [publishing and refreshing real collection data](live-collection-sync.md): synchronization is an explicit operator command, so subsequent blockchain actions need another sync run before their database snapshots change.

## Funding

The user submitted the initial **0.5 Sepolia ETH** transfer from `0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145` to the deployment wallet in Opera. Its sender, recipient, amount and successful receipt were independently checked over RPC: [initial funding transaction](https://sepolia.etherscan.io/tx/0x50bd6be23b918684caf5e368286c3f6107759308c7a486bd7d6e6bdae3f31d9d), block `11726676`.

| Role | Address | Balance at block 11726733, before deployment |
| --- | --- | --- |
| Deployer | `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223` | 0.399891071562781 ETH |
| Affiliate A | `0xE9d5303480E33cfa4310576967C62cBd2bEC8B87` | 0.02 ETH |
| Affiliate B | `0x9876C055407927AC7D01a26Db2D7ACB1f3397C8b` | 0.02 ETH |
| Affiliate C | `0xca6f6597A6dC2EdfB5E1e3C8711Db281833d005c` | 0.02 ETH |
| Buyer A | `0xF0aD291922A954e035323d37F79702e02912e12A` | 0.02 ETH |
| Buyer B | `0xc48E0430E8BbA9ecf314C33266559118D7Ca3e9B` | 0.02 ETH |
| Enrollment signer | `0xE995671cdF0110D51F9dF6D079B363879009976F` | 0 ETH; signs admission vouchers only |

All five outgoing transfers succeeded on Sepolia. Independent reconciliation at block **11726733** verified each transaction's sender, recipient, amount, successful canonical receipt and current balance, with at least three confirmations each. Total transferred: **0.10 ETH**; total transfer gas: **0.000108928437219 ETH**. At that funding checkpoint, the deployer's balance exceeded the recorded preflight's combined gas and VRF allowance by **0.058490746866858286 ETH**. That allowance was a historical pre-deployment estimate; actual deployment gas is recorded above.

| Recipient | Confirmed transaction |
| --- | --- |
| Affiliate A | [0.02 ETH](https://sepolia.etherscan.io/tx/0x6feb5c9c664937d9ede015efb8397ebe1530acd5cadf73c18573544ef2d47fca) |
| Affiliate B | [0.02 ETH](https://sepolia.etherscan.io/tx/0x2c64a60fce1a1d7c2c1d527ec31d550afdb3b245edcf85424bcbeeaac95591bf) |
| Affiliate C | [0.02 ETH](https://sepolia.etherscan.io/tx/0x9375cd46583399fbdba62767fc5b0656ae55495a86029bd9af73168520332d75) |
| Buyer A | [0.02 ETH](https://sepolia.etherscan.io/tx/0x8db1229c4bc143299b52b1fc706904f54b4e8e1748f9bd9a82b585cb8f81de69) |
| Buyer B | [0.02 ETH](https://sepolia.etherscan.io/tx/0xb53da5c27d0996015cfcf6f6a88db792653c11043dd1a20b0c0ae47512a8cd6c) |

Public receipt and balance evidence is saved in `.vercel/sepolia-20-ticket/funding-receipts.json`. The private reconciliation journal is `.vercel/staging-wallet-funding.json`; retain it to prevent duplicate payments. The fixed-purpose helper `scripts/fund-staging-wallets.mjs` defaults to a read-only preview, requires an explicit send flag, and passed 28 offline tests. It is restricted to these five recipients on Sepolia with a 5 gwei fee ceiling and a 0.393 ETH minimum deployer reserve.

The funding table is historical. The subsequent deployment and VRF subscription deposit are recorded above; no mint payment has been sent.

## Exclusive prize-claim authority

V5 already checks that a caller of `claimPrize(recipient)` is exactly `ownerOf(winningTokenId)`. The highest rank is unique. Holding a different NFT, owning the contract, holding the winning token previously, or having ERC-721 approval does not authorize a prize claim. Transfers are frozen from sellout until payment. Operator withdrawal cannot spend the unpaid prize or unpaid affiliate liabilities.

Two distinct payment paths remain as designed: the owner may call `distributePrize()` to pay the winning holder directly, with no selectable recipient; after the existing seven-day grace period, that holder may call `claimPrize(recipient)` independently and choose a receiving address for smart-wallet compatibility. Only the holder controls that alternate destination, and the prize can be paid once.

Added explicit authorization regressions and a 20-ticket unique-rank/referral-accounting case. **40/40 targeted V5 tests passed**, using local mocked VRF. Production contract code and ABI were unchanged. Public Sepolia lifecycle testing and independent audit are separate qualification steps.

## Next stage

Deployment, subscription funding, source verification and publication are complete. Next, qualify real affiliate enrollment and Turnstile through the hosted UI, then activate the sale and complete the 20-ticket lifecycle in [the Sepolia plan](sepolia-test-plan.md). The sale remains inactive, with the immutable deadline above. Keep ordinary tooling at `V5_BROADCAST=0`; repeat deployment only by resuming the original private journal. No new deployment is needed to refresh the web database. The [sync command](live-collection-sync.md) reads chain state and updates the display snapshot explicitly; an unattended observer is not running.
