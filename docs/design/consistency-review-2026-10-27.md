# Component consistency and quieter pages

Local source and rendered review · 2026-10-27 · visual standard v1.1.

## Result and scope

The existing Tincta identity, artwork and compact control scale are preserved. Equivalent controls and cards now use the same metrics, while major sections have more space and focused public tasks sit in the center of the page. Repeated explanations and navigation rows have been replaced with short copy and contextual documentation links.

Reviewed consumers: parent Landing `/`, Rewards `/rewards`, `/whitepaper`; Web participation, Genesis, claims, affiliates, holder rewards, collection directory/artwork galleries and all nine guides; Launch `/dashboard`; shared controls, navigation, wallets, disclosures, loading/error states and footers. Retired route implementations are not restored by this work.

| Component family | Refinement |
| --- | --- |
| Buttons, icon actions and retry controls | Retain shared 13/18 px type, 32 px fine-pointer and 44 px coarse-pointer minimum targets; remove consumer margins and a nested season-picker label size override |
| Panels, forms and cards | Shared 20 px padding, 16 px below 600 px; parent gaps replace stacked field, paragraph and action margins |
| Navigation and supporting text | Exact shared line-height and label roles; consistent Launch header geometry; remove the extra mobile docs label |
| Major sections | Shared 80 px desktop / 48 px mobile section padding; centered public headings and 44rem task regions, with 54rem voting/Genesis layouts |
| Participation and claims | Preserve the first-viewport stage, show the current task and one contextual guide link; retain the version-correct allocation summary only on home |
| Affiliates and holder rewards | Shorter copy, readable essential eligibility/claim facts and a dedicated rules link instead of repeated global explanations |
| Landing | Shorter thesis, project and reward explanations; guide links for deeper reading; larger section separation and consistent panel spacing |
| Documentation | Shared card/table spacing, readable paragraph measure, full-width diagrams and grids that reflow at 320 px with doubled text |
| Galleries and recovery states | Centered headings and recovery content, shared card padding and parent-owned back-link spacing |

Different semantic text roles remain intentional: headings, body, labels, amounts and addresses do not all use the same font size. Fluid page edges, artwork proportions and navigation behavior remain intact. Essential costs, gas exclusions, lifetime mint limits, first-ballot rights, one-time claims, slot limits, execution order, burns, stale state and transaction review are preserved. Existing contracts continue to display their actual allocation and capabilities. No signing or protocol behavior is changed.

## Regression protection

- `tests/visual/consistency.spec.ts` measures visible production controls, including nested button labels, exact padding, line height, weight, radius and zero external margins. It measures cards, checks overflow and runs axe across eleven route/state families. Fine-pointer Chromium covers 320, 390, 768, 1280, 1440, 1920 and 2560 px; Firefox/WebKit cover 390 and 1440 px. Coarse input covers 390 and 1440 px in each engine. All routes receive a 320 px doubled-text check in Chromium.
- Source ownership checks now treat `packages/protocol` as a UI consumer. Only `packages/ui` may author control metrics; consumers must put action spacing on the parent. Eleven source-policy/fixture tests pass.
- Existing state and interaction suites remain in use. The new audit supplements tests for signing guards, stale data, wallet changes, refunds, holder rights, galleries, documentation, first paint, recovery and keyboard interactions.
- The parent-page test now checks its existing Genesis preview instead of a superseded Open illustration. Gallery assertions check the shorter first-ballot/no-financial-entitlement copy. The artwork itself was not changed.

The enlarged-text pass found two real documentation overflow defects, in the introductory row and article pagination. Both now use wrapping grid tracks with minimum sizes bounded by their container. A Chromium full-page screenshot was also found to reset touch media emulation between routes; the touch audit now captures viewport images and explicitly verifies pointer emulation before measuring each consumer.

## Local verification

All three production-component fixture applications and all three actual applications build successfully. Web, Landing and Launch typechecks and the browser harness typecheck pass. Application tests report 519 passes and 11 optional/database-gated skips across the three apps and their supporting commands. Brand parity passes for 55 generated derivatives; permanent Landing artwork parity passes for six previews. Source policy and whitespace checks pass.

Across all 22 browser suite files, the latest results for the current scenarios are **798 passes and 186 planned secondary-engine viewport skips**, with no unresolved failures. This total combines the broad run and focused corrections; it is not a claim that the initial broad command exited successfully. The final focused run passed 50 checks with 16 planned skips, covering the eleven-route consistency audit, simulated wallets, fixture isolation and both independent Genesis gallery states. The aggregate is saved in ignored `test-results/consistency-verification-summary.json`.

The mandatory Landing first-paint, pending/empty/error/retry/stale and recovery scenarios pass in Chromium, Firefox and WebKit. Twelve loaded/stale baselines at 390/1440 px were reviewed and refreshed for the new section spacing and exact navigation/support type. These also include the Genesis section that was already present in source before this task but absent from the older baselines. The current artwork and brand geometry are preserved. First-paint traces and videos are retained under `test-results/consistency-hero-transitions/`; reviewed actual/expected/diff images are under `test-results/consistency-baseline-review/`.

The last corrections addressed test assumptions as well as layout: the parent selector now targets its existing Genesis figure, and the empty/syncing gallery fixtures run independently so immediate navigation does not cancel Reown initialization and surface a WebKit teardown error. Reown configuration and plan reads receive local fixture responses; other external requests remain blocked and writes remain intercepted. No page errors were filtered out of the assertions.

Reproducible commands include `npm run ui:source`, `npm run ui:typecheck`, `npm run ui:fixtures:build`, each app's test/typecheck/build scripts, and the relevant suites in `tests/visual/`. The final correction command was:

```sh
npx playwright test tests/visual/nft-mirror.spec.ts tests/visual/isolation.spec.ts tests/visual/web-wallet.spec.ts tests/visual/consistency.spec.ts --grep 'Genesis artwork state|fixture boundary|Reown|wallet|current route control consistency'
```

Environment: macOS 15.4.1 arm64, Node 22.20.0, Playwright 1.58.2, Chromium 145.0.7632.6, Firefox 146.0.1, WebKit 26.0, axe 4.11.1, system fonts, en-US/UTC, DPR 1. Fixture requests use fixed local data; external requests and real mutations are blocked.

Evidence lives in ignored `test-results/consistency-before/`, `test-results/consistency-after/` and the Playwright output directories. Screenshots were reviewed for desktop/mobile composition, control alignment, section space, essential text and unchanged artwork. Full-page captures supplement computed metrics; they are not a substitute for state-transition traces. Relative links in the updated design documents were checked.

## Verification boundaries

This is a local implementation and browser review. No deployment, database write, real wallet signature or public-chain action was performed. Reown/provider requests are intercepted or blocked; connected-wallet tests simulate accounts and RPC responses. Hosted UI, remote CI execution, authenticated production data, physical devices, manual screen-reader behavior and real 400% browser zoom remain unverified. Automated axe, keyboard, text enlargement, text-spacing, motion and forced-color checks establish only their stated local coverage.

Acceptance is limited to the verified local scope; this record does not assert complete accessibility or live delivery. Pre-existing V15 protocol work in the same worktree is outside this UI refinement.
