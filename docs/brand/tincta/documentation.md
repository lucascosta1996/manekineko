# Tincta public documentation

`apps/web/app/docs` provides an independently readable, statically rendered guide. It does not query the database or require a connected wallet. Public navigation links to `/docs`; individual topics have stable `/docs/<slug>` URLs and section anchors.

The layout uses Tincta's existing white canvas, black system typography, quiet borders and compact header. A grouped sidebar and local full-text search help discovery. The article outline follows scroll position, with an inline expandable outline on smaller screens. Mobile uses a separate collapsible documentation menu. Previous and next links form a sequential reading path.

Content lives in `apps/web/lib/docs/content.ts`; the typed block model and local search live beside it. Keep explanatory prose separate from the navigation and article rendering. Each page requires a unique slug, section IDs, description and navigation group. Structural tests check internal documentation links, anchors, tables and search coverage.

## Editorial boundaries

- The current architecture guide explains V10 permanent combinations and one post-sellout VRF draw. Public copy and V10 Web transaction/read support, Launch, database/indexer/worker and deployment tooling are implemented locally; live database/registry migration, hosted deployment and rehearsal remain pending. Each deployed collection retains its immutable version and terms.
- Solidity generates unique ordered numbers from the token ID; mint callers supply neither numbers nor a seed. Combinations are public and predictable identities, not independent random draws or advance scores.
- The configured 1–10 distinct winning NFTs default to six; that does not imply six distinct wallets. VRF selects winners after sellout and the contract assigns unique final scores.
- V10 permanent metadata/artwork deliberately exclude score, prize, award rank and changing lifecycle status. Results are separate contract reads. Existing V8/V9 numbers still encode their revealed scores, and their metadata can require an external cache refresh.
- Affiliate pool allocation is equal only among qualifiers and remains bounded by its configured cap.
- Lifetime winner rewards depend on a supported, funded canonical registry. No new deployment is implied by these pages.
- Season planning is distinct from autonomous deployment and social posting. A version-aware V9/V10 worker exists in source; no V9/V10 season or live X delivery is recorded.
- On-chain metadata, settlement and rules are distinguished from oracle fulfillment, off-chain enrollment checks, the database/indexer and third-party rendering.

The content is grounded in the versioned Solidity implementations and the current `docs/architecture.md` and `docs/permanent-combinations-v10.md` handoff. Historical references include `docs/season-v8-implementation.md`, `docs/affiliate-holder-eligibility.md` and the corresponding winner-credit registries. Recheck contract changes before updating public guarantees.

## Structure references

- [Uniswap documentation](https://developers.uniswap.org/docs/protocols/overview): grouped concepts and guides, local page outlines, version-specific explanations.
- [Aave documentation](https://aave.com/docs): overview entry points, action guides and a separate reference section.

These informed information architecture only. Tincta's prose and styling are original and specific to this protocol.

## Validation

The original documentation implementation passed a production build and 224 Web tests (two environment-dependent tests skipped), prerendered 14 guides, and received desktop/mobile browser review. Those are historical implementation results, not a fresh V10 integration or hosted check.

The 2026-09-21 architecture-copy refresh is local. Web tests passed **247 of 249**, with **two environment-dependent tests skipped and no failures**. Web typechecking and its production build passed, generating all 14 documentation routes; Landing typechecking and its production build also passed. These checks validate public copy and rendering source, not V10 transaction/read integration. Read-only local browser review covered the documentation overview, searching for “permanent” and opening the randomness guide, My NFTs help, Seasons, the Landing hero/body, and the Cinder Study V8 mint page with its expanded V10-comparison FAQ. Historical artwork and V8 rules remained intact. The inspected Web and Landing pages reported no browser-console errors. These checks confirm copy/navigation and historical presentation; they did not connect a wallet, submit transactions or verify a live V10 collection/explorer. No remote deployment, database change, wallet transaction or live V10 explorer verification is part of this documentation update.

The subsequent V10 runtime integration passed **263 Web tests with no skips**, including isolated SQL regressions, plus Web typechecking and production build. This extends the local evidence beyond copy-only checks; it still does not prove a connected wallet, deployed V10 registry/collection, hosted application or live explorer.
