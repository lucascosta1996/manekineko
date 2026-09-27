# Launch active/upcoming views and duration policy

## Context and working boundaries

Work in `/Users/admin/Documents/workspace/manekineko` (Tincta). This spec comes from the user's first Airy Garden Sepolia run notes. This task produced documents only; observations below are user reports or explicitly identified code findings, not newly reproduced live bugs. Read root `AGENTS.md`, `docs/architecture.md`, `docs/permanent-combinations-v10.md`, applicable app `AGENTS.md`, and the local Next.js documentation before app changes. Preserve the existing visual language and unrelated uncommitted work.

The active two-collection automation is `79b44791-5787-4a26-90db-86a06a286a3b`; run `257c7ab9-9e56-4daf-b5db-917a05d15d1c`; chain `11155111`. Lunar Stone is collection `369e50fc-47f3-496f-938d-53e5ea0f9d02`, contract `0xaeCf42388f3Df8A92279d68065920745B73Ad728`. Satin Echo is `2a7d8825-da7d-42e6-92b4-f15a34d78e27`. Public app: `https://app.tincta.xyz`. Old ten-collection run `971a0f25-992c-4bde-ba50-c9afb9fe329d` is superseded history, never the recovery target.

Read `/Users/admin/Documents/workspace/manekineko/docs/airy-garden-first-collection-handoff-2026-09-27.md` for the incident evidence. At its recorded chain check, Lunar Stone had 1,000 mints, six revealed winners and zero claimed prizes. The pause was a 403 on Lunar Stone's first individual winner reply, after successful winner-root and results posts; no Satin Echo announcement was attempted. These are dated observations: recheck before operations.

Do not start workers, publish X posts, transfer funds, withdraw rewards, alter hosted secrets, rewrite prepared artifacts or reschedule deployed seasons under this document alone. Preserve private keys, encrypted wallet vaults and transaction journals. Test with isolated databases, never seed staging. Report source/tests, hosted behavior, connected-wallet behavior and canonical chain evidence separately. Deliver a scoped implementation, validation and operational handoff; do not claim untested boundaries are complete.

## User outcomes

Add Launch pages “Active collection” and “Upcoming collection”; make the intended season easy to find; use a 24-hour standard mint window and never allow ordinary new mint windows longer than one day.

## Scope and requirements

- Inspect existing navigation, runtime and earnings surfaces before adding pages. Active/upcoming views must derive from the selected network's canonical/indexed lifecycle and frozen runtime plan, not only the first saved draft or newest database row.
- Show collection identity, protocol/network, planned enrollment/mint times, deployment/activation state, verification status, sold-out/draw progress, relevant explorer links, last observed time, and actionable errors. Link to the underlying season and public page. Integrate treasury data from spec 03 rather than recomputing balances.
- Use the shared live badge and restrained reduced-motion-aware animation from spec 01 so Launch and public applications remain consistent.
- Handle no active mint, paused season, undeployed upcoming collection, missed opening, several historical collections and incomplete/stale observations. A revealed collection with unpaid prizes remains discoverable even when no mint is active.
- The user reported the two-collection Airy Garden disappeared. An ordering fix was already deployed: replacement drafts inherit catalog position from the same chain/season identity. It appears first, while the frozen ten-collection record remains. Reproduce current behavior; investigate filtering/pagination/cache/network selection before claiming it is fixed again. Make superseded prepared history unmistakable and avoid accidental old-run resume without deleting audit records.
- For newly editable ordinary plans, set the default mint duration to **24 hours** and validate a **24-hour maximum** in all applicable creation/edit/preparation paths, including automated imports/runner tooling. Explain whether the deadline is measured from scheduled opening versus deployment for each contract version. Maintain correct timezone handling.
- Existing deployed/prepared artifacts retain their actual deadlines. Lunar Stone's saved public projection showed a 30-day deadline; do not rewrite it to satisfy the new default.
- The user separately requests a **30-minute Sepolia refund rehearsal**. Treat that as an explicit test-only exception to the ordinary default, not a Mainnet default. Current `season-timeline.ts` enforces at least 3,600 seconds; investigate shared config and Solidity limits as well. Agree the narrow chain-pinned exception or versioned test path with spec 06. If it cannot safely use current contracts, present that limitation; do not silently substitute 60 minutes or weaken Mainnet validation.

## Starting points and ownership

`apps/launch/lib/{launch-navigation,launch-automation-store,season-runtime-store,season-timeline,launch-config-validation}.ts`, `apps/launch/components/automations/`, `apps/launch/components/launch/form-values.ts`, earnings UI, shared config/defaults, `scripts/create-sepolia-mock-seasons.mjs`, and preparation code.

Own Launch routes/navigation and ordinary duration validation. Coordinate shared summaries with spec 01, balances/verification with spec 03, and exception enforcement with spec 06. Do not make unrelated credential/hosting changes while adding pages; the earlier incident handoff separately tracks those issues.

## Acceptance

Verify default 86,400 seconds, rejection above 86,400 for editable ordinary plans through UI and API, preserved historical exports/deadlines, network isolation, list ordering/pagination, active/upcoming/paused/missed-window states, and authenticated hosted output. Test the scoped 1,800-second rehearsal exception separately from Mainnet rejection. Deployment and hosted configuration need explicit destination-scoped review; keep credentials private.
