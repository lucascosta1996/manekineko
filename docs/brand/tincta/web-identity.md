# Tincta web identity

Applied to `apps/web` only. Public branding is Tincta; internal package names, typed-data signing domains, contract names and historical collection records remain unchanged.

## Visual system

- White canvas, near-black typography, neutral gray supporting text and hairline borders.
- Native system sans for readable editorial headings; monospace for IDs and technical labels. No remote font request.
- Tincta wordmark and a compact geometric T for favicon and wallet/brand moments.
- Collection colors remain data-driven accents. Existing NFT images are rendered from their actual contract, including older Manekineko editions.
- Catalog artwork has quiet neutral framing; mint details, history, affiliate tools, NFT gallery and NFT provenance share the same typography and spacing.
- Keyboard focus, reduced-motion support, disabled states and narrow-screen layouts remain supported.

This is a presentation change. It does not change draw, enrollment, wallet authorization, commission, mint or claim rules. The separate Launch and landing-page apps have not been rebranded in this change.

## Verification

Production Next build and web typecheck pass. Web tests: 222 passed, 2 existing environment-dependent tests skipped. Desktop and mobile visual review uses the actual Sepolia collection records in an isolated local database.

## Season navigation

The compact navigation links to Seasons, History and My NFTs. `/mint` resolves the currently minting, deployed collection and redirects to its season with that collection highlighted; otherwise it redirects to `/seasons`. Scheduled, expired and sold-out collections are not considered live. Season routes include the chain and immutable season ID. Public pages group deployed collection records and do not expose unpublished Launch drafts. Existing collection and referral URLs remain valid.

At widths of 760px and below, navigation collapses behind a Menu button with expanded-state and control labels for assistive technology. Links close the menu after selection; Escape restores focus to the button, and outside interaction or leaving the navigation closes it. Desktop keeps the inline links. Browser checks cover mobile opening, Escape, page selection, outside dismissal, 320px overflow and desktop navigation. The production build passes.

The current-format copy describes six winning NFTs with equal prizes and the qualifying affiliate program. Collection-specific prize amounts, winner counts and referral minimums come from each collection's terms, including earlier single-winner editions. Routing tests cover live selection, fallback, deadlines, scheduling, deterministic catalog ordering and historical copy. The current visual-review snapshot has no published season, so browser QA exercises the empty catalog and historical collections; the live-season branch is covered by automated tests.

The existing staging database is behind the current application's schema (missing newer season and multi-winner fields). To avoid a staging mutation during a visual change, a local database was created from a read-only export of public collection and indexed NFT records and upgraded with the existing migrations. Its runtime database role can only SELECT.

Review at `http://localhost:3101`. Private start/cleanup instructions are in `.vercel/tincta-qa/README.md`. This is a local snapshot for visual review, not a deployed staging release. The normal development server at 3100 retains its original database configuration. Staging schema synchronization is still needed before deploying the current app against that database.
