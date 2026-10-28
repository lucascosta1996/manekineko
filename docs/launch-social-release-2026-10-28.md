# Launch access, X accounts and social images · October 28, 2026

This release includes the complete reviewed local worktree: the public copy review, Web/Rewards TC branding and navbar border, Genesis and catalog social previews, the V16 social observer, encrypted network-specific account settings, and the user-requested restoration of login across Launch.

## Access and posting setup

Use `https://launch.app.tincta.xyz/login` with the existing operator account. Dashboard, X previews, X account settings and image/download APIs require a valid database session. The server checks access before emitting protected page content and independently on API requests. Missing, malformed, unknown, expired, revoked and disabled-user sessions fail closed. Sign-out revokes the session and clears the cookie. Safe internal return destinations preserve the selected network.

After signing in, open **X account** in the header. Mainnet and Sepolia profiles are separate. The current deployment permits Sepolia changes; Mainnet remains unconfigured. Saves verify the account with X, encrypt credentials, retain revision/conflict and historical-publication guards, and never start delivery. The configured production login origin was corrected to the verified custom domain above. No operator password was reset, no new account was provisioned and no database migration was needed.

V16 sender configurations may explicitly select `accountSource: "launch"`; their account ID, website and credentials then come from these settings. The sender stops on a profile revision change or disabled publication permission, including between watch iterations. Existing outboxes remain bound to their original network, contract and numeric X account. Historical environment-based configurations retain their behavior. See [setup and activation boundaries](v16-social-automation.md).

## Local verification before publication

- All 531 contract tests passed, including local V16 adapter and historical rehearsal coverage. No deployed contract was changed or exercised by those tests.
- Web: 300 passed, three environment-dependent skips. Launch: 194 passed, six database-dependent skips; five preparation tests passed. Indexer: 73 passed, nine database-dependent skips. Winner credits: 35 passed. Eligibility: 11 passed, one database-dependent skip. Landing: 35 passed, one database-dependent skip; newsletter database setup also skipped.
- All five workspace typechecks and builds passed. The first `npm run check` stopped at an outdated Sepolia-logo expectation; that assertion was corrected to require the TC glyph while retaining visible test-network identity, and every remaining check stage was rerun successfully.
- V16 social/account tests: ten passed. Canonical generators verified 55 brand assets, six permanent-artwork previews and six Rewards illustrations. UI source contracts and harness typechecking passed.
- The authentication, settings, preview and branding matrix passed 119 browser checks with four planned viewport skips. The real local server rejected absent, malformed and unknown session cookies on every active page and both SVG/PNG image endpoints. Cross-origin sign-in, sign-out and settings writes were rejected before mutation. Account-save/sign-in successes used intercepted fictional responses, not live credentials.
- The broader affected Rewards/gallery/holder/Genesis matrix passed 213 checks with 42 planned viewport skips. Rewards buckets now fit their container with enlarged text; stale documentation/gallery assertions were aligned with the existing deployment-aware wording. This resolves the 21 exceptions recorded in the earlier [editorial review](editorial-review-2026-10-28.md), without changing historical entitlement rules.
- After the final loading/error/sign-out-shell adjustment, all 57 focused Launch boundary and login checks passed. Chromium, Firefox and WebKit covered phone and desktop; additional widths were checked in the branding matrix. Real mobile devices and manual screen-reader use remain separate.

No database test fixtures were seeded into staging. Read-only checks confirmed the existing operator/profile and key decryption, a paused legacy runtime, and no unresolved historical account-binding restriction. No live X credential replacement or delivery was tested. No sender, funded/sealed Genesis or rehearsal was started. Mainnet and live wallet/VRF verification remain outside this application release. Hosted deployment and GitHub CI outcomes must be reported separately from these local results.

## Hosted packaging correction

The first hosted Launch build exposed an application import from `/scripts`, a directory intentionally removed by `.vercelignore`. Reusable V16 templates/preview data and the server-only X transport now live in `packages/contracts/src`, with compatibility re-exports at their historical script paths. The application uses explicit package exports; private operator tooling remains excluded. A deployment-import regression joins `ui:source`. The corrected Launch build, social/transport tests, UI typecheck and V16 typecheck passed locally before the follow-up publication.

## On-demand X connection check

X previews now includes **Test X connection**, which verifies the saved account through X's read-only identity endpoint and reports the handle, numeric ID, network and check time. The server requires an operator session, same origin and the configured network, and rejects a profile that changes during verification. Credentials remain server-side. This action creates no post, uploads no image, changes no settings and does not start a sender; a successful identity check does not establish post/media permissions.

Local validation: Launch's 197 tests and five preparation tests passed, with six database-dependent skips; the production build, UI source checks and UI typecheck passed. The preview/connection/authentication browser matrix passed 31 checks with eight intentional viewport skips across Chromium, Firefox and WebKit, including real-server authentication/origin rejection. A live read-only check of the saved Sepolia account succeeded using the configured local network proxy. Hosted deployment and CI are verified separately from these results.
