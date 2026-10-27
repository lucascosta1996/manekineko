# V16 Sepolia release — October 28, 2026 (Asia/Shanghai)

## Verified contract deployment

- Contract: [`0x673D155f884976bb42eab2F1F11b381dc4d8D26A`](https://sepolia.etherscan.io/address/0x673D155f884976bb42eab2F1F11b381dc4d8D26A#code).
- Deployment transaction: [`0x1eb2cf493bdaab0c69f10bf44ddd001adfaaa8df3e3064ccef4c141e133515ae`](https://sepolia.etherscan.io/tx/0x1eb2cf493bdaab0c69f10bf44ddd001adfaaa8df3e3064ccef4c141e133515ae), block **12006197**.
- Runtime code hash: `0xf922fd995949d2368b98a0df53d5339b8515d27303f28d12760d616f8f57161f`.
- Frozen manifest hash: `0x9d0e87653a933059fc3b50283f7a9ff9d3207cffb2b59fa49a6c50ad0a518888`.
- All **216 collections / 22 seasons** uploaded in 22 catalog batches, preserving the Sepolia catalog identities and order.
- Two independent RPCs verified exact compiled runtime, immutable chain identity, settings, all three options, complete catalog and inactive state at block **12006290**, hash `0x63913c4ce38a2ff53f4533646e21fb2175be2383009ddc21f059ee78b5ee24cd`.
- Exact source published successfully on Etherscan.
- **Unsealed; zero prepared collections, zero Genesis mints, zero operating funding.** No rehearsal transaction has been sent.

The deployment uses a fresh V16 address; earlier deployments and their frozen exports remain unchanged. Sepolia accepted the current 39,442-byte runtime and deployment transaction. Mainnet remains unconfigured and unqualified.

## Application and database changes

Web and Launch select dedicated V16 pins and use the same single contract for Genesis, voting, paid mints, affiliate enrollment/claims, prize/refund/sponsored claims, holder rewards and operator controls. Displayed NFT numbers are translated through `(collectionId << 17) | serial`. Signing reviews also bind the selected internal collection, not just the shared contract address.

Migration **036_v16_nft_mirror.sql** was tested against isolated PostgreSQL, then applied to the dedicated staging database. It adds separate collection-ID-aware tables, keeps historical projections, and permits V16 sources only on Sepolia. Historical **2 collections / 51 tokens** retained identical content hashes before/after migration. Web has read-only access to the new projections; indexer has restricted DML access. No staging fixtures were seeded.

Public runtime pins and the indexer source were written and read back for `manekineko-staging-web`, `manekineko-staging-launch`, and `manekineko-staging-indexer`. Vercel's expired CLI token was refreshed through the existing authenticated CLI before the update. No secret is embedded in browser code; the browser uses a public RPC endpoint.

Hosted readiness, alias resolution and observed V16 page behavior are checked after publishing this release. A successful local build or saved environment pin alone is not hosted verification. The private release folder retains deployment, source-publication, database and hosted evidence; only redacted reports may be shared.

## Verification boundaries

- `npm run protocol:v16:test`: **29 passing**, including actual V16 application/mirror adapters and a ten-collection local conservation rehearsal.
- `npm run protocol:v16:rehearsal:test`: **4 passing**; full catalog/budget, encrypted vault uniqueness/privacy, manual receipt matching and custody safeguards.
- Isolated PostgreSQL NFT mirror tests: **7 passing, none skipped**, including same-address collection/NFT collisions, scoped reset, burned NFT metadata and legacy projections.
- Web tests: **300 passing, 3 database-gated skips**. Indexer tests: **73 passing, 9 database-gated skips**; the mirror database tests were additionally executed separately. Launch tests and preparation tests pass.
- Workspace TypeScript and Web, Launch, indexer builds pass. These are separate from hosted CI status.
- Chromium at 1440 and 390 px uses the actual local V16 runtime, deployed menu and full catalog. Three options render, no horizontal overflow, no accessibility violations in the protocol page, no page errors, and an exact V16 vote reaches the simulated wallet and is rejected without a live transaction. [Desktop](../output/v16-deployment-2026-10-28/voting-desktop.png), [mobile](../output/v16-deployment-2026-10-28/voting-mobile.png), [evidence](../output/v16-deployment-2026-10-28/visual-evidence.json).
- Genuine V16 Chainlink fulfillment, live wallet minting/claims and the complete 216-collection runner have **not** run. There is no live winning wallet yet.

The first deployment pass finished its catalog transactions but encountered a readback anchor that preceded the final batch. The verifier was corrected to wait for a common anchor containing the last receipt, then resumed the saved journal. It sent no duplicate deployment or catalog transaction. Final two-RPC verification and source publication succeeded.

The rehearsal is prepared outside the repository with 501 fresh encrypted wallets, a frozen runtime and plan, empty transaction journals, a pause marker, two unfunded human-wallet handoffs and a successful read-only preflight. See [the complete workflow](sepolia-v16-rehearsal.md) and [216-collection matrix](sepolia-v16-scenarios.md). No scheduler or worker was started for it. UI fixes can be deployed independently; the contract's clocks never pause.
