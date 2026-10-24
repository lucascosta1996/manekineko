# Shared Web wallet

Implementation and verification record · 2026-10-24.

Web uses one Reown AppKit 1.8.24 instance with its Ethers adapter. The root layout keeps the selected wallet across Participate, Rewards, Affiliates, Holders and documentation. The compact header shows the address and opens Tincta’s account menu. Network details and selection are available inside the menu; a mismatched wallet still cannot authorize an action. Mobile navigation expands in the page flow; wallet status remains visible outside it.

## Configuration

Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `apps/web/.env.local` for local use and in the Web hosting environment before building a deployment. This is the public Reown project ID, not a secret API key. A changed public environment value requires a new build and a server restart when using `next start`.

The user-created Tincta project is configured locally. Its Reown allowlist was verified with these exact origins:

- `https://app.tincta.xyz`
- `http://localhost:3100`
- `http://127.0.0.1:3100`

Add any future hosted preview origin explicitly before testing it. Do not reuse another project's ID or enable wildcard origins to bypass configuration errors. On 2026-10-24, the same public project ID was saved to the Web project's production environment for the user-requested application release. Deployments follow the [main-branch release workflow](git-deployments.md); environment configuration alone is not proof that a build has reached production.

The selector supports EIP-6963 installed wallets and WalletConnect mobile/QR pairing. Metadata uses the current origin and Tincta's icon. Email/social login, smart-account defaults, swaps, onramp and analytics are disabled. Vendor UI uses supported AppKit theme variables; no vendor shadow-DOM CSS overrides are maintained. Launch and historical workflows retain their existing account picker.

## Session and transaction boundaries

- `packages/protocol/src/web-wallet-kit.ts`: lazy SDK singleton and supported networks (Ethereum and Sepolia).
- `packages/protocol/src/web-wallet-provider.tsx`: root context, SDK subscriptions, account management and reconnect.
- `packages/protocol/src/web-wallet-menu.tsx`: shared Tincta dialog and controls for connection/account switching, copying, disconnect and network details. Reown remains the session authority; cloud feature availability is respected.
- `packages/protocol/src/connected-wallet.ts`: verifies the SDK-selected account with read-only `eth_accounts` and `eth_chainId`; constructs the existing Ethers session without requesting account permission again.
- `apps/web/components/header-wallet.tsx`: shared Button controls, address status, busy feedback, retry and responsive icon-only access.
- `packages/protocol/src/use-wallet-session.ts`: Web consumers share the root session; consumers outside that provider keep their local picker.

Provider account, network and disconnect events immediately revoke the old signer. Revision guards discard late restores, and disconnect cannot silently restore stale provider permissions. Navigation does not disconnect. Unsupported or mismatched networks disable protocol actions. Connecting, restoring and opening account management never submit a transaction. Existing runtime pin checks, fresh contract reads, simulation, explicit review and account/network-scoped recovery journals still govern every write.

This change does not modify financial rules, deployed contracts, network pins or deployment authority.

## Verification

The compact header and first-party account-menu follow-up has a separate [2026-10-24 verification record](design/compact-navigation-docs-2026-10-24.md), including multi-wallet switching and disconnect-all. The results below describe the earlier shared-wallet integration and release preflight, not a deployment of that follow-up.

- Web production build passed with the new local project ID. The local production server was restarted to load that build.
- Web tests: 296 passed, 3 database-gated tests skipped. Focused wallet tests cover read-only restoration, signer invalidation, disconnect and stale restore handling.
- Source checks: 10 passed; JSX/CSS policy and browser harness TypeScript checks passed. Web and Launch TypeScript checks passed during integration.
- The initial four-suite Web browser run passed 164 scenarios and skipped 48 redundant viewport cases. Its seven failures were test synchronization/selector assumptions after moving the wallet into the header. The focused final run passed all 21 selected scenarios across Chromium, Firefox and WebKit, with six planned viewport skips. It includes all seven previously failing scenarios.
- Launch wallet regression: 54 browser scenarios passed across the three engines.
- Browser evidence covers real AppKit/Ethers adapter behavior with a simulated EIP-6963 wallet: navigation, refresh restoration, disconnect, account changes during review, network switching, zero unintended submissions, keyboard/reflow checks, responsive navigation and axe scans. Widths 320, 390, 768, 1280 and 1440 are covered in Chromium; 390 and 1440 are also covered in Firefox and WebKit.
- Screenshots are in ignored `test-results/header-wallet-*.png`; Reown allowlist evidence is `test-results/reown-tincta-origins.png`.
- With the actual project ID, the local production build loaded Reown's live wallet catalog and rendered a WalletConnect QR code. The dialog was canceled without pairing a wallet or signing anything. Selector evidence is `test-results/reown-live-wallet-selector.png`.

The browser fixtures block external services and use a synthetic project ID; they do not prove mobile pairing, hardware wallet behavior, hosted availability or a live signed transaction. Real wallet pairing/signing and hosted acceptance remain separate checks.

SDK references: [Reown Next.js/Ethers installation](https://docs.reown.com/appkit/next/core/installation?platform=ethers) and [AppKit actions](https://docs.reown.com/appkit/javascript/core/actions).

## Application release preflight · 2026-10-24

The complete `npm run check` passed, including 465 contract cases, all enabled application tests, five workspace typechecks and five builds. Optional database suites remained skipped. Re-exporting the contract ABIs/source produced no changes to the reviewed snapshot. Season tooling typecheck passed; its separate regression run passed 196 cases with three opt-in skips. The complete `npm run ui:check` passed: source policy, asset parity, harness typecheck, all fixture builds, and 598 browser cases with 158 planned skips. Staged whitespace and credential checks passed; only the documented local database placeholder and an invalid-domain rejection fixture were identified and reviewed.

These are local release checks. Vercel readiness, stable-domain acceptance, GitHub CI and any public-chain rollout are independent evidence.
