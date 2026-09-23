# Tincta logo study 01

Exploratory design study, 2026-09-23 UTC. Open [the review gallery](index.html) to compare six directions in monochrome, reversed and across all 22 catalog palettes. The gallery includes actual CSS-pixel specimens at 16, 24, 32, 48 and 64 px.

The boards record the original exploratory proposals.

**Selection update, 2026-09-23 UTC:** the user selected **06 — Drawn signature** for all apps. The [approved identity source and application guide](../identity/README.md) now govern implementation. The comparisons and recommendations below remain the original exploratory study.

## The brief

**Color, collected into a lasting identity.** Tincta brings together original geometric artwork, seasonal color families and permanent collectible identity. The logo should provide a recognizable signature across those changing editions.

The current identity gives this study its constraints:

- White and warm paper surfaces, ink-colored typography and restrained borders.
- Editorial sans-serif lettering, with monospace reserved for supporting details.
- Seasonal palettes and geometric curves as the expressive material.
- A compact T that works beside a readable wordmark and alone in a favicon.

The existing mark uses three narrowing horizontal lines and one vertical stem. That is useful continuity, but it can read as a technical signal symbol. The proposed studies vary mass, negative space, curvature and lettering to move toward a recognizable art-edition signature.

The workflow calls for a stable parent identity across season announcements, collection pages, NFT signatures, social avatars and wallet contexts. A mark must not change meaning when a collection sells out or a draw completes. V10’s four-number identity is permanent; score and winning status are separate. Four-part geometry can refer to identity, but must not imply four winners, four draws or a prediction.

## Six directions

| Direction | Design idea | What works | What needs refinement |
| --- | --- | --- | --- |
| **01 — Edition T** | Two offset bands share a stem. | Clear continuity with the current initial; robust filled silhouette. | Can still feel technical; offset may resemble an F or signal mark. |
| **02 — Ribbon T** | A broad color band bends into an asymmetric stem. | Fluid, expressive, suited to a color-led art label. | T recognition is weaker; the descending curve can suggest a J or another glyph. |
| **03 — Contour T** | An outer T surrounds a second T-shaped counter. | Repeats a contour without appropriating any one season motif; holds its shape in one color. | Refine the inner opening and stem; use optical adjustment at small sizes. |
| **04 — Four fields** | Four fields leave shared T-shaped negative space. | An abstract connection to permanent identity; clear modular construction. | Can read as a cross or four disconnected blocks before the T. |
| **05 — Edition seal** | A T sits within a portrait frame. | Suggests a publisher’s imprint or collectible edition; useful compact footprint. | The frame is generic and can compete with the artwork’s framing. |
| **06 — Drawn signature** | Original lowercase lettering repeats the t construction and uses a square i dot. | Makes the name itself the visual signature; softer, more individual voice. | Needs refined spacing and a companion mark; the standalone t remains provisional. |

## Recommendation

Develop **03A — Single contour** first, keeping **02 — Ribbon T** as the expressive alternative. The contour provides a clear initial and a direct formal relationship with the geometric artwork. Its inner and outer shapes repeat one identity, which is appropriate to a brand of finite editions.

The single contour balances solidity with open space. 03B tests softer internal junctions. 03C tests repeated fine contours, but its detail makes it more suitable for large artwork than a universal small logo. Ribbon variants test a more upright stem and a split band to improve the relation to the existing identity.

Pair the shortlisted marks with a quiet sans wordmark while evaluating the symbol. The boards compare `Tincta` with the landing page’s existing lowercase `tincta` treatment. Casing and punctuation remain a design decision; this study does not change the live naming convention.

Use one monochrome master with reversible foreground. Season colors remain contextual and keep their exact catalog order. The palette applications place the master on a neutral field so it does not acquire a different silhouette or lose contrast across adjacent bands. Selecting a single permanent brand accent is outside this recommendation.

## Review artifacts

- [Six directions — PNG](01-directions.png) / [editable SVG](01-directions.svg)
- [Six construction sketches — PNG](02-construction-sketches.png) / [editable SVG](02-construction-sketches.svg)
- [Application study — PNG](03-applications.png) / [editable SVG](03-applications.svg)
- [Individual marks and provisional optical variants](marks/)
- [Original vector wordmark](marks/06-drawn-signature-wordmark.svg)
- [Review gallery](index.html)

The PNGs are rendered previews. Original symbols and route 06 lettering are path-based SVG. Routes 01–05 use local Helvetica/Arial wordmark text for comparison; their type is not outlined and may render differently on another system. This is not a final logo asset kit.

## What was reviewed

- All three rendered boards were visually inspected for spacing, alignment, clipping and legibility.
- Normal and reversed logo treatments, title case and lowercase, and three strongly contrasting catalog palettes appear in the application board.
- 16/24 px variants widen open spaces. They are optical proposals, not finished pixel-fitted masters.
- The gallery allows all six directions and every catalog season to be compared without changing source assets.
- Browser review verified direction selection, palette switching, reversal, case switching and the path-drawn wordmark. At 320 px, the page had no horizontal overflow and the size specimens measured 16/24/32/48/64 CSS px. No browser warnings or errors were observed in that review.
- The gallery script passed a syntax check and all 14 local file references resolved.

Before adoption, refine one chosen direction, check recognition with viewers, compare it with existing marks, resolve the final lettering and create dedicated small-size masters. No trademark or competitive-similarity assessment is claimed here.

No app source, production favicon, NFT renderer, minted artwork, catalog colors, database or contract behavior was changed by this study. Existing unrelated workspace changes remain outside its scope.

## Source context

- [Current architecture](../../../architecture.md)
- [V10 permanent identities](../../../permanent-combinations-v10.md)
- [Web visual identity](../web-identity.md)
- [Social artwork](../social/README.md)
- [Current landing direction](../../../landing-design-research.md)
- [Current web mark](../../../../apps/web/components/brand-mark.tsx)
- [Current landing brand](../../../../apps/landing-page/app/landing-experience.tsx)
- [Exact palette catalog](../../../../seasons.json)
- [Authored seasonal motifs](../../../../packages/contracts/src/tincta-motifs.ts)

The historical artwork README covers older V8/V9 result-dependent imagery; the current V10 architecture governs this study’s interpretation of permanence.

## Regenerate

From the repository root:

```sh
node docs/brand/tincta/logo-study-01/generate.mjs
```

This uses the repository’s existing `sharp` dependency and local fonts. It writes only this study directory. No image-generation service, external font, remote asset or network operation is used.
