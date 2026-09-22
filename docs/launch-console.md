# Private launch configuration console

**Version boundary, 2026-09-21:** The local Launch/preparation/season-worker pipeline supports V10 and preserves explicit V9 operation. New drafts use V10; persisted validation, permanent previews, preparation, registry pins and execution adapters use exact versions. Existing saved drafts and finalized exports are never silently converted. Live migration/registry/hosting deployment and rehearsal remain pending. Read [the architecture](architecture.md) and [V10 rollout checklist](permanent-combinations-v10.md#integration-status-and-remaining-checklist). The V4–V8 examples and original worker assumptions below are historical; current commands are in [V9/V10 season automation](season-automation.md).

`apps/launch` is an independent Next.js application. Run it on port **3200** and deploy it as its own Vercel project. The buyer website (`apps/web`) does not expose its routes, password handling or configuration APIs. The same private app now includes [launch automation plans](launch-automations.md) at `/seasons`, with named groups of up to 10 collections, individual NFT colors and per-collection deadlines. `/automations` redirects there; configuration templates are at `/launch`. See [season artwork and persistence](seasons.md).

This implements the **configuration** stage: draft → review → finalized snapshot → export. Finalization does not deploy a contract, activate minting, attest ownership of an address, or qualify a Mainnet launch. The console never accepts a wallet private key. Real Sepolia qualification, audit, transaction operations and production infrastructure remain separate release gates.

## Local setup

Use Node 22.20 or a compatible pinned Node 22 release, then from the repository root:

```sh
npm ci
npm run db:up
cp apps/launch/.env.example apps/launch/.env.local
npm run launch:db:migrate
npm run launch:account -- create --username operator --credential-file .env.launch-credentials.local
npm run dev:launch
```

The example database credentials refer only to the local Docker service. Account provisioning is a terminal operation; there is no public registration or shared default password. Do not put passwords in shell command arguments or source files. The account utility supports secure generated credential files and password input over stdin. Its password reset operation revokes existing sessions.

Open [the launch console](http://localhost:3200). The configured `LAUNCH_PUBLIC_ORIGIN` must exactly match the origin used in the browser, including the port. `localhost` and `127.0.0.1` are different origins.

## Configuration rules

- **Contract:** Ethereum Mainnet or Sepolia, name, symbol, supply, exact mint price, lifetime, round owner, prize share, affiliate pool percentage and position count. The pool is shared by successful referral sales at sellout; the winner reserve is independent.
- **Randomness:** reviewed Chainlink coordinator/key for the selected network, confirmations, callback gas and a separate native VRF funding budget. The console does not quote live VRF fees; funding must be checked against the live coordinator during deployment preflight.
- **Authority:** deployment sender, factory owner, new/existing factory, round owner and a separate enrollment signer. The current CLI creates a new factory owned by the deployment sender; an existing factory also requires its owner to submit the deployment. A later ownership transfer requires an explicit operational step. Enter public addresses only.
- **Enrollment:** a planned enrollment window shorter than the total collection lifetime. The contract deadline starts at deployment and includes enrollment time. The planning window is an instruction for the future operator, not a new on-chain timer. Deployment remains inactive until enrollment is closed through sale activation.
- **NFT eligibility:** new V6 launches require the canonical affiliate eligibility registry for their network. After its first official collection, enrollment requires a currently held NFT from an earlier collection that sold out, revealed and paid its winner. Each wallet and source NFT can qualify one position per destination. Transfers afterward preserve the registered position and earnings. Current-collection NFTs cannot qualify; wallet and automated abuse checks remain required. See [the complete rule and setup](affiliate-holder-eligibility.md).

Amounts and basis points are canonical integer strings. The browser formats human units without floating-point money arithmetic. Finalization and deployment use the matching versioned parser in `packages/contracts`. A price must be divisible by 10,000 wei, and the pool plus prize share must be at most 10,000 bps. Position count is independent of pool size. Saved V4/V5 terms keep their original parser and payout behavior; finalized records must first be duplicated to change versions. New V6 drafts also record the [winner-credit registry and sponsorship budget](winner-credits.md).

Drafts may omit values while work is in progress. Finalization requires complete valid values and the exact saved revision. Concurrent edits return a conflict rather than silently overwriting another operator. Finalized configurations are immutable; duplicate a configuration to prepare changed terms or another collection.

## Persistence and automation

The PostgreSQL launch tables are separate from the public collection catalog. A saved configuration is not a deployed collection. Its UUID identifies the preparation record; a future deployment worker must link the resulting factory/round and confirmed transactions to the public collection ID.

The server owns validation, revision checks, finalization and auditing. React only calls the protected API. The persistent version-aware worker uses a dedicated restricted database identity and reads the frozen plan; it does not automate a browser or reuse a human password.

The export contains an exact versioned contract configuration (V10 for new defaults; historical exports retain their version), operational instructions and a SHA-256 digest over canonical JSON (object keys sorted recursively, array order retained). Keep the expected digest from the authenticated finalized record separately from the downloaded file. A matching digest detects changes relative to that trusted value; it is **not** a digital signature or independent approval proof.

Prepare a newly finalized V10 export with the current command; it rejects historical exports rather than upgrading them:

```sh
npm run launch:prepare:current -- --manifest /path/to/export.json --expected-hash HASH_FROM_CONSOLE --output /path/to/new-output-directory
```

This refuses historical exports, changed terms, unknown fields, an incorrect hash and existing output directories. It writes `round-v10.json` and `deployment-plan.json`, explicitly identifying `affiliate-v10` and `unique-rank-v6`. The plan contains the read-only environment (`V10_BROADCAST=0`), reviewed deployment sender and factory selection. For intentional historical work, `launch:prepare` retains version-matched preparation; it never upgrades a saved artifact in place. Apply all these values when running the matching version’s preflight, including clearing `FACTORY_ADDRESS` for a new factory. The JSON plan is data, not a shell script; do not source it.

A deployment job must use the finalized record ID and hash as its idempotency key, recheck live ownership and network conditions, and persist its transaction journal before sending. For V8, it must advance the next collection only after confirmed sellout, reveal and fully backed liabilities, following the season’s fixed timing; outstanding holder claims remain protected. Historical versions retain their own rollover gates. Preparing an export does not itself enqueue or execute a season; runtime controls require a separately reviewed prepared plan and persistent worker.

## Independent Vercel project

Create a Vercel project with Root Directory **`apps/launch`**, Next.js framework and Node 22. Permit workspace files outside the project root so the shared contract package is available. Install from the monorepo lockfile. Use a dedicated HTTPS hostname and configure:

- `DATABASE_URL`: managed PostgreSQL connection for the launch application, with only required privileges.
- `LAUNCH_PUBLIC_ORIGIN`: the exact HTTPS launch origin, without a path or query string.
- `LAUNCH_RATE_LIMIT_SECRET`: a random server-only secret of at least 32 characters for hashing rate-limit subjects.

Run migrations with a separate migration identity. Provision production users against the production database through a trusted terminal; local accounts do not automatically become production accounts. The public Web database role must not have access to launch credentials, sessions or configuration tables. The launch runtime must not own schema objects or have permission to disable immutable-record triggers.

Production sessions use Secure, HttpOnly, host-only, SameSite=Strict cookies, with absolute and idle expiry. Every configuration read/write/export checks a live server-side session. Writes require the configured origin. Login throttling is persisted in PostgreSQL, and passwords use salted scrypt parameters following [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). TLS termination and trusted client-IP headers must match the deployment platform. Configure external access controls/MFA before granting this application authority to spend Mainnet funds.

The app denies framing, restricts form destinations and sets no-index headers. Preview deployments need their own explicit origin and isolated database; do not point untrusted previews at production operator data. Do not put an enrollment signing key, deployment key, password or database URL in a `NEXT_PUBLIC_*` variable.

## Verification

```sh
npm run launch:test
npm run launch:db:test:auth
npm run launch:db:test:config
node --env-file=apps/launch/.env.local --env-file=.env.launch-credentials.local scripts/verify-launch-http.mjs
npm run typecheck --workspace @manekineko/launch
npm run build:launch
```

Database regressions use an isolated schema in a local PostgreSQL instance and exercise the real migration constraints and domain operations. Passing these checks proves the application behavior tested, not public-chain qualification or an independent security audit.
