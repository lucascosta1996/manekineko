# Affiliate enrollment and commission journey

## Context and working boundaries

Work in `/Users/admin/Documents/workspace/manekineko` (Tincta). This spec comes from the user's first Airy Garden Sepolia run notes. This task produced documents only; observations below are user reports or explicitly identified code findings, not newly reproduced live bugs. Read root `AGENTS.md`, `docs/architecture.md`, `docs/permanent-combinations-v10.md`, applicable app `AGENTS.md`, and the local Next.js documentation before app changes. Preserve the existing visual language and unrelated uncommitted work.

The active two-collection automation is `79b44791-5787-4a26-90db-86a06a286a3b`; run `257c7ab9-9e56-4daf-b5db-917a05d15d1c`; chain `11155111`. Lunar Stone is collection `369e50fc-47f3-496f-938d-53e5ea0f9d02`, contract `0xaeCf42388f3Df8A92279d68065920745B73Ad728`. Satin Echo is `2a7d8825-da7d-42e6-92b4-f15a34d78e27`. Public app: `https://app.tincta.xyz`. Old ten-collection run `971a0f25-992c-4bde-ba50-c9afb9fe329d` is superseded history, never the recovery target.

Read `/Users/admin/Documents/workspace/manekineko/docs/airy-garden-first-collection-handoff-2026-09-27.md` for the incident evidence. At its recorded chain check, Lunar Stone had 1,000 mints, six revealed winners and zero claimed prizes. The pause was a 403 on Lunar Stone's first individual winner reply, after successful winner-root and results posts; no Satin Echo announcement was attempted. These are dated observations: recheck before operations.

Do not start workers, publish X posts, transfer funds, withdraw rewards, alter hosted secrets, rewrite prepared artifacts or reschedule deployed seasons under this document alone. Preserve private keys, encrypted wallet vaults and transaction journals. Test with isolated databases, never seed staging. Report source/tests, hosted behavior, connected-wallet behavior and canonical chain evidence separately. Deliver a scoped implementation, validation and operational handoff; do not claim untested boundaries are complete.

## User outcomes

The user could not enroll, saw a disabled button and “Automated enrollment is not configured for this deployment yet,” and therefore could not test commission claims. They also saw a qualifying-NFT prompt on what they considered the first collection. Make this journey functional and explain its current availability clearly.

## Investigation and requirements

- Reproduce the hosted connected-wallet flow using the intended Sepolia domain. Trace database enrollment-enabled state, pinned signer, server signer configuration, allowed origin, Turnstile hostname/configuration, enrollment windows, canonical chain state and wallet eligibility. Diagnose the actual reason before assuming it is only a closed window.
- Separate “opens in,” “open until,” closed/full, wallet-ineligible, wrong-network, backend-unavailable and transaction-pending states. Add distinct affiliate timers using the lifecycle contract owned by spec 01. Show a concise user-facing unavailable message; preserve useful structured operator diagnostics instead of exposing implementation jargon publicly.
- Verify the actual Eligibility V5 bootstrap authority for this deployed collection. First in a season does not automatically mean bootstrap: this environment has historical V8 collections and migrated registry lineage. The UI already has a bootstrap branch labeled “First collection · no NFT required”; find whether the registry says false, the response is wrong, or the branch is not reached.
- If canonical bootstrap applies, require no source NFT and make that explicit. Otherwise explain the actual qualifying NFT requirement, preferably discover eligible NFTs after wallet connection rather than forcing manual address/token input. Never bypass registry eligibility because the user calls it the first season, and never reset historic eligibility authority to fabricate a bootstrap.
- Once supported, validate enrollment, paid referral mint, the one-paid-referral qualification threshold, equal-pool entitlement, applicable payout cap and claim behavior. Enrolled and qualified are different states; expose both accurately.
- Do not conflate unavailable enrollment with unallocated affiliate money. The reserve/treasury treatment belongs to spec 03.

## Starting points

`apps/web/lib/affiliates/{service,enrollment,enrollment-window,eligibility-wallet,eligibility-chain,eligibility-repository,wallet-discovery,policy}.ts`, `apps/web/components/affiliates/affiliate-experience.tsx`, affiliate API routes, `apps/contracts/contracts/ManekinekoAffiliateEligibilityV5.sol` (confirm exact filename), registration and registry verification in `scripts/season-runner/`.

`service.ts` derives enrollment availability from saved enablement and configured signer; `affiliate-experience.tsx` already distinguishes bootstrap. Use those boundaries to find the mismatch. Never print signing keys or wallet signatures in diagnostics.

## Acceptance and ownership

Own the affiliate page, enrollment API and eligibility diagnostics; coordinate shared status fields with spec 01 and test-wallet referral scenarios with spec 06. Verify correct bootstrap/non-bootstrap UX, before/open/after-window behavior, wrong chain, source NFT ownership changes, duplicate challenge/replay rejection, challenge expiry, origin and bot checks, successful enrollment and referral qualification. Complete hosted and connected-wallet checks separately from unit tests. Leave a concrete test recipe for commission claiming; do not claim success from the previous all-direct-mint rehearsal.
