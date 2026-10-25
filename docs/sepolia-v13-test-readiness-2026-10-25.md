# V13 Sepolia test readiness · 2026-10-25

This follow-up repairs the wallet and worker issues found while reviewing the [deployed V13 graph](sepolia-v13-release-2026-10-25.md). It does not redeploy contracts, change immutable terms, prepare a collection, activate a persistent worker or publish an X post.

## Wallets and the first transaction

The user's test wallet is `0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145`. A live Sepolia read at block **11991383** returned **35.128651708115842012 test ETH**. It may fund and call permissionless preparation, enroll when eligible, mint, vote when eligible, finalize draws and claim rewards/refunds it owns. Its key stays in the user's wallet.

The immutable operator remains `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223`. Only that address can withdraw treasury proceeds or use the combined operator settlement action. Using another wallet for tests does not replace this role. Permissionless finalization and preparation remain available separately.

Open [Launch on Sepolia](https://launch.app.tincta.xyz/dashboard?chainId=11155111), connect the test wallet and review **Prepare next collection**. With the controller balance still zero, its first transaction requires **0.06 test ETH plus gas**: 0.01 randomness funding, 0.04 sponsored-mint funding and 0.01 execution reward. Confirming preparation starts the fixed schedule: voting starts after 60 seconds and lasts one hour. The first collection is **Aster Study / Aster Atlas**. Do not prepare it until ready for that schedule.

The minimum option sells 1,000 NFTs at 0.01 test ETH. Each recipient is capped at 20 primary mints, so a sellout requires at least 50 controlled recipient wallets; one funded wallet can pay for mints to those recipients. The second option costs 40 test ETH to sell out and requires at least 100 recipients. The quoted wallet balance alone does not cover that larger option. The old accelerated V12 buyer rehearsal is not a V13 run configuration.

## Wallet connection repairs

- Web observes the SDK session store without invoking the remote-feature-gated multi-wallet subscription. A project with multi-wallet disabled no longer opens the **Multi-Wallet Not Enabled** warning. Existing multi-wallet switching remains supported when enabled.
- Launch installs the Ethers adapter when opening WalletConnect and shares the configured public Reown project. Its production `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` was read back successfully. Reown visibly confirms the exact `https://launch.app.tincta.xyz` allowlist entry alongside the existing participant app entry; no wildcard was added.
- Launch and its isolated fixture use the same server external-package boundary already used by Web. Browser bundles still contain the working wallet adapter.

## V13 social and execution tools

The shared worker implementation selects ABIs from an explicit version, checks the controller runtime and version, verifies the V13 holder runtime/controller binding and 10% allocation, and checks every observed/executed round against the controller mapping, voting contract and holder pool. Older V12 configurations retain their actual behavior; V13 pins cannot silently run as V12.

V13 opening cards show **60% prizes / 20% affiliates / 10% season holders / 10% protocol treasury**, including accessible image descriptions. All lifecycle links now use the participant route `/?collection=N`; `/collections` is the artwork gallery. Pending outbox entries may adopt new copy; sent and uncertain deliveries remain immutable. Offline previews retain the approved colors, identities, ordering and explicit Sepolia test labels.

```sh
npm run protocol:v13:previews
npm run protocol:v13:executor -- scripts/protocol-v13/sepolia-inspect.json .private/executor.json --inspect
npm run protocol:v13:social -- private-config.json private-outbox.json --observe
```

The checked-in executor configuration is **inspection only**, with zero spending/recovery budgets. Signing additionally requires two independent HTTPS RPC hosts, the complete reviewed deployment expectation, a pinned dedicated non-operator wallet, explicit positive bounded subsidy/recovery amounts and `TINCTA_EXECUTOR_PRIVATE_KEY` supplied privately. The V13 entry point requires `version: 13`; before signing it uses the full V13 graph verifier on the common finalized block from both RPCs. Existing nonce, signed-intent journal, canonical receipt, subsidy and per-invocation transaction limits remain enforced. The full public deployment record can be used as `expectationFile`; its `expected` object is selected explicitly.

Social configuration adds `version: 13` and `holderRewardsCodeHash` to `{chainId, controller, controllerCodeHash, rpcUrl, appUrl, xAccountId}`. Use the exact pins in the release manifest, `chainId: 11155111` and `appUrl: "https://app.tincta.xyz"`. Publishing uses a separately reviewed numeric account ID and **`V13_SEPOLIA_X_`** credentials (`API_KEY`, `API_KEY_SECRET`, `ACCESS_TOKEN`, `ACCESS_TOKEN_SECRET`). Mainnet uses its own prefix. The observer has no signer; observing or previewing does not authorize publishing. Existing locks and uncertain-delivery reconciliation still apply.

## Verification boundaries

The live V13 executor inspection returned `idle`; the live finalized observer returned zero observations/pending posts. Both validated the deployed V13 controller and holder pool. No first collection existed during these checks.

Local focused validation: **56 V12/V13 contract tests**, **27 worker tests**, all workspace typechecks and visual source/type checks passed. Contract coverage includes V13 event projection, correct participant links, wrong-version/wrong-holder rejection before signing, bounded finalization, confirmed journal recovery and exact 10% holder funding. Focused browser results are recorded below. These checks do not prove a real wallet signature, public-chain mint, Chainlink delivery, complete season or X delivery.

Focused browser validation passed **81 cases** across Chromium, Firefox and WebKit (24 Web wallet cases, 57 Launch cases; six intentional Web viewport skips). This covers disabled multi-wallet behavior, configured WalletConnect selection/cancellation, retained account switching, exact operator review, network/pin rejection and wallet rejection without a resubmission. Both fixture builds passed. The regenerated V13 opening and timeout cards were visually inspected.

The preceding `c86f433` GitHub Checks run failed only because the legacy V12 20-collection rehearsal exceeded its 15-minute timeout; it had reached collection 19 and continued to collection 20. That single test now has a 30-minute ceiling, preserving all 20 collections, the 1,800-step bound and every receipt/restart/accounting assertion. Production chain freshness, timing and spending limits are unchanged. CI now also runs the shared worker tests and explicit worker TypeScript check. A new CI result is required before calling the remote workflow green.

The complete local `npm run check` passed: **468 contract tests**, including the 20-collection rehearsal, all app tests, workspace typechecks and all five build tasks. The legacy rehearsal completed in 519.833 seconds locally. Additional season-tooling validation passed **196 tests** with three optional skips and its TypeScript check. Contract export regeneration produced no changes. This records local evidence; hosted promotion, real connected-wallet use and the new remote CI run are separate checks.
