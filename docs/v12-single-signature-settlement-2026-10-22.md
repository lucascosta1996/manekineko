# V12 single-signature settlement

**Subsequent policy update:** [72-hour randomness timeout and funded execution](v12-draw-failure-policy-2026-10-22.md) supersedes this record’s no-timeout/affiliate-vesting/timer behavior and adds 0.01 ETH to preparation costs. Earlier test counts below describe their original revision.

Local implementation, 2026-10-22. This refines the undeployed V12 source and Launch dashboard. No existing deployment, frozen catalog, Mainnet setting, saved draft or user wallet was changed.

## One ordinary transaction between collections

After the single VRF callback supplies verified randomness, Launch offers **Settle & prepare next collection**. The fixed operator signs one transaction to the season controller:

```solidity
settleAndPrepare(uint256 expectedRoundId, uint256 expectedOperatorProceeds)
```

The function performs these steps atomically:

1. Verify the sealed catalog, latest expected collection, operator caller and exact separate operating-fund top-up.
2. If necessary, finalize the existing bounded deterministic draw using its original VRF word and counter.
3. Verify that the remaining ordinary operator allocation matches the reviewed amount, then pay it to the immutable operator wallet.
4. Prepare/fund/register the next catalog collection and publish its voting schedule. On the final catalog collection, settle without creating another.

Any failure reverts the complete transaction, including payout and finalization. Stale collection IDs, changed proceeds and incorrect top-ups fail closed. The exact funding shortfall can be attached as `msg.value`; this is separate operating ETH, not a deduction from protected mint liabilities or a change to the 20% allocation. If the controller is already funded, `msg.value` is zero.

The round's narrow `withdrawOperatorToOperator()` method accepts only its immutable voting controller. It can transfer only the existing `operatorWithdrawable()` amount to the fixed operator. It has no arbitrary recipient, arbitrary target, allowance or access to prize, affiliate, refund, growth, VRF or sponsorship reserves. The controller's batch method is operator-only and both contracts retain reentrancy protection.

`prepareNext()` remains permissionless and now accepts operating ETH in the same transaction. This also gives the first collection or an unsold rollover a single preparation/funding transaction. Individual finalization, ordinary withdrawal and preparation remain available; the batch does not become an exclusive operator gate. Optional unused-fund recoveries remain separate transactions under their original rules.

## Bounded draw processing

The winner algorithm and its eight-attempt bound are unchanged. `canFinalizeDraw()` previews whether the next bounded batch can finish. If it cannot, Launch offers **Advance draw processing** before settlement. A direct batch that cannot finalize reverts with `DrawNeedsProgress`; the permissionless standalone `finalizeDraw(8)` persists progress instead. No randomness is replaced or rerolled.

Thus one signature covers the ordinary funded settlement after VRF is ready. It is not a promise that a failed VRF request, incomplete draw batch, rejected transaction or optional fund recovery never needs another transaction. The initial catalog deployment/sealing is also separate setup work.

## Counter and refund semantics

The signing dashboard now shows the selected collection's timing next to its pending actions:

| Verified phase | Display |
| --- | --- |
| Before voting | Countdown to voting start |
| Voting | Countdown to the deadline that opens minting |
| Minting | Countdown to the mint deadline; explains the unsold refund condition |
| Sold out / waiting for VRF / finalizing / prizes | Elapsed time since sellout; **refunds unavailable** |
| Unsold and expired | Elapsed time since refunds became available |
| Stale or failed network read | Unavailable timing and disabled signing |

**A sold-out collection has no draw-finalization deadline that enables refunds.** Refunds require an unsold collection at its immutable mint deadline. Delayed finalization delays prize claims and next preparation, while reserves remain protected. Browser time alone cannot declare refunds: when a cached mint countdown reaches zero, the page says it is checking chain state until a fresh read confirms the outcome.

The display estimates elapsed seconds from a verified block and refreshes every second. It does not schedule or authorize transactions. The counter uses `role="timer"` without announcing every tick to screen readers.

## Verification and rollout boundary

- Full contract suite: **431 passed**, including **23 V12 tests**.
- V12 batch cases cover unchanged winners/metadata, three qualified affiliates' reserved entitlements, exact 20% payout, prior NFT voting eligibility, settlement after the original mint deadline, pre-VRF and live-sale rejection, unauthorized calls, stale IDs/amounts, exact top-ups, full rollback on next-deployment failure, bounded-progress fallback, partial prior withdrawals, unsold rollover, crossing seasons and final-catalog settlement.
- Protocol/operator/timing tests: **12 passed**. Timer tests prove zero on a cached countdown does not invent refunds and sold-out phases never acquire a refund deadline.
- Web unit tests: **290 passed**, three database-dependent skips. UI source and TypeScript checks passed. Launch and Web production builds passed locally.
- Full browser suite: **345 passed, six intentional Studio viewport/browser skips** across Chromium, Firefox and WebKit; this includes **48 Launch checks**. Intercepted RPC and wallet providers verify a single reviewed `settleAndPrepare` request, exact proceeds/top-up, wrong-wallet blocking, rejection without retries, stale counters, deadline-zero handling, bounded fallback, responsive layout and accessibility. Desktop/mobile settlement screenshots were visually inspected. These checks do not establish actual wallet or live VRF operation.

Only the V12 round/controller/deployer ABI and source exports were regenerated. Runtime/creation sizes remain within EVM limits: round 22,527 / 26,219 bytes; controller 10,810 / 36,536 bytes; deployer 1,381 / 28,416 bytes. Historical exports and algorithms retain their versioned behavior.

Updated V12 bytecode requires new independently verified deployment/runtime pins before use. No chain deployment, hosted update, signature, X publication or database mutation occurred. Catalog identity reconciliation and a live Sepolia rehearsal remain separate rollout work.
