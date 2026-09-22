# Tincta · Manekineko monorepo

A finite ERC-721 prize protocol with named seasons, color-based collections, unique on-chain scores, fully on-chain SVG artwork, holder-claimed prizes and an affiliate program. The public brand is **Tincta**; internal code and package names remain **manekineko**.

**Start with [the current architecture and agent handoff](docs/architecture.md).** It covers protocol rules, component boundaries, database/indexing, launch planning, Mainnet/Sepolia separation, recorded deployment evidence and remaining work. [AGENTS.md](AGENTS.md) provides the agent entry point. The local contract and application/launch baseline is V10; the completed 1,000-ticket Sepolia rehearsal is V8. Public architecture pages describe V10, but none of those source or copy changes upgrade an existing collection.

**Season worker:** [V9/V10 automation setup and commands](docs/season-automation.md) cover autonomous collections, X posts/images, Launch controls, public countdowns and the encrypted reusable **50-wallet Sepolia rehearsal**. Use the separate `npm run season:run:sepolia -- --help` and `npm run season:run:mainnet -- --help` commands. Mainnet never creates buyer wallets or simulates purchases. Execution requires configured credentials, registry pins, migrations through 026 and explicit spending caps. Local implementation is not evidence of a live rollout.

Four independently deployable Next.js apps cover Web, Landing, Launch and Indexer. Web serves seasons, minting, NFT viewing, history, affiliate dashboards and public docs. Indexer tracks registered collections from confirmed chain activity, including external mints. Launch stores authenticated, reviewed configuration and season plans; it does not yet run an automatic blockchain/X-posting service. Staging uses an isolated Neon database. Older version guides remain historical references, not instructions to relabel immutable collections.

## Repository

The latest contract version, **V10**, gives each NFT a permanent four-number identity and finished on-chain artwork at mint. Solidity derives the unique ordered combination from the assigned token ID; buyers provide no numbers or seed. One VRF draw after sellout still assigns final scores and the configured distinct winning NFTs, default six. Numbers identify the ticket and do not encode its future score. Score, prize and claim state remain separate contract reads, keeping JSON/SVG unchanged. See the [V10 integration and rollout handoff](docs/permanent-combinations-v10.md).

V10 preserves V9's cumulative **20 primary mints per recipient wallet per collection**, V8's equal-prize design, qualified affiliate payouts and season timing. Paid, referral and sponsored mints share the allowance; transfers and refund burns do not restore it. Web reads/transactions, Launch, database constraints, indexer, worker, previews and deployment tooling now support V10. New drafts and current preparation/deployment commands target V10; explicit V9 commands and old finalized exports remain unchanged. Migrations 025/026 and Web/Launch/Indexer are deployed to staging; see the [release record](docs/staging-v10-release.md). Compatible V10 registries, contract deployment, persistent worker activation and a V10 Sepolia rehearsal remain pending. The V8 Cinder Study Sepolia rehearsal remains the completed live collection, with its original sealed/revealed behavior. See [V9 behavior and rollout](docs/wallet-mint-cap-v9.md) and the [V8 architecture](docs/season-v8-implementation.md).

V6 introduced varied on-chain combinations, [winner credits](docs/winner-credits.md) and [affiliate NFT ownership eligibility](docs/affiliate-holder-eligibility.md). V7 retains those concepts with two unequal awards; V8 extends them to configurable equal awards using versioned registries. Historical collections keep their original enrollment and payout rules.

```text
apps/
  web/                  Collection catalog, mint, history, affiliates and APIs · port 3100
  landing-page/         Independent Next.js public site · port 3101
  launch/               Private configuration and automation planning console · port 3200
  indexer/              Confirmed chain indexing, cron and signed webhook ingress · port 3300
  contracts/            Solidity, Hardhat, adversarial tests, deployment scripts
packages/
  contracts/            Versioned V1–V10 ABIs, source and shared deployment validation
docs/
  launch-console.md     Operator login, finalized configurations and automation boundary
  contracts.md          Rules, configuration, lifecycle, authority and limitations
  deployment.md         Local/Sepolia deployment and Vercel project setup
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

Open [the collection app](http://localhost:3100) or [the landing page](http://localhost:3101). Individual commands are `npm run dev:web` and `npm run dev:landing`. Run the separate private console with `npm run dev:launch` at [localhost:3200](http://localhost:3200). Its account provisioning and database setup are described in [launch console setup](docs/launch-console.md). Use `/seasons` to plan named seasons of up to 10 collections, with individual names, NFT colors, terms and deadlines; see [seasons](docs/seasons.md) and [automation plans](docs/launch-automations.md). Individual configuration templates remain at `/launch`.

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

Open `/mint` to reach the current live season and highlighted collection, or `/seasons` when none is live. Public catalog queries require a deployed contract and verified snapshot; `/history` separates confirmed outcomes from collections still in progress and excludes mock archives. See the [dated staging snapshot](docs/architecture.md#recorded-deployment-and-verification-status) for collection identities. Indexing does not activate a sale or mint tickets.

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

V10 is the local integrated launch target. Review the [live rollout checklist](docs/permanent-combinations-v10.md#integration-status-and-remaining-checklist), apply the full database migration history through 026 in the intended environment, and configure independently verified Eligibility V5 / Winner Credits V6 registries before execution. Prepare finalized V10 inputs with `npm run launch:prepare:current -- --manifest /path/export.json --expected-hash TRUSTED_HASH --output /path/new-directory`. This refuses older exports. Generic deployment shortcuts select V10; explicit `v9:*` commands preserve V9 operation and recovery. Never relabel or overwrite a finalized historical export.

Use **four separate Vercel projects** for Root Directories `apps/web`, `apps/landing-page`, `apps/launch` and `apps/indexer`. The launch app has separate server credentials and a private login; it stores reviewed configuration without holding blockchain signing keys or sending transactions. The indexer has its own restricted database role, server-only RPC and authenticated cron/webhook routes. It observes already registered contracts and never signs transactions. Production contracts target Ethereum Mainnet, with Sepolia qualification first. Follow the [current release gaps and workflow](docs/architecture.md#known-gaps-before-the-next-release), [automatic indexing](docs/automatic-indexing.md) and version-specific deployment scripts. The [staging setup](docs/staging.md), [V8 Sepolia plan](docs/sepolia-test-plan.md), [original deployment guide](docs/deployment.md) and [V5 admission runbook](docs/deployment-v5.md) contain historical instructions; do not use their old version defaults for a new V10 test.

Contract tests cover financial reserves, current-holder payouts, rejected receivers, reentrancy, refund burning, reveal timing, combination/scoring correctness, metadata escaping, ownership handoff, and rollover. Historical V1/V2 full-collection regressions check one greatest score and a single successful prize payment for 1, 1,000 and 2,000 NFTs. Current multi-award regressions verify the configured distinct winners and independent holder claims; V10 additionally checks permanent combinations/metadata and compatible registry lineage. V2 adds authenticated VRF fulfillment, replay/zero-word handling, funding delays, transfer locks and delayed recovery claims. See the [combination and winner uniqueness proofs](docs/unique-winner.md) for the distinction between guaranteed uniqueness and entropy assumptions. These checks are implementation validation, not an independent smart-contract audit.
