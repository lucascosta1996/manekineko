# Next Sepolia rehearsal and recovery integration

## Context and working boundaries

Work in `/Users/admin/Documents/workspace/manekineko` (Tincta). This spec comes from the user's first Airy Garden Sepolia run notes. This task produced documents only; observations below are user reports or explicitly identified code findings, not newly reproduced live bugs. Read root `AGENTS.md`, `docs/architecture.md`, `docs/permanent-combinations-v10.md`, applicable app `AGENTS.md`, and the local Next.js documentation before app changes. Preserve the existing visual language and unrelated uncommitted work.

The active two-collection automation is `79b44791-5787-4a26-90db-86a06a286a3b`; run `257c7ab9-9e56-4daf-b5db-917a05d15d1c`; chain `11155111`. Lunar Stone is collection `369e50fc-47f3-496f-938d-53e5ea0f9d02`, contract `0xaeCf42388f3Df8A92279d68065920745B73Ad728`. Satin Echo is `2a7d8825-da7d-42e6-92b4-f15a34d78e27`. Public app: `https://app.tincta.xyz`. Old ten-collection run `971a0f25-992c-4bde-ba50-c9afb9fe329d` is superseded history, never the recovery target.

Read `/Users/admin/Documents/workspace/manekineko/docs/airy-garden-first-collection-handoff-2026-09-27.md` for the incident evidence. At its recorded chain check, Lunar Stone had 1,000 mints, six revealed winners and zero claimed prizes. The pause was a 403 on Lunar Stone's first individual winner reply, after successful winner-root and results posts; no Satin Echo announcement was attempted. These are dated observations: recheck before operations.

Do not start workers, publish X posts, transfer funds, withdraw rewards, alter hosted secrets, rewrite prepared artifacts or reschedule deployed seasons under this document alone. Preserve private keys, encrypted wallet vaults and transaction journals. Test with isolated databases, never seed staging. Report source/tests, hosted behavior, connected-wallet behavior and canonical chain evidence separately. Deliver a scoped implementation, validation and operational handoff; do not claim untested boundaries are complete.

## User outcomes

The next run must intentionally test an unsold collection: a **30-minute mint window, only three NFTs minted, then refunds**. It must also exercise real affiliate enrollment, qualification and commission claiming, which the initial all-direct-mint rehearsal did not cover. Keep the existing X incident and missed schedule recovery as a separate workstream using the earlier handoff.

## Recovery prerequisites

Read the incident handoff first. The recorded 403 occurred at Lunar Stone's `winners-revealed:winner:1` after root/results success; it was not a second-collection post. Preserve confirmed post IDs, all actions and signed journals. Diagnose using bounded safe error diagnostics; no broad raw-response logging, duplicate-post retries or speculative credential rotations. Never infer rate-limit/billing causes from status alone. The user's note says “0.22 cents” spent against a $15 top-up; units and actual billing were not independently verified. Earlier estimated posting cost was not a bill.

The fixed second schedule derived from sellout was announcement 01:08:24, enrollment 01:23:24, mint 01:38:24 UTC on September 27. It now requires fresh review, not a date edit or blind resume. No execution is authorized by this documentation task.

## Rehearsal design

- Create an explicit Sepolia-only scenario manifest with a bounded mint target of **3**, deadline duration **1,800 seconds**, spending limits and expected terminal outcome `unsold/refundable`. Keep supply greater than 3 so the scenario cannot accidentally sell out.
- Confirm semantics: the requested 30 minutes is the mint sale window, with enough independent deployment/enrollment lead. Do not shorten enrollment or silently anchor the timer to the wrong event.
- Coordinate with spec 05: current season timeline minimum is one hour. Inspect contract/shared-validator minimums and implement only a documented chain-pinned test exception or clearly versioned compatible test contract. Mainnet must never import rehearsal wallet generation or this exception. Do not fake readiness, mutate a deployed deadline or present a local time-warp test as a real 30-minute Sepolia run.
- Stop automated purchases at exactly 3 confirmed primary mints, including restart behavior. Avoid duplicate transactions; reuse saved journals and encrypted managed-wallet state. Decide deliberately which controlled recipients receive them and preserve a manifest for refund verification.
- At expiry verify no sellout draw/winners, the actual supported cancellation/refund transition, refund amounts, NFT burn behavior, remaining liabilities, no affiliate entitlement on an unsold expiry, and termination of later collections in that failed factory sequence. Use the genuine contract semantics rather than assuming every expiry requires the same transaction.
- Keep successful affiliate-commission testing in a separate sellout scenario: enroll at least one genuinely eligible affiliate, mint a qualifying paid referral, verify pool/cap allocation, then claim. Three unsold tickets cannot prove sellout commission distribution. Coordinate bootstrap versus historical NFT eligibility with spec 02.
- Include winner prize claims, growth reserve/treasury recycling and sponsored-credit behavior as separately identified cases; do not claim all are covered just because sellout or refund succeeded.
- Validate public status/countdowns/results, wallet claim pages, Launch active/upcoming views, source verification and expected social events using specs 01–05. Keep required launch announcements distinct from supplemental winner/payment replies. Recovery design must not let a noncritical social failure starve canonical updates or authorized claims, or silently weaken launch gates.

## Starting points and acceptance

Own rehearsal scenario controls, test manifests, integration acceptance and coordination with the existing recovery workstream. Starting points: `scripts/season-runner/{sepolia,sepolia-wallets,runner,prepare-sepolia,outbox,social,store,logging}.ts`, `apps/launch/lib/season-timeline.ts`, existing isolated worker tests and `docs/airy-garden-v10-runbook.md`.

Acceptance: dry-run report explicitly says 3 tickets / 30-minute Sepolia unsold test; correct chain and exact scenario are pinned; no more than three confirmed mints on restart; all three refund rights and subsequent receipts/burns are reconciled; no next-collection launch follows unsold termination; no unauthorized X post or fund movement occurs in tests. Publish sanitized run IDs, expected-versus-observed event checklist, transaction receipts and post IDs for later analysis. Separate local simulation, testnet execution and UI verification.
