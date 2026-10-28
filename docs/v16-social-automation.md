# V16 Genesis and season posts · October 28, 2026

Launch exposes a read-only **X previews** page at `/social`, linked from its dashboard. Choose Ethereum Mainnet or Sepolia, Genesis or any of the 216 ordered catalog collections, then an event. The page shows the exact worker template text and a marked 1600 × 900 image, with a PNG download. Images use the canonical TC glyph on both networks. Preview data is illustrative; it is not an observation of a live event. Mainnet remains unconfigured. Historical editors and worker APIs remain retired. The user-requested Launch login now protects every active page and image endpoint using the existing authentication store.

## Test the X connection

In **X previews**, use **Test X connection** to verify the currently saved account. The authenticated, same-origin `POST /api/social-account?chainId=…` checks the deployment network, decrypts the saved credentials on the server, and calls X’s read-only identity endpoint. It checks the returned ID and handle and rechecks the profile revision before displaying the account, network and check time. No credentials are returned, no profile is changed, and no media or post is published. This confirms account authentication, not media-upload or post-creation permissions.

Checks run only on demand, work even when automated posts are disabled, prevent duplicate clicks while pending, and time out with a retryable message. Missing settings, profile changes, expired Launch sessions and X rate limits have explicit feedback. The account-settings link preserves the network; Mainnet remains unavailable in the Sepolia deployment.

## Change the posting account

Open **Launch → X account**, or `/social/account?chainId=11155111`, and sign in with the existing Launch operator username and password. The deployed Launch origin is `https://launch.app.tincta.xyz`; `LAUNCH_PUBLIC_ORIGIN` must match that exact origin for authenticated mutations. Local development uses its own exact origin, normally `http://localhost:3200`.

Enter the account handle, numeric X account ID, public website and all four OAuth 1.0a credentials when replacing an account. **Verify and save account** asks X to verify that the credentials belong to the supplied ID and handle before storing them encrypted. Blank credential fields keep the existing encrypted values when the account ID is unchanged. Responses contain only the profile and a credentials-configured flag, never secrets. The existing rate-limited, HTTP-only, expiring Launch session protects these settings; saving also requires a same-origin request and the deployment's allowed network. Mainnet and Sepolia profiles remain separate, and a Sepolia deployment cannot save Mainnet credentials.

The server requires the existing restricted Launch `DATABASE_URL`, `SEASON_RUNNER_MASTER_KEY`, `LAUNCH_RATE_LIMIT_SECRET`, `LAUNCH_PUBLIC_ORIGIN` and `MANEKINEKO_CHAIN_ID`. No schema migration or new operator account is introduced. The dashboard, image previews and account settings all require a valid server-verified operator session. `/login` is the public entry point; `/api/auth/session` signs in and out. Protected pages preserve the selected network and destination through sign-in. Image and settings APIs return 401 without a valid session, including forged, expired or revoked tokens. The shared header signs out by revoking the session and clearing the cookie. Passwords use the existing scrypt verifier, login quotas, secure HTTP-only cookies, eight-hour absolute expiry and 30-minute inactivity limit. Wallet approval remains separately required for contract actions.

**Allow automated posts** controls the profile's publication permission. Saving or enabling it does not start a sender. A running V16 sender configured with `accountSource: "launch"` checks the stored revision immediately before posting and stops if settings change or publication is disabled. Stop the sender before changing accounts, then review its private configuration/outbox before restarting. Outboxes remain bound to their original numeric account ID; changing the destination never silently replays old posts into a new account. Existing legacy run and publication-history guards also remain enforced by the shared store.

## Announcements and timing

The V16 observer in `scripts/protocol-v16/social.mts` reads the single verified contract at a fresh finalized block. It verifies network, runtime hash, contract/algorithm version and Genesis rules before reading events. It never loads a wallet signer or submits a chain transaction.

- Genesis free mint opening, after sealing and its actual start. Copy states **1,000 free NFTs, two lifetime primary mints per wallet, gas applies**.
- Genesis sellout. The first collection starts **with voting as soon as Genesis sells out**. Paid minting opens after the full ballot; the post never promises immediate paid minting.
- Season start at its first collection’s ballot; collection preparation, voting, minting, sellout, randomness recorded, final results, all prizes claimed, unsold refunds and randomness-timeout refunds.
- Season completion only when every collection has finalized or reached an eligible refund outcome. This does not imply that all prizes, refunds, affiliates or holders have claimed.

Collection 1's zero vote/sale timestamps before Genesis sellout emit no paid-collection or season event. There is no Genesis deadline reminder or expiry post. Late observers use historical milestone wording and link to current status. A recorded randomness result suppresses timeout refunds. V16 allocation images disclose the no-qualifier exception: the 20% affiliate allocation joins treasury; prizes and holders are unchanged.

Genesis cards use its exact existing monochrome NFT preview and no paid-season or collection number. Paid images retain catalog names, color order and established geometric artwork. Every preview is visibly marked; Sepolia images and text additionally identify testnet/test ETH. All new copy shares the existing conservative X weighted-length validator.

## Delivery

The dedicated V16 adapter reuses the existing durable X outbox, media upload/alt text, numeric account verification and reconciliation. Keys bind chain, contract, internal collection ID and event. Sent, intent and uncertain records retain their exact text/image evidence. Pending entries can refresh and obsolete pending observations are removed. A new canonical observation is required immediately before posting. An uncertain send stops further delivery until reconciliation; the loop does not retry an ambiguous post.

V16 sending currently accepts **Sepolia only**, matching the verified deployment and application adapter. Mainnet templates can be reviewed without authorizing or qualifying a deployment. Use a separate V16 state file; do not repoint a historical V12–V14 outbox or relabel its records.

Keep the config, outbox and credentials outside the repository with owner-only permissions. Start from [the public example](../scripts/protocol-v16/social.config.example.json). Its `accountSource: "launch"` reads the numeric ID, public website and encrypted credentials saved on **X account**. The sender process needs the restricted Launch `DATABASE_URL`, matching `SEASON_RUNNER_MASTER_KEY` and explicit `MANEKINEKO_CHAIN_ID=11155111`; do not expose them in client environment variables. Missing or unavailable settings fail closed, with no environment-credential fallback. Observation can inspect a disabled profile, but publishing requires it to be enabled.

For an existing privately configured environment-based sender, omit `accountSource` or explicitly set it to `"environment"`, fill `xAccountId`, and provide:

- `V16_SEPOLIA_X_API_KEY`
- `V16_SEPOLIA_X_API_KEY_SECRET`
- `V16_SEPOLIA_X_ACCESS_TOKEN`
- `V16_SEPOLIA_X_ACCESS_TOKEN_SECRET`

Commands accept private absolute config/outbox paths:

```sh
# Read finalized chain state and save pending observations; no X requests.
npm run protocol:v16:social -- /private/config.json /private/outbox.json --observe
# Deliver at most five pending events with fresh preflight checks.
npm run protocol:v16:social -- /private/config.json /private/outbox.json --publish
# Observe/publish every 60 seconds, stopping on any error or ambiguous delivery.
npm run protocol:v16:social -- /private/config.json /private/outbox.json --watch
# Verify an existing candidate post before marking an uncertain entry sent.
npm run protocol:v16:social -- /private/config.json /private/outbox.json --reconcile EVENT_KEY POST_ID
```

The observer is separate from the frozen V16 rehearsal. Its implementation does not replace that runner, start/fund/seal Genesis, activate an X account, or install a scheduler. **No X publishing process was started in this task.** Start the sender with the intended account when the run is approved; the [manual rehearsal](sepolia-v16-rehearsal.md) remains paused.

## Verification

Seven focused social tests cover opening/sellout gates, zero schedules, refund/randomness outcomes, all 216 identities and 22 seasons in both catalog previews, maximum onchain name lengths, marked Genesis PNG output, durable ordering and version/network/URL rejection. Existing historical social tests remain passing. The real local V16 adapter test additionally exercises observations before sealing, before sellout, at the first ballot, after a successful draw and at the final refund/season completion. It uses local bytecode and mock VRF, not a live rehearsal.

A read-only call to the deployed Sepolia address `0x673D155f884976bb42eab2F1F11b381dc4d8D26A` verified its runtime and returned zero eligible posts while unsealed. The existing staging profile and local key's ability to decrypt it were checked without exposing credentials. No X API delivery, live credential replacement, live wallet transaction or genuine VRF was tested.

Launch browser checks cover catalog/event selection, keyboard return focus, image loading/error recovery, stable preview geometry, enlarged text, PNG bytes, rejected preview inputs, responsive layout and automated accessibility in Chromium, Firefox and WebKit. The final focused run passed 17 checks with four deliberate viewport-matrix skips. Web, Rewards Landing and Launch production builds passed locally. The narrow/tablet checks run in Chromium; all three cover phone and desktop. Hosted deployment, actual mobile devices and manual screen-reader acceptance remain separate.

### Local development selection regression (2026-10-28)

A collection selection crash was reproduced in the actual Launch development server. A counter captured by the Field render callback advanced twice under React Strict Mode, producing out-of-range collection IDs. Options now derive their IDs from the stable flattened catalog index. The production fixtures did not replay this callback and therefore missed the defect.

Six development-server browser checks passed across Chromium, Firefox and WebKit, covering both catalogs and repeated switches between Genesis, the first/last paid collections and another collection. UI typechecking passed. Run this additional check while Launch is running locally:

```sh
UI_APP=launch LAUNCH_DEV_URL=http://localhost:3200 LAUNCH_DEV_STORAGE_STATE=/private/launch-session.json npx playwright test tests/visual/v16-social-dev.spec.ts
```

After the login restoration, this selection regression requires private Playwright storage state from a legitimate operator login; without it the test deliberately skips. Never commit that file. The separate `launch-auth-dev.spec.ts` checks the real server with absent, malformed and unknown session cookies and creates no database fixture.

Use the origin printed by the local development server; Next.js development-origin checks remain enabled. This test blocks external requests, mutations and unrelated API routes.
