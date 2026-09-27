# Sepolia V10 season readiness — 2026-09-25

**2026-09-26 correction and resolution:** anonymous checks exposed Vercel authentication blocking public Web access; earlier checks used an authorized session and missed this worker-facing restriction. The trusted enrollment origin now uses `https://app.tincta.xyz`. After explicit user approval, Vercel Authentication was disabled for all four Tincta projects. At 21:20 UTC, anonymous checks verified custom domains, aliases and active deployment URLs are free of Vercel login; Launch private APIs and Indexer still return their expected application-level 401. The historical enrollment endpoint returns expected `409 enrollment_closed`, confirming the origin restriction is resolved. Actual Turnstile challenge verification remains untested. Configured wallets held 11.498009930637521818 Sepolia ETH at block 11788758; this is available capital, not a certified full-season gas/VRF budget. No season was started.

**Ready for the user to run after funding Sepolia wallets and configuring X.** The other identified setup blockers are resolved, with hosted verification completed at 18:24:37 UTC. The user selected Airy Garden, authorized removal of the unused V8 collection and completion of other prerequisites, and retained responsibility for funding, X credentials and personally starting the season. This record supersedes the initial read-only audit from 17:16 UTC. It establishes setup readiness, not a completed live V10 rehearsal.

The working checkout is based on `c26e99d834697891e70fe499833e69d9ecf99d7b` plus the local preparation, logging, retirement and worker reliability changes. These changes are not committed or published. Run from this prepared checkout using the [Airy Garden runbook](airy-garden-v10-runbook.md).

## Verified setup

| Component | Verified state |
| --- | --- |
| Network/database | Sepolia chain 11155111; existing restricted Launch and worker database roles; no hosted fixture seeding. |
| Unused V8 | Zero-mint collection `e30303a5-7b3f-46f0-8b88-258bc1a74f0a` permanently retired onchain and removed from public database projections. Immutable finalized Launch audit and encrypted deletion backup preserved. |
| Eligibility V5 | Deployed, owned by the configured operator; completed V8 source imported as source-only history. |
| Winner Credits V6 | Deployed with previous V5 lineage and unchanged zero legacy Merkle root; completed V8 imported rewards-only. Previous lifetime-use checks preserved. |
| V10 factory | Deployed with exact renderer/creation-helper/runtime checks and approved in both new registries. All setup journal receipts reconciled canonically. |
| Hosted Web/Indexer | V10 public trust pins deployed, existing sensitive credentials preserved, historical V8 reads/credits verified, mixed-version indexing configured and minute schedules active on the new deployment. |
| Airy Garden | Staging draft revision **2**, ten V10 collections, `unique-rank-v6`, fixed cap 20; no opening timestamp. Names, IDs, colors, order, cadence and sale economics preserved. |
| Other plans | All **43 other automations and 2 standalone Launch configurations** unchanged by the scoped draft update. |
| Funding policy | 0.3 ETH VRF and 0.06 ETH sponsorship per collection; 250 ETH cumulative transaction cap, 5 gwei fee ceiling, two confirmations. The cap is not a required wallet balance or a cost estimate. |
| Execution state | No run queued or started, no 50-wallet vault generated, no V10 collection deployed, no NFT minted and no X post sent during setup. |
| User launch command | Read-only by default; `--execute` schedules, prepares and queues Airy Garden, then runs the Sepolia worker with logging and fund recycling. |

Airy Garden automation: `5296e2a2-8450-4a73-9ed8-22b55f3448fa`. Season ID: `0xd532e78151b2f58444b3a87563ee0edd3514b173d51cb7dea444e7ea287f1dfc`. Draft plan hash: `cd787f5a4d3281d9589a2ffbf2cbed139e1cadab45af607c79e9f49561c06f0c`. The independent post-commit read confirmed revision 2, draft state and zero runtime runs.

## Public Sepolia pins

| Component | Address | Runtime code hash |
| --- | --- | --- |
| Eligibility V5 | `0xe2e6bFE6Ef2CC4b0F1BE5Aec60C32874DE761D27` | `0x4385f26cc4e80a18128527b65ea885615c3c64dda69422ff64076bcd642a2dac` |
| Winner Credits V6 | `0x9ffba23cCCe9AcBeeDb16762C4f07967b5D6197C` | `0x4e2075d4ab5d046c3a5b3791f1684e835107c9cd949c1688730f01488e7b63a3` |
| V10 factory | `0x9766eC13865E474C53ae2671a77138A4a7440faC` | `0xf3c09a0327cc97a8ae5b7233f1a2085fccbd7c4c4abc9587c7c46573a208b08e` |

The factory's renderer is `0x89fD90dA28b05E149BD5196EE8187Ed178e9f3Bf`; its round creation helper is `0x47c493D70708260043A1C69E697Ac6f3bf8A6516`. The operator is `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223`; the separate admission signer is `0xE995671cdF0110D51F9dF6D079B363879009976F`.

Six registry transactions were canonically verified through block 11780900. Factory deployment transaction [`0x8edb…7c4e1`](https://sepolia.etherscan.io/tx/0x8edb693f18aac8908998bc3c98b0daf6154fd40a68fdc785fb79076d8787c4e1) was confirmed in block 11780914; eligibility approval in block 11780925 and credits approval in block 11780947. Final factory verification completed at 18:15:52 UTC. Full public receipt details are retained in the private setup proofs; signed raw transactions remain encrypted.

Previous Credits V5 `0xa8d5a0359D607bAFC8e2edC6Ac81771DA6659605` and V4 `0x951BEb244be852aD0a820B94a41eC291ea7E7b15` retain their real versions. The completed V8 source `0xf564cc9cA88A036211dC37cBDc4F116f18a22cb2` remains available. Old registry governance must not register/fund fresh mintable destinations after migration.

## Unused V8 removal

The removed round is `0x1FF99E7A579C4DF625E1F73d66CFEbaD4D0829Bf`. It had zero mints and had never activated. V8 has no immediate cancellation function, so deletion alone would not have retired its mint authority. Three canonical transactions deployed the reviewed retirement owner, transferred ownership and accepted it; the accepted ownership was verified at block 11780816.

Retirement owner `0x29E27cEB200Dd3D2be9398C5A3ED5BA0794198Bc` has no activation, onward ownership-transfer or arbitrary-call path. Public collection, deployment, state, affiliate program, checkpoint and three event projections were then removed in one scoped database transaction with an encrypted backup. The completed V8 collection was preserved.

The unused **0.3 ETH VRF balance remains locked until 2026-10-21 18:00 UTC**. Afterwards, `recoverRandomnessFunding()` can return it only to the original operator. This setup did not recover or count that ETH as available. See [the exact retirement evidence](unactivated-v8-retirement.md).

## Hosted application verification

Staging Web and Indexer were redeployed with the new public V10 pins using their existing commit `c26e99d834697891e70fe499833e69d9ecf99d7b`. This did not publish the local worker changes. Existing sensitive credentials were preserved. Public pins were also synchronized to the three existing local environments (`.env.staging.local`, `.env.staging.web.local`, `apps/web/.env.local`), with private permissions and verified dotenv round trips. The two requested local Indexer environment paths were absent; hosted Indexer settings were verified directly. The old private registry-setup environment was preserved.

| Surface | Evidence completed at 18:24:37 UTC |
| --- | --- |
| Web | `dpl_EN5xT9Hg7wnrq6uUwt3NT69DXBty`, READY; `/seasons`, completed V8 mint page and NFT 81 API each returned 200. Removed V8 mint page returned 404. |
| Historical winner credits | Both original winner wallets returned Credits V6 with three source awards but exactly one lifetime reward each, verified at blocks 11780993/11780994. |
| Indexer | `dpl_TiNJ1oo8qQ6GUzxyc6pejvYcXUs3`, READY; both minute schedules bound to the new deployment. Authenticated V8/V10-configured cycle returned 200/ok; completed V8 caught up through block 11780992 with no error/reorg. No V10 collection exists yet to index. |
| Configuration checks | 49 focused configuration tests passed; public trust pins and canonical chain hashes matched. |

Sensitive Vercel environment values are intentionally unreadable through the API; absence of a returned value is not absence of the configured secret.

At 18:19:35 UTC, the closed historical enrollment endpoint returned `409 enrollment_closed`, a branch reached only after signer, non-test Turnstile, IP-hash and origin configuration checks. The hosted public signer matches the intended V10 signer. No challenge or enrollment permit was generated. Existing sensitive credentials were preserved; an actual browser Turnstile challenge remains untested.

## Run-day prerequisites retained by the user

1. **Fund Sepolia wallets.** Each collection sells 1,000 tickets at 0.01 ETH, requiring 10 ETH of mint principal before winnings can recycle. At the 5 gwei ceiling, each fresh buyer needs 0.2 ETH for its 20 tickets plus a 0.0125 ETH gas reserve. Each donor must cover a whole buyer shortfall and retain its own gas reserve; the algorithm does not combine donor fragments. Allow additional deployment, transfer, mint, VRF and settlement costs and the whole season's 0.6 ETH sponsorship. Unused sponsorship is not reclaimed by this rehearsal. Refresh balances on run day; the initial 17:16 UTC total of 10.762688085 ETH was insufficiently distributed for all 50 buyers and is no longer a current balance assertion.
2. **Configure and enable the Sepolia X profile** in staging Launch: account ID, handle, public origin and all four OAuth 1.0a user credentials. The run-day helper verifies the account with an authenticated GET before freezing a schedule. The read-only wrapper currently stops at `configure_enabled_sepolia_x_profile_first`, as expected. Media upload and posting permissions require actual X delivery.
3. **Run the command in the runbook and keep the Mac awake.** The first opening is chosen 75 minutes after execution; later collections retain one-hour spacing from confirmed predecessor sellout. Keep the worker running through final claims and recycling. No start date was saved during setup.

The 250 ETH cap counts repeated transfers, mint payments and gas cumulatively even when capital is recycled. Ten collections total 100 ETH of mint payments, potentially another 106.25 ETH of buyer funding transfers, 3 ETH of VRF allocations and 0.6 ETH sponsorship before other costs. This policy headroom does not certify a sufficient starting balance or future fee conditions.

## Reliability and validation

- Added private, append-only NDJSON logs with UTC timestamps, Run ID/session, safe statuses/errors and transaction hashes. Unsafe paths/files and logging failures fail closed; keys, OAuth values and raw signed transactions are excluded.
- Added run-day draft preparation with a fresh opening, strict chain/database/policy checks, authenticated X identity verification and atomic prepare/queue. Restarts reuse the original run and schedule and refuse to override paused/stopped state.
- Live setup encountered the RPC provider's 50-method/second limit. Worker/setup now share a 20-method/second per-process endpoint budget with bounded read retries; broadcasts never receive automatic transport retries.
- Receipt reconciliation reuses only canonically anchored, unchanged confirmed prefixes within the provider process; new/pending receipts stay fresh and a cold restart rechecks all. Setup cannot report ready with an unreconciled final receipt.
- Activation receives priority within 120 seconds of opening, keeping old snapshots/claims out of the critical path while retaining current/predecessor state, admission and X checks and the fixed 60-second broadcast deadline.
- Redundant polling checks of X identity now reuse a successful result for five minutes within the same worker/profile instance, with fresh checks after restart, rollback or failed renewal. Public writes keep fresh identity checks. This avoids exhausting the documented [identity-read quota](https://docs.x.com/x-api/fundamentals/rate-limits) through idle polling; no real X account was accessed during this change.
- Final worker suite: **126 passed, 3 isolated-database opt-ins skipped, zero failures**; season TypeScript check passed. Output is retained privately in `season-tests-final.log`; an independent review also passed all 31 runner tests. Focused retirement/lineage, Solidity retirement and Launch checks passed separately. Skipped database tests are not live persistence evidence; the actual scoped staging update and fresh post-commit checks are recorded above.
- Live retirement validation with provider result caching disabled measured approximately 11.6 seconds cold and 7.9–8.1 seconds warm, across distinct blocks without rate-limit failures. This is timing evidence for the gate, not a guarantee of every future network call.

## Evidence for later analysis

The user command prints the Run ID and absolute log path. Retain `.private/season-runner/<Run-ID>.log`, the encrypted `.private/season-runner/sepolia-wallets.enc`, the database and original master key. The database contains the frozen artifact, durable actions, encrypted transaction journals and X outbox. The private setup/proof files are under `.private/v10-setup-2026-09-25/` and `.private/v10-readiness-2026-09-25/`; they are ignored by Git.

Later analysis must compare canonical deployed terms/receipts, all ten collections, 1,000 mints each, recipient caps, permanent identity/metadata, actual VRF results, six distinct winning NFTs, holder claims, reserves/recycling, indexed state and public pages. The diagnostic log is not a full metadata archive; pre/post-VRF byte comparisons need historical RPC state or explicit snapshots.

The rehearsal exercises direct minting and managed-wallet settlement. Affiliate referral qualification, sponsored-credit redemption, an intentionally rejected 21st mint, a separate unsold-refund case and external explorer rendering remain separate acceptance checks. No V10 collection, real V10 VRF, connected-wallet flow or X delivery has yet been qualified. Mainnet was not configured or operated.
