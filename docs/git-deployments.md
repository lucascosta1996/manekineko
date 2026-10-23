# GitHub and Vercel deployments

The source repository is [lucascosta1996/manekineko](https://github.com/lucascosta1996/manekineko). The release branch is `main`.

On 2026-09-22, the three existing staging Vercel projects were connected to this repository and their production branch was verified as `main`:

| Project | Root directory | Stable staging URL |
| --- | --- | --- |
| `manekineko-staging-web` | `apps/web` | https://manekineko-staging-web.vercel.app |
| `manekineko-staging-launch` | `apps/launch` | https://manekineko-staging-launch.vercel.app |
| `manekineko-staging-indexer` | `apps/indexer` | https://manekineko-staging-indexer.vercel.app |
| `manekineko-staging-landing` | `apps/landing-page` | https://manekineko-staging-landing.vercel.app |

Pushes or merges to `main` now use Vercel's native GitHub integration. Each app's `vercel.json` permits automatic Git deployments only from `main`. Other branches still run GitHub checks but do not create Vercel previews; the staging runtime credentials and stable origins are configured for the production target. This follows [Vercel's Git integration](https://vercel.com/docs/git) and [branch deployment configuration](https://vercel.com/docs/project-configuration/git-configuration).

Each existing project retains Node 22, `cd ../.. && npm ci` as its install command, `npm run build` in its app directory, access to shared source outside that directory, and automatic production alias assignment. Existing environment variables, access protection and Indexer schedules remain configured in Vercel. No Vercel token or deployment secret is required in GitHub Actions. The `Checks` workflow validates source independently; it does not gate Vercel's build or promotion.

Landing was added on 2026-09-23 with the same repository, `main` branch, Node 22, monorepo install/build settings and its existing branch deployment rule. It has Vercel authentication protection on all deployments. Its production environment points to staging Web and the canonical Landing staging origin, and stores only its dedicated newsletter database URL and IP-hashing secret as encrypted server-only values. No other app runtime credentials were copied to Landing.

Newsletter migration 028 and the restricted staging newsletter login were applied and verified separately on 2026-09-23 through `scripts/setup-landing-newsletter.mjs --apply`, after both isolated PostgreSQL 17 suites passed. No test registrations were inserted into staging.

## Release workflow

1. Run the relevant tests and `npm run check`. For shared contract changes, also run `npm run contracts:export` and review the generated exports.
2. Review the staged source and keep local environment files, `.private/`, wallet vaults, `.vercel/` journals, dependencies and build output out of Git.
3. Commit the reviewed changes and run `git push origin main`.
4. Check GitHub `Checks`, `Visual UI contracts`, and all five Vercel deployment results, including the parent `tincta` project. Verify that their Git commit matches `main`, each deployment reaches `READY`, and each stable alias points to that deployment.

Vercel's production target here serves **Sepolia staging**. Pushing source does not apply database migrations, deploy blockchain contracts, activate the persistent season worker, start seasons or send X posts. Those operations remain separate and require their existing reviewed workflows. See [the architecture handoff](architecture.md), [staging release](staging-v10-release.md) and [Sepolia mocks](sepolia-mock-seasons.md).

Direct CLI deployment remains available for deliberate recovery, but normal application releases should come from `main` so the deployed source has a traceable Git commit.

## Public parent landing project · 2026-10-21

The separate Vercel project [`tincta`](https://vercel.com/pro-5deee0e3/tincta) is connected to this repository's `main` branch, rooted at `apps/landing-page`, with Node 22, `cd ../.. && npm ci`, `npm run build`, and shared source access. Production is public. Its domains are `tincta.xyz` and `www.tincta.xyz`; `www` redirects to the apex with HTTP 308. Both domains were verified, and Vercel reported their existing external DNS configuration valid without a DNS change.

The two Landing projects use build-time routing settings:

| Project | Settings | Behavior |
| --- | --- | --- |
| `tincta` | `LANDING_SITE_ROLE=studio`, `NEXT_PUBLIC_LANDING_URL=https://tincta.xyz`, `REWARDS_PUBLIC_URL=https://rewards.tincta.xyz` | Parent Tincta page at `/`; `/rewards` redirects to the existing Rewards domain. No newsletter database or application credentials are copied into this project. |
| `manekineko-staging-landing` | `LANDING_SITE_ROLE=rewards`, `NEXT_PUBLIC_LANDING_URL=https://tincta.xyz` | Rewrites `/` to the Rewards page, preserving `rewards.tincta.xyz` and the stable Vercel alias. Its existing newsletter and Web configuration stay with this project. The Website footer link returns to the parent domain. |

With `LANDING_SITE_ROLE` unset, local development keeps the parent page at `/` and Rewards at `/rewards`. Routing changes require a new build. The parent page has no live collection dependency. Its launch list uses the Rewards newsletter API directly with a narrow parent-origin CORS allowlist; no newsletter credentials are added to the parent project. Deploy the updated Rewards handler before enabling the parent form. The canonical Rewards origin is accepted independently of the older `NEWSLETTER_PUBLIC_ORIGIN` alias; keep that setting only for additional intentional deployment origins. Database availability remains required for both forms. The Rewards header includes an explicit `https://app.tincta.xyz` Open app action. The historical protection description above records the September setup; the Rewards project was already public when inspected on October 21.

The public parent project is an additional deployment target for `main`. It does not configure or activate Mainnet contracts, migrations, seasons, workers, or social delivery. Vercel build readiness, domain/HTTPS checks, browser acceptance, and GitHub CI results must still be verified independently for each release.

## Public X accounts · 2026-10-23

The user-confirmed public profiles are `https://x.com/tinctaxyz` for the parent Tincta site and `https://x.com/tinctarewards` for the Rewards landing, participant app and docs. They are defined once in `packages/ui/src/links.ts` and selected by page identity, so the two Landing deployments cannot accidentally share one `NEXT_PUBLIC_X_URL`. That variable is no longer used for public profile links. Existing per-network social credentials, automatic posting settings and links to specific published posts remain separate. Publishing website links does not configure or authorize social posts.
