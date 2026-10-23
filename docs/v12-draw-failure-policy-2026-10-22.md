# V12 randomness timeout and funded execution

2026-10-22. Local source implementation. This supersedes the earlier V12 no-timeout policy and affiliate payout timing. Existing deployed versions are unchanged. Fresh bytecode, ABI, dependency verification and deployment pins are required.

## Fixed policy

| Stage | Deadline / permitted outcome |
| --- | --- |
| Unsold minting | At the immutable mint deadline, full mint-price refunds become available. |
| Sold out, request not accepted or entropy not recorded | `randomnessDeadline = soldOutAt + 72 hours`. Retries/funding cannot reset it. |
| Matching verified entropy recorded strictly before cutoff | Draw is irrevocable. Anyone can finalize at any later time. Refunds and cancellation are impossible. |
| No recorded entropy at cutoff | Full mint-price refunds are available immediately from the contract, including at exact timestamp equality. No operator or cancellation transaction is required. |
| Late callback | Authenticate the coordinator/request, emit `LateRandomnessIgnored`, and return without changing the outcome. It cannot revive a draw before or after a refund transaction. |
| Next collection | Preparation accepts successful fully backed settlement or either refundable outcome. Unclaimed refunds/prizes remain in their original contract. |

The 72-hour policy is compiled into the new contracts through `ManekinekoV12Policy`; it is not voted or operator-editable. It starts at sellout even when the initial request reverts. A successfully accepted request cannot be replaced or rerolled. The callback only records entropy, without drawing or making payments. Clock passage changes transaction eligibility; refunds still require holder transactions and gas.

## Funds and execution

All mint receipts stay protected until draw finalization. Affiliate qualification and equal shares are calculated at sellout, but `affiliateClaimable` remains zero until finalization. Ordinary operator withdrawals and growth-reserve withdrawals also remain locked. Failed draws yield zero operator/affiliate mint proceeds. Refunds pay the current holder the full original mint price and burn the NFT. Resale premiums and gas are excluded. Sponsored refunds preserve the existing one-redemption lifetime rule.

A successful collection still allocates exactly 60% to equal winning-NFT prizes, 20% equally among affiliates with a paid referral, and 20% ordinary proceeds to the operator. Affiliate rounding dust/zero-qualifier pools retain their separate growth-reserve treatment. Prizes and affiliate claims do not depend on other holders claiming.

Every preparation costs `randomnessBudget + sponsorshipBudget + 0.01 ETH`. The last component is a separately reserved executor reward, funded before opening. It does not reduce mint allocations. Anyone may increase it through `fundExecution` before finalization/refund eligibility; nobody may remove it while live.

- `finalizeDraw(1..8)` preserves bounded deterministic processing and records a pull-claimable reward for the successful caller. This core path never sends ETH to the caller.
- `finalizeDrawAndClaim(recipient)` performs the same eight-attempt batch and pays the reward in one transaction if successful. A progress-only batch preserves progress and pays nothing yet. If the recipient rejects ETH, that convenience transaction reverts; core finalization remains available.
- `claimExecutionReward(recipient)` allows only the recorded executor to claim, once. Unclaimed rewards remain in `protectedBalance`.
- The controller batch records the fixed operator as executor and pays its reward alongside the separately accounted ordinary 20%. An independent executor's reward is never taken by the operator batch.
- `recoverExecutionFunding()` lets the operator recover only unused execution funding after refunds unlock. Full mint principal remains protected.
- Unused VRF subscription recovery may still fail while Chainlink considers a request pending. This separate oracle funding does not block holder refunds or next preparation.

Launch retains the single operator settlement transaction. Successful settlement finalizes if necessary, withdraws remaining ordinary proceeds (and its own execution reward when applicable), then prepares the next ballot atomically. A refundable collection has zero ordinary proceeds; `prepareNext` or `settleAndPrepare(id, 0)` can advance without waiting for refunds. Exact attached operating shortfalls now include the new executor funding.

## Independent executor

`scripts/protocol-v12/executor.mts` is a permissionless executor with no operator authority. It submits only three allowlisted calls to controller-bound V12 rounds: `requestRandomness()` after a failed unaccepted request, `fundRandomness()` with an exact bounded top-up, and `finalizeDrawAndClaim(itsOwnAddress)` for progress or finalization. It cannot replace an accepted request, extend the cutoff, withdraw operator proceeds or change sale terms. Top-ups are allowed while a sold-out round is waiting for a request or delivery; they stop once refunds become available.

The [current readiness runbook](v12-mainnet-readiness-2026-10-22.md) specifies the private deployment manifest, two independent RPC endpoints, pinned dedicated gas wallet, explicit fee/gas limits, per-round subsidy and VRF funding target required for signing. These are operating funds separate from mint receipts. The worst-case gas charge plus transaction value must fit the unused budget without assuming the caller will earn a finalization reward. Only actual finalized reward receipts reduce recorded expenditure.

```sh
npm run protocol:v12:executor -- /private/executor-config.json /private/executor-intent.json --inspect
npm run protocol:v12:executor -- /private/executor-config.json /private/executor-intent.json --once
npm run protocol:v12:executor -- /private/executor-config.json /private/executor-intent.json --watch
```

Inspection is the default and creates no signer. Signing modes verify the complete deployment graph through two RPCs at startup. Watch mode polls every 15 seconds, with transport failover/backoff up to 60 seconds. A private mode-0600 intent is flushed before broadcast. An uncertain send reuses the identical signed transaction, never a fresh nonce. Canonical finalized receipts update an idempotent private budget ledger before clearing the intent. Unresolved nonce consumption, altered bindings or an abandoned lock stop the runner for reconciliation; locks are never stolen automatically. Use one private journal and dedicated wallet per process, with separate wallets and hosts for redundancy. No public executor was activated by this source work.

The separately prefunded 0.01 ETH reward remains a settlement incentive. The additional capped subsidy supports rare progress batches, request recovery, VRF shortfalls and finalization whose gas exceeds that reward. This cannot guarantee inclusion during indefinite censorship, gas above the configured ceiling or exhausted funding. Recorded results never change into refunds because a worker is absent. Operators must supervise runner health and funding and retain the public manual paths.

## UI and event projection

Launch and public Collections read all values at one verified block. They display:

- The active voting or mint countdown before sellout.
- A randomness countdown, UTC cutoff, current request/delivery stage and the exact refund consequence before entropy arrives.
- An irrevocable recorded-result explanation and separately funded reward during finalization.
- A distinct unsold-expiry or missing-randomness reason once refunds are verified available.
- Checking/unavailable states at cached timer zero, stale RPC data or failed reads. Browser time never enables a financial action.

Public Collections offers permissionless request retry, finalization with reward, and a recorded executor's pull claim. Launch provides optional VRF funding in either request/delivery stage and unused execution-funding recovery after refunds. The X observer adds separate recorded-randomness and draw-timeout events from finalized state. No X messages were sent.

## Accepted security tradeoff requiring independent review

The user explicitly chose to retain the immutable 72-hour full-refund cutoff and accepted its oracle-withholding tradeoff on 2026-10-22. This is the selected policy, not an outstanding policy question.

Chainlink's [VRF security guidance](https://docs.chain.link/vrf/v2-5/security) warns against cancellation or re-requesting because parties may discard unfavorable randomness. It also states failed consumer callbacks are not retried. This implementation deliberately chooses a fixed terminal application refund cutoff over indefinite lockup, with no replacement seed, discretionary cancellation, extension or acceptance after cutoff.

Fixing the timestamp removes operator discretion and post-cutoff callback/refund transaction-order races. It **does not eliminate selective oracle withholding or sustained validator censorship before entropy is recorded**, nor does it prove unbiased outcomes conditional on successful delivery. This is an explicit availability/fairness tradeoff, not a claim of full compliance with the no-cancellation recommendation. Independent security review and real Sepolia exercises must assess it before Mainnet. The existing immutable proof-verifying coordinator and confirmation requirements remain unchanged.

## Verification

Verified locally on 2026-10-22:

| Check | Result |
| --- | --- |
| Full Solidity suite (`npm run contracts:test`) | 439 passed, including 31 V12 tests |
| Contract TypeScript/build | Passed |
| Protocol tooling/unit tests | 13 passed |
| Web tests | 290 passed; 3 database-dependent tests skipped |
| Web and Launch production builds | Passed |
| Visual source policy and fixture TypeScript | Passed |
| Targeted browser suites: V12 Launch, public protocol, current docs | 147 passed across Chromium, Firefox and WebKit |
| Diff whitespace | Passed |

Contract coverage includes every one of 1,000 full-price refunds after timeout; one-second-before/exact-cutoff boundaries; missing initial request; consumed-but-failed delivery; callback before/after a refund; pending VRF funding independent from refunds; no cancellation after recorded entropy even a year later; deferred equal affiliate claims; fully protected executor rewards; stale batch rollback; and an independent executor recovering its saved signed transaction without the operator key. All historical contract tests also pass.

Browser coverage includes all five layout widths for the main pages; deadline/refund states at 390/1440; timer zero requiring a fresh chain read; stale data; public executor wallet review; fixed operator authorization; exact combined operating funding; signature rejection without retry; and automated accessibility checks. Inspected the generated desktop deadline and mobile refund screenshots. The fixture uses a fixed clock and simulated RPC/wallet responses.

Screenshots: `test-results/v12-randomness-deadline-1440.png`, `test-results/v12-randomness-deadline-390.png`, `test-results/v12-draw-refunds-1440.png`, `test-results/v12-draw-refunds-390.png`. Logs: `/tmp/tincta-timeout-{all-contracts,contract-types,protocol,web-tests,launch-build,web-build,browser,source,types,exports}.log`.

New V12 exports: Round runtime 24,500 / initcode 28,234 bytes; Controller 11,248 / 36,974; Deployer 1,381 / 30,431. All respect EIP-170/EIP-3860. The round has only 76 bytes of runtime headroom; future changes must keep the size assertion. Only undeployed V12 exports were regenerated, including their fixed-policy source; historical exports were not rewritten.

Local mocks do not verify a live VRF proof, public deployment, connected production wallet, physical device or hosted executor. No public network was deployed, configured or signed; no database writes, X messages or Git publication occurred. The independent executor is included and locally exercised, not running on Mainnet/Sepolia. The Launch preview was rebuilt; without deployment pins it continues to truthfully show an unconnected catalog rather than simulated live money.

## Subsequent architecture review

The [security review](v12-architecture-security-review-2026-10-22.md) adds the mandatory Credits factory seal, checks the genesis exception against declared history, and hardens the executor watcher against competing finalizers and classified transport errors. These changes require fresh V12 deployment pins. The 72-hour outcome policy and 60/20/20 reserves are unchanged.
