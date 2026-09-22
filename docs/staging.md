# Sepolia staging

**Latest staging update — 2026-09-22 UTC:** migrations 025/026 and Web/Launch/Indexer are deployed and hosted reads were verified. See [the application release record](staging-v10-release.md). V10 registries/contracts, season-worker activation and the V10 live rehearsal remain pending. Earlier local-only verification below remains dated evidence.


> Historical setup and verification record, beginning 2026-09-17. For the latest recorded V8 rehearsal, V10 local integration and live rollout gaps and Mainnet/Sepolia planning separation, start with [the architecture handoff](architecture.md). Mainnet **season drafts** are now allowed in the private staging planner; Mainnet preparation and live chain records remain blocked. The V5 counts, pending-sale status and blanket draft rejection below describe their original verification date, not current staging state.

The staging environment separates the web app, launch console and indexer into three Vercel projects in the existing `pro` team. It is isolated from other applications and from Mainnet. The web and launch origins are deployed, and the 20-ticket V5 deployment and VRF subscription funding are confirmed. The separate indexer project is deployed, with unattended cron observation verified for registered collections; notification acceptance is verified separately below.

| Project | Root directory | Stable origin |
| --- | --- | --- |
| `manekineko-staging-web` | `apps/web` | `https://manekineko-staging-web.vercel.app` |
| `manekineko-staging-launch` | `apps/launch` | `https://manekineko-staging-launch.vercel.app` |
| `manekineko-staging-indexer` | `apps/indexer` | `https://manekineko-staging-indexer.vercel.app` |

All projects use Node 22, the repository's shared lockfile, installation from the monorepo root, and their own app build. Source outside the root directory is enabled for shared packages. Web and launch retain Vercel deployment protection. The indexer exposes server-to-server routes with mandatory HMAC or bearer authentication; it has no public operator interface. These are dedicated staging projects: their Vercel `production` target supplies a stable staging hostname and does not mean Ethereum Mainnet. The independent landing-page app is not part of this staging rehearsal.

## Verified setup — 2026-09-17

The web and launch HTTPS aliases are live and protected by Vercel sign-in. The launch app additionally requires its own operator login. The username is `staging-operator`; its generated password is stored only in the ignored, mode-0600 `.env.staging.launch-credentials.local`. Open that file locally and move the credentials into your password manager. No plaintext login password was uploaded to a Vercel project.

Nine live HTTP checks passed on the deployed stable origins: anonymous app API denial, foreign-origin login denial, secure operator login, authenticated database reads, Mainnet/foreign-origin write rejection, persisted Sepolia draft save/reload, page rendering, PostgreSQL catalog/history reads, and server-side logout revocation. The session cookie is host-only, Secure, HttpOnly and SameSite=Strict; reusing it after logout returns 401. Separate anonymous requests to both projects redirect through Vercel authentication.

The initial connectivity draft has now been replaced with **Sepolia 20-ticket qualification**, finalized revision 4, with the reviewed first-test terms. Its export and offline prepared CLI configuration have matching hashes; see [the 20-ticket configuration and funding record](sepolia-20-ticket.md). Finalization itself did not deploy or activate a contract. The subsequent deployment created round `0xAfFd7dc1B6A0D8974040F3216316240B724715A9` and funded its dedicated VRF subscription with 0.30 Sepolia ETH. Its verified snapshot is registered in PostgreSQL with pending activation and zero mints. All four contracts are source-verified on Etherscan; independent Sourcify exact creation/runtime verification explicitly confirms the factory’s Cancun build where the earlier Etherscan record omitted its target. The web app is published with one real collection, zero completed outcomes and the collection listed in history as in progress. No launch automation has been enabled. Test login sessions were revoked.

The web app was republished after live collection registration and reported `READY`. Eight hosted HTTP/API checks passed for the real catalog, in-progress history, collection detail, old mock URL rejection, live affiliate readiness and rendered pages; evidence is in `.vercel/sepolia-20-ticket/hosted-web-verification.json`. The launch app remains on its protected stable origin. Local validation passed 75 web tests, 81 launch tests (two optional database cases skipped in that suite), both app typechecks and production builds, plus the staging configuration/provisioning tests. The provisioner was separately tested against disposable PostgreSQL and successfully exercised against the real Neon database. Client build assets were scanned for the generated staging secrets; none were found.

QuickNode and Etherscan provider credentials were subsequently provisioned and validated as described below. Funding for the first rehearsal is complete: before deployment, the deployer held 0.399891071562781 Sepolia ETH and each of the three affiliate and two buyer wallets received 0.02 ETH. The subsequent deployment consumed 0.012002427042770458 ETH in transaction gas and moved a separate 0.30 ETH into the VRF subscription. A separate RPC read at block 11726878 confirmed the deployer’s remaining 0.087888644520010542 ETH and the untouched 0.30 ETH subscription reserve. See [verified funding receipts](sepolia-20-ticket.md#funding). Connected-wallet minting, actual Turnstile enrollment, real VRF and contract settlement remain later test-plan stages.

## Chain isolation

Web and launch have `MANEKINEKO_CHAIN_ID=11155111` in production, preview and development settings. This changes launch defaults and choices to Sepolia and enforces the restriction server-side on configurations, automations, exports, public collection/history reads and affiliate access. The separate indexer requires the same chain pin and verifies the RPC's actual chain ID before writing snapshots. An invalid value fails closed. Every public catalog environment now requires a database: missing configuration cannot silently serve sample collections. Public collection queries require a deployed contract and verified snapshot; history excludes mock archives and lists live collections separately from completed outcomes. Runtime credentials and stable origins are configured only on the dedicated projects' production target; preview deployments need their own reviewed configuration before use.

The database provisioner additionally restricts network, launch-configuration and automation records to Sepolia. It installs all migrations but does not import demo collections or mock history. The first actual V5 collection is now registered with its verified initial snapshot; no demo seed was imported. The former local database’s two demo catalog records and eight mock history rows were explicitly removed.

## Credentials and private files

`.env.staging.example` documents the required variables. Real values are held in the ignored, mode-0600 `.env.staging.local`. The local web environment was backed up privately as `.vercel/web-local-before-sepolia.env`, then switched to the same restricted staging web database role and Sepolia chain as the hosted app. Do not run local fixture seeding through that active staging configuration.

The setup generated seven separate Sepolia wallets: owner/deployer, enrollment signer, three affiliates and two buyers. Six are now funded for the first rehearsal; the enrollment signer remains at zero balance. Private keys are in `.env.staging.wallets.local`; public addresses are in `.vercel/staging-wallet-addresses.json`. These are testnet credentials only. The enrollment signer stays unfunded and must never be reused as the owner/deployer. Import only the relevant test wallets into a separate test browser wallet profile when mint testing begins.

No application receives the owner/deployer private key. The public app's server receives only its dedicated enrollment signer. The launch console receives no blockchain signing key or plaintext login password. The indexer receives no signing key of any kind; its RPC access is read-only and its database role is limited to indexing. `.vercelignore` excludes all `.env` files, local Vercel state, deployment journals and build caches from source uploads.

## Database

The database is a new Neon **Free** project named `manekineko-staging-db`, in the same region as the apps (`iad1`). Provider terms were accepted and provisioning completed. The initial setup applied migrations 001–013; the web/launch restricted roles and Sepolia identity checks passed on the managed database. Automatic indexing adds migrations 014–015 and a separate runtime role through its reviewed setup command. No other application's database or rows were reused.

Use a direct PostgreSQL endpoint with verified TLS for the administrator and runtime connections. Configure `STAGING_DATABASE_EXPECTED_HOST`, `STAGING_DATABASE_EXPECTED_NAME` and the generated `STAGING_DATABASE_ID`, plus:

- `DATABASE_ADMIN_URL`: database owner, used only by setup, account provisioning and the explicit verified collection synchronization command.
- `WEB_DATABASE_URL`: distinct `manekineko_staging_web` role.
- `LAUNCH_DATABASE_URL`: distinct `manekineko_staging_launch` role.
- `INDEXER_DATABASE_URL`: distinct `manekineko_staging_indexer` role, created by the indexer setup and supplied as `DATABASE_URL` only to the indexer app.

The runtime roles use separate random passwords. The web role can read the catalog and write admission challenges/quotas; it cannot read launch users or modify collection snapshots. The launch role can manage sessions, drafts and audit records; it cannot change password hashes, access affiliate challenges or create schema objects. The indexer can read registered collection terms and update derived snapshots, canonical logs, checkpoints, archives and webhook delivery leases. It cannot change mint prices, deployment addresses, enrollment signers, login records or admission challenges. No runtime role owns the database or tables.

Neon requires plaintext role passwords in its provisioning statement. The provisioner permits that provider-specific format only for the exactly pinned `.neon.tech` endpoint over verified TLS, escapes SQL literals and never logs credentials; other providers use SCRAM verifiers. The administrator connection remains local to privileged setup and registration/recovery commands and is not present in any app's environment.

Run from the repository root:

```sh
npm run staging:db:check
npm run staging:db:provision
npm run staging:db:check
```

The provisioner reads only `.env.staging.local`, never the ambient development `DATABASE_URL`. First use requires an empty database. Later runs require the exact matching staging marker, owner, endpoint and chain. Unrelated tables, existing unowned runtime roles and non-Sepolia collection data stop provisioning. Migrations retain their checksum ledger; reruns do not seed demo data or reset credentials.

Provision the staging operator with the existing `scripts/launch-account.mjs` CLI using the administrator connection in the child process environment and `--credential-file .env.staging.launch-credentials.local`. Do not use the normal development `launch:account` command without overriding its database, and do not pass passwords or database URLs in command-line arguments. Keep generated credentials in the password manager after setup.

## Turnstile and RPC

A real managed Turnstile widget, **Manekineko Sepolia staging**, was created for `manekineko-staging-web.vercel.app` only, with pre-clearance disabled. Its keys are configured in staging. A negative Siteverify check returned `invalid-input-response`, confirming that the secret was recognized while an invalid token was rejected. This does not establish successful human enrollment: the deployed V5 contract is now registered, verified factory pins are configured and its program is enabled, but a genuine completed browser challenge and enrollment transaction still need qualification. The app uses its exact HTTPS origin, `AFFILIATE_TRUSTED_PROXY=vercel`, a separate IP-hashing secret and the actual Vercel edge environment. Dummy test keys or simulated localhost proxy headers do not qualify live admission.

The initial shared PublicNode RPC has been replaced in the private staging configuration with a dedicated QuickNode Ethereum Sepolia endpoint. Its URL is server-only in `AFFILIATE_RPC_URL_11155111` and is also available to contract tooling as `SEPOLIA_RPC_URL`. The endpoint is separate from the account's existing Ethereum Mainnet endpoint.

Concurrent browser/API verification exposed one temporary upstream HTTP failure; an isolated retry passed. The affiliate read transport now paces requests within each server process and retries only HTTP 429/502/503/504 or explicit RPC code 429, with at most three attempts inside the original 12-second request budget. Canonical block parameters and all deployment checks remain unchanged, and no enrollment authority is cached. Nine focused transport tests passed. The final deployment passed all eight hosted checks, including two simultaneous verified affiliate reads. This reduces bursts; account-wide rate control across server instances still needs production load qualification.

The deployed V5 factory is `0xfF48d290d0dEbbF676831d589567D1Ed70C4BdB1`; its observed runtime hash is `0x0506d7089f0fc7bc03544701b7e10fe06549d09c4100d09fe021e492e43308d3`. These verified pins are now configured locally and in the Vercel web environment, and the registered affiliate program is enabled. The hosted API confirms `canEnroll=true` and `canMint=false`. Minting requires a later owner activation; the immutable deadline is 2026-09-18 23:02:24 UTC. Keep `V5_BROADCAST=0` outside the intentional deployment command.

### Dedicated provider configuration

Created the Ethereum **Sepolia** endpoint **Manekineko Sepolia staging**, [QuickNode endpoint 663922](https://dashboard.quicknode.com/endpoints/663922), under the already-active Build plan. It uses an available endpoint slot in that plan; no new subscription or paid add-on was selected. Requests consume the account's existing shared API-credit allowance. The original Mainnet endpoint was left unchanged. This is an authenticated provider endpoint, not a dedicated physical node or cluster.

Store the complete credential-bearing HTTPS endpoint as both `SEPOLIA_RPC_URL` and `AFFILIATE_RPC_URL_11155111` in the private root `.env.staging.local`. Update the private web export and the web project's sensitive `AFFILIATE_RPC_URL_11155111` setting, then redeploy web: changing a Vercel environment variable does not update an existing deployment. The launch app does not call the RPC and does not need this credential. Never put the endpoint into a `NEXT_PUBLIC_*` variable.

Created a separate Etherscan API key labeled **Manekineko Sepolia staging** on the existing Free API plan and stored it as `ETHERSCAN_API_KEY` in the same private local configuration. The contract workspace already consumes this variable through Hardhat's verification plugin; explicitly load the staging env when invoking it. Etherscan V2 uses the account key with `chainid=11155111`; the label does not restrict the key to that chain. Neither Vercel app receives this key. See [Etherscan key setup](https://docs.etherscan.io/set-up-your-api-key).

Run `npm run staging:providers:check` to qualify the providers without signing or broadcasting transactions. It reads only the private root `.env.staging.local`, restricts HTTPS destinations to supported provider hosts, rejects redirects, checks chain ID `11155111` and a recent block, and requests the verified Sepolia VRF coordinator ABI through Etherscan V2. Output and errors omit URLs and keys. The checker has 27 passing focused tests, including invalid-chain/key responses and credential-redaction cases.

The live check passed on 2026-09-17: QuickNode returned Sepolia block `11726601`, two seconds old at the time of the check; Etherscan V2 accepted the new key and returned the expected coordinator ABI. Keep `V5_BROADCAST=0`. API-key acceptance proves access, not source verification of Manekineko contracts. Deployment receipts and source-verification results are tracked separately in [the rehearsal record](sepolia-20-ticket.md).

## Export and deploy

```sh
npm run staging:check
npm run staging:env -- web
npm run staging:env -- launch
```

Exports create private `.env.staging.web.local` and `.env.staging.launch.local` files using explicit app-specific allowlists; they refuse to overwrite existing files. Upload only those selected variables to their matching Vercel project using encrypted server settings, with the site key and chain ID as public configuration. Never upload the combined setup file or the wallet file as deployment environment variables.

Normal application releases now deploy through pushes to `main` in [lucascosta1996/manekineko](https://github.com/lucascosta1996/manekineko). All three existing projects are connected to that repository with `main` as their production branch; see [Git deployment setup and release workflow](git-deployments.md). For deliberate CLI recovery, use an explicit project on every Vercel invocation, inspect `vercel deploy --dry --json`, and verify no `.env` file, wallet file or `.vercel` record is included. Deploy from the monorepo root with the selected project and stable staging target.

## Automatic collection updates

`apps/indexer` observes already registered V5 collections using confirmed QuickNode RPC data. Its production Vercel configuration schedules `/api/indexer/run` every minute; the route requires `CRON_SECRET`. The signed `/api/indexer/quicknode` route supports earlier notification-driven cycles, with durable replay protection. It never accepts notification payloads as authoritative mint counts or collection addresses. QuickNode webhook `d5e070ca-1629-4c02-915a-719431faf6f6` is active on Sepolia. Its authentic signed sample completed successfully, and separate live replay, forged-signature and gzip checks passed; see the [activation evidence](automatic-indexing.md#staging-verification--2026-09-18-utc). The minute cron remains enabled as the independent recovery path.

The cron is the recovery path for notifications that are missed, arrive before the confirmation threshold, or are unavailable. It also refreshes deadline-driven state without requiring a transaction. Etherscan and direct contract mints are indexed from the same logs as web-app mints, and open web pages refresh from the resulting database state. All contract state calls are pinned to a canonical block hash, and reorganizations rebuild the affected projections atomically.

Run `node scripts/setup-indexer-staging.mjs` to inspect the isolated staging prerequisites, `node scripts/setup-indexer-staging.mjs --apply` to apply migrations 014–015 and verify the restricted role, then repeat the check. Configure the indexer project with that role, Sepolia RPC/factory pins and separate authentication secrets before deploying. The setup reads only the private root staging environment and imports no fixtures. See [automatic indexing](automatic-indexing.md) for full configuration, authentication, deployment and regression checks.

Verify the deployed `/api/indexer/status` and an authenticated cycle, then confirm the database checkpoint advances through subsequent cron executions. Separately verify provider push and replay handling. The service does not activate sales, enroll affiliates, mint tickets, request randomness or deliver prizes; those remain explicit test transactions.

## Acceptance checks

- Web and launch HTTPS deployments are ready; unauthenticated launch APIs deny access.
- The staging operator can log in and out; sessions and drafts use the managed database.
- Mainnet launch inputs are rejected through APIs, including nested automation steps and exports.
- History/catalog show only the clean Sepolia database, with no legacy demo or Mainnet records.
- The web runtime cannot access private launch tables; the launch runtime cannot change passwords or collection state.
- The configured RPC reports `11155111`, the real Turnstile widget is restricted to the staging hostname, and Vercel is the actual trusted edge.
- Source uploads and client assets contain no admin connection string, wallet private key, Turnstile secret or session secret.
- The deployed indexer rejects unauthenticated requests, advances confirmed checkpoints automatically, and cannot access authentication tables or modify launch terms.
- An externally submitted test mint updates the database and an already-open web page after confirmations; QuickNode push is verified independently from cron catch-up.

Run `npm run staging:test` for configuration/export checks. Database integration cases in `scripts/staging-database.test.mjs` require a disposable local PostgreSQL instance; they are separate from the staging provisioner. The app suites and production builds must also pass. A successful build alone does not establish managed-database connectivity, authenticated login or real Turnstile verification.

Continue with actual wallet enrollment and Turnstile qualification in the [20-ticket Sepolia rehearsal](sepolia-test-plan.md), then activate minting. Use [initial registration and recovery](live-collection-sync.md) for newly deployed collections or controlled repairs. Routine updates belong to the [automatic indexer](automatic-indexing.md), with separate evidence for scheduled operation, provider push and actual external mint observation. Indexing does not complete contract audit, VRF fulfillment or settlement qualification.
