# V14 Genesis-first Sepolia rehearsal

The approved run uses the existing encrypted bank and 50 buyer wallets, a fresh V14 manifest and a new private transaction journal. The original V13 run stays paused. Do not edit or restart its frozen runtime.

## Scenarios and timing

1. Each of the 50 wallets mints one free Genesis NFT using its own signed transaction.
2. Wait the full onchain 24-hour Genesis window. This cannot be accelerated on Sepolia, including after sellout.
3. Prepare the first paid collection. Wait for finalized two-RPC runtime verification and public source/ABI publication before voting or minting.
4. All 50 wallets vote for option one: 50 Genesis votes for collection 1, then 1,000 eligible paid NFT votes per later ballot. Three wallets enroll as affiliates through the existing version-specific rules.
5. Run the first ten-collection season: collections 1–4 and 6–9 sell out; collections 5 and 10 mint only three NFTs and expire into refunds. Each paid ballot lasts one hour; unsold mint windows expire on real chain time. Sellouts use real Chainlink, never a locally supplied random word.
6. Claim all 48 prizes, qualified affiliate payouts and six refunds to the bank. Recover unused sponsorship, execution and randomness funds plus treasury balances without touching protected reserves.
7. At season end, 400 eligible paid NFTs claim the 8 ETH holder pool. Genesis NFTs have no holder entitlement. Stop before the next season.
8. Return recoverable buyer funds, the operator’s rehearsal-funded surplus and the bank balance to `0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145`.

These are acceptance criteria, not a claim that the live run has completed. The full rehearsal takes more than a day. Its durable journals permit a process restart without repeating confirmed actions. Source publication can delay progression. Public outside-wallet mints or unexpected ownership cause the run to stop for review.

## Funds and recovery

The user funded bank `0xC51c9c66997740523F8c85D0336267919F32539C` with 20 Sepolia ETH in transaction `0xc0729edc730366827416b4f3f5a200933f8c7e6b4319653b026fe38040922d4b`. The original remaining 10 ETH was not transferred to this rehearsal. The funding proof checks sender, recipient, value, successful receipt, canonical block and finality through two independent RPCs.

The run accepts 20–30 ETH total funding, limits normal gas to 1.5 ETH with a separate 1 ETH recovery reserve, caps fee-per-gas at 5 gwei and gross recycled transfers at 300 ETH. These are ceilings, not spending targets. Deployment gas comes from the separately funded operator, before its protected starting balance is recorded. The runner never signs for the user’s recovery wallet.

Final accounting must reconcile funding into returned ETH, transaction gas, actual Chainlink charges, small fee-reserve balances and any locked holder liabilities. Gas and consumed Chainlink fees cannot be returned. The normal successful scenario leaves no holder liability. An early recovery may have to wait for immutable refunds and can leave a season pool locked until the season ends; it must not be called a completed test.

## Runbook

- Compile and test: `npm run protocol:v14:rehearsal:test`.
- Build a fresh runtime: `npm run protocol:v14:rehearsal:build -- PRIVATE_NEW_RUNTIME_DIRECTORY`. It reads the reviewed V14 deployment manifest and freezes executable/artifact/plan hashes.
- Initialize: `node PRIVATE_RUNTIME/runner.mjs init PRIVATE_RUNTIME PRIVATE_NEW_STATE_DIRECTORY`.
- Inspect and check: use the same command with `status` or `preflight`.
- Run: `node PRIVATE_RUNTIME/runner.mjs run PRIVATE_RUNTIME PRIVATE_STATE APPROVAL_HASH FUNDING_TRANSACTION_HASH`.
- Recover: stop the runner, then use `recover` with the same state and approval hash. Recovery is irreversible for that run.
- Run `npm run protocol:v14:sources -- expectation.json PRIVATE_SOURCE_REPORT_DIRECTORY --watch` alongside it, with `V14_REHEARSAL_STATE_DIRECTORY` pointing to the new private state. It also publishes the disposable batch-funding helper before any buyer funds pass through it. The publisher has no signer and does not post to X. The rehearsal waits for its matching verified report for every newly prepared collection.

Private runtime variables are `V14_REHEARSAL_RPC_URL`, `V14_REHEARSAL_SECONDARY_RPC_URL`, `V14_REHEARSAL_VAULT_KEY`, `V14_REHEARSAL_OPERATOR_KEY`, an absolute shared `V14_REHEARSAL_OPERATOR_LOCK`, and absolute `V14_REHEARSAL_SOURCE_REPORT_DIRECTORY`. Publisher variables are documented in the V14 Genesis guide. Never commit their values. Optional `V14_EXPLORER_PROXY_URL` is an HTTP(S) proxy for explorer access.

Only initialization accepts `V14_REHEARSAL_ADOPT_UNUSED_V13_DIRECTORY`. It requires the original pause marker, no old transactions or round journal entries, an authenticated vault with matching accounts, zero nonces on both RPCs and empty buyers. It copies only the encrypted vault into new private state; its historical encryption format retains its original V13 AAD. No old approval, financial state or frozen artifact is reused.

## Local evidence

The production engine passed on an isolated Sepolia-ID EVM with a VRF mock: 50 Genesis mints, 500 wallet voting transactions, 406 paid mint transactions, eight sellouts, two refunds, 48 prize claims and 400 holder claims. It survived state reloads and an irreversible recovery rehearsal. The test reconciled all 20 ETH, with zero locked holder funds. This establishes local behavior, not real Sepolia Chainlink delivery or live completion.
