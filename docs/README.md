# Tincta documentation

The latest local protocol implementation is **V13**, pending public deployment. Start with [architecture](architecture.md) and [season holder rewards V13](season-holder-rewards-v13.md). Existing contracts retain their original versions and rules; source changes do not upgrade them.

## Current guides

- [V13 allocations, dynamic season amounts and holder claims](season-holder-rewards-v13.md): 60/20/8/12, first-5% coverage, settlement unlock, current-owner claims and verification boundaries
- [V12 governance](deadline-governance-v12.md): inherited voting, deadlines, mint limits and refunds; its 60/20/20 allocation applies only to V12
- [Versioned contract behavior](contracts.md) and [permanent NFT identity](permanent-combinations-v10.md)
- Participant guides are authored in [Web documentation content](../apps/web/lib/docs/content.ts) and served at `/docs`, including `/docs/holder-rewards`.
- [Shared Web wallet](web-wallet-integration.md): Reown configuration, header account controls, session safety and verification boundaries
- [Git deployments](git-deployments.md): application releases are separate from public-chain deployment
- [Brand and artwork](brand/tincta/README.md)
- [Cross-app visual identity standard](design/visual-identity.md), [reusable UI prompt](design/agent-prompt.md), [quality gates](design/quality-gates.md) and [adoption audit](design/adoption-audit.md)

## Historical subsystem guides

These preserve their named versions and operational evidence. They do not describe a completed V13 rollout.

- [Season execution](season-automation.md) and [social automation](season-social-automation.md)
- [Launch console](launch-console.md), [seasons](seasons.md) and [Sepolia mock catalog](sepolia-mock-seasons.md)
- [Automatic indexing](automatic-indexing.md)
- [Randomness](blockchain-randomness.md) and [winner uniqueness](unique-winner.md)

Subsystem documents may contain dated implementation sections. Use the current architecture, exact versioned source and immutable deployed terms when those sections differ. Do not apply V12 treasury percentages or historical affiliate formulas to V13.

## Dated deployment and recovery evidence

- [Latest Airy Garden reconciliation, 2026-09-27](handoffs/bots-run-notes-2-ultra-implementation-2026-09-27.md): both V10 collections completed and all six prizes per collection paid at the recorded block; this is not a fresh live check.
- [V10 registry and factory readiness, 2026-09-25](sepolia-v10-readiness-2026-09-25.md)
- [V10 application release, 2026-09-22](staging-v10-release.md)
- [Airy Garden recovery](airy-garden-live-recovery.md) and [incident investigation](airy-garden-first-collection-handoff-2026-09-27.md)
- [Earlier registry setup](sepolia-v9-registry-setup.md) and [unused V8 retirement](unactivated-v8-retirement.md): retained dependency lineage and executed operations.

Superseded V1–V9 deployment guides, V7–V9 implementation guides and V5/V8 test plans have been deleted. Git history retains them if a version-specific investigation needs them. Historical accounting, executed deployment records and incident evidence remain where they explain preserved contracts, claims or V10 dependencies. Older version numbers on Eligibility and Winner Credits are independent subsystem versions, not obsolete protocol guides.
