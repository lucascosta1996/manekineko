# Tincta landing design research

Reviewed on 2026-09-22. This is a visual and content design study of current official websites, not an endorsement of their products or a source for Tincta financial claims. Desktop pages were inspected in a browser as well as through their public page content. No third-party artwork, brand assets, or code were copied.

## Comparative findings

| Reference | Observed design pattern | Useful application to Tincta |
| --- | --- | --- |
| [Aave](https://aave.com/) | Warm white canvas, a very large centered headline, quiet lavender atmosphere, pill actions, and a layered product stage. Major network metrics follow the hero before deeper product and trust sections. | Give the proposition generous space, make the season artwork the visual centerpiece, and put a compact set of unmistakably labeled reward figures close to the first action. |
| [Morpho](https://morpho.org/) | Black hero with a restrained white headline, blue action, animated particle sphere, and two quantitative labels near the hero base. The rest of the narrative progresses through use cases, integrations, and verification. | Use one coherent animated composition instead of unrelated decorative objects. Keep explanatory text stable while the visual moves. Translate the narrative into prizes, seasons, collections, then transparent rules. |
| [Uniswap](https://app.uniswap.org/) | The homepage directly exposes its main interaction. A short headline and central swap panel sit among softly blurred colorful objects; pink consistently identifies actions. | Make the next step obvious and keep it close to the value proposition. A season palette can provide atmosphere while the primary CTA remains unmistakable. Do not imitate its swap interface for a different product. |
| [Lido](https://lido.fi/) | A pale background and unusually large product wordmark create an editorial feel. APR and TVL sit together directly above a compact black action. Subsequent sections distinguish reward products, ecosystem, and security. | Place prize amounts and affiliate amounts side by side with clear labels and context. Let those numbers carry the commercial appeal rather than adding badges, fake activity, or dense dashboard furniture. |
| [Apple iPhone](https://www.apple.com/iphone/) | Large product presentations alternate with concise benefit copy, comparison galleries, clear actions, and progressive detail. Product identity and color are the content; most technical detail appears later. | Present SVG NFT artwork as a desirable collectible first, followed by short explanations of its permanent identity and the collection draw. Use broad sections and a small gallery instead of a wall of tiny cards. |

## Recommended direction

Tincta should feel like a colorful collectible brand with a precisely explained prize mechanic. Use warm paper, ink-colored typography, large tightly set headlines, and the existing seasonal palette. Put the strongest honest prize and commission figures in the first viewport, with units, per-collection or catalog scope, and draft/full-sellout context visibly attached. Numbers must come from the repository's current terms or authoritative runtime data; reference-site rates and metrics have no role in Tincta copy.

Use a single spacious hero with three layers: quiet animated season-color SVG geometry, a short retail-facing headline and actions, and a reward rail with larger numerals than supporting labels. Artwork should read as a considered composition rather than confetti. Keep the text and action area visually calm and high contrast.

Below the hero, tell the story in this order:

1. **The collection reward:** show what is shared, how many distinct NFTs win under the displayed terms, and the condition that unlocks the draw.
2. **The season:** describe a themed family of collections with a consistent color identity; preserve catalog order and colors.
3. **The collectible:** show several real SVG designs large enough to appreciate. Explain that the four-number identity is permanent while final scores and winner status are separate contract state.
4. **The affiliate pool:** explain qualification and sharing in everyday language using the current version's rules.
5. **The next step:** return to one clear action and brief, accessible answers about mechanics.

The page can make the opportunity exciting without implying a guaranteed return or inflating a visitor's personal odds. A catalog total is a planned aggregate, not a live funded pool; distinct winning NFTs do not imply distinct winning wallets. Any probability shown must state its relevant collection size and number of entries.

## Motion direction

[Apple's motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion) recommends purposeful motion, brief and precise feedback, optional movement, and avoiding interactions that make people wait for an animation. This supports the following Tincta treatment:

- Slow, low-amplitude motion in a bounded hero artwork stage introduces the season colors.
- Staggered opacity and short-distance reveals establish hierarchy as sections enter the viewport.
- A subtle change in artwork depth or position follows normal scrolling without taking control of scrolling.
- Hover and focus effects make links and season selectors feel responsive; essential information remains present at rest.
- Reduced-motion preferences produce the complete static composition. A visible pause control is appropriate for continuous decorative motion.
- Use transforms and opacity for most movement, reserve SVG filters for limited areas, and avoid broad expensive blur animation.

These are implementation recommendations inferred from the references, not a claim that Apple prescribes specific web timings. All landing illustrations, decorative artwork, and icons should remain SVG; the references' photographs or raster assets are not part of the proposed implementation.

## Verification priorities

- Hero reward amounts and labels remain legible without animation, on mobile, and before client hydration.
- CTA destinations match the actual available experience and network.
- Artwork colors and collection identities match source data.
- Keyboard navigation, visible focus, reduced motion, and pause behavior work.
- No PNG/JPEG or remote reference-site assets enter the landing implementation.
- Confirm layout at narrow phone, tablet, and wide desktop sizes; separately report source/build checks and actual browser observations.

## Implemented landing

The redesign lives in `apps/landing-page`, with a server page that passes only season numbers, color arrays and a public planned-reward summary into `app/landing-experience.tsx`. Unpublished theme and collection names are excluded. The hero reads **“Real art. Real rewards.”** and explains original onchain art, the chance of ETH prizes and referral rewards for growing the community.

The header and footer now use the approved **06 — Drawn signature** vector wordmark, with its compact lowercase t as the favicon. [The canonical identity source](brand/tincta/identity/README.md) generates matching assets for Landing, Web and Launch. Lettering is authored geometry with no font dependency; the previous icon-plus-text-plus-period lockup is retired from the app interface.

The rewards rail aggregates the entire planned Mainnet catalog: **1,296 ETH in prizes** and **up to 292 ETH in affiliate budgets**, across **22 seasons / 216 collections**. `lib/planned-rewards.ts` derives the collection counts from `seasons.json` and preserves the original economic allocation: all collections in seasons 1–4 and the first two in each later season use Growth terms (76 collections); the rest use Standard terms (140). The V8 upgrade kept those affiliate terms while introducing six equal prizes. The resulting 1,296 winning NFTs each receive 1 ETH under this baseline. These are editable catalog sellout assumptions, not a live read of private drafts, collected funds or paid claims. Visible copy explains sellout, eligibility and payout caps; the lower reward panels still explain one collection’s terms. No live funding, audit, launch date or guaranteed outcome is claimed.

The hero email form posts to its own same-origin `POST /api/newsletter`. Migration `028_landing_newsletter.sql` stores normalized, deduplicated addresses with the consent-copy version, source and signup time. The endpoint validates bounded JSON, uses a honeypot and a durable five-attempt / ten-minute network quota, and stores only short-lived HMAC network digests. It returns success only after the insert completes (including duplicates), and retains the email with an inline retry message on failure. No email messages are sent by registration.

Configure Landing with server-only `NEWSLETTER_DATABASE_URL` using a separate restricted login, `NEWSLETTER_IP_HASH_SECRET` (at least 32 random characters), and `NEWSLETTER_PUBLIC_ORIGIN` for the canonical HTTPS deployment origin. Local development accepts its localhost origin. Production IP attribution requires Vercel’s trusted forwarding header. Grant the login database `CONNECT`, schema `USAGE`, `INSERT(email)` on `manekineko_newsletter_subscribers` and `SELECT, INSERT, UPDATE, DELETE` on `manekineko_newsletter_rate_limits`; it must not read subscriber addresses or access protocol/Launch tables. Do not reuse a Web, Launch, Indexer or owner credential. Applying the migration and configuring the hosted Landing environment are separate from building the app.

For the existing pinned staging database, `node scripts/setup-landing-newsletter.mjs` performs a read-only preflight. Adding `--apply` applies only migration 028 with its checksum ledger entry, creates or verifies a dedicated restricted newsletter login, and privately saves the local Landing environment. The script verifies the prior migration history and staging identity, does not rotate existing credentials, and checks the login’s effective grants. It neither deploys Landing nor adds test subscribers. Hosted deployment still needs its own canonical origin and server-only environment configuration.

The page includes the 22-season color browser, six permanent SVG NFT previews, six equal prize illustrations, affiliate explanation, three-step introduction and expandable FAQs. Native scrolling remains intact. The hero cycles six representative season palettes, users can choose a palette or pause motion, and device reduced-motion preferences disable animation. All image and icon assets are SVG; no raster or third-party artwork is used. The visual layer adds no runtime packages; signup uses the repository’s existing `pg` driver and `server-only` boundary.

- Run the landing: `npm run dev:landing` (port 3101).
- Check signup policies and catalog totals: `npm run landing:test`. Database suites opt in through `NEWSLETTER_DATABASE_TEST_URL` and `NEWSLETTER_SETUP_TEST_URL`, and require disposable local PostgreSQL instances; they reject remote hosts.
- Configure `NEXT_PUBLIC_WEB_URL` to link the separately deployed Web app. Unset production configuration keeps primary actions in the on-page preview; development uses Web on port 3100.
- Regenerate genuine renderer previews: `node --import tsx scripts/generate-landing-artwork.mjs`.
- Verify preview parity: `node --import tsx scripts/generate-landing-artwork.mjs --check`.
- The static previews use canonical catalog motifs and illustrative permanent numbers. They do not represent deployed or minted NFTs.

Local validation on 2026-09-22: landing typechecking, production build and deterministic SVG verification passed. Browser review covered 320px/390px phone, 768px tablet and 1280px/1440px desktop layouts, season selection (including Season 22's six colors), gallery boundaries, FAQ expansion, mobile menu/Escape focus and animation pause. No browser warnings or errors were observed. Reduced-motion behavior was checked in source; no operating-system preference was changed. This work does not establish hosted deployment, connected-wallet behavior, database state or live-chain execution.

Rewards/signup validation on 2026-09-23 UTC: production build, typecheck and 13 policy/catalog tests passed. Two separate disposable PostgreSQL 17 suites verified migration history, subscriber deduplication/consent, concurrent quotas, restricted grants, and setup apply/rerun behavior under a non-superuser database owner. Browser checks at 320/390/768/1280px confirmed the new layout; real form submission plus a case-variant duplicate persisted exactly one normalized subscriber in the disposable database. Storage failure showed an inline retry message and preserved the entered email. All disposable databases were removed; no test registrations were stored in staging. The pinned staging read-only preflight passed; migration 028 and its restricted login still require application. No hosted Landing deployment or live chain operation is established by these checks.
