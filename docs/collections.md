# Collection catalog and mint data

**Version boundary, 2026-09-21:** Local Web/indexer collection support extends through V10, including explicit `affiliate-v10` / `unique-rank-v6` constraints, canonical permanent identities before reveal, and separate finalized scores/claims. Migration 026 and hosted V10 rollout have not been applied. Use [the architecture](architecture.md) and [V10 handoff](permanent-combinations-v10.md) for rules and verification boundaries. The V1–V5 migrations, manual synchronization and formula descriptions below are historical subsystem records; the current [indexer](automatic-indexing.md) handles confirmed chain updates. Do not seed hosted fixtures or change an existing collection's immutable version.

The web app resolves each mint page by a stable collection UUID: `/mint/[collectionId]`. The UUID exists before deployment and remains the same after its contract receives a real chain address. `/mint` lists available collections and `/` redirects there. The public, read-only API provides `GET /api/collections` and `GET /api/collections/[collectionId]`; malformed and missing IDs return 404. Responses are uncached.

## Live catalog only

PostgreSQL is required for public collection reads. The repository lists only deployed collections with a verified indexed snapshot; undeployed fixtures and drafts do not appear. Missing database configuration or a database failure produces an unavailable state and a generic API 503. Missing or undeployed collection IDs return 404. There is no checked-in JSON fallback and no simulated minting in the public runtime.

The current Sepolia collection uses UUID `3342c115-3d41-4cb4-be45-fa103178f0ff` and deployed round `0xAfFd7dc1B6A0D8974040F3216316240B724715A9`. Its finalized terms are 20 tickets at 0.0001 Sepolia ETH. It is registered and published in the [hosted Collections section](https://manekineko-staging-web.vercel.app/mint), with pending activation and zero minted tickets. The old mock collection URL returns 404. See [deployment and publication evidence](sepolia-20-ticket.md). A pending-activation snapshot means the contract exists but minting has not been opened. Potential sellout prizes are calculations from immutable terms, not claims that those amounts have already been collected.

The original `catalog.json` and SQL seeds remain isolated test fixtures. They are not loaded by the runtime. Do not seed demonstration data into staging or production. The [scoped cleanup](live-collection-sync.md) removed the two identified demo catalog records and eight mock archives from the former local database without repurposing their UUIDs or algorithms.

## PostgreSQL persistence

The app validates each database record against its contract version, algorithm and declared deployment state. Apply all numbered migrations through `013_shared_affiliate_pools.sql`; migration scripts retain checksums. Use `db:migrate` for an existing database. `db:setup` also imports fixtures and is intended for a separate local test database only.

The staging web project and local web development now use the same restricted staging database role and chain `11155111`. Keep that server-only `DATABASE_URL` out of client variables. The role reads collection and history tables and writes only admission challenges and quotas; it cannot publish collection snapshots. A separately protected operator credential runs registration and synchronization. Provider TLS certificate validation remains enabled.

The namespaced schema stores network, series, collection, deployment, and state records, using `numeric(78,0)` for uint256 values and exact wei. UUIDs connect records; a round is unique within its factory-derived series and a deployed address is unique per chain. Deployed status requires a contract address, receipt, owner, deployment block, deadline and creation time. Snapshot constraints reject impossible supply, revenue, refund, randomness and prize states.

## Deployment and synchronization

1. Finalize the collection's immutable terms under a stable launch UUID.
2. Deploy the reviewed V5 configuration and retain its version-2 transaction journal. The factory checks its prior round's `readyForNextRound()` before creating a successor.
3. Run [the registration command](live-collection-sync.md) in preview mode, then explicitly write the verified result. It compares the finalized export, canonical receipts, runtime bytecode, constructor values and a single confirmed block snapshot before inserting the new live collection.
4. Repeat the same synchronization command after test transactions. It updates mint progress and randomness, and archives an outcome only after confirmed prize delivery or complete refunds. Repeated synchronization is idempotent and refuses conflicting or older evidence.
5. Public collection and history pages read that database snapshot. The API has no public deployment, payout or catalog-write endpoint.

Synchronization currently runs as an explicit operator command. There is no unattended observer, automatic refresh from every block, or launch-plan transaction worker. A long-running indexer with monitoring, backfill and reorg rollback remains required for autonomous operation. A database phase is a display projection and must never authorize a payment or successor deployment without a fresh contract check.

## Versioned algorithms and randomness

Each catalog and history record has immutable `algorithmVersion` and `randomnessProvider` fields. Migration 004 backfills existing rows as V1 without changing their configured terms, winners, provenance or timestamps. A new V2 UUID must explicitly select `unique-rank-v2` with `chainlink-vrf-v2.5`; editing a V1 record into V2 is rejected. The app calculates `scoreFormula` from the stored version and rejects contradictory data. The source viewer selects the matching round source and displays the V2 `UniqueRank` library. Retained test fixtures remain V1 and are excluded from public history.

V2 is restricted to Ethereum Mainnet (`1`) and Ethereum Sepolia (`11155111`), with ETH and 18 decimals. `revealDelayBlocks` is null for V2 because it has no legacy blockhash capture window. Deployment metadata still requires a confirmed contract address and immutable deadline. No V2 collection or deployed address is inserted by migration 004.

V2 snapshots expose `randomnessState` (`not_requested`, `pending`, or `fulfilled`) and the exact decimal-string `randomnessRequestId`. The database also stores the fulfilled uint256 `randomness_word`; zero is a valid fulfilled word. Legacy snapshots leave these fields null. The intended phases are `pending_activation`, `minting`, `awaiting_request`, `awaiting_randomness`, `awaiting_finalization`, `awaiting_prize`, `complete`, and `refundable`. V2 phases, supply, request status and finalized winner must agree. Pending/fulfilled request rows are projections from verified chain events, not permission to request randomness or pay prizes.

The V2 snapshot adapter must derive `settled_count` as `maxSupply` when `revealed()` is true and zero otherwise; V2 finalizes in one ranking step and has no `settledCount()` getter. Keep `reveal_seed` and `reveal_block` null for V2. Project `randomnessRequested()`, `randomnessReceived()`, `requestId()` and `randomWord()` into the dedicated randomness columns after a consistent, confirmed chain read. Migration 006 permits request ID zero: use the explicit request status and a null request ID before submission, never a zero sentinel. Pending and fulfilled requests can legitimately have ID `"0"`.

The V2 contract requests randomness once after sellout and verifies the provider proof through the Chainlink coordinator. The callback stores the word; permissionless finalization processes the deterministic candidate sequence and records the accepted offset. The rotation assigns ranks `1..N` bijectively to token IDs, where `N` is supply. Four numbers in `1..16` encode a rank using `1+(a-1)*4096+(b-1)*256+(c-1)*16+(d-1)`. Exactly one NFT has rank `N`, including supplies of 1,000 and 2,000. The rank assignment is a rotation, so ranks are correlated; it is not a uniform shuffle of all possible rankings. Individual winning chances depend on the VRF and candidate derivation security assumptions.

V2 NFT transfers stop at sellout until prize delivery. The owner can pay 50% of primary receipts to the winning holder. Seven days after finalization, the winning holder can claim to an address they select if the prize remains unpaid. Unsold expiry/cancellation supports refunds; sold-out V2 rounds cannot refund or reroll if the provider is delayed. The VRF subscription must be funded separately from ticket receipts. Metadata, SVG art, ranking and prize accounting stay on-chain; Chainlink is an external randomness service. These implementations still require the deployment and security qualification described in [blockchain randomness](blockchain-randomness.md).

V5 keeps that randomness lifecycle and reserves an immutable collection-wide affiliate pool, allocated at sellout in proportion to each affiliate’s referred ticket count. Pool and winner percentages are independent immutable terms; see [V5 accounting](affiliate-pools.md).

V4 keeps that randomness lifecycle and adds immutable collection financial terms. `contract_version` identifies the financial implementation separately from the scoring algorithm, and `prize_bps` specifies the prize used by the mint UI and payout validation. Each affiliate position has its own fixed referral rate. Legacy and V3 collections retain the original half-revenue prize. See [affiliate programs](affiliates.md) and [V4 configuration and deployment](deployment-v4.md).

## Historical V1 number generation

The Solidity source seals every ticket until sellout. The last mint fixes `revealBlock = block.number + revealDelayBlocks`. After that block, anyone can preserve its hash with `captureReveal()` within the contract's 256-block capture window. The seed hashes that fixed block hash with the contract address, chain ID, and round ID. Callers cannot choose a different block or reroll the result.

Four Feistel rounds permute each token ID into a unique 32-bit combination code. Splitting that code into four bytes and adding one gives four numbers in 1–256. The contract computes `(a*b+c*d)*4294967296+combinationCode`; the combination code breaks arithmetic ties, so each minted token has a unique complete score. Anyone can compare `combination(tokenId)` with settlement results. The owner must call `distributePrize()` to pay 50% of primary mint revenue to the current winning NFT holder.

These rules are public, deterministic after reveal, identical for every ticket, and verifiable in the source. They are **not manipulation-resistant randomness**: block producers can influence blockhash entropy. The UI must explain that limitation rather than promise equal odds, cryptographically unbiased randomness, an independent security audit, or trustless payout. This is the historical V1 design, not the deployed V5 randomness model. Unsold expiry or a missed reveal capture window permits refunds under the contract's existing rules.

The source viewer shows the repository's matching contract source. Explorer verification is a separate evidence gate; the actual Sepolia deployment and current verification status are recorded in [the rehearsal record](sepolia-20-ticket.md).
