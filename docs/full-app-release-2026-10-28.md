# Full application release · 2026-10-28

The user authorized publishing the complete remaining worktree and deploying every application. The commit adding this record includes the parent landing's glass sculptures and scroll motion, the Rewards landing's TC + REWARDS header and illustrative mint/draw/claim animation, their generated artwork and browser coverage, the previously local V15 source/exports/tests, and historical voting-preview evidence. V15 source publication does not deploy V15 or replace the active V16 runtime.

## Targets

| Vercel project | Public surface |
| --- | --- |
| `tincta` | [Tincta](https://tincta.xyz), with `www` redirecting to the apex |
| `manekineko-staging-landing` | [Rewards](https://rewards.tincta.xyz) |
| `manekineko-staging-web` | [Participant app](https://app.tincta.xyz) |
| `manekineko-staging-launch` | [Launch dashboard](https://launch.app.tincta.xyz/dashboard) |
| `manekineko-staging-indexer` | [Indexer](https://manekineko-staging-indexer.vercel.app) |

All five use the established `origin/main` integration described in [Git deployments](git-deployments.md). Existing environment settings and the separate parent/Rewards routing roles are retained. Deployment acceptance requires each project to report the release commit as `READY`, its production target to match, and every stable alias to resolve to that deployment. GitHub Actions results are separate evidence.

## Local acceptance

- `npm run check` passed: **1,185 tests passed**, **21 environment-dependent tests skipped**, zero failures; all five workspace typechecks and all five builds succeeded. This includes 531 contract tests and the historical local recovery rehearsals. Skipped persistence/integration cases are not claimed as passed.
- UI source contracts, harness typecheck, canonical brand parity, permanent landing artwork and all six machine assets passed.
- The Landing state, motion, Rewards machine, minimal-content, cross-app branding and parent-page suites passed **254 browser checks**, with **34 planned secondary-engine viewport skips**, across Chromium, Firefox and WebKit. No failures or flaky results occurred. Desktop and phone screenshots were inspected.
- V15 unit and local multi-collection rehearsal tests passed **20 cases**. `contracts:export` regenerated the new V15 exports without changing any existing deployed-version export.
- The staged snapshot passed whitespace and credential checks. Wallet vaults, environment secrets and private deployment journals are excluded.

Local logs, the browser environment/result report, final deployment metadata and hosted screenshots are retained in `.private/full-release-2026-10-28/`. Hosted checks cover both landing domains at desktop and phone widths, motion and pause behavior, illustrative claims, parent/Rewards redirects, the V16 participant routes, Launch's catalog state and the authenticated indexer. No newsletter registration or connected-wallet transaction is part of this release acceptance. Browser automation does not establish physical-device or manual screen-reader acceptance.

## Rehearsal boundary

V16 remains pinned to `0x673D155f884976bb42eab2F1F11b381dc4d8D26A`; see [its deployment record](sepolia-v16-release-2026-10-28.md). The fresh rehearsal remains **prepared, paused and not started**, with zero Genesis mints and zero prepared paid collections. Its frozen runner SHA-256 remains `c0467ab3623b34e5d93b70d964b704d240a1d5611b61e80827ac042cdedfd5e0`.

Publishing these apps does not seal the catalog, fund wallets, open minting, begin voting, run old rehearsals or send social messages. Mainnet remains unconfigured. The [manual rehearsal workflow](sepolia-v16-rehearsal.md) and [scenario matrix](sepolia-v16-scenarios.md) remain the operational handoff for a future explicitly started run.
