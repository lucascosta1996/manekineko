# Compact navigation, wallet menu and public guides

Local implementation and verification · 2026-10-24.

## Result

Web uses a 56 px header at ordinary text size, with a 24 px Open symbol, 80 px Ligature wordmark, quiet Rewards descriptor and shared controls. The connected-wallet button shows only the address; narrow screens use an accessible wallet icon. Network details remain inside account management. Enlarged text can increase the header height, and the documentation navigation follows that measured height.

The wallet account menu composes the shared Radix dialog, buttons, icons, badges, neutral surfaces, spacing and system font tokens. It supports connection/account switching, address copying, an explorer link, individual disconnect and disconnect-all. Reown remains the connection authority; its supported APIs provide the actual accounts and respect cloud multi-wallet availability. SDK connection, QR and network selectors retain supported theme configuration. Account changes invalidate prior signing sessions, and mismatch checks still block transactions.

Public Landing, Web, page metadata and all nine documentation guides describe the current Tincta design without release-number labels. Holder rewards remain honestly marked as planned for launch. Existing deployments still render their actual allocation and capabilities. Internal identifiers, environment variables, contract exports, retired components and historical engineering records retain their real versions.

The guides now contain server-rendered, selectable and searchable diagrams for voting, mint review, collection outcomes, affiliates, holder claims, refunds and verification. Formula panels explain the allocation (updated to 60/20/10/10 on 2026-10-25), equal prizes, vote ties, affiliate division, season holder pool and claim slots, ordered winner sampling with rejection, and permanent four-number identities. Equations define their symbols, rounding and assumptions. The draw description distinguishes winner sampling from the deterministic losing-ticket order, and permanent identity from VRF scores.

## Implementation anchors

- [Shared compact brand](../../packages/ui/src/rewards-brand.tsx), [Web header](../../apps/web/components/site-shell.tsx), [navigation](../../apps/web/components/site-navigation.tsx), [wallet button](../../apps/web/components/header-wallet.tsx).
- [Wallet menu](../../packages/protocol/src/web-wallet-menu.tsx), [menu styles](../../packages/protocol/src/web-wallet-menu.css), [provider integration](../../packages/protocol/src/web-wallet-provider.tsx).
- [Guide visuals and formulas](../../apps/web/lib/docs/visuals.ts), [semantic renderer](../../apps/web/components/docs/docs-visual.tsx), [guide styles](../../apps/web/app/docs/docs.css).
- [Responsive documentation checks](../../tests/visual/compact-docs.spec.ts), [wallet interaction checks](../../tests/visual/web-wallet.spec.ts), [search/content checks](../../apps/web/test/docs.test.ts).

## Verification

| Check | Local result |
| --- | --- |
| Web tests | 297 passed; 3 database-gated skips |
| Landing and newsletter setup tests | 22 passed; 2 optional skips |
| Launch and preparation tests | 195 passed; 6 database-gated skips |
| Web, Landing and Launch typechecks and production builds | Passed |
| UI source contracts, JSX/CSS policy and browser harness typecheck | Passed; 10 source tests |
| Generated brand parity | Passed; 55 artifacts |
| Final selected browser suites | 317 passed; 46 planned viewport skips; no failures |
| Whitespace/diff check | Passed |

The final browser command was:

```sh
npx playwright test tests/visual/web-wallet.spec.ts tests/visual/compact-docs.spec.ts tests/visual/v13-holders.spec.ts tests/visual/v13-landing.spec.ts tests/visual/studio.spec.ts tests/visual/landing.spec.ts tests/visual/rewards-brand-check.spec.ts tests/visual/v12-launch.spec.ts --output=test-results/compact-verified
```

All three production-component fixtures were built before testing. The final run used Chromium, Firefox and WebKit. Coverage includes header breakpoints from 320 to 1440 px, expanded navigation and Escape focus return, 200% text with additional spacing, diagram overflow, axe scans, simulated multi-wallet switching, disconnect-all, account/network invalidation, zero unintended submissions, holder claim safety, Landing states, Launch regression and shared-brand consumers. Earlier iterations exposed formula wrapping and SDK disconnect semantics; both fixes are included in the passing final run.

Reviewed screenshots are in ignored `test-results/wallet-menu-*.png`, `test-results/header-wallet-*.png`, `test-results/formula-*.png` and `test-results/compact-review/`. These show the rendered desktop/mobile account menu and guide panels, not live financial data.

## Evidence boundary

This is local source and simulated-browser verification. No deployment, database write, live wallet signature or public-chain action was performed. The existing historical release records are separate evidence. This scoped run is not a complete new `ui:check`, remote CI run, physical-device test, manual screen-reader audit or real mobile/hardware-wallet pairing test.

## User-requested release preflight

The subsequent request to deploy the complete worktree triggered the full release workflow. `npm run check` passed: 465 contract tests including the isolated 20-collection rehearsal, all enabled application tests, five workspace typechecks and five builds. Optional database/integration suites remained skipped. Season tooling typecheck and its 196 tests passed with three opt-in skips; all 25 protocol-tooling tests passed. Re-exported contract source and ABIs matched the reviewed snapshot.

The complete UI pipeline passed source policy, harness typecheck, brand/artwork parity and all fixture builds. Its browser run passed 612 cases with 162 planned viewport skips and three failures in an older touch-layout test. That test measured the newly hidden desktop wallet button. It now measures the visible mobile icon button and checks both 44 px dimensions and the shared 12 px touch padding. All three corrected scenarios passed across Chromium, Firefox and WebKit. This establishes 615 passing scenarios across the full run and targeted correction; it is not a claim that the initial full command exited successfully. No product behavior was changed during this test correction.

The staged release was reviewed for whitespace and credentials; the sole credential-pattern match was an intentional invalid-domain URL in a rejection test. Deployment readiness, stable-domain checks and remote CI results are reported separately after publication.
