# V13 first-season buyer rehearsal

**Paused by the user on 2026-10-25:** the launcher was stopped before any participant transaction. At block 11991768 the bank still held 20 Sepolia ETH (nonce 0); the journal contained zero transactions and the first collection had zero mints/affiliates. Do not run or recover this bundle without new user instructions. The V13 contract itself cannot be paused. The replacement design is [V14 Genesis](genesis-free-mint-v14.md); this frozen V13 bundle is not compatible with that graph.


This is an executable Sepolia buyer simulation for the [2026-10-25 V13 graph](sepolia-v13-release-2026-10-25.md). It uses the existing deployed contracts and their actual one-hour voting and mint windows. It does not change deployed contracts, frozen terms, the catalog, or Mainnet. Opera is the user's wallet browser for this project.

## Fixed exercise

Aster Study contains ten collections. The runner sells out collections 1–4 and 6–9, with 1,000 NFTs at 0.01 ETH each. Collections 5 (Aster Ember) and 10 (Aster Journey) each receive three paid mints, remain unsold, expire, and refund all three NFTs. All rounds use option zero; option one would require 40 ETH before gas and is outside this funded plan.

The encrypted vault contains one bank and 50 independent buyer wallets. Each successful collection gives every buyer 20 NFTs. There is no fabricated first-ballot voting power: the bootstrap collection has no previous eligible NFTs. For each subsequent ballot, all 50 wallets cast actual transactions, with 20 votes each from their most recent successful collection. Three wallets enroll as affiliates, receive paid referrals, and claim the equal affiliate allocation. The refund collection between successful rounds remains ineligible as a voting source.

After each sellout, real Sepolia execution waits for Chainlink's actual callback, finalizes the draw, claims all six prizes and all affiliate proceeds, and recovers unused sponsorship, randomness funding, execution funding and ordinary treasury proceeds. The original `V12RehearsalFunding` helper is deployed unchanged as a disposable Sepolia-only batch payer; its runtime and deployment receipt are checked. It has no authority over V13 or retained funds. This avoids 50 sequential funding transactions per round.

The runner stops at collection 10. It never calls `settleAndPrepare`, which would prepare collection 11 on this 216-collection controller. Each revealed collection contributes 1 ETH to holders. After the two refundable collections and eight revealed collections finish, the pool contains 8 ETH for 8,000 eligible NFTs. The first 400 eligible NFT claims each pay 0.02 ETH. The script claims one NFT per buyer per successful collection: 50 × 8 = 400. Refunded NFTs contribute neither funds nor claim eligibility.

This tests paid minting, voting, affiliate qualification, draw execution, prizes, refunds and season holder rewards. It does not exercise sponsored winner-credit redemptions or publish X posts. Local tests use time travel and a VRF mock; live Sepolia has neither. Allow at least 12 hours of fixed windows, plus transactions, Chainlink confirmations/callbacks and finality; a missing callback can take the immutable 72-hour refund route. The runner does not skip deadlines or manufacture entropy.

## Funds and return address

The fixed recovery address is **`0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145`**. There is no recipient override. The only user-wallet operation is funding the generated bank from that address in Opera; its private key is never supplied to the runner.

Start with **20 Sepolia ETH**, keeping the remainder in the user's wallet. The run accepts one independently verified, finalized funding transfer of 20–30 ETH. The 30 ETH figure is a maximum initial transfer, not a requirement to move all of it. Funds are recycled: 80 ETH of successful mint receipts do not require 80 ETH of starting capital. Before the last sellout, up to 7 ETH is held in the season pool, 10 ETH funds the next sellout, about 1 ETH provides buyer gas reserves, and one preparation costs 0.06 ETH. Preparation top-ups are exact; surplus controller deposits cannot be withdrawn until all 216 catalog entries finish.

The gas price ceiling is 5 gwei. Normal execution has a 1.5 ETH aggregate gas ceiling; recovery permits a further 1 ETH to exit existing positions, never to start new collections. These are ceilings, not fee estimates. The separate 300 ETH gross transaction ceiling counts repeated internal funding and recycled mint principal; it does not authorize another deposit or access to the user's remaining funds. Existing operator ETH is recorded and preserved, with rehearsal gas added separately.

Prizes, affiliates, refunds, treasury and recovered operating budgets return to the bank between collections. At completion, buyer balances, the operator's rehearsal surplus and the bank balance are sent to the fixed recovery address. Each sender retains its estimated return-transfer gas reserve at the fee ceiling (0.000126 ETH for a plain EOA recipient; more for delegated wallet execution); the final report lists the actual residual instead of calling it returned. The user's EIP-7702 delegation bytes are pinned and checked before each return, and transfer gas is estimated against that wallet instead of assuming 21,000 gas. These wallets and keys remain available for later dust recovery. For these exact terms, the holder pool has no division dust; the affiliate division dust is recovered through the contract's growth reserve.

The accounting identity is:

`bank funding + pre-existing first-round operating funding = returned ETH + actual journal gas + Chainlink charges + wallet dust + any still-locked holder funds`

The user's earlier preparation transaction and funding-transfer gas are outside the runner's journal. Its pre-existing 0.06 ETH operating deposit is included when an untouched first collection is adopted. Network gas and Chainlink charges are consumed. A precise return of the original 30 ETH is therefore impossible. No completion certificate is issued for an unexplained accounting difference, pending receipt, unrecovered collection liability, or unfinished holder pool.

## Build, inspect and execute

```sh
npm run protocol:v13:rehearsal:build -- /ABSOLUTE/NEW/runtime
node --env-file=/PRIVATE/v13.env /ABSOLUTE/NEW/runtime/runner.mjs init /ABSOLUTE/NEW/runtime /PRIVATE/new-run
node --env-file=/PRIVATE/v13.env /ABSOLUTE/NEW/runtime/runner.mjs preflight /ABSOLUTE/NEW/runtime /PRIVATE/new-run
```

Use [the environment template](../scripts/protocol-v13/rehearsal/environment.example). Keep the master key separately backed up; losing it loses control of the generated wallets. Vault encryption uses AES-256-GCM with a V13/Sepolia domain. State files and signed transaction journals are private mode 600; directories are mode 700. Never commit or publish them.

Initialization accepts zero prepared collections or an untouched first collection with at least 20 minutes remaining before minting. It refuses existing mints, enrolled affiliates and controller surplus. A public collection with external activity requires separate reconciliation. Full-graph verification compares code, immutable values, catalog, economics, credits and holder bindings at a common finalized block across two independent RPC hosts before signing.

The initializer prints the bank address and a hash binding the frozen runtime, plan, buyer addresses, operator baseline and adopted collection. After funding that bank **from the fixed recovery address**, use the transfer hash:

```sh
node --env-file=/PRIVATE/v13.env /ABSOLUTE/NEW/runtime/runner.mjs run /ABSOLUTE/NEW/runtime /PRIVATE/new-run APPROVAL_HASH FUNDING_TX_HASH
```

Run on a machine that remains awake, with the private log redirected to mode-600 storage. Do not run another operator/executor against this graph simultaneously. Runtime writes require both a run lock and a shared operator lock. SIGINT/SIGTERM stops between durable steps. Restart the identical command and original files; no transaction is replaced or assigned a new nonce. RPC transport failures switch between the already verified providers and reconcile the same signed journal. Unexplained nonces, reorgs, ownership changes, external mints/claims, scenario mismatches, stale RPCs and spending-limit failures stop execution. Never delete a lock merely because a process appears slow; confirm the owning process exited before removing a stale lock.

```sh
node /ABSOLUTE/NEW/runtime/runner.mjs status /ABSOLUTE/NEW/runtime /PRIVATE/new-run
node --env-file=/PRIVATE/v13.env /ABSOLUTE/NEW/runtime/runner.mjs recover /ABSOLUTE/NEW/runtime /PRIVATE/new-run APPROVAL_HASH
```

Recovery permanently disables new preparation, voting and minting in that run. It waits for existing immutable sale/VRF deadlines, claims available funds, and returns liquid balances. A partial season's holder pool remains contract-locked: the report identifies that balance and does **not** call the season completed. Lost external ownership, unresolved Chainlink requests or contract-locked funds may still require later recovery; keep the vault and journals.

## Verification evidence

`npm run protocol:v13:rehearsal:test` covers the frozen bundle, encryption/private-file enforcement, funding-source and finality checks, policy tampering, and a complete local EVM season with the production V13 contracts. The integration test also checks restart recovery, interruption with locked holder funds, preservation of operator funds, every financial allocation, final wallet recovery, and no collection 11. This is separate from live Sepolia execution; only a finalized `completion.json` with transaction hashes and reconciled accounting establishes a completed live run.

### 2026-10-25 execution preparation

Five runner policy/vault/funding tests and the two contract integration tests passed locally. The full season test completed in 135 seconds with local time travel, mock VRF and a payable recipient requiring more than 21,000 gas. It recorded 450 votes, 406 mint transactions, six NFT refunds, 48 prize claims and 400 holder claims. Every collection balance and protected liability, sponsorship balance and final holder-pool balance was zero. A separate snapshot exercised early recovery with 1 ETH still locked for holders and correctly reported the season incomplete. Worker typechecking and whitespace checks passed. Hosted CI has not been run for this change.

The live runner was initialized against the existing untouched Aster Atlas ballot, collection `0x210c13D0bc8300236d865E8A6987650725C8caaA`. Its frozen runtime manifest SHA-256 is `d23c3dc1373e6a4a39a6faff11fee174b9f72ff1668822f75545d77800b97265`. Two independent providers verified the full deployed graph at finalized block **11991602**.

The user signed a **20 Sepolia ETH** transfer to the new bank **`0xC51c9c66997740523F8c85D0336267919F32539C`**, transaction [`0xc0729edc730366827416b4f3f5a200933f8c7e6b4319653b026fe38040922d4b`](https://sepolia.etherscan.io/tx/0xc0729edc730366827416b4f3f5a200933f8c7e6b4319653b026fe38040922d4b), confirmed in block **11991697**. Both providers agreed on its sender, recipient, empty calldata and value. At **15:20 UTC**, the background process was waiting for that transfer to finalize before running. This is funding/startup evidence, not completion of the live rehearsal. The original recovery address and operator baseline remain bound in the private run record. macOS idle sleep is inhibited while the worker process runs; closing the machine or stopping the process can still interrupt deadline-sensitive work.
