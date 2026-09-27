# V9/V10 season automation

**Current update — 2026-09-27:** Airy Garden run `257c7ab9-9e56-4daf-b5db-917a05d15d1c` is paused after Lunar Stone sold out and revealed winners. The second fixed opening was missed. Read the [incident](airy-garden-first-collection-handoff-2026-09-27.md) and [implementation/recovery report](handoffs/airy-garden-testnet-notes/implementation-2026-09-27.md) before any operation; the older pending-execution statements below are historical. Local source now includes separately bound refund/affiliate scenarios, canonical projection before supplemental social replies, and durable explorer verification. New ordinary editable durations default/cap at 24 hours; frozen artifacts keep their original dates.

Explorer jobs use the exact saved compiler build-info, constructor arguments and version pins. `--verify-explorer` is read-only unless `--execute` is explicitly authorized; execution requires a paused run and only submits/polls explorer sources. `--retry-verification ADDRESS` retries a reviewed job. An optional worker `ETHERSCAN_API_KEY` remains server/private-only. Keep build-info files alongside the deployment artifacts; missing keys defer verification, missing/altered sources fail, and neither causes redeployment. Verification is observable but does not bypass fixed launch gates.

`--sepolia-scenario PRIVATE_JSON` requires `--sepolia-rehearsal` and binds one new collection plus the exact spending caps. `refund-3-30m` purchases one ticket for each of the first three vault wallets, then reconciles all three refunds/burns after the actual 1,800-second mint window. `affiliate-sellout` requires a genuinely enrolled managed wallet and uses paid referrals before claiming its commission. Mainnet rejects both rehearsal flags and the test-only contract marker. These local implementations do not establish live scenario acceptance; use the report's run plans and preserve the existing vault/journals.

Status as of 2026-09-21: migration 024 and restricted runtime grants are applied to the existing Sepolia staging database. Eligibility V4 and Winner Credits V5 are deployed with the completed V8 source imported and previous lifetime-credit history preserved. Staging Launch has the shared encryption key and was verified through authenticated hosted reads. See the [executed setup record](sepolia-v9-registry-setup.md) for public pins, receipts and remaining steps. No V9 season, mint rehearsal or X delivery has run; Mainnet remains unconfigured.

V10 integration selects an exact V9 or V10 policy from each frozen prepared artifact; existing V9 plans and their V4/V5 pins remain versioned. Web/Launch/Indexer and migrations 025/026 were deployed to staging on 2026-09-22 UTC ([release record](staging-v10-release.md)). On 2026-09-25, Eligibility V5, Winner Credits V6 and the V10 Sepolia factory were deployed and verified, and the unused V8 mint destination was permanently retired. See [the readiness record](sepolia-v10-readiness-2026-09-25.md). Airy Garden is selected for the first V10 run; the user will supply ETH/X and start its local worker through [the runbook](airy-garden-v10-runbook.md). No V10 collection, rehearsal wallet or season run has been created.

Use the separate network entry points: `npm run season:run:sepolia -- …` and `npm run season:run:mainnet -- …`. Each pins its chain and rejects a conflicting `--chain`; the legacy `season:run -- --chain …` command dispatches to the same entry points. Launch saves the reviewed season and requests execution; a persistent external Node 22 worker runs the transactions and X delivery. Run it on a supervised host with durable storage, a direct PostgreSQL connection and a backed-up encryption key. A Vercel request or a Codex scheduled task is not the worker.

## What a run does

1. Checks the exact prepared V9/V10 revision/hash, network, owner, compatible registry runtime pins, fee/spending limits and the authenticated X account's numeric ID.
2. Publishes the upcoming-season image/thread. Only after X confirms publication does the Web receive the public season schedule.
3. Creates or verifies the exact versioned factory, deploys each collection, verifies constructor/runtime/receipt provenance, registers Eligibility V5 and Winner Credits V6 for V10 (V4/V5 for V9), and funds VRF and configured sponsorship. Public collection rows are admitted only after those checks; the existing indexer supplies actual activity and awards.
4. Opens the configured affiliate enrollment window, verifies the public enrollment API, posts the enrollment announcement, and activates at the fixed opening. Filling affiliate positions does not permit early minting.
5. Watches confirmed sellout, requests VRF, advances the bounded draw and posts separate sellout and verified-winner threads. Prize payments are announced only from canonical `AwardClaimed` receipts. NFT holders claim prizes; sellout does not automatically pay winners.
6. Resolves each subsequent opening from the previous confirmed sellout plus the prepared delay. A verified draw and backed prize liabilities are required before the next deployment. A missed opening pauses; it never silently moves the advertised time.
7. Posts refunds for an unsold expiry, terminates further launches in that factory sequence, and posts an actual-results recap. Sold-out collections cannot refund just because VRF is delayed. A completed season continues monitoring later prize receipts until its worker is paused/stopped.

The worker never invents winner addresses, payouts, enrollment readiness or live mint state. Public countdowns show scheduled times, pause/stale states and activation separately. One worker owns the network lock at a time, including registry setup and use of the shared test-wallet vault.

## Database and Launch setup

Apply the full migration chain through `026_permanent_combinations_v10.sql` using the project's migration workflow and the intended environment. Never seed fixtures into staging or production. Local database tests create and drop an isolated database.

Use three existing restricted database roles: Launch, Web, and a dedicated worker. See [PROVISIONING.md](../scripts/season-runner/PROVISIONING.md) for role boundaries and provisioning order. Provision their runtime grants with the administrator connection:

```sh
node --env-file=/absolute/private/provision.env --import tsx scripts/season-runner/provision.ts \
  --launch-role YOUR_LAUNCH_ROLE --web-role YOUR_WEB_ROLE --worker-role YOUR_WORKER_ROLE --execute
```

The private provisioning environment requires `SEASON_RUNNER_DATABASE_ADMIN_URL`, `SEASON_RUNNER_EXPECTED_DATABASE_HOST` and `SEASON_RUNNER_EXPECTED_DATABASE_NAME`. Remote administrative connections require `sslmode=verify-full`. This command resets the **dedicated worker role's** direct public-schema grants; do not reuse an unrelated application's role. It preserves existing application grants and adds runtime access. Web can read only the public schedule table, not credentials, private plans, signed transactions or the outbox. Launch receives safe action columns; the worker cannot read login/session tables.

Set the same `SEASON_RUNNER_MASTER_KEY` in Launch and the worker: a random 32-byte key encoded as base64. Generate it into your secret manager/private environment, not a committed file or shared terminal transcript. Back it up securely: losing it prevents decrypting X credentials, signed journals and the Sepolia wallet vault. Rotation requires an explicit re-encryption procedure; simply replacing the key breaks recovery.

Set `MANEKINEKO_CHAIN_ID` explicitly for each execution environment. Staging remains Sepolia-only for execution; Mainnet catalog planning remains available without Mainnet deployment authority.

In Launch:

- Select the network, edit a fictional Sepolia season or a Mainnet catalog season, choose the exact registries for its version (V10 defaults require Eligibility V5 / Winner Credits V6) and leave adequate lead time before the first enrollment window.
- Enable X announcements, inspect the eight canonical event/image previews, save, validate and prepare the season. Dates, wallets and statistics in previews are illustrative.
- Save the selected network's X handle, numeric account ID, public website HTTPS origin and all four OAuth 1.0a user credentials: API key, API key secret, access token, access token secret. The network-level settings are available before saving a season. Mainnet and Sepolia have separate encrypted profiles, with no credential fallback or copying between them. Use a different account and website on each network. An app-only bearer token cannot substitute for this user context. The app/account must have current X permissions and access for user lookup, image upload, metadata and posting.
- Review the prepared revision, X profile and deployment intent, then Start. Copy the displayed Run ID into the command below. Start queues the run; it does not spawn a server process.

Pause the worker and wait for its lease to end before changing X credentials. Credential rotation for the same account can resume a run. Once a run has posted, its account ID and public origin remain bound to that run. Changing accounts is suitable for a new season; restore the original account to continue an older season's thread. Completed claim monitoring has Pause/Resume controls too.

## Private worker environment

Environment files supplied with `--env-file` must be owned regular files with mode `600`; repeated flags load files in order. No secret is embedded in Launch exports, public routes or command output.

Use the npm commands below, which include Node's `--` option separator before the script path. If invoking Node directly, preserve that separator (`node --import tsx -- scripts/season-runner/mainnet.ts …`) so Node does not consume the worker's `--env-file` option before its network and private-file checks.

For a new V10 Sepolia plan:

```dotenv
MANEKINEKO_CHAIN_ID=11155111
SEASON_RUNNER_MASTER_KEY=<same base64 key as Launch>
SEASON_RUNNER_DATABASE_URL_11155111=<direct worker-role PostgreSQL URL>
SEASON_RUNNER_RPC_URL_11155111=<Sepolia HTTPS RPC URL>
SEASON_RUNNER_PRIVATE_KEY_11155111=<existing Sepolia operator key>
SEASON_RUNNER_MAX_FEE_PER_GAS_WEI_11155111=<explicit positive fee ceiling>
SEASON_RUNNER_MAX_TOTAL_SPEND_WEI_11155111=<explicit positive run spending ceiling>
AFFILIATE_ELIGIBILITY_V5_ADDRESS_11155111=<verified address>
AFFILIATE_ELIGIBILITY_V5_CODEHASH_11155111=<verified runtime hash>
WINNER_CREDITS_V6_ADDRESS_11155111=<verified address>
WINNER_CREDITS_V6_CODEHASH_11155111=<verified runtime hash>
```

Existing V9 plans instead require the original `AFFILIATE_ELIGIBILITY_V4_*` and `WINNER_CREDITS_V5_*` pins. Do not relabel those addresses as the new versions. Each prepared artifact chooses one exact policy; registries never fall back across versions.

The Sepolia worker can reuse `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` from the existing private test environment when its namespaced values are absent. It does **not** discover or use arbitrary keys. To reuse ETH held by the previous test wallets, explicitly list their loaded key variable names, for example:

```dotenv
SEASON_RUNNER_SEPOLIA_DONOR_KEY_NAMES=BUYER_A_PRIVATE_KEY,BUYER_B_PRIVATE_KEY,AFFILIATE_A_PRIVATE_KEY,AFFILIATE_B_PRIVATE_KEY,AFFILIATE_C_PRIVATE_KEY
```

These keys can come from the existing `.env.staging.wallets.local`, loaded with `--env-file`. Donors send only needed shortfalls and retain a gas reserve. The old V8 collection and its historical terms are not changed. The script does not assume that the available wallet balances cover the season.

For Mainnet, use a separate private environment with `MANEKINEKO_CHAIN_ID=1`, the same variable names ending in `_1`, its own operator key, production database, verified Mainnet registry pins and the real X account configured in the Mainnet Launch instance. Mainnet never inherits `DEPLOYER_PRIVATE_KEY` or a Sepolia RPC. Minimum confirmations are 12 on Mainnet and 2 on Sepolia; `SEASON_RUNNER_CONFIRMATIONS_<chain>` may increase them.

Spending caps cover native transaction values plus gas. Rehearsal caps aggregate every managed signer, including the shared operator journal. Funding transfers and subsequent mint payments are both counted conservatively; recycling ETH does not reset the cumulative cap. Choose a cap for the entire prepared season after reviewing deployment, VRF, sponsorship, mint and gas costs. Changing the cap or other bound execution settings mid-run is rejected.

## Registry migration before V10

The completed Sepolia collection remains immutable V8. The historical V9 setup record verifies Eligibility V4 / Winner Credits V5 only. New V10 setup uses Eligibility V5 / Winner Credits V6 and can import reviewed completed V6–V9 sources without changing their original registries, versions or holder rights. Imports are source-only where required and precede new target registration so a registry migration cannot create an unrestricted bootstrap. Winner Credits V6 carries forward previous lifetime-use state and the legacy Merkle root.

Use the one-time registry setup command with a separate encrypted journal and private JSON containing **`contractVersion: "affiliate-v10"`**, `chainId`, `owner`, `previousCredits: {address, codeHash}` and `historicalSources: [{factory, factoryCodeHash, round, roundCodeHash, roundId}]`. These are independently reviewed public identities. Optional `legacyMerkleRoot` must agree with the prior registry. For an actually fresh network only, use `freshNetwork: true` without history or a previous registry. Omitting `contractVersion` retains V9 setup/recovery compatibility; it does not select V10.

```sh
npm run season:run:sepolia -- --env-file /absolute/private/worker.env \
  --setup-registries --setup-config /absolute/private/v10-setup.json \
  --journal /absolute/private/v10-setup.enc --once
# After reviewing preflight and authorizing the target, repeat with --execute.
```

V10 setup and unsigned operations check the complete previous-registry lineage and reject remaining sponsor balances and previously registered destinations that can still mint. Zero balance alone is insufficient: someone can fund an old registry again. Retire old mintable targets, stop older sponsorship automation and recover only operator-owned available sponsorship through the reviewed migration procedure. Keep old registry governance retired so it cannot register new mintable destinations later. Setup never withdraws those funds for you. Preserve historical roots and lifetime-use state, and install the returned exact new pins in worker/Web configuration and new Launch plans only after canonical verification. Never rewrite an already prepared plan's registry addresses.

## Running a season and the 50-wallet rehearsal

Read-only preflight (no deployment, posting or wallet creation):

```sh
npm run season:run:sepolia -- --run-id RUN_UUID \
  --env-file /absolute/private/worker.env --once \
  --log-file .private/season-runner/RUN_UUID.log
```

Run the Sepolia season with the requested 1,000-mint rehearsal:

```sh
npm run season:run:sepolia -- --run-id RUN_UUID \
  --env-file .env.staging.local --env-file .env.staging.wallets.local \
  --env-file /absolute/private/worker.env \
  --execute --sepolia-rehearsal --recycle-sepolia-funds \
  --wallet-vault /absolute/private/tincta-sepolia-wallets.enc \
  --log-file .private/season-runner/RUN_UUID.log
```

`--log-file` appends a flushed NDJSON diagnostic record for each changed console report, plus process start/stop records. Every line has a UTC timestamp, chain ID, Run ID and a unique process-session ID. The file is created with mode `600`; symlinks, shared hard links and existing files readable by other users are rejected before loading private configuration or contacting services. The log must be separate from environment files, wallet vaults and setup configuration/journals, including aliases through symlinked directories. Existing non-log content, incomplete final lines and logs for a different run are rejected without appending. A write failure stops execution. Logs contain selected public status fields, transaction hashes and safe error codes; private environment values, wallet keys, signed transactions and private paths are excluded. Console output remains unchanged. Keep the log under the ignored `.private/` directory and reuse it when restarting the same run. An abrupt power loss or forced kill may leave no final stop record; use a new log path if the last line was interrupted.

For later analysis, retain the Run ID, this log, the encrypted wallet vault, the shared master key and the database. The database remains the recovery source: encrypted run state contains signer journals with canonical receipt blocks and gas costs, deployment evidence and collection snapshots; runtime action rows retain transaction status, X post IDs, exact social content and image hashes. The Launch activity panel displays only the latest 50 events and 100 actions, so it cannot represent the whole season's evidence. Diagnostic logs supplement those records; they do not replace them or prove that hosted metadata, Web pages and X images rendered correctly. Never share decrypted journals or the master key in a transcript.

On its first executed rehearsal the script creates **exactly 50 random wallets** and atomically saves their keys in an authenticated AES-256-GCM encrypted, mode-600 vault. Subsequent collections and season runs use the same vault and key. Never delete it to fix a failed run. It is independent of the run's database journal and survives changing the Run ID.

A crash while opening or creating the vault can leave its `.lock` file. Stop every worker using that vault and inspect the private vault/temporary file before removing only the stale lock. Do not remove or replace the encrypted vault. An empty or damaged existing vault fails authentication instead of silently generating 50 replacement wallets.

For a 1,000-ticket V9/V10 collection, each managed wallet mints at most **20 cumulative primary tickets**. The worker checks `mintedPerWallet`, remaining supply and exact transaction receipts before funding or minting again. If real outside mints occur, it respects remaining supply; it never overmints to force 1,000 additional test purchases. It reuses balances first, then explicit old donor wallets and excess balances from managed wallets. It only tops up the shortfall.

The rehearsal also claims prizes and refunds for NFTs still held by its 50 wallets. `--recycle-sepolia-funds` additionally recovers released operator treasury/growth balances and unused VRF funding after reveal. Contract reserves remain protected. This enables test capital to circulate across later collections; gas and VRF fees remain expenses. Affiliate commissions owed to other wallets are never swept. The mint rehearsal itself uses ordinary direct mints; it is not a substitute for separately testing NFT-holder affiliate enrollment, referral qualification and sponsored winner-credit redemption.

Mainnet execution:

```sh
npm run season:run:mainnet -- --run-id RUN_UUID \
  --env-file /absolute/private/mainnet-worker.env --execute --allow-mainnet
```

The Mainnet entry point does not load the rehearsal/wallet-generation module and uses only the explicitly configured operator key for normal lifecycle operations. It waits for real buyers. Test-wallet creation, funding, simulated minting and recycling options are hard-rejected before reading private environment files or connecting to services. The runner also rejects saved rehearsal state on Mainnet before any profile lookup or journal replay. Sepolia loads its simulation adapter only with `--sepolia-rehearsal`; wallet creation still requires `--execute`. Without `--execute`, all networks remain in preflight. `--once` performs a bounded tick; without it the process polls until stopped, paused or failed. Deployments and draw progress need multiple ticks while receipts become confirmed. Restart using the same run, vault, key and configuration. Run only one persistent worker per network; stop completed claim monitoring before assigning that worker to another season.

## Recovery and delivery semantics

- Setup and season execution share an in-process RPC budget of **20 individual JSON-RPC methods per second per endpoint**, with at most 10 methods per HTTP batch. Rate-limited read methods may retry three times after 1, 2 and 4 seconds; an HTTP `Retry-After` up to 30 seconds can extend a wait. Other failures stop normally. HTTP transport retries are disabled for transaction broadcasts, including ethers' default HTTP-429 retry. A partial batch can retry failed reads without repeating a broadcast or a successful read. Separate processes and hosted indexers have their own traffic, so an external endpoint quota can still stop a run. Provider result caching is disabled so repeated canonical-anchor checks reach the RPC again. Network verification, canonical history checks, immutable execution settings and signed-journal nonce recovery remain unchanged. Stopping the provider cancels queued requests, retry waits and active HTTP requests.
- Signed raw transactions and nonces are encrypted and committed before broadcast. Restarts reconcile canonical receipts or rebroadcast the **same signed bytes**. No automatic nonce replacement, fee bump, journal reset or reorganization repair occurs.
- A verified confirmed journal prefix can be reused within the same provider process only while fresh RPC block hashes prove its original canonical anchor remains in the current chain. The cache binds signed entries, canonical receipts, policy and signer; new/pending entries are always read again. Reorganizations, policy/provider changes or journal mutations invalidate it or fail closed. Cold starts recheck receipts, and setup reconciles every entry before reporting ready.
- During the 120 seconds around a scheduled opening, activation checks take priority over bulk historical snapshots, indexing and rehearsal settlement. The worker still verifies the candidate and immediate predecessor, confirmed state, public enrollment readiness and X prerequisites. Its original 60-second activation broadcast deadline remains fixed; a missed deadline pauses instead of changing the announced opening.
- Routine polling verifies X identity on the first tick and at least every five minutes within the same loaded profile/credential instance. Failed refreshes clear approval; a clock rollback or restart forces a fresh check. Store profile/lease guards still run on each executed tick, and media/public-write helpers independently verify identity immediately before their requests. This avoids consuming X's [75-per-15-minute identity-read limit](https://docs.x.com/x-api/fundamentals/rate-limits) merely by polling; actual account permissions/quota still require live qualification.
- A timeout or crash around X create-post may mean the post already exists. The action becomes `uncertain` and execution pauses. It never blindly reposts.
- If the post exists, reconcile its exact ID with the account, expanded text, media and reply parent:

  ```sh
  npm run season:run:sepolia -- --run-id RUN_UUID \
    --env-file /absolute/private/worker.env --execute \
    --reconcile-action ACTION_KEY --post-id POST_ID
  ```

  Keep the run paused during reconciliation, then Resume in Launch and restart the worker. If no post can be proven, investigate the account/API and outbox before a manual database repair; there is deliberately no “assume unsent” switch.
- Explicit X rate-limit rejections wait for `Retry-After` (60 seconds when absent), then resume with fresh guards. Other rejected/unsent posts can retry after review; image uploads are staged separately. Countdown content expires and is regenerated only while known unsent. Published roots retain their IDs and new verified payment receipts become individually deduplicated replies.
- Pausing stops subsequent side effects. A transaction or HTTP request already in flight can finish; the journal records it. Failed database persistence stops further writes. Web suppresses countdowns after stale evidence instead of asserting activation.
- An unsold collection ends further launches. A sold-out collection waiting for VRF remains pending; its announced later opening is not moved to compensate.

## Images, source map and verification

The approved reference image, seven additional event examples, SVGs, PNGs, post templates and gallery remain in [brand/tincta/social](brand/tincta/social/README.md). The runtime renderer extends that same 1600×900 layout, ordered season colors and geometric motifs. See [season-social-automation.md](season-social-automation.md) for event fields, APIs, alt text and factual copy rules. Preview examples are never used as chain evidence.

| Area | Source |
| --- | --- |
| Network entry points / shared CLI / setup | `scripts/season-runner/mainnet.ts`, `sepolia.ts`, `worker-cli.ts`, legacy dispatcher `cli.ts`, `config.ts`, `chain-setup.ts` |
| Lifecycle / projections / receipts | `runner.ts`, `registration.ts`, `store.ts` |
| V9/V10 signing / wallet vault | `chain.ts`, `chain-transactions.ts`, `sepolia-wallets.ts`, [CHAIN.md](../scripts/season-runner/CHAIN.md) |
| X outbox / images | `outbox.ts`, `social.ts`, `social-image.ts`, shared `packages/contracts/src/season-social*.ts` |
| Launch controls / encrypted profiles | `apps/launch/lib/season-runtime*.ts`, `components/automations/season-runtime-panel.tsx` |
| Web schedules | `apps/web/lib/seasons/schedule*.ts`, `app/api/seasons/schedules/route.ts` |
| Private/public storage and grants | migrations 024/026, `scripts/season-runner/provision.ts` |

Run `npm run season:test`, `npm run season:typecheck`, relevant Launch/Web tests and their typechecks. The opt-in `SEASON_RUNTIME_TEST_DATABASE_URL` enables isolated localhost persistence/permission tests, never staging fixtures. Historical V4 import and actual 50-recipient V9 sellout have local Solidity regressions; V10 contract/registry tests add permanent identity and new lineage coverage. Mixed-version indexer rollout uses `INDEXER_TRUSTED_FACTORIES_JSON` with separate explicit V8/V9/V10 factory/runtime pins, preserving later historical claims; configuring source support is not proof that the hosted indexer cron and provider filters have been updated.

Remaining live qualification: fund the Sepolia wallets, configure the X test account, and execute the Airy Garden run-day command to freeze a fresh schedule and keep the worker running. The V10 registry migration and factory are verified in [the 2026-09-25 record](sepolia-v10-readiness-2026-09-25.md); real V10 minting, VRF, X delivery, hosted results and connected-wallet affiliate flows still require execution. Mainnet configuration and qualification remain separate.

Local V10 integration checks: **386** Solidity and **61** season-worker tests passed; Web **263**, Launch **185**, Indexer **78** tests passed with database opt-ins enabled and no skips; their builds/typechecks passed. Migration 026 preserved frozen V8/V9 exports and catalog plans, accepted homogeneous prepared V9/V10 runs, and retained staging Mainnet-draft-only restrictions in an isolated PostgreSQL 16 database. See the [V10 verification boundary](permanent-combinations-v10.md#verification-boundary); these checks sent no live transactions or posts.

Network-entry separation verification (2026-09-22 UTC): `npm run season:test` passed **71 tests**, with **3 database opt-ins skipped**; `npm run season:typecheck` passed. CLI regressions verify fixed network selection, rejection before private environment loading, legacy dispatch and absence of the rehearsal module from Mainnet startup. Runner regressions reject test options and persisted rehearsal state on Mainnet and verify V9/V10 lifecycle monitoring waits for real buyers without generating wallets or calling the simulation adapter. Existing Sepolia vault reuse and simulated-mint tests also pass. This was a local source/test change only: no database changes, worker deployment, live transactions or X posts.
