# Unfold — minimal variations

Date: 22 October 2026. Review sketches only.

Three reference-guided variations of the selected [Unfold](references/unfold.png), preserving its intended opening / discovery / revealed-value association. The geometry is simplified into larger folds and a two-face center. Color remains orange, vermilion, red and oxblood.

| Variation | Change | Assessment |
| --- | --- | --- |
| [A / Essential](sketches/a-essential.png) | Keeps the tall right wing and supporting lower fold; removes secondary shards. | Closest to the selected composition. |
| [B / Cradle](sketches/b-cradle.png) | Broad connected base, shorter proportions, larger center. | Preferred PFP candidate for its compact silhouette. |
| [C / Open](sketches/c-open.png) | Wider opening and outward diagonal movement. | Airier and more expansive. |

These are raster concept sketches, not finalized vector marks. Intended associations have not been audience-tested. The reveal is a metaphor for discovery; it does not imply guaranteed winnings or changes to permanent NFT artwork.

## Review

Open `index.html` through a local server. The study includes square/circle framing, fixed 32/48/96 px avatar samples, an adjustable 32–128 px preview, hidden explanations and the original reference. The white inset used in the review should be preserved when preparing a final circular PFP.

`comparison.png` presents the labeled variants. `comparison-circles.png` presents circular framing. `comparison-unlabeled.png` hides concept names.

## Provenance

Created using the built-in `image_gen` tool in reference-guided edit mode. All three use `../artwork-study-05/sketches/a-unfold.png` as their reference. Exact prompts are saved in [prompts.json](prompts.json); the reference was inspected before generation. Generated originals remain in the tool output directory; the copies here are unmodified.

- A: `exec-591e6eb6-6083-42f6-a40e-bff1fe5c60ab.png`
- B: `exec-4066f2d4-0bd3-4a67-ad7d-65df6529125f.png`
- C: `exec-9474bd5d-4c0c-4625-94e2-38fb89e53b44.png`

## Verification scope

`node docs/brand/tincta/artwork-study-06/build.mjs` rebuilds the static viewer. With this directory served on port 8128, `node docs/brand/tincta/artwork-study-06/verify.mjs` checks responsive overflow, image loading, preview controls, keyboard interactions and accessibility, then captures review boards. Results are in `verification/browser-check.json`.

No production assets, approved Ligature identity, app behavior, social posts, season art or deployments are changed by this study.
