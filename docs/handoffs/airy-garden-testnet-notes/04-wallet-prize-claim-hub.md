# Wallet prize claim hub

## Context and working boundaries

Work in `/Users/admin/Documents/workspace/manekineko` (Tincta). This spec comes from the user's first Airy Garden Sepolia run notes. This task produced documents only; observations below are user reports or explicitly identified code findings, not newly reproduced live bugs. Read root `AGENTS.md`, `docs/architecture.md`, `docs/permanent-combinations-v10.md`, applicable app `AGENTS.md`, and the local Next.js documentation before app changes. Preserve the existing visual language and unrelated uncommitted work.

The active two-collection automation is `79b44791-5787-4a26-90db-86a06a286a3b`; run `257c7ab9-9e56-4daf-b5db-917a05d15d1c`; chain `11155111`. Lunar Stone is collection `369e50fc-47f3-496f-938d-53e5ea0f9d02`, contract `0xaeCf42388f3Df8A92279d68065920745B73Ad728`. Satin Echo is `2a7d8825-da7d-42e6-92b4-f15a34d78e27`. Public app: `https://app.tincta.xyz`. Old ten-collection run `971a0f25-992c-4bde-ba50-c9afb9fe329d` is superseded history, never the recovery target.

Read `/Users/admin/Documents/workspace/manekineko/docs/airy-garden-first-collection-handoff-2026-09-27.md` for the incident evidence. At its recorded chain check, Lunar Stone had 1,000 mints, six revealed winners and zero claimed prizes. The pause was a 403 on Lunar Stone's first individual winner reply, after successful winner-root and results posts; no Satin Echo announcement was attempted. These are dated observations: recheck before operations.

Do not start workers, publish X posts, transfer funds, withdraw rewards, alter hosted secrets, rewrite prepared artifacts or reschedule deployed seasons under this document alone. Preserve private keys, encrypted wallet vaults and transaction journals. Test with isolated databases, never seed staging. Report source/tests, hosted behavior, connected-wallet behavior and canonical chain evidence separately. Deliver a scoped implementation, validation and operational handoff; do not claim untested boundaries are complete.

## User outcome

Add a public “Claim your prizes” page on `app.tincta.xyz`. After connecting a wallet, users should see prizes available to claim and prizes already claimed. Provide a clear path from navigation and sold-out collection results.

## Scope and requirements

- Discover candidate winning NFTs and claim history across supported indexed collections, then revalidate entitlement and claim state against canonical contract data before enabling actions. Avoid unbounded chain scans or suggesting zero prizes when indexing/RPC is unavailable.
- Prize entitlement follows the current winning NFT holder, not necessarily the minter or original winning wallet. Handle transferred winning NFTs and ownership changes before signing.
- Separate “Available to claim,” pending transaction, already claimed payment history and unavailable/stale data. Define claimed-history semantics explicitly: show connected-wallet payment receipts with transaction/recipient information, and identify already-paid winning NFTs currently held without attributing their past payouts to a new owner.
- Respect actual version-specific claim methods, rank, delay and reserve state. Current defaults have six winning NFTs, possibly fewer than six distinct wallets. Do not assume one prize per wallet or confuse prize claims with lifetime sponsored-NFT redemption.
- Support transaction confirmation, rejection, failure, refresh and network changes. Do not auto-submit wallet transactions. If batch claiming is offered, only use a genuinely supported contract path; otherwise make individual claims clear.
- Link to affiliate commissions on their existing journey; that implementation belongs to spec 02. Link collection details and canonical explorer receipts.
- Add accessible empty/loading/error states and compact ETH values consistent with Tincta. Mobile and disconnected-wallet behavior must work.

## Starting points and dependencies

`apps/web/app/`, `apps/web/components/affiliates/`, `apps/web/lib/affiliates/wallet-discovery.ts`, existing collection/NFT result readers, Web collection queries, indexed prize events and versioned ABIs. Inspect existing routes/claims before introducing a second inconsistent implementation.

Own the new claim feature, its discovery API/read models and wallet transaction UI. Coordinate navigation and mint-page entry points with spec 01; arrange any necessary indexer contract with that owner before migrations. Do not use test-managed private keys in the browser. No production fixture seeding.

## Acceptance

Verify disconnected/wrong chain, no prizes, one prize, several winning NFTs per wallet, transferred unclaimed NFT, transferred already-paid NFT, prior claims paid to another recipient, wallet switch, partial indexer results, pending and reverted transactions, and a successful supported claim flow. Validate claim totals against the chain and explain indexing delays. The prior run snapshot had six unclaimed prizes; recheck before using any live acceptance case and obtain the user's execution approval.
