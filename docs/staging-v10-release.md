# V10 application staging release — 2026-09-22 UTC

The user authorized deploying the integrated changes to staging. Migrations 025 and 026 were applied to the existing, identity-verified Sepolia staging database, and the three existing Vercel projects were built and promoted. The dedicated projects use Vercel's production target for their stable **staging** URLs; this is not a Mainnet release.

| App | Stable URL | Deployment ID |
| --- | --- | --- |
| Web | https://manekineko-staging-web.vercel.app | `dpl_DHGtAGaRt7LYN2r1yfc99f2ba2LT` |
| Launch | https://manekineko-staging-launch.vercel.app | `dpl_A4T6BaDkXAKswvf4FKF14xi81TRx` |
| Indexer | https://manekineko-staging-indexer.vercel.app | `dpl_CjUX5qcUPeEcYViiZheddgC9j4Bg` |

## Database and preservation

- Applied `025_nft_metadata_refresh.sql` and `026_permanent_combinations_v10.sql` through the existing checksum-verifying migration runner on the pinned direct endpoint.
- Granted only the existing restricted indexer role access to the two new metadata queue/provider tables. Verified its actual runtime connection and immutable/authentication-table restrictions. Web and Launch have no access to those new tables; their existing runtime isolation checks passed.
- Before/after hashes matched for both saved Launch configurations, all 22 season plans, both registered collections, and the empty runtime profile/run tables. No plans, identities, terms, exports or contract versions were rewritten. No fixture seeding was performed.
- Reviewed Vercel's complete 374-file upload manifest and scanned uploaded source against configured credential material. Environment files, private journals, wallet vaults and operator scripts were excluded.

## Hosted verification

All three deployment builds reached `READY`. Candidate checks passed for Web documentation, Seasons, catalog/history reads, the existing V8 collection, Launch login rendering, unauthorized API denial and authenticated Sepolia indexer status with the new metadata queue schema. Stable-URL checks also passed for documentation, the historical NFT #81 API, actual Launch login/logout and authenticated season/configuration/runtime reads. The 22 Mainnet draft plans and two saved configurations remain available. Anonymous private APIs returned 401. A normal indexing cycle returned HTTP 200, `caught_up`, no reorganization and no error; subsequent scheduled cycles advanced the checkpoint independently.

Metadata discovery backfilled all 1,000 completed V8 tokens. Scheduled cycles persisted refresh attempts and subsequently verified matching full explorer metadata. Initial hosted cycles exposed RPC request-limit errors (`-32007`); the worker now reuses immutable verification within one confirmed block per bounded cycle, keeps per-token generation/canonicality checks and stops the cycle on verification failure. Two focused regressions cover reduced duplicate reads, reorg rejection and generation/registration mismatch. The current non-database Indexer run passed 66 tests, with eight explicit SQL opt-ins skipped; typechecking passed. Earlier full isolated database verification is recorded in the V10 handoff. The corrected hosted candidate returned HTTP 200 with six successful, quota-respecting job reads before promotion. The stable deployment’s subsequent scheduled metadata request also returned HTTP 200. Vercel project records confirmed all three active deployment IDs listed above.

The Indexer deployment includes authenticated minute schedules for `/api/indexer/run` and `/api/indexer/metadata`. The historical refresh worker excludes V10. Existing factory/registry pins, app credentials and deployment protection were preserved.

## Remaining boundary

This release deploys application support and the database schema. It does **not** deploy V10 Eligibility V5 / Winner Credits V6, a V10 factory or collection. Existing Sepolia Eligibility V4 / Winner Credits V5 and V8 factory pins retain their original identity. No new V10 addresses were invented or substituted.

The persistent season worker remains source-ready, without an activated season or X profile. No wallet transaction, real V10 VRF draw, paid 50-wallet rehearsal, X post or V10 external-explorer acceptance was performed. The separate Landing app was not part of the three-project staging release. Mainnet remains unconfigured.

Private operational evidence lives under `.vercel/v10-staging-release/`; do not publish credentials or raw authenticated outputs. Continue with the remaining registry/rehearsal requirements in [the V10 handoff](permanent-combinations-v10.md).
