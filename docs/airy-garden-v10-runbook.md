# Airy Garden V10 — Sepolia run day

This is the first Sepolia mock season: automation `79b44791-5787-4a26-90db-86a06a286a3b`, two collections (Lunar Stone and Satin Echo) of 1,000 tickets at 0.01 ETH each. Its names, identities, order, colors and mint economics are preserved. See the [dated readiness record](sepolia-v10-readiness-2026-09-25.md) for setup evidence and verification boundaries.

On 2026-09-26, the user reduced the rehearsal from ten collections to two to lower X API costs. The original frozen automation `5296e2a2-8450-4a73-9ed8-22b55f3448fa` and paused run `971a0f25-992c-4bde-ba50-c9afb9fe329d` remain audit history. Its only action was a pending X announcement with no post ID or transaction hash; no public season projection existed. **Do not resume that old run.** Launch lists replacement drafts in the original season’s catalog position, newest first; select the Airy Garden draft with **2 collections**. The older **prepared / 10 collections** entry remains immutable history. The existing command now targets the replacement draft, preserving the first two collection payloads, season identity and wallet vault. It will choose a fresh opening when executed. Fund X API credits before starting; authentication alone does not establish paid posting capability.

## Before running

1. Fund the configured Sepolia operator/donor wallets. The first collection needs 10 ETH of mint principal across 50 buyers, plus gas and operating reserves. Each collection reserves 0.3 ETH for VRF and 0.06 ETH for sponsored rewards. Unused VRF can recycle after settlement; this rehearsal does not reclaim unused sponsored-reward funding. The 250 ETH cumulative transaction cap counts recycled transfers and mint payments again; it is not a required wallet balance or a cost estimate. The fee ceiling remains 5 gwei.
2. In [staging Launch](https://manekineko-staging-launch.vercel.app)'s **Sepolia** X profile, save and enable the intended test account, its numeric ID, handle, four OAuth 1.0a user credentials and public origin `https://app.tincta.xyz`. The run-day helper checks the account with an authenticated GET before freezing the schedule. Actual media/post permission is established only during delivery.
3. Keep this Mac connected and running. The two collections have one-hour spacing after the first sellout, so the season takes at least one hour after the first collection, plus deployment/draw/settlement time. The worker must continue after the first `completed` report so final claims and recycling can settle.

Do not prepare a dated artifact days in advance. The configured plan intentionally remains a draft with no opening time or runtime run. The helper chooses the first opening 75 minutes after you execute it: 15 minutes of enrollment plus one hour of deployment lead. Subsequent times follow the preserved season cadence.

The user added `app.tincta.xyz` to the existing staging Web project on 2026-09-26. Its trusted enrollment origin was updated accordingly. At the user's explicit request, Vercel Authentication was disabled for all four Tincta projects (Web, Launch, Indexer and Landing). Anonymous checks at 21:20 UTC verified custom domains, project aliases and active deployment URLs no longer require Vercel login. Launch's application sign-in and Indexer's API authentication remain enforced. The closed historical enrollment endpoint passes the new origin check. Actual Turnstile challenge verification on this hostname remains a separate browser check.

## Check and start

On this prepared checkout, a read-only preparation check is:

```sh
node /Users/admin/Documents/workspace/manekineko/.private/v10-setup-2026-09-25/run-airy-garden.mjs
```

After funding and configuring X, start the season yourself:

```sh
caffeinate -i node /Users/admin/Documents/workspace/manekineko/.private/v10-setup-2026-09-25/run-airy-garden.mjs --execute
```

That command sets the fresh opening, atomically prepares and queues the exact Airy Garden plan, then starts the Sepolia worker with the encrypted 50-wallet rehearsal, fund recycling and logging. It prints the Run ID and absolute log path. It can send Sepolia transactions and publish to the saved Sepolia X account. No season was started during readiness setup.

The helper uses the existing private staging files and `.private/v10-setup-2026-09-25/worker.env`. Keep the checkout, compiled artifacts, environment files and shared master key intact. The private helper/configuration files are ignored by Git; a fresh clone does not contain them. Generic checked-in preparation is available through `npm run season:prepare:sepolia -- --help`.

If interrupted, rerun the **same command**. It reuses the same Run ID, encrypted vault and saved signed transactions. It does not reset dates or resume a paused/stopped run; review that run in Launch first. A missed scheduled opening requires review, not a silent date change. Never delete a pending journal or replace a pending transaction to bypass an error.

## Evidence for later analysis

- Diagnostic log: `.private/season-runner/<Run-ID>.log` — timestamped, private NDJSON containing safe statuses/errors and transaction hashes.
- Wallet vault: `.private/season-runner/sepolia-wallets.enc` — encrypted and created only when the worker executes.
- PostgreSQL runtime: immutable prepared artifact, actions, encrypted transaction journals, X outbox and indexed collection state.

Keep these locally and give Codex the Run ID or log path. Do not paste wallet keys, OAuth credentials or decrypted journals. The log is not a full metadata archive. Later verification must compare canonical contract state/receipts, indexed/public results and token metadata, using historical RPC state where needed.

This rehearsal covers direct minting and managed-wallet prize/refund settlement. It does not automatically test affiliate referrals, sponsored-credit redemption, an intentionally rejected 21st mint or a separate unsold collection. Those acceptance cases remain distinct from a successful two-collection sellout run.

## Retired V8 collection

The unused Cinder Study V8 collection was removed from the public database after permanent activation retirement. Its chain code remains historical. The retirement owner is `0x29E27cEB200Dd3D2be9398C5A3ED5BA0794198Bc`; its `recoverRandomnessFunding()` can return the unused VRF balance only to the original operator, and only after **2026-10-21 18:00 UTC**. See [the retirement design and verification](unactivated-v8-retirement.md). This is separate from the V10 run-day command.
