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
4. Check GitHub `Checks` and the four Vercel deployment results. Verify that their Git commit matches `main`, each deployment reaches `READY`, and each stable alias points to that deployment.

Vercel's production target here serves **Sepolia staging**. Pushing source does not apply database migrations, deploy blockchain contracts, activate the persistent season worker, start seasons or send X posts. Those operations remain separate and require their existing reviewed workflows. See [the architecture handoff](architecture.md), [staging release](staging-v10-release.md) and [Sepolia mocks](sepolia-mock-seasons.md).

Direct CLI deployment remains available for deliberate recovery, but normal application releases should come from `main` so the deployed source has a traceable Git commit.
