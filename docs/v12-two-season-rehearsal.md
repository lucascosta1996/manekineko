# V12: two seasons with 15-minute windows

This is a **Sepolia-only accelerated rehearsal**, not Mainnet approval or evidence of real VRF delivery until the public run completes. It exercises all 20 collections in the first two checked-in fictional seasons: **Aster Study** and **Beryl Study**. Existing saved plans, historical deployments and Mainnet identities are not modified. Saved-catalog reconciliation remains a separate release gate.

## What the runner does

It deploys a fresh controller, voting contract, renderer, Credits V8 registry, round deployer and a disposable Sepolia-only batch-funding helper. It seals the catalog and registry, checks the complete deployment against its frozen compiled artifacts through two independent RPC providers, and then runs both seasons. No database, browser, Next.js process or Twitter service is required for execution.

Each collection gets a **15-minute voting window**, preceded by a one-minute opening delay, and a **15-minute mint window**. Minting becomes available at the voting deadline. Sellout triggers a real Chainlink VRF request with **64 confirmations**. The runner waits for actual onchain randomness and permissionless finalization; elapsed time alone never supplies a result. The fixed missing-randomness cutoff remains **72 hours after sellout**. Recorded results never expire because the operator missed a signature.

64 confirmations are roughly 13 minutes at Ethereum's nominal 12-second slots, before variable oracle/inclusion delays; this is an estimate, not a delivery guarantee. See [Ethereum blocks](https://ethereum.org/developers/docs/blocks/) and [Chainlink VRF security considerations](https://docs.chain.link/vrf/v2-5/security). Both requested windows are exactly 900 seconds in this plan. The full 20-collection run still takes many hours: voting alone totals five hours, with real VRF waits and transaction confirmations in addition.

The first nine collections in each season sell out; the tenth deliberately receives only three paid mints and expires into full refunds. This covers rollover into season two after an unsold collection, including voting with NFTs from earlier successful collections. The runner exercises:

- The default 1,000 tickets at 0.01 ETH and six winners; a vote for 2,000 tickets at 0.01 ETH; and a vote for 1,000 tickets at 0.012 ETH and four winners.
- 100 persistent encrypted buyer wallets, at most 20 primary mints per recipient, three enrolled affiliates, qualifying paid referrals and equal affiliate shares with unfilled slots.
- Snapshot voting from three managed holders, sponsored mints when an unused eligible award is available, permissionless finalization from a different signer, holder prize claims, affiliate claims and full refunds.
- Exactly 60% prizes / 20% affiliates / 20% ordinary operator proceeds on successful collections. Failed collections yield no ordinary operator proceeds.
- Combined operator settlement/preparation between collections, recovery of unused operating funding, durable restart and final recovery of managed-wallet ETH. A small maximum-gas reserve stays in each wallet; NFTs remain with those wallets.

For capital recycling, the managed test wallets direct **their own** claims/refunds to the dedicated test operator. This does not change production payout rights or let the operator claim other holders' money. All simulated actors are controlled by this private rehearsal vault. The script intentionally tests mechanics; it does not establish that these are independent people.

The build patches an in-memory copy of the production compiler input. Production source and artifacts keep their one-hour minimums. The accelerated controller constructor refuses any chain except Sepolia and exposes `REHEARSAL_PROFILE=sepolia-fast-v12-15m-15m`. A production-timing rehearsal using the exact production build is still required before Mainnet.

## Your setup and start commands

Use Node 22.20+ (22.x), two genuinely independent HTTPS Sepolia RPC services, an always-on host and a **dedicated Sepolia operator EOA**. Do not reuse a Mainnet/operator treasury key. The script signs automatically from this test key after you approve its exact plan hash; production's manual wallet-signing flow is unchanged.

Start with **at least 30 Sepolia TEST ETH** in that dedicated operator. About 25 ETH initially funds the 100 buyers; the remainder covers deployment and operations. Funds are recycled, but gas and VRF consume ETH, so 30 ETH is an initial threshold, not a guaranteed total budget. Monitor and top up that address if needed. Fees are capped at 5 gwei. The 1,000 ETH gross-spend cap counts every outbound value transfer and gas, including repeated movement of the same test capital; it is not an upfront deposit or an expected loss.

From the repository root, create a frozen runtime **outside the application source directories**:

```sh
npm run protocol:v12:rehearsal:build -- "$HOME/.local/share/tincta/v12-rehearsal-runtime"
mkdir -p "$HOME/.config/tincta" "$HOME/.local/share/tincta"
chmod 700 "$HOME/.config/tincta" "$HOME/.local/share/tincta"
cp -n scripts/protocol-v12/rehearsal/environment.example "$HOME/.config/tincta/rehearsal.env"
chmod 600 "$HOME/.config/tincta/rehearsal.env"
```

The runtime destination must not already exist. Review its `plan.json`, `compiler-input.json` and `manifest.json`. Edit the private environment file locally with the dedicated operator key and the two RPC URLs. Generate the vault key with your password manager or a cryptographically secure 32-byte generator, then save its 64-character hex value in `V12_REHEARSAL_VAULT_KEY`. Do not put credentials in command arguments, screenshots, Git or chat. Back up the private environment file separately from the state directory.

Initialize the vault offline, replacing the address placeholder with the dedicated operator address:

```sh
node --env-file="$HOME/.config/tincta/rehearsal.env" \
  "$HOME/.local/share/tincta/v12-rehearsal-runtime/runner.mjs" \
  init "$HOME/.local/share/tincta/v12-rehearsal-state" YOUR_SEPOLIA_OPERATOR_ADDRESS
```

This creates 100 encrypted wallets and prints an approval hash. It submits no transaction. Preserve `wallets.enc`, `state.json` and the original frozen runtime. Then check funding and RPC connectivity:

```sh
node --env-file="$HOME/.config/tincta/rehearsal.env" \
  "$HOME/.local/share/tincta/v12-rehearsal-runtime/runner.mjs" \
  preflight "$HOME/.local/share/tincta/v12-rehearsal-state"
```

After reviewing the plan and funding, start it in a persistent terminal session (or install the supplied systemd service on Linux):

```sh
node --env-file="$HOME/.config/tincta/rehearsal.env" \
  "$HOME/.local/share/tincta/v12-rehearsal-runtime/runner.mjs" \
  run "$HOME/.local/share/tincta/v12-rehearsal-state" APPROVAL_HASH_FROM_INIT
```

Keep the computer awake and connected. The optional service template is `scripts/protocol-v12/ops/tincta-rehearsal.service`; configure its paths, private environment, user and approval hash before installation. It stops on policy failures rather than repeatedly signing. No service has been installed by this implementation.

## Editing the UI while the test runs

After deployment verification, the private state directory contains `public-pins.txt` with the Sepolia controller address and runtime hash. For Launch, use its `NEXT_PUBLIC_V12_SEPOLIA_*` variables. For Web, use the generic `NEXT_PUBLIC_V12_CHAIN_ID=11155111`, `NEXT_PUBLIC_V12_CONTROLLER` and `NEXT_PUBLIC_V12_CONTROLLER_CODE_HASH` values also included in that file. Configure `NEXT_PUBLIC_V12_SEPOLIA_RPC_URL` for Launch and `NEXT_PUBLIC_V12_RPC_URL` for Web with a separate browser-safe public RPC endpoint. Never copy the runner's private keys or authenticated RPC URLs into `NEXT_PUBLIC_*` values. Restart/rebuild the UI to load the new pins.

The existing Launch dashboard reads the controller's season/collection progress and deadlines. The frozen runner is a separate process with bundled dependencies: editing UI files, running development hot reload, rebuilding or restarting Web/Launch does not stop it. You can use the UI to watch progress. Keep the test operator out of manual signing flows while the runner owns its nonce. Extra mints, votes, transfers or claims from outside the script can invalidate the deliberately deterministic test scenarios.

Do not rebuild over, edit or replace the active frozen runtime. Its manifest hash is bound to the durable state and run approval. A different plan/runtime requires a fresh run; it cannot rewrite already deployed deadlines. The runtime may be copied intact to another host with its private state and keys, but never run two instances at once.

## Status, stopping and recovery

Read the last saved observation without loading a signing key:

```sh
node "$HOME/.local/share/tincta/v12-rehearsal-runtime/runner.mjs" \
  status "$HOME/.local/share/tincta/v12-rehearsal-state"
```

`observedAt` and the chain timestamp identify the age of that observation; offline status is not a live chain read. Normal logs contain public addresses, stages and transaction hashes, not keys. Keep the complete state directory private because it contains signed intents and the encrypted wallet vault.

Ctrl-C requests a graceful stop. Resume with the identical `run` command, original bundle, environment and state. Signed intent is saved before broadcast; restart reconciles the same transaction hash and nonce, verifies canonical receipts, and rechecks the deployment graph. RPC transport faults switch configured providers. The chain clock continues while the runner is stopped: voting/mint deadlines cannot be paused or extended. Resume promptly during those stages.

After a forced termination, inspect `run.lock`, confirm that its process is actually stopped and that no other host is running the same state before removing only that stale lock. Never delete journals or create replacement wallets to get past a nonce, failed-receipt or hash error. External transactions with the operator key deliberately stop the runner's nonce checks.

A missed planned sellout, unexpected external holder/activity, insufficient funding, spending limit, changed deployment or reverted transaction stops the run without a passing report. Preserve the state and transaction hash for reconciliation; participant refund/claim rights still follow the contracts. Failed-run recovery can require separately reviewed transactions using the original vault; the automatic final wallet sweep runs only after all expected collection outcomes pass. Do not discard the vault after a failed run.

On success, `completion.json` records all 20 collection outcomes and confirmed accounting only after the final transaction reaches chain finality. Successful rounds must withdraw exactly 20% to the operator, pay prizes/affiliates and release unused operating funds; the two unsold rounds must fully refund. Completion retains the accelerated-profile label. Twitter posts remain a separate observer responsibility and are not sent by this runner.

## What still requires you

1. Fund the dedicated test wallet, configure two RPC services, protect/back up the keys and run this rehearsal on an always-on host. Review its completion evidence and exercise the connected UI using a separate wallet in an appropriate manual test.
2. Restore the saved-plan database's quota/capacity, or provide a trusted current export, so the canonical Mainnet/Sepolia catalog can be reconciled. This runner's checked-in fictional catalog does not resolve that blocked comparison.
3. Commission the independent contract/economic review and resolve its findings against the final source/build. The earlier audit packet is an immutable snapshot; new tooling must be included in a fresh packet when the revision is frozen.
4. Select and secure the production operator wallet and recovery procedure; fund and host independent executors with health/funding alerts. The rehearsal's 100 buyer keys and automatic operator key are test infrastructure.
5. Complete a public rehearsal using the exact production build/timing, verify the deployment graph and explorer sources, exercise wallet claims/refunds/rollover and operational recovery, then approve the reconciled Mainnet catalog and launch configuration.

The detailed release gates are in [the Mainnet readiness record](v12-mainnet-readiness-2026-10-22.md). Local mocks, a passing build and an accelerated rehearsal cannot substitute for independent review or the production deployment checks.

## Local verification on 2026-10-22

- Existing Solidity regression suite: **445 passed**.
- New accelerated-contract tests: **2 passed**. The complete 20-collection engine run passed in about nine minutes on a local simulated chain with a mock coordinator and advanced block time. It covered 18 sellouts, two full-refund outcomes, varied voting results, sponsored mints, equal affiliate payouts, exact operator withdrawals, restart recovery, closed subscriptions and zero residual round liabilities/balances. It is not evidence of public Chainlink delivery.
- The Mainnet-deployment rejection check was repeated with otherwise valid deployed dependencies and passed.
- V12 tooling tests: **25 passed**; shared durable transaction-pipeline tests: **18 passed**. Strict contracts/rehearsal TypeScript checks passed.
- The final self-contained bundle initialized 100 encrypted wallets and read offline status from a separate temporary directory without repository dependencies, RPC connectivity or an operator signing key. That unfunded disposable test state was removed afterward.
- No UI files changed in this follow-up. No fresh browser/wallet acceptance is claimed. No public chain deployment, saved-plan write, X post or hosted service installation occurred.

Frozen local runtime: `output/rehearsal/v12-two-seasons-15m/`. Manifest SHA-256: `b363da99b65fedccdccae260d9253933deaa6836343e84e8316670f5932e8fa7`. Copy the entire directory intact to a new runtime location if using this exact revision instead of rebuilding. The manifest binds the runner, compiled artifacts, compiler input and plan; a later build can have a different hash and must receive its own approval.

Local evidence logs: `/tmp/tincta-v12-rehearsal-integration-15m-b.log`, `/tmp/tincta-v12-rehearsal-mainnet-guard.log`, `/tmp/tincta-v12-rehearsal-all-contracts.log`, `/tmp/tincta-v12-rehearsal-tools.log`, `/tmp/tincta-v12-rehearsal-journal.log`, `/tmp/tincta-v12-rehearsal-contract-types-final.log` and `/tmp/tincta-v12-rehearsal-types-final.log`.

## RPC configuration completed — 2026-10-23

The local private file `~/.config/tincta/rehearsal.env` now has the existing authenticated **QuickNode** Sepolia endpoint as `V12_REHEARSAL_RPC_URL` and the independent **PublicNode** Sepolia endpoint as `V12_REHEARSAL_SECONDARY_RPC_URL`. PublicNode is a shared public service; it is not a dedicated second account or a production availability guarantee. Its network is listed by [PublicNode](https://ethereum.publicnode.com/?sepolia). No provider subscription or billing setting was changed.

The file has mode 600 and its directory mode 700. Preserve these two settings when adding wallet credentials later; do not overwrite the configured file with the example. Operator key, vault key and run approval remain unset. No wallet was initialized, funded or used to sign, and no runner/service was started.

Read-only checks passed on both providers at `2026-10-23T03:20:37.722Z`: Sepolia chain ID 11155111, fresh heads, matching finalized block **11973888** (`0x19900d621b4f54b46dc0615606abe4e9ea8269eecd6dd9b34909cd9442b0427a`), matching Chainlink coordinator runtime and historical contract reads, a 5,000-block filtered log query, canonical transaction/receipt lookup, pending nonces, fee data, gas estimation and JSON-RPC batches. The sanitized report is saved privately at `~/.config/tincta/rehearsal-rpc-check.json`. This bounded check does not prove sustained request capacity, transaction broadcast or real VRF delivery. Recheck availability before the funded run.
