# Deployment and operations

**Historical deployment record.** The sections below describe the original V1/demo hosting and chain setup. Current local preparation/deployment shortcuts target V10; explicit V9 commands preserve historical operation and recovery. Use [the architecture](architecture.md), [V9/V10 season operations](season-automation.md) and [V10 rollout checklist](permanent-combinations-v10.md#integration-status-and-remaining-checklist). Live migrations, V10 registries/collections, hosting and rehearsal remain pending. The [V8 Sepolia plan](sepolia-test-plan.md) remains historical. No source or documentation edit upgrades an existing collection or authorizes live execution.

## Vercel monorepo setup

Connect this Git repository to two Vercel projects. Keep the repository root `package-lock.json`; do not install separate dependency trees inside the apps.

| Setting | Collection app | Public landing page |
| --- | --- | --- |
| Root Directory | `apps/web` | `apps/landing-page` |
| Framework | Next.js | Next.js |
| Node.js version | 22.x | 22.x |
| Build Command | `npm run build` | `npm run build` |
| Output Directory | Next.js default | Next.js default |
| Install Command | `cd ../.. && npm ci` | `cd ../.. && npm ci` |
| Include source files outside Root Directory | Enabled | Enabled |

The build command above is evaluated inside the selected app root. Each app includes its own `vercel.json` framework setting. Vercel runs only that frontend's build; it does not deploy contracts. The landing page can link to the Web app through `NEXT_PUBLIC_WEB_URL`. Set it to the Web app's final HTTPS origin. Without it, the production landing page omits the app link; development uses `http://localhost:3100`. Local Web and Landing servers use ports 3100 and 3101 respectively; the private Launch console uses 3200.

The Web app reads collection data from a server-side catalog or PostgreSQL `DATABASE_URL`. The `/history` page always requires PostgreSQL; it reads persisted sample archives and winners through the same database path intended for the future indexer. Configure a managed server-only `DATABASE_URL` and apply migrations explicitly; the local Docker database does not deploy to Vercel. See [history/database setup](history.md) and [collection setup](collections.md). Demo mints remain local to a browser tab. No live wallet transaction integration or deployed collection is configured. Private deployment keys must never be added to a frontend environment variable, especially one beginning with `NEXT_PUBLIC_`.

Vercel reference: [Using monorepos](https://vercel.com/docs/monorepos).

## Local blockchain

From the repository root, in one terminal:

```sh
npm ci
npm run contracts:node
```

In another terminal:

```sh
npm run legacy:deploy:local --workspace @manekineko/contracts
```

The local node binds to `127.0.0.1:8545`. Its public development keys are for local testing only. The script deploys a factory and its first collection and writes a receipt to `apps/contracts/deployments/31337-round-1.json`. Defaults: 100 NFTs, 0.001 native coin each, a 7-day mint period, and a 5-block reveal delay. A local node does not produce blocks while idle: mine past `revealBlock` using Hardhat RPC before calling `captureReveal()`.

For a throwaway in-memory deployment without a persistent node:

```sh
npm exec --workspace @manekineko/contracts -- hardhat run scripts/deploy.ts
```

Addresses from that in-memory invocation cease to exist when it exits. It validates tooling but is not a durable deployment.

## Sepolia

Copy `apps/contracts/round.example.json` to a reviewed configuration file and adjust its decimal-string values. Optional `initialOwner` selects a different round owner; otherwise the deployment signer owns the round. The factory owner is the deployment signer. The factory assigns the sequential round number through its gate.

Provide `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` through your process environment or Hardhat's encrypted keystore. `.env.example` is documentation and is not automatically loaded. With variables already provided:

```sh
ROUND_CONFIG_PATH=./round.example.json npm run legacy:deploy:sepolia --workspace @manekineko/contracts
```

Paths above are relative to `apps/contracts`, where npm runs the workspace script. The script verifies chain ID, requires explicit round configuration for Sepolia, validates parameters before deploying, waits for two confirmations, checks deployed bytecode exists, and saves chain ID, addresses, constructor configuration, and transaction details. Supported script targets are local chain 31337 and Sepolia 11155111. Other chains require a reviewed network configuration and matching Cancun support.

No external deployment was performed while creating this repository. Explorer source verification is also not performed automatically. Hardhat build-info plus the saved constructor configuration are available for an explorer's standard JSON verification flow. An official compiler release is distinct from verifying a deployed contract's source on an explorer.

## Successive rounds

Once the prior round is sold out, revealed, fully settled, and successfully paid, use the existing factory:

```sh
FACTORY_ADDRESS=0xYourFactoryAddress ROUND_CONFIG_PATH=./next-round.json npm run legacy:deploy:sepolia --workspace @manekineko/contracts
```

The script checks that the factory's runtime bytecode matches this build and the signer owns it. The on-chain factory independently rejects creation until `readyForNextRound()` is true. Supply, price, duration, reveal delay, metadata name, and round owner can differ in the next configuration. Transferring factory ownership does not transfer ownership of already deployed rounds.

The later automation system should observe `SoldOut`, capture the fixed hash promptly, call `settle()` in batches of at most 200, execute owner-only `distributePrize()`, verify `PrizeDelivered` and `readyForNextRound()`, and send the next factory transaction. Recheck current on-chain state immediately before every write to make retries safe. A paid prize must mean an actual successful native transfer, not a queued payment.

An expired/refunded round is deliberately terminal for its factory. It does not satisfy the user's sold-out-and-paid condition. Starting a replacement series requires a new factory; do not silently roll over a failed round.

## Dependency checks

The compiler is loaded from pinned `solc/soljson.js`, avoiding moving compiler-download defaults. Root npm overrides update the Solidity wrapper's `tmp` and Mocha's serialization/diff dependencies to patched releases without changing the Solidity compiler. Full development tooling may still report upstream advisories; check `npm audit` when preparing a release. None of these Node packages becomes part of the deployed Solidity runtime.
