# Retired page coverage

The `*.legacy.ts` files and their old screenshot baselines document the retired database-driven pages. Playwright no longer routes those user interfaces in production, so these are intentionally outside its `*.spec.ts` entry points. Contract, arithmetic, historical source and migration unit coverage is retained.

Replacement coverage is `v12-protocol.spec.ts`, `v12-launch.spec.ts`, `current-docs.spec.ts`, the updated brand/resilience checks and local production-route smoke checks documented in the V12 operator implementation record. These exercise the actual shared V12 components, direct RPC reads, stale/error states, wallet review/rejection/recovery, catalog progress and current documentation. Existing global baselines were not relabeled as evidence for the new pages.
