# Agent entry point

Read [docs/architecture.md](docs/architecture.md) before changing protocol behavior. It is the current architecture and handoff guide, including a dated deployment snapshot, code map, invariants, known gaps and verification boundaries. Follow applicable `apps/*/AGENTS.md` instructions for app work too.

## Visual identity and UI acceptance

Before frontend work, read [the cross-app visual standard](docs/design/visual-identity.md) and [its quality gates](docs/design/quality-gates.md). They govern Landing, Web/docs, Launch and `packages/ui`, including first paint, loading, error, retry and footer states. Use the [reusable agent prompt](docs/design/agent-prompt.md) for scoped UI tasks and check the [adoption audit](docs/design/adoption-audit.md) for known gaps. Preserve the approved Tincta identity, use shared tokens/components and verify final rendered behavior. A build alone is not visual acceptance; the documented browser/CI pipeline must not be reported as installed or passed until it actually exists and runs.

## Current baseline

- Public brand: **Tincta**. Internal `manekineko` names remain intentional.
- Local integration baseline: **V10** (`affiliate-v10`), draw algorithm **`unique-rank-v6`**, Eligibility **V5**, Winner Credits **V6**. It gives each minted NFT a permanent Solidity-generated four-number identity; one post-sellout VRF draw still assigns scores and winners. Read [docs/permanent-combinations-v10.md](docs/permanent-combinations-v10.md) before changing or operating it.
- Web/Launch/indexer/season-worker, preparation and deployment tooling support **V10**. New editable defaults and `launch:prepare:current` target V10; explicit V9 tooling and immutable V8/V9 exports retain their actual versions. Migration **026** adds V10 without rewriting rows or artifacts. Migrations 025/026 and Web/Launch/Indexer were deployed to staging on 2026-09-22 UTC; read `docs/staging-v10-release.md`. Eligibility V5, Winner Credits V6 and the V10 Sepolia factory were deployed and verified on 2026-09-25; read `docs/sepolia-v10-readiness-2026-09-25.md`. V10 collection deployment, worker activation and the live rehearsal remain pending until the user starts the run.
- Default collection: 1,000 tickets, 0.01 ETH, six equal prizes, qualified equal affiliate pool, one paid referral to qualify, and V9's fixed cumulative 20 primary mints per recipient. Read the actual frozen terms for every existing collection.
- Prize claims belong to the winning NFT holder. Lifetime sponsored reward is one redeemed NFT per wallet, not per win. Preserve financial reserves and version-specific historical behavior.
- V10 numbers identify the token, not its final score. They are predictable, unique within the collection and fixed before VRF; buyers pass no numbers/seed to any mint function. Final scores and winning status remain contract state and are deliberately absent from permanent NFT metadata/SVG. Default six winners is still a configurable 1–10 distinct NFTs, not necessarily six wallets.
- The 22 catalog seasons / 216 collection drafts belong to Mainnet; fictional tests belong to Sepolia. Staging permits Mainnet **draft planning**, not Mainnet preparation or deployment.
- Migration 027 and 22 independently named Sepolia mock seasons / 216 collections were persisted on 2026-09-22. Copies preserve Mainnet terms and colors but use fresh identities and cleared network authority. Never overwrite existing copies on a repeat import. Twitter / X profiles are separate per network. Read `docs/sepolia-mock-seasons.md` for source, deployment and verification boundaries.
- Preserve `seasons.json` order and hex colors, `collection-names.json` names, stable season IDs and geometric artwork. Do not regenerate identity when changing a plan's environment.
- Season execution includes a durable V9/V10 worker, private NDJSON logs, X outbox and encrypted reusable 50-wallet Sepolia rehearsal. Historical V4/V5 pins remain in `docs/sepolia-v9-registry-setup.md`; the separately verified V5/V6 lineage and V10 factory are in the 2026-09-25 readiness record. The unused zero-mint V8 was permanently retired and removed from public projections at the user's request; preserve its finalized audit and the completed V8 collection. Airy Garden is the selected first V10 season; use `docs/airy-garden-v10-runbook.md` for fresh run-day scheduling. No V9/V10 season or X delivery has run. Mainnet remains unconfigured.

## Working rules

- **2026-09-27 recovery update supersedes the pending-run statements above:** Airy Garden's Lunar Stone sold out and revealed six V10 winners; the two-collection run is paused after a winner-reply X 403 and Satin Echo's fixed opening was missed. Read `docs/handoffs/airy-garden-testnet-notes/implementation-2026-09-27.md` and the incident handoff before operations. Preserve the old ten-step run as superseded history. The six handoffs added local source/tests, not a deployment or live recovery. Ordinary new mint windows default/max at 24 hours; the one-collection, three-mint 30-minute exception is explicit Sepolia V10 only. Frozen deadlines and deployed SVGs remain unchanged.

- Use code, immutable deployed terms and current verified state to resolve ambiguity; older docs often describe superseded single-winner/proportional-commission designs.
- Never rewrite finalized exports or relabel deployed versions. Draft changes do not upgrade contracts.
- Local environment files may target staging. Never run fixture seeding against staging/production; use an isolated database for migration tests.
- Keep credentials, wallet keys, authenticated RPC URLs and private deployment journals out of source, logs and documentation.
- Update relevant architecture documentation when changing protocol rules. Report local tests, database persistence, hosted UI, connected-wallet checks and live chain verification separately.
