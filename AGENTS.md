# Agent entry point

Read [docs/architecture.md](docs/architecture.md) before changing protocol behavior. It is the current architecture and handoff guide, including a dated deployment snapshot, code map, invariants, known gaps and verification boundaries. Follow applicable `apps/*/AGENTS.md` instructions for app work too.

## Current baseline

- Public brand: **Tincta**. Internal `manekineko` names remain intentional.
- Local integration baseline: **V10** (`affiliate-v10`), draw algorithm **`unique-rank-v6`**, Eligibility **V5**, Winner Credits **V6**. It gives each minted NFT a permanent Solidity-generated four-number identity; one post-sellout VRF draw still assigns scores and winners. Read [docs/permanent-combinations-v10.md](docs/permanent-combinations-v10.md) before changing or operating it.
- Web/Launch/indexer/season-worker, preparation and deployment tooling now support **V10**. New editable defaults and `launch:prepare:current` target V10; explicit V9 tooling and immutable V8/V9 exports retain their actual versions. Migration **026** adds V10 without rewriting rows or artifacts. Migrations 025/026 and Web/Launch/Indexer were deployed to staging on 2026-09-22 UTC; read `docs/staging-v10-release.md` for verification. V10 registry/contract deployment, persistent worker activation and the V10 Sepolia rehearsal remain pending.
- Default collection: 1,000 tickets, 0.01 ETH, six equal prizes, qualified equal affiliate pool, one paid referral to qualify, and V9's fixed cumulative 20 primary mints per recipient. Read the actual frozen terms for every existing collection.
- Prize claims belong to the winning NFT holder. Lifetime sponsored reward is one redeemed NFT per wallet, not per win. Preserve financial reserves and version-specific historical behavior.
- V10 numbers identify the token, not its final score. They are predictable, unique within the collection and fixed before VRF; buyers pass no numbers/seed to any mint function. Final scores and winning status remain contract state and are deliberately absent from permanent NFT metadata/SVG. Default six winners is still a configurable 1–10 distinct NFTs, not necessarily six wallets.
- The 22 catalog seasons / 216 collection drafts belong to Mainnet; fictional tests belong to Sepolia. Staging permits Mainnet **draft planning**, not Mainnet preparation or deployment.
- Migration 027 and 22 independently named Sepolia mock seasons / 216 collections were persisted on 2026-09-22. Copies preserve Mainnet terms and colors but use fresh identities and cleared network authority. Never overwrite existing copies on a repeat import. Twitter / X profiles are separate per network. Read `docs/sepolia-mock-seasons.md` for source, deployment and verification boundaries.
- Preserve `seasons.json` order and hex colors, `collection-names.json` names, stable season IDs and geometric artwork. Do not regenerate identity when changing a plan's environment.
- Season execution source includes a durable version-aware V9/V10 worker, X outbox and encrypted reusable 50-wallet Sepolia rehearsal. Sepolia migration 024, Eligibility V4 and Winner Credits V5 were configured on 2026-09-21; read `docs/sepolia-v9-registry-setup.md` for verified pins and recovery context. V10 needs separately verified Eligibility V5 / Winner Credits V6 pins and retirement of older mintable reward destinations. No V9/V10 season or X delivery has run. Read `docs/season-automation.md` before execution; Mainnet remains unconfigured.

## Working rules

- Use code, immutable deployed terms and current verified state to resolve ambiguity; older docs often describe superseded single-winner/proportional-commission designs.
- Never rewrite finalized exports or relabel deployed versions. Draft changes do not upgrade contracts.
- Local environment files may target staging. Never run fixture seeding against staging/production; use an isolated database for migration tests.
- Keep credentials, wallet keys, authenticated RPC URLs and private deployment journals out of source, logs and documentation.
- Update relevant architecture documentation when changing protocol rules. Report local tests, database persistence, hosted UI, connected-wallet checks and live chain verification separately.
