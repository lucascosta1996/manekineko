# Public lifecycle, countdowns and presentation

## Context and working boundaries

Work in `/Users/admin/Documents/workspace/manekineko` (Tincta). This spec comes from the user's first Airy Garden Sepolia run notes. This task produced documents only; observations below are user reports or explicitly identified code findings, not newly reproduced live bugs. Read root `AGENTS.md`, `docs/architecture.md`, `docs/permanent-combinations-v10.md`, applicable app `AGENTS.md`, and the local Next.js documentation before app changes. Preserve the existing visual language and unrelated uncommitted work.

The active two-collection automation is `79b44791-5787-4a26-90db-86a06a286a3b`; run `257c7ab9-9e56-4daf-b5db-917a05d15d1c`; chain `11155111`. Lunar Stone is collection `369e50fc-47f3-496f-938d-53e5ea0f9d02`, contract `0xaeCf42388f3Df8A92279d68065920745B73Ad728`. Satin Echo is `2a7d8825-da7d-42e6-92b4-f15a34d78e27`. Public app: `https://app.tincta.xyz`. Old ten-collection run `971a0f25-992c-4bde-ba50-c9afb9fe329d` is superseded history, never the recovery target.

Read `/Users/admin/Documents/workspace/manekineko/docs/airy-garden-first-collection-handoff-2026-09-27.md` for the incident evidence. At its recorded chain check, Lunar Stone had 1,000 mints, six revealed winners and zero claimed prizes. The pause was a 403 on Lunar Stone's first individual winner reply, after successful winner-root and results posts; no Satin Echo announcement was attempted. These are dated observations: recheck before operations.

Do not start workers, publish X posts, transfer funds, withdraw rewards, alter hosted secrets, rewrite prepared artifacts or reschedule deployed seasons under this document alone. Preserve private keys, encrypted wallet vaults and transaction journals. Test with isolated databases, never seed staging. Report source/tests, hosted behavior, connected-wallet behavior and canonical chain evidence separately. Deliver a scoped implementation, validation and operational handoff; do not claim untested boundaries are complete.

## User outcomes

A visitor should understand what happens next before deployment, throughout enrollment/minting, after sellout, and during the draw. Compact the mint page; make the current primary action obvious.

## Scope and requirements

- Keep the announced fixed mint time visible before deployment/funding finishes. Show a countdown to a known scheduled time, alongside an honest readiness/freshness label. Preserve the safety rule that a clock reaching zero does not prove mint activation. Distinguish unknown schedule from stale execution observations; do not remove stale-state protection just to keep a timer visible.
- Show separate affiliate enrollment opening/closing and mint opening times. They are not simultaneous: this run had 15 minutes of enrollment before mint opening. The affiliate task owns its detailed page implementation; agree on a shared lifecycle view model first.
- Replace the generic “No collection is minting right now” message with upcoming-collection context and a link/countdown when a confirmed schedule exists.
- Distinguish deployment pending, deployed but awaiting activation, active mint, sellout awaiting randomness request, randomness requested/waiting for fulfillment, randomness received/awaiting finalization, and results ready. Only say “Contract deployment in progress” when deployment is actually pending. The user's suggested wording must not falsely describe activation as deployment.
- After sellout, replace the purchase-first layout with results/draw progress and prize/affiliate claim entry points. Remove the generic unavailable-mint message from this state. Explain Chainlink VRF in plain language: the external verifiable randomness service used by the draw. Show known transaction links, request/fulfillment/finalization timestamps and last checked time; separate unknown/stale data from pending chain work. Do not invent ETA, percentage progress, or a Chainlink failure from elapsed time alone.
- Give “Mint open” a clearer visual style. Add restrained live/loading animation consistent across public surfaces, respecting reduced motion and accessible status announcements.
- Landing hero must show the current live collection or the next confirmed scheduled collection and countdown. It must consume live runtime/indexer data with a clear stale/no-data fallback, not a hardcoded catalog preview.
- Compact mint details and the lengthy wallet-cap warning. Suggested short copy: “Up to 20 mints per wallet.” Keep remaining allowance visible and explain shared paid/referral/sponsored accounting and non-resetting transfers in expandable help; do not remove the cap itself.
- Remove the requested “permanent edition numbers fixed at mint” explanatory labels wherever they are ordinary UI copy. Inventory exact strings first. `ManekinekoRendererV10.sol` embeds “Numbers fixed at mint” in generated NFT artwork: an existing immutable NFT cannot be rewritten by a web-copy edit. Document that limit and coordinate any future renderer/version work with spec 03; preserve actual permanent number identity and verification information.

## Starting points

`apps/web/lib/seasons/{schedule,activity}.ts`, `apps/web/lib/collections/presentation.ts`, `apps/web/components/seasons-experience.tsx`, `apps/web/components/affiliates/affiliate-mint-panel.tsx`, `apps/web/app/mint/[collectionId]/`, `apps/web/test/{season-schedule,collection-activity}.test.ts`, `apps/landing-page`, and `apps/contracts/contracts/ManekinekoRendererV10.sol`.

The code currently suppresses season countdowns when the projection is over 180 seconds old. Investigate why publication/update timing leaves a scheduled-but-not-yet-deployed season without useful countdown data. The incident handoff also shows the projection lagging draw state after the X exception; coordinate with the recovery owner rather than patching public data independently.

## Acceptance and ownership

Own public lifecycle/read models and public/landing presentation, not enrollment signing, withdrawal logic, worker recovery, or Launch navigation. Coordinate mint-page claim links with spec 04. Verify pre-deploy, stale, enrollment, active, sold-out/draw stages, revealed/claimed, unsold/refund and empty states; include responsive and reduced-motion checks. A scheduled countdown must never enable minting without canonical activation. Record data-source and cache/freshness behavior for landing and web.
