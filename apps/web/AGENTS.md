<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Protocol version handoff

Read [the root architecture](../../docs/architecture.md) and [V10 permanent combinations](../../docs/permanent-combinations-v10.md) before protocol changes. Local Web runtime supports V10 (`affiliate-v10`, `unique-rank-v6`) alongside historical versions; deployment remains separate. V10 uses an independently pinned V10 factory, Eligibility V5 and Winner Credits V6. Keep exact contract/algorithm pairs and never reuse historical pins under new labels.

V10 numbers exist from mint, while final scores require the completed VRF draw. NFT readers fetch `combination()` before reveal, verify `tokenIdForCombination()` against the NFT ID and return a null pending score. After finalization, both `scoreCombination()` and `score(tokenId)` must agree. Permanent metadata must contain exactly A/B/C/D/Combination code and no Score, Award Rank, Prize or lifecycle Status. Awards/history decode numbers to token identity, then validate score independently against rank; preserve V8/V9 score-derived decoding. Mint functions accept no numbers or seed. V9/V10 direct, referral and sponsored paths share the cumulative 20 primary mints per recipient.

Shared previews use a demonstration key and remain explicitly illustrative. V10 artwork has the same numbered image before/after the draw. Current outcomes and claims appear separately in first-party UI; original V8/V9 sealed/revealed behavior remains versioned. Contracts/source links follow the actual collection version.

Winner Credits V6 verifies the full independently pinned ancestry (PREVIOUS, ANCESTOR, ANCESTOR_2, ANCESTOR_3 where present), preserved legacy proof root and zero sponsorship in every prior registry. Old funded targets must remain retired; old contracts cannot observe new redemptions. `.env.example` documents every new pin without real addresses or secrets.

Local verification for this integration: Web production build/typecheck passed; 263 tests passed with both SQL tests enabled against an isolated disposable PostgreSQL database. Tests use temporary tables and rollback. No hosted deployment, connected-wallet V10 mint/claim, live VRF, staging migration or explorer acceptance is implied by these checks. Keep public `/docs` and generic explanatory pages aligned with source support while clearly retaining the pending live rollout notice.
