# Public-copy editorial review — 2026-10-28

This is a local editorial review, not a release record. Edits remain in the working tree. Nothing was published, sent, deployed, funded or changed in a database. The paused Sepolia rehearsal remains paused.

## Voice and scope

Tincta speaks as a product and project team, primarily to prospective collectors, NFT holders, affiliates and people checking the rules before signing a transaction. Launch also serves the operator. The public language is English (`lang="en"`); no translation catalogs or additional public locales were found. Dates and amounts have runtime formatting, which was preserved.

The working voice is direct, calm and specific. Short interface labels describe an action or state. Marketing explains voting, collecting and conditional rewards without suggesting that everybody wins. Guides keep the qualifications needed to understand eligibility, reserves and claims. The research whitepaper retains its formal specification voice. “Color, collected.” and the established Tincta identity remain.

Terminology is consistent: **NFT** for the asset, **collection** for a mint and draw, **season** for a collection group, **affiliate** for the enrolled referral role, and **claim** for an action the eligible holder must submit. **NFT number** means the number within the selected collection in the app; the verification guide distinguishes it from the current deployment’s global ERC-721 token ID. “Onchain” is used in ordinary display copy. Version identifiers and historical terms remain exact where technically necessary.

The review began from a clean working tree. Route and import tracing covered 138 reachable TypeScript/TSX files, followed by separate checks of dynamic content, catalogs, social templates, Solidity metadata and asset generators. Reviewing a source did not imply changing it. The route manifest in `tests/visual/route-inventory.json` and actual App Router files were cross-checked; legacy redirects are not treated as active pages.

## Working inventory

All rows use English unless stated otherwise. “Edited” includes retained passages within the same content group. The table accounts for accessible source copy, not a claim that every possible live account or chain state was exercised.

| Surface / content group | Authoritative local sources | Disposition |
| --- | --- | --- |
| Parent site `/`: thesis, projects, research concepts, news signup, closing CTA | `apps/landing-page/app/page.tsx` | **Edited.** Replaced abstract promotion with concrete project descriptions; kept research concepts explicitly prospective. |
| Rewards `/rewards`: hero, Genesis, voting, prizes, affiliates, holders, seasons, artwork, FAQs, CTA | `apps/landing-page/app/landing-experience.tsx`, `app/rewards/page.tsx` | **Edited.** Conditional prize language, clearer affiliate requirements, varied useful headings, current testnet boundary. Economic examples and qualifications retained. |
| Whitepaper `/whitepaper`: introduction, 13 sections, references, normative interface | `apps/landing-page/app/whitepaper/page.tsx` | **Edited** introductory description and interface introduction. **Retained** normative requirements, code, attribution, citations and draft status. |
| Landing metadata and social descriptions | Landing `app/layout.tsx`, route metadata and existing image/brand sources | **Edited** parent description. **Retained** accurate page titles, image branding and draft whitepaper metadata. |
| Landing header, mobile navigation, section index, activity notices and collection announcement | Landing `components/`, `lib/live-collection.ts`, `lib/mint-activity.ts` and imported shared UI | **Edited** announcement accessibility wording. **Retained** working navigation, countdown, loading, empty and stale labels. |
| Newsletter form, pending/success/validation/error responses | `apps/landing-page/app/newsletter-signup.tsx`, `lib/newsletter.ts`, `app/api/newsletter/route.ts` | **Edited.** Concise validation and recovery instructions; ten-minute rate limit reflects implementation. Consent/privacy commitments, response fields and subscriber handling retained. No outbound newsletter email template exists here. |
| Public app `/`: collection selection, Genesis, ballot, paid and sponsored minting, transaction review and recovery | `packages/protocol/src/public-workspace.tsx`, `experience.tsx`, `chain.ts`, `v16.ts`; Web route wrapper | **Edited** headings, state explanations and surfaced read/transaction failures. **Retained** amounts, eligibility, review requirements and transaction behavior. |
| `/claims`: prizes, refund entry, outcome and pending states | Public workspace and protocol experience; `apps/web/app/claims/page.tsx` | **Edited** page/outcome framing; **retained** qualified financial instructions and action labels. |
| `/affiliates`: enrollment, eligibility, referral URL, balances and commission claim | Public workspace and protocol experience; Web affiliate route | **Edited** page framing and referral explanation. **Retained** qualification, same-wallet exclusion, amounts, copy/share behavior and claim rules. |
| `/holders`: pool progress, NFT entry, eligibility and claim review | Public workspace, `holder-rewards-panel.tsx`, `holder-rewards.ts`; Web holder route | **Edited** pool description, NFT-number label and failures. **Retained** first-5% limit, slot and ownership qualifications and all calculations. |
| Wallet/account/network menus, permissions, pending-request and provider errors | `packages/protocol/src/wallet.tsx`, wallet helpers, Web wallet components and shared header | **Reviewed and retained.** Existing instructions are specific; wallet vendor interfaces are outside local authorship. |
| `/collections` and `/collections/[chainId]/[address]`: gallery, Genesis, NFT cards, pagination, empty and syncing states | `apps/web/components/nft-mirror/gallery.tsx`, gallery helpers and route wrappers | **Edited** heading, empty-state framing and sync label. **Retained** NFT identities, attributes, ownership/burn status, links and version-specific Genesis rights. |
| Web route loading, error, not-found and permission boundaries | Web active route boundaries; protocol state handling | **Edited** root, gallery and docs errors. **Retained** accurate loading/not-found messages and signing-disabled rules. |
| Shared public navigation, footer, external links and unavailable contact states | `apps/web/components/site-navigation.tsx`, shared header, `packages/ui/src/footer.tsx` and UI primitives | **Edited** navigation casing and unavailable-support wording. **Retained** standard buttons, accessibility instructions, brand/credit/legal text and link destinations. |
| Documentation shell, search, results, contents, next-page navigation, metadata | `apps/web/components/docs/`, `apps/web/lib/docs/model.ts`, docs route wrappers | **Edited** orientation/help text. **Retained** useful search, empty-result, navigation and accessible labels. |
| `/docs` overview | `apps/web/lib/docs/content.ts`, `visuals.ts` | **Edited.** Concrete overview, allocation and deployment boundary. |
| `/docs/genesis` | Same sources | **Edited.** ETH/test-ETH distinction, referral wording and historical/current boundaries; limits and ownership rules retained. |
| `/docs/holder-rewards` | Same sources | **Edited.** Removes repetition and avoids implying a separate pool contract for the current launch; all examples/formulas retained. |
| `/docs/onchain-voting` | Same sources | **Edited.** Clearer package/tie explanations; economic limits, snapshot rules and treasury qualifications retained. |
| `/docs/quickstart` | Same sources | **Edited.** “Mint your first NFT”; selected-collection NFT numbers distinguished from receipt token IDs. |
| `/docs/seasons` | Same sources | **Edited.** Current separate finalization/preparation actions distinguished from earlier combined controller actions. |
| `/docs/prizes` | Same sources | **Reviewed and retained** substantive draw, prize and sponsored-mint rules. The prior-registry phrase requires an owner decision below. |
| `/docs/affiliates` | Same sources | **Edited** referral wording and current/testnet boundaries. **Retained** substantive enrollment, qualification, equal-share and zero-qualifier treasury terms. |
| `/docs/refunds` | Same sources | **Edited** NFT-number instruction. **Retained** full mint-price, gas, burn, reserve, timeout and no-expiry qualifications. |
| `/docs/verification` | Same sources | **Edited.** Current single-contract reads and global-token conversion now match the local ABI; historical instructions explicitly use their own ABI. Security and audit limitations retained. |
| Launch `/dashboard`: search, actions, timing, Genesis, operator review, readiness/error states | `packages/protocol/src/operator-workspace.tsx`, `operator-actions.ts`, `experience.tsx`; Launch route wrappers | **Edited** search/actions headings and missing-deployment explanation. **Retained** precise funding, signer and transaction instructions. Reviewed even though operator-facing. |
| API / runtime responses shown in active screens | Landing APIs and response helpers; Web status, mint activity, metadata routes; protocol readers | **Edited** newsletter/read failures and metadata display spelling. **Retained** stable response keys/codes and useful existing messages. Database/RPC text is not rewritten as content. |
| Automated social posts and image alt/headline/detail text | `scripts/protocol-v12/social-content.ts`, V13/V14 wrappers; `packages/contracts/src/season-social.ts`, `season-social-image.ts`; season runner adapters | **Edited** draw-ready/finalization wording. **Retained** versioned economics, receipt/claim distinctions and placeholders. No publishing tool was invoked. |
| Social design templates and account asset kit | `docs/brand/tincta/social/post-templates.json`, social renderer, `scripts/generate-twitter-account-kit.mjs` and its manifest/readme | **Reviewed and retained.** Explicitly design-review templates, not a live publisher; current posts require their documented version-specific preflight. Names and profile IDs remain configuration/data. |
| Public artwork, logos, SVG labels/accessible descriptions and generated previews | `scripts/generate-tincta-brand.mjs`, `generate-landing-artwork.mjs`, `generate-rewards-machine-artwork.mjs`; corresponding `public/` assets/manifests | **Reviewed and retained.** Branded identity, art numbers and meaningful alt text; no raster text needed rewriting. Generated assets were verified, not hand-edited. |
| Collection/season identities and palettes | `seasons.json`, `collection-names.json`, Launch Mainnet/Sepolia catalogs, Web collection catalog | **Reviewed and retained.** Proper names, stable IDs, order, terms and colors are product data, not editorial synonyms. |
| Permanent NFT metadata/SVG | Versioned artwork/Genesis contracts under `apps/contracts/contracts/`; Web metadata projection | **Reviewed and retained** immutable descriptions/attributes. **Blocked from editorial alteration** for deployed bytes; one V16 issue is documented below. |
| Publicly readable repository/package introductions | `README.md`, `packages/ui/README.md`, `packages/contracts/README.md` | **Edited** current root introduction/deployment pointers and UI component specifications. **Retained** explicitly historical contract-package explanations and developer instructions. |
| Inactive legacy UI and redirected routes | Legacy mint/history/season/NFT route wrappers and unmounted components; historical Launch login/plan tooling | **Excluded from rewriting** because active routes redirect or no longer mount them. Route behavior and archived terminology retained. |
| Internal operations and history | Architecture/runbooks/handoffs, migration/deployment journals, scripts’ logs, AGENTS, tests/fixtures, `docs/design/`, archived design studies/output previews | **Excluded** as internal guidance, evidence, historical artifacts or test material. Read relevant guidance/evidence; did not recast history as a current offering. Text assertions are changed only to follow intended copy edits. |
| Vendor code and quoted third-party material | Vendored Chainlink, dependencies, attributed specification references | **Excluded from editing.** Attribution and quotations preserved. |
| Live remote content | Configured chain/indexer/database records; external explorer/X/profile/support destinations; wallet-provider UI | **Blocked/inaccessible in this review.** Local rendering/templates and canonical catalogs were reviewed; no fresh authenticated database, live onchain, social-profile or vendor-content inspection is claimed. No remote CMS authoring integration was found. |

## Representative edits

| Before | After | Reason |
| --- | --- | --- |
| “You vote. You mint. You win. The next collection opens.” | “Vote on the terms. Mint an NFT. Claim a prize if you win.” | Removes the implication that every participant wins and names the required claim. |
| “100% onchain autonomous rewards.” | “Onchain art. ETH prizes.” | Names the collection and prize experience in ordinary language. |
| “Not a winner, but still a holder?” | “A season pool for NFT holders.” | Does not imply that winning NFTs are excluded from holder rewards. |
| “Retry network read” | “Try again” | Uses a clear recovery action while adjacent text explains the failed read. |
| “Pending signatures” | “Actions to review” | The list includes potential operator actions, not signatures already requested. |
| “Awaiting URL” | “Unavailable” | Describes the visitor-visible condition instead of configuration work. |
| Verification instructions centered on separate round/pool contracts | Current single-contract getters, NFT-number conversion and a historical-deployment qualification | Makes the guide usable for the current deployment without relabeling earlier contracts. |

## Preserved contracts and second pass

The second pass followed the parent site, Rewards sections and FAQs, Genesis and paid participation, wallet/review/recovery states, claims/affiliates/holders, galleries, each of the ten guides, Launch and notification templates. It checked shared text in both customer and operator contexts. Standard labels were retained rather than varied for style.

Prices, percentages, mint limits, time windows, winner counts, claim prerequisites, burns, reserves, refund rules and qualification exceptions remain intact. The V16 deployment boundary is based on the dated repository release record, not a fresh live-chain observation. No financial or signing logic, route, catalog identity, translation key, API enum, event key, generated ABI, analytics identifier, CSS or dependency was intentionally changed. Legal/footer commitments, formal specification requirements and permanent deployed artifacts were left intact.

## Validation

| Check | Result |
| --- | --- |
| `npm run landing:test` | 35 passed; 2 database/setup cases skipped because no disposable local PostgreSQL test URLs were configured. |
| `npm run web:test` | 300 passed; 3 opt-in database cases skipped. |
| `npm run launch:test` | 195 passed across app and preparation tests; 6 isolated-database cases skipped. |
| Social/template tests (`scripts/protocol-v12/social.test.ts`, season runner social and image tests) | 30 passed, including message length, interpolation, versioned economics and image text. |
| `npm run typecheck` | All 5 workspace tasks passed. |
| `npm run ui:typecheck`, `npm run ui:source` | Passed; 11 source-policy tests plus JSX/CSS checks. There is no separate repository lint or localization command. |
| `npm run build:landing`, `build:web`, `build:launch` | All production builds passed. |
| Visual fixture production builds | Landing, Web and Launch passed with isolated fixture configuration. |
| Brand/artwork generator `--check` commands | 55 brand artifacts, 6 permanent-artwork previews and 6 Rewards animation illustrations verified. |
| Protected-string/markup audit | Edited source preserves JSX IDs, URLs, roles, classes, form names, data attributes, template expressions, guide slugs/anchors, formulas and allocation values; local Markdown link targets exist. |
| `git diff --check` | Passed. |
| Three-engine browser matrix (18 specification files, 879 cases) | 658 passed, 200 intentionally skipped secondary-engine/intermediate-width combinations, 21 failed. A focused final run passed 9 affiliate-guide cases, skipped 6, and confirmed the revised empty-state assertion before hitting 3 unchanged legacy-holder assertions. The 21 remaining cases are explained below; the browser suite is not fully green. |

Browser checks use isolated fixture servers, deterministic chain responses and simulated wallets. They cover Chromium, Firefox and WebKit; phone and desktop sizes; all ten guides; navigation, forms, pending/empty/error/stale states; accessible names; enlarged text; transaction reviews and recovery. Chromium covers additional widths and breakpoint edges. These checks do not demonstrate live wallet signing, hosted behavior or database persistence.

Only the 12 affected hero baselines (loaded/stale, phone/desktop, three engines) were updated. Desktop differences center on the heading/support text; the shorter mobile heading also moves subsequent content upward. Screenshots and pixel-difference bounds were inspected. The targeted 12-case update run passed, followed by checks against the saved baselines. No broad snapshot update was performed.

Known browser exceptions are retained as failures rather than hidden by changing unrelated assertions:

- `tests/visual/landing-navigation.spec.ts` (Rewards text reflow) and `resilience.spec.ts` (Landing text spacing): the unchanged `apps/landing-page/components/rewards-machine.module.css` animation buckets/proof rings overflow at 320px with 200% root text. Ordinary mobile/desktop copy checks pass. This needs a separate layout fix.
- `tests/visual/nft-mirror.spec.ts`, “Genesis directory and minted gallery”: an existing assertion still expects “first paid vote only”; the unchanged gallery correctly says affiliate eligibility follows the deployment’s original rules. This assertion predates the editorial changes.
- `tests/visual/v13-holders.spec.ts`, “V13 unconfigured and V12 routes do not invent a holder balance”: the intended empty-state assertion was updated to “No collection is open yet.” and passes. Its next, unchanged assertion expects “No holder pool in this deployment.”, whereas the existing public workspace explains that this collection does not include season holder rewards. This remaining mismatch occurs in all three engines.
- `tests/visual/v14-genesis.spec.ts`, “V14 documentation and landing explain first-only free votes”: an existing assertion expects the former Genesis section heading on `/docs/onchain-voting`; the dedicated `/docs/genesis` guide and linking section were already present before this edit. The current-guide and Genesis-copy suites cover the actual navigation/content.

Detailed local browser evidence is saved under `test-results/editorial-2026-10-28/` (ignored test output): `matrix-results.json`, `matrix.log`, `followup-results.json` and `followup.log`. The six reflow failures and fifteen stale-assertion failures concern unchanged layout or content expectations; they were not converted into passing tests by weakening assertions.

No staging/production database tests, full contract/rehearsal suite, remote-content review or deployment were run. Contract logic and database schema were not edited. Database-gated tests were left skipped rather than pointed at the repository’s staging configuration.

## Remaining questions and inaccessible content

1. **Prior registry history and lifetime sponsored mints:** `apps/web/lib/docs/content.ts`, `/docs/prizes`, “One lifetime sponsored ticket,” says “Each wallet can redeem at most one sponsored NFT for life, including prior registry history.” The current `apps/contracts/contracts/ManekinekoV16.sol` checks its own `lifetimeRewardUsed` mapping; no import of earlier registry use is apparent in the local implementation. This concerns entitlement across deployments, so the statement was not silently weakened or redefined. If the intended scope is deployment-local, proposed replacement: “Each wallet can redeem at most one sponsored NFT through this deployment. Earlier deployments retain their own redemption records and rules.” The owner must resolve the intended cross-deployment rule first.
2. **Immutable V16 metadata function name:** `apps/contracts/contracts/ManekinekoArtworkV16.sol`, `_paidTokenURI`, tells NFT readers to call `scoreCombination(collectionId,[a,b,c,d])`. That function is absent from the V16 ABI. The public verification guide now names the implemented reads. For a future, separately versioned deployment, proposed metadata wording: “Use tokenForCombination(collectionId,[a,b,c,d]) to find the token ID, then call score(token) after draw finalization.” Editing the local Solidity string would not fix deployed metadata and would change source/code identity, so it was left intact.
3. **Broad autonomy language:** the parent headline “Defined 100% onchain. Shaped by participation.” and legal/footer autonomy language remain established brand/specification statements. The formal draft distinguishes its intended guarantees from implementations. This review adds no certification or security-audit claim. Any decision to qualify the broad brand promise should be made together with the specification owner, rather than as an incidental copy change.
4. **Remote records and delivery:** live indexed names/state, already-posted X content/profile biographies, wallet-provider screens and delivered emails were not inspected. Their local sources and rendering paths are accounted for above. No local outbound newsletter campaign/confirmation-email template or remote CMS content dump was available; no proposed replacement is invented for unread content.

Accessible local copy has been accounted for. These factual decisions and remote/deployed limitations remain open; local editorial coverage does not establish hosted, connected-wallet, delivered-notification or Mainnet acceptance.

## Subsequent application release verification

The later [Launch/social release](launch-social-release-2026-10-28.md) fixed the Rewards animation reflow and updated the stale gallery, holder and Genesis-guide assertions listed above. Its affected six-spec browser run passed 213 checks with 42 planned skips, resolving those 21 recorded failures. This supersedes the earlier browser exception status; the protocol/documentation questions and remote-content limitations remain separate.
