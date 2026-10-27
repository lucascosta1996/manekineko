# V16 Sepolia rehearsal — prepared, not started

The deployed contract is [0x673D155f884976bb42eab2F1F11b381dc4d8D26A](https://sepolia.etherscan.io/address/0x673D155f884976bb42eab2F1F11b381dc4d8D26A#code). The application is [app.tincta.xyz](https://app.tincta.xyz). No Genesis mint, sealing, operating funding, paid preparation or rehearsal transaction has been sent. The separate historical V14 rehearsal remains paused.

## Files and wallets

The frozen runner, encrypted vault, journal and reports live outside the repository at `/Users/admin/.local/share/tincta/v16-rehearsal-2026-10-28/`. Its `command.mjs` loads owner-only credentials from `/Users/admin/.config/tincta/v16-rehearsal-2026-10-28.env`. UI deployments do not replace the runner, wallet vault, plan or transaction history.

- Frozen runtime SHA-256: `b78e0a513a4a7fd9e50f3044fe5ecbdbbbccd82658ced7a89fb51f203510f25a`.
- Plan SHA-256: `4fcf1ee3858133040a066295d5ef597bfbfecd6ef1049bbe608d303e3a684ef9`.
- Fresh bank: `0x6E33bE5D2e41A27b4d580eeEdf4C0b324dB393a1`.
- Manual affiliate wallet 0: `0x76E0D6518b3Dec962044575E8C0FDCfe34d494a6`.
- Manual referred buyer wallet 1: `0xC9cEAB404436a85aAc34bC2F6F3A5814809323C1`.
- Funding/recovery wallet: `0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145`, retained from the previous recovery instructions. Verify that this is the intended source before funding. No old bank or buyer balance is moved by this runner.

The manual wallets are ready for import from `handoffs/wallet-0/` and `handoffs/wallet-1/` inside the run directory. Each contains `wallet.json` (encrypted keystore), `password.txt`, and `private-key.txt` for wallets that require private-key import. These are owner-only local files, excluded from Git and reports. Use these fresh accounts for this Sepolia test.

The actual winning wallet is selected only after genuine Chainlink randomness and draw finalization. The runner reserves the first real winning wallet in each season, records its collection/NFT/global token ID, and stops. Use `handoff INDEX` to export it, import it, and confirm the handoff checkpoint. Automation cannot sign or sweep any wallet placed in human custody, including all other NFTs that wallet happens to win. No preselected wallet is presented as a winner.

## Workflow

1. **Review and fund later.** On the user's explicit start instruction, run preflight again, confirm the website and wallet imports, and transfer 25–30 Sepolia ETH from the pinned recovery wallet to the fresh bank. Register the confirmed funding transaction. The script accepts at most 30 ETH of external funding in total.
2. **Open Genesis.** Resume the local pause marker, invoke the runner, review its `start-genesis` checkpoint, acknowledge it, and invoke it again. It funds and seals the catalog. Genesis has no deadline. The first paid ballot is still closed.
3. **Manual Genesis tests.** The runner stops for each of two free mints from each manual wallet. Test the website, collect receipts, and verify the third primary mint is unavailable. Each manual transaction needs its exact confirmed hash and a test note. Bots then fill Genesis to 999 using 498 other wallets.
4. **Be present before mint 1,000.** The runner prefunds paid participants, then requires a readiness checkpoint. The final Genesis mint immediately opens the immutable one-hour first ballot.
5. **Affiliate enrollment and voting.** Use the affiliate wallet to enroll with its Genesis NFT, copy its referral URL, and test the first Genesis vote. The three packages are always shown. The runner waits for genuine ballot time to elapse; it does not fast-forward Sepolia.
6. **Referred mint.** At sale opening, import the buyer wallet and open the copied affiliate link. Mint one NFT through the UI. The receipt must match the target collection, recipient, affiliate slot, current terms hash and exact price. Bots fill the remainder only after the checkpoint is acknowledged.
7. **Draw and prizes.** After sellout, wait for real Chainlink fulfillment, process the bounded draw, and reserve a real winner for the user. Import that wallet and claim every prize it owns through Rewards. Claim the affiliate payout through Affiliates. Other winners claim through their own wallets under automation, returning proceeds to the bank.
8. **Sponsored redemption.** In collection 2, use the winning wallet to redeem its lifetime sponsored NFT. This remains a manual UI checkpoint. The contract pays its price from the separately funded reserve.
9. **Other collections and refunds.** A readiness checkpoint precedes every next preparation. The plan covers 172 sellouts and 44 unsold refunds, including one Option 2 partial mint and 24-hour refund. Each refund collection reserves a real holder for manual refund testing. Remaining refunds are claimed by their owners.
10. **Season holder rewards.** After every collection in the season is terminal, the script gives the user the first opportunity to claim a holder reward with an eligible winning NFT. Only after that confirmed manual claim do bots fill remaining first-5% slots. A season review checkpoint records UI defects, evidence and any returned manual-wallet funds before the next season.
11. **Final review and recovery.** Review all 216 actual outcomes, 22 holder pools, receipts, payouts, errors and outstanding liabilities. After final acknowledgement, `recover` returns automation-controlled unspent funds to the original recovery wallet. Human-controlled wallets are never swept; return their excess funds yourself.

A single invocation stops at a human checkpoint or time/VRF wait. There is no scheduler installed. Reinvoke it after the required event or acknowledgement. Do not acknowledge a transaction checkpoint until the UI action succeeds and its receipt is confirmed.

## Commands

All commands below use the frozen local runner. **The deployment task runs only initialization, preflight, status and the two unfunded manual-wallet exports.** Funding, resume, acknowledgement, execution and recovery remain future actions.

```sh
V16_RUN=/Users/admin/.local/share/tincta/v16-rehearsal-2026-10-28
node "$V16_RUN/command.mjs" preflight
node "$V16_RUN/command.mjs" status
node "$V16_RUN/command.mjs" report
node "$V16_RUN/command.mjs" handoff 0
```

After the user starts the rehearsal, substitute the actual funding hash, current gate ID and observed test notes:

```sh
node "$V16_RUN/command.mjs" funding 0xFUNDING_TRANSACTION_HASH
node "$V16_RUN/command.mjs" resume
node "$V16_RUN/command.mjs" run --execute 4fcf1ee3858133040a066295d5ef597bfbfecd6ef1049bbe608d303e3a684ef9
node "$V16_RUN/command.mjs" ack GATE_ID "Observed result and evidence path" 0xMANUAL_TRANSACTION_HASH
# Omit the final transaction hash for readiness/review gates.
node "$V16_RUN/command.mjs" handoff WINNER_WALLET_INDEX
node "$V16_RUN/command.mjs" pause
# Only after final review and completion:
node "$V16_RUN/command.mjs" recover --execute 4fcf1ee3858133040a066295d5ef597bfbfecd6ef1049bbe608d303e3a684ef9
```

The `state.json` address array gives each wallet index. `status` returns the current checkpoint and public report path. `resume` only removes the local pause marker; it submits no transaction. `run` additionally requires `--execute` and the exact plan hash. No approval is inferred from elapsed time.

## Budget and duration

The 216 collections use the real catalog order, names, season IDs, colors and deployed menu. See the [full scenario matrix](sepolia-v16-scenarios.md).

| Package | Supply × price | Sellout principal | Paid window | Live coverage |
| --- | --- | --- | --- | --- |
| 1 | 1,000 × 0.01 ETH | 10 ETH | 1 hour | Sellout, six prizes, refunds, no-vote fallback |
| 2 | 2,000 × 0.02 ETH | **40 ETH** | 24 hours | Vote, three paid mints, refund |
| 3 | 1,000 × 0.01 ETH | 10 ETH | 24 hours | Sellout, ten prizes |

**Option 2 cannot sell out with a 30 ETH budget.** Its complete sellout/draw/prize path is tested locally. No principal can be recycled out of a still-unsold collection. The live run will not borrow funds, silently exceed the ceiling, or call that local test a live pass.

The plan recycles prize, affiliate, refund, treasury, execution and unused reserve proceeds. Season holder allocations remain locked until season completion; manual-wallet payouts remain with the user until returned. Start funding is at least 25 ETH, with a 1 ETH liquid bank reserve. The saved fee cap is 0.5 gwei. At 3 ETH of recorded gas plus known VRF fees the script stops for a cost review. `review-cost NEW_LIMIT_WEI "Detailed reason and budget review"` can explicitly raise that review threshold while preserving the 30 ETH funding ceiling and mint principal. It cannot change the contract or voting package.

There are 216 one-hour ballots, 43 one-hour refund windows and one 24-hour refund window: **at least 283 hours (11 days 19 hours)**, excluding Genesis, mint transactions, VRF, delay periods, claims and human pauses. Real execution will take longer. The runner does not accelerate production rules.

## Fixing UI problems during the run

Use `pause` to stop further bot signatures, record the collection, gate, account, URL, browser, screenshot, expected/actual result, and transaction hash if one exists. Fix and deploy Web/Launch/indexer code against the **same verified address**. Preserve the frozen runtime, plan, vault, journal and human custody reservations. Check live contract state, then resume the runner.

**A local pause never pauses the contract.** Ballots, mint deadlines and the 72-hour randomness cutoff continue. A UI fix cannot reopen a missed window or alter immutable terms. If a fixed deadline is missed, follow the real outcome/refund path and record the failed test.

`reconcile COLLECTION_ID "Detailed incident, observed state and reason"` is an explicit, read-only incident acceptance for the current collection after its ballot closes. It records an error and an observed-state override, preserves the original plan, never reports the missed checkpoint as passed, and chooses refund instead of trying to fund a 40 ETH sellout. Use it only after inspecting the defect and actual terms. It sends no transaction. A changed contract or chain fails closed; it cannot be reconciled into this run.

## Coverage and evidence

| Scenario | Prepared live workflow | Existing local verification / manual evidence required |
| --- | --- | --- |
| Genesis 0/1/2 mints, third mint rejection, transfer allowance, no deadline, final sellout gate | Human mints and final-mint readiness gate | Contract tests cover rollback/reentrancy and transfer limits; capture UI rejection |
| Three packages, first Genesis vote, paid snapshot votes, no votes, ties | All packages selectable; 22 no-vote collections | Local tests cover ties, invalid/duplicate token proofs, ownership changes and all package sellouts |
| Genesis affiliate proof, later paid proof, slots full, already-used proof, self-referral | First collection of every season manual; three/ten/no-slot scenarios elsewhere; ten-slot case deliberately leaves one unqualified | Local tests cover paid proofs, transfer reuse, season reuse and invalid calls; manually inspect disabled/error states |
| Affiliate link attribution and qualified equal payout | Manual referred mint and payout each season | Record copied URL, matching receipt, expected amount, claim confirmation and duplicate-claim behavior |
| Six and ten prizes, current NFT owner, claimed status | Every winning NFT claimed; actual winning wallet handed to user each season | Local tests cover four-prize package, transfer restrictions, rejecting recipients and reentrancy |
| Lifetime sponsored NFT | Manual redemption in collection 2 | Local tests cover double use and refund not restoring entitlement |
| Unsold refund and burned NFT metadata | 44 refund collections with manual holder checkpoints | Local tests cover full price, later claims, allowances and historical mint-block metadata |
| Randomness retry/timeout and bounded draw progress | Real request/fulfillment only; actual failures recorded | Deterministic local tests cover timeout and recovery; a successful live request does not prove an outage case |
| Holder pool locked/unlocked, first 5%, fixed reward, repeat claim, exhausted slots | Manual claim before bots each of 22 seasons | Local tests cover exact conservation and limits; capture connected UI before/after claim |
| Wrong network, wallet cancellation/disconnection, RPC outage/retry, account switch, mobile | Explicit manual browser checklist at checkpoints | Current capture verifies local desktop/mobile and simulated wallet rejection; no live wallet claim is yet tested |
| Nonce interruption, fee cap, restart, custody, reserve and receipt protection | Durable signed journals; saved runtime/plan hashes; exact manual receipts | Runner guard tests and existing transaction pipeline; full 216-collection live runner remains unexecuted |

`report.json` contains anchored collection outcomes, winners/beneficiaries, season pools, manual tests, transaction hashes, gas, known VRF fees, custody balances, errors and incident overrides. Private `state.json` additionally contains signed transaction journals; do not publish it. Keep screenshots and defect notes separately and reference them in each acknowledgement. The final audit must distinguish expected negative tests, actual defects, repaired defects, untested paths and remaining liabilities. It must not claim every possible scenario has passed merely because all collections completed.
