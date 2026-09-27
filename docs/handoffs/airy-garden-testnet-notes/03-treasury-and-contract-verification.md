# Treasury accounting, contract verification and immutable artifacts

## Context and working boundaries

Work in `/Users/admin/Documents/workspace/manekineko` (Tincta). This spec comes from the user's first Airy Garden Sepolia run notes. This task produced documents only; observations below are user reports or explicitly identified code findings, not newly reproduced live bugs. Read root `AGENTS.md`, `docs/architecture.md`, `docs/permanent-combinations-v10.md`, applicable app `AGENTS.md`, and the local Next.js documentation before app changes. Preserve the existing visual language and unrelated uncommitted work.

The active two-collection automation is `79b44791-5787-4a26-90db-86a06a286a3b`; run `257c7ab9-9e56-4daf-b5db-917a05d15d1c`; chain `11155111`. Lunar Stone is collection `369e50fc-47f3-496f-938d-53e5ea0f9d02`, contract `0xaeCf42388f3Df8A92279d68065920745B73Ad728`. Satin Echo is `2a7d8825-da7d-42e6-92b4-f15a34d78e27`. Public app: `https://app.tincta.xyz`. Old ten-collection run `971a0f25-992c-4bde-ba50-c9afb9fe329d` is superseded history, never the recovery target.

Read `/Users/admin/Documents/workspace/manekineko/docs/airy-garden-first-collection-handoff-2026-09-27.md` for the incident evidence. At its recorded chain check, Lunar Stone had 1,000 mints, six revealed winners and zero claimed prizes. The pause was a 403 on Lunar Stone's first individual winner reply, after successful winner-root and results posts; no Satin Echo announcement was attempted. These are dated observations: recheck before operations.

Do not start workers, publish X posts, transfer funds, withdraw rewards, alter hosted secrets, rewrite prepared artifacts or reschedule deployed seasons under this document alone. Preserve private keys, encrypted wallet vaults and transaction journals. Test with isolated databases, never seed staging. Report source/tests, hosted behavior, connected-wallet behavior and canonical chain evidence separately. Deliver a scoped implementation, validation and operational handoff; do not claim untested boundaries are complete.

## User outcomes and important code finding

The user saw 2 ETH available to the creator, 6 ETH for prizes and feared the other 2 ETH was lost because no affiliates enrolled. They want unused affiliate allocation available to the operator, with an option to fund a larger future prize, and want verified contracts automatically after deployment.

**Current V10 source already provides this separation:** `unallocatedAffiliatePool()` returns unallocated affiliate budget; `growthReserveBalance()` tracks the remaining reserve; `withdrawGrowthReserve(recipient, amount)` is owner-only and available after reveal. `withdrawableBalance()` deliberately excludes this reserve and prize/affiliate liabilities. The apparent missing 2 ETH must first be checked against this existing reserve mechanism, not treated as proven loss or justification to relax protections.

## Treasury work

- Read canonical owner, runtime identity, revenue, qualified count, accrued/claimed affiliate amounts, growth reserve/withdrawals, prize liabilities, ordinary withdrawable balance and actual contract balance. Reconcile with the Launch earnings view and runner recycling journal. Report values at a named block.
- Show “Creator earnings” and “Unallocated affiliate funds / growth reserve” separately, with accurate ownership and availability. Present total accessible operator funds without double counting or treating outstanding prizes/affiliate entitlements as revenue.
- Document the existing explicit owner withdrawal route and how withdrawn funds could sponsor a future collection through a separately reviewed operation. A larger future prize is a future configuration decision, not an automatic rewrite of current economics.
- Handle zero enrollment, enrolled-but-zero-qualified, payout-cap leftovers and rounding, partially claimed affiliate rewards, unsold refunds, and prior growth withdrawals. Never move accrued affiliate entitlements to the operator.
- No automatic withdrawal or on-chain change is authorized by this spec. If source already meets the policy, fix tooling/UI/docs rather than creating a new contract version.

## Explorer verification work

- Confirm and document the deployed architecture: worker uses version-pinned Factory, Deployer, Round and Renderer contracts; do not describe it as clones without verifying bytecode/design.
- Reconstruct exact build inputs, compiler/settings, libraries, constructor arguments and deployed bytecode for Lunar Stone and its dependencies from trusted artifacts and private journals. Submit verification only when authorized in the implementation task; report the explorer's verified state, not merely successful submission.
- Add idempotent automatic verification to deployment tooling with durable pending/verified/failed status and bounded retries. Explorer outages must not trigger duplicate contract deployment. Decide explicitly whether verification gates public launch and how that interacts with fixed opening windows.
- Provide explorer links and a clear operator retry path. Source verification improves inspection and explorer interaction; it does not technically enable contract withdrawals. A correctly implemented app can call an unverified contract. Do not tell users funds are inaccessible merely because the explorer lacks source.
- The public UI request to remove embedded NFT wording reaches immutable renderer code. Existing frozen exports and deployed token metadata must stay intact. Any prospective renderer change needs exact new runtime artifacts, verification pins/version strategy, and clear separation from old deployments; no silent relabeling of V10 bytecode.

## Starting points and acceptance

`apps/contracts/contracts/ManekinekoRoundV10.sol`, V10 Factory/Deployer/Renderer sources, `apps/contracts/scripts/deploy-v10.ts`, deployment journal helpers, `scripts/season-runner/{chain,chain-setup,chain-transactions}.ts`, `apps/launch/lib/{creator-earnings,creator-earnings-store}.ts`, and `apps/launch/components/earnings/creator-earnings.tsx`.

Own treasury accounting, verification tooling and any future immutable-artifact proposal. Coordinate display data with spec 05 and rehearsal settlement with spec 06. Acceptance: every wei category reconciles; protected liabilities remain protected; repeat verification does not redeploy; explorer verified links match actual addresses. Record code findings separately from live balances, approved withdrawals and verified explorer results.
