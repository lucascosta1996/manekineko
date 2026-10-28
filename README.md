# Tincta · Manekineko monorepo

Tincta publishes onchain NFT collections with community-voted mint terms, permanent SVG artwork and ETH rewards claimed by eligible holders and affiliates. Collections run in a fixed season order. The public brand is **Tincta**; internal code and package names remain **manekineko**.

Start with [the architecture guide](docs/architecture.md) for the code map, protocol rules, application boundaries and dated verification evidence. [AGENTS.md](AGENTS.md) contains repository instructions.

The current deployed version is **V16**, with Genesis, voting, paid collections and claims at one ERC-721 address. Genesis has 1,000 free NFTs, two lifetime primary mints per wallet and no mint deadline. Sellout opens the first paid ballot. Genesis also qualifies its holder for affiliate enrollment across collections and seasons, subject to the enrollment and referral rules.

After a successful paid draw, mint revenue is allocated **60% to prizes, 20% to qualified affiliates, 10% to season holders and 10% to the protocol treasury**. If no affiliate qualifies, its 20% joins the treasury. Holder claims open after season settlement and are limited to the first **5% of eligible NFTs** to claim. Actual pools and payouts depend on successful mints and voted terms. Read [the V16 rules](docs/genesis-utility-v16.md) for conditions and historical differences.

The [October 28, 2026 release record](docs/sepolia-v16-release-2026-10-28.md) confirms the Sepolia deployment and 216 catalog entries. At that checkpoint, Genesis was unsealed and unminted, and the [501-wallet rehearsal](docs/sepolia-v16-rehearsal.md) was prepared but paused. **Do not start or fund the rehearsal without the user’s explicit instruction.** Mainnet remains unconfigured. Existing deployments and NFTs retain their original rules.

**Historical V9/V10 season worker:** [V9/V10 automation setup and commands](docs/season-automation.md) cover autonomous collections, X posts/images, Launch controls, public countdowns and the encrypted reusable **50-wallet Sepolia rehearsal**. Use the separate `npm run season:run:sepolia -- --help` and `npm run season:run:mainnet -- --help` commands. Mainnet never creates buyer wallets or simulates purchases. Execution requires configured credentials, registry pins, migrations through 026 and explicit spending caps. Local implementation is not evidence of a live rollout.

Four Next.js apps serve Web, Landing, Launch and Indexer. Web reads verified contract state directly: `/` for voting and minting, `/claims` for prizes and refunds, `/affiliates` for referrals and payouts, `/holders` for season pools, `/collections` for the NFT gallery, and `/docs` for participant guides. Landing serves the parent site, Rewards landing page and TAS-1 whitepaper. Launch builds reviewed operator wallet transactions. Web, Launch and Indexer have dedicated V16 adapters; the older planning and worker integrations remain version-specific.

## Repository

Since **V10**, the permanent-number design gives each NFT a permanent four-number identity and finished on-chain artwork at mint. Solidity derives the unique ordered combination from the assigned token ID; buyers provide no numbers or seed. One VRF draw after sellout still assigns final scores and the configured distinct winning NFTs, default six. Numbers identify the ticket and do not encode its future score. Score, prize and claim state remain separate contract reads, keeping JSON/SVG unchanged. See the [V10 integration and rollout handoff](docs/permanent-combinations-v10.md).

V10 preserves V9's cumulative **20 primary mints per recipient wallet per collection**, V8's equal-prize design, qualified affiliate payouts and season timing. Paid, referral and sponsored mints share the allowance; transfers and refund burns do not restore it. Web reads/transactions, Launch, database constraints, indexer, worker, previews and deployment tooling now support V10. Legacy draft preparation/deployment commands still target V10; explicit V9 commands and old finalized exports remain unchanged. Migrations 025/026 and Web/Launch/Indexer are deployed to staging; see the [release record](docs/staging-v10-release.md). The latest recorded reconciliation on 2026-09-27 confirms both V10 Airy Garden collections completed with all six prizes paid per collection; see the [dated verification report](docs/handoffs/bots-run-notes-2-ultra-implementation-2026-09-27.md). Historical Cinder Study retains its V8 sealed/revealed behavior. See [V10 protocol rules](docs/permanent-combinations-v10.md).

V6 introduced varied on-chain combinations, [winner credits](docs/winner-credits.md) and [affiliate NFT ownership eligibility](docs/affiliate-holder-eligibility.md). V7 retains those concepts with two unequal awards; V8 extends them to configurable equal awards using versioned registries. Historical collections keep their original enrollment and payout rules.

```text
apps/
  web/                  Voting, minting, claims, affiliates, holder pools and docs · port 3100
  landing-page/         Independent Next.js public site · port 3101
  launch/               Operator dashboard and reviewed wallet transactions · port 3200
  indexer/              Confirmed chain indexing, cron and signed webhook ingress · port 3300
  contracts/            Solidity, Hardhat, adversarial tests, deployment scripts
packages/
  contracts/            Versioned ABIs through V16, source and shared deployment validation
  protocol/             Shared verified reads, wallet flows and version-specific interfaces
docs/
  genesis-utility-v16.md Current Genesis, voting and affiliate rules
  launch-console.md     Historical login and configuration workflow
  contracts.md          Rules, configuration, lifecycle, authority and limitations
  season-holder-rewards-v13.md  V13 economics and holder claims
  git-deployments.md    Application release workflow
  collections.md        Database-backed catalog, deployed snapshots and isolated fixtures
  history.md            Confirmed outcomes, in-progress collections and history API
  architecture.md       Current architecture, deployment boundaries and agent handoff
  automatic-indexing.md Canonical indexing, provider notifications and recovery
database/
  migrations/           Normalized collection/deployment/state and archive schema
  seeds/                Opt-in fixtures for isolated development and regression tests
```

The root uses npm workspaces and Turborepo. Node **22.20.0** is pinned in `.nvmrc`; exact dependency versions and `package-lock.json` make installs reproducible. Solidity is pinned to **0.8.37+commit.f401782d**, confirmed against the [official September 10, 2026 release](https://github.com/argotorg/solidity/releases/tag/v0.8.37). Builds target the **Cancun EVM**, without experimental compiler features. OpenZeppelin Contracts is pinned to 5.6.1.

## Run locally

```sh
nvm use
npm ci
npm run dev
```

Open [the collection app](http://localhost:3100) or [the landing page](http://localhost:3101). Individual commands are `npm run dev:web` and `npm run dev:landing`. Run the separate private console with `npm run dev:launch` at [localhost:3200](http://localhost:3200). The current interface is `/dashboard`; it reads the sealed catalog and builds reviewed operator transactions. Legacy account/database planning instructions in [launch console setup](docs/launch-console.md), [seasons](docs/seasons.md) and [automation plans](docs/launch-automations.md) describe the older workflow. They do not configure or launch V16.

The indexer runs separately with `npm run dev:indexer` at port 3300. Configure its restricted database role, RPC and authentication variables before invoking its routes; Vercel cron scheduling is configured for the deployed service, not for the local dev server. See the [indexer setup and verification runbook](docs/automatic-indexing.md).

Manekineko uses dedicated local ports to avoid other projects on 3000/3001. Run only one development server per app: `npm run dev` already starts both Web and Landing, so do not also start their individual commands. If Next.js reports an existing server, reuse the printed URL or stop that app with Ctrl+C in its terminal before restarting. Changing ports does not allow two Next.js development servers to share the same app directory.

```sh
npm run contracts:test       # Compile and run contract/factory tests
npm run web:test             # Collection, demo mint, exact-price and SVG parity tests
npm run launch:test          # Authentication and launch configuration regressions
npm run indexer:test         # Chain indexing, reorganization and webhook regressions
npm run credits:test         # Legacy proof and unsigned sponsorship-plan regressions
npm run eligibility:test     # Affiliate eligibility operations and opt-in local SQL tests
npm run contracts:export     # Compile, check deployment sizes and regenerate shared ABIs
npm run typecheck            # TypeScript checks for all apps
npm run build                # Production builds for all apps
npm run check                # All tests, typechecks, production builds
```

Contract typechecking first generates its required bindings. Contract artifacts and generated TypeScript bindings are ignored; shared ABI JSON is checked in.

Open `/` for the selected collection’s current stage, `/claims` for prizes and refunds, or `/holders` for the selected collection’s season pool. An unconfigured deployment remains clearly unavailable; no planned amount is presented as funded. See the [dated staging snapshot](docs/architecture.md#recorded-deployment-and-verification-status) for collection identities. Indexing does not activate a sale or mint tickets.

The local web environment is currently connected to the same restricted staging database as the hosted app. Keep fixture seeding out of that environment. For separate local development, start PostgreSQL with `npm run db:up`, configure an isolated local database, and apply schema with `npm run db:migrate`. `db:seed` and `db:setup` explicitly import legacy fixtures and are only for isolated development or regression tests; there is no automatic fixture fallback in the public app. See [live collection registration](docs/live-collection-sync.md), [automatic indexing](docs/automatic-indexing.md) and [database setup](docs/history.md).

## Legacy V1 demo game rules

1. The deployment fixes the name, symbol, round ID, supply, even mint price in wei, sale deadline, reveal delay, and owner. New rounds can use new settings; a running collection's rules cannot change.
2. Buyers pay the exact price and receive sequential NFTs with sealed, fully on-chain SVG metadata. No free owner mints are provided.
3. Sellout commits a future block. Anyone can capture that block's hash during the next 256 blocks. This reveals four unique numbers per NFT, each between 1 and 256.
4. Anyone can advance bounded settlement batches. The contract compares `(a*b+c*d)*4294967296+combinationCode`; the code makes tied arithmetic subtotals produce distinct final scores.
5. Only the owner can call `distributePrize()`. The current winning NFT holder receives half of mint receipts. Only a successful transfer completes the round and unlocks its remaining funds.
6. Only the owner can call `withdraw(recipient, amount)`. Prize/refund funds remain reserved. Failed or unsold rounds offer refunds to current NFT holders.
7. The factory deploys another round only after the previous one sold out **and** delivered its prize. It exposes the on-chain gate for a future transaction-sending automation service.

The contract needs no metadata host, IPFS, oracle, backend, or off-chain score calculation. Transactions are still necessary to advance it. Future-block entropy remains influenceable by block producers, and the owner can delay prize payment; this implementation does not claim manipulation-resistant randomness or automatic payout liveness. See the [full contract model](docs/contracts.md).

## Deployment

Application releases use `git push origin main` to [lucascosta1996/manekineko](https://github.com/lucascosta1996/manekineko). The existing Vercel Web, Launch and Indexer staging projects are connected to `main`, with other branches excluded from automatic deployment. See [the Git deployment workflow](docs/git-deployments.md) for project roots, verification and the separate Landing setup.

The [V16 Sepolia release record](docs/sepolia-v16-release-2026-10-28.md) documents the deployed address, runtime pins, application adapters and verification limits. The [V13 record](docs/sepolia-v13-release-2026-10-25.md) remains historical evidence for that deployment. Application deployment does not deploy contracts, migrate existing seasons or start a rehearsal.

The following commands belong to the **legacy V10 pipeline**, not V16. Review the [live rollout checklist](docs/permanent-combinations-v10.md#integration-status-and-remaining-checklist), apply the full database migration history through 026 in the intended environment, and configure independently verified Eligibility V5 / Winner Credits V6 registries before execution. Prepare finalized V10 inputs with `npm run launch:prepare:current -- --manifest /path/export.json --expected-hash TRUSTED_HASH --output /path/new-directory`. This refuses older exports. Generic deployment shortcuts select V10; explicit `v9:*` commands preserve V9 operation and recovery. Never relabel or overwrite a finalized historical export.

The four app directories deploy through five Vercel projects: Landing serves the parent and Rewards sites separately. The current Launch dashboard connects an operator wallet and reviews transactions before requesting signatures. Its retired login and database-planning workflow remains in the repository for historical reference. The indexer has its own restricted database role, server-only RPC and authenticated cron/webhook routes. It observes already registered contracts and never signs transactions. Production contracts target Ethereum Mainnet, with Sepolia qualification first. Follow the [current release gaps and workflow](docs/architecture.md#known-gaps-before-the-next-release), [automatic indexing](docs/automatic-indexing.md) and version-specific deployment scripts. Use the [documentation index](docs/README.md) for versioned guides and dated operational evidence. Superseded V1–V9 guides are available in Git history.

Contract tests cover financial reserves, current-holder payouts, rejected receivers, reentrancy, refund burning, reveal timing, combination/scoring correctness, metadata escaping, ownership handoff, and rollover. Historical V1/V2 full-collection regressions check one greatest score and a single successful prize payment for 1, 1,000 and 2,000 NFTs. Current multi-award regressions verify the configured distinct winners and independent holder claims; V10 additionally checks permanent combinations/metadata and compatible registry lineage. V2 adds authenticated VRF fulfillment, replay/zero-word handling, funding delays, transfer locks and delayed recovery claims. See the [combination and winner uniqueness proofs](docs/unique-winner.md) for the distinction between guaranteed uniqueness and entropy assumptions. These checks are implementation validation, not an independent smart-contract audit.
