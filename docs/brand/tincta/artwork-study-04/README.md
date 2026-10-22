# Tincta artwork study 04 — minimal Foldscape

2026-10-21. The user selected **Foldscape's style** and requested minimalistic variations. A final variation has not been selected.

## Variations

| ID | Name | Difference |
| --- | --- | --- |
| A | Essential | Three broad folds retain the original upright rhythm while removing small facets. |
| B | Compact | Broad faces gather around one diagonal cleft, producing a more compact silhouette. |
| C | Open | Two separated folded planes reduce the composition to four principal colored faces. |

The warm vermilion/orange/oxblood palette and folded-plane character carry forward. The variation axes are plane count, compactness and negative space. **B** is the suggested PFP candidate; **C** is the most minimal. These are design judgments for review, not the user's final choice.

## Deliverables

- [Interactive comparison](index.html), with circular framing, fixed 32/48/96 px previews and adjustable avatar size.
- [Labeled comparison](comparison.png) and [circular comparison](comparison-circles.png).
- Full PNG sketches: [A / Essential](sketches/a-essential.png), [B / Compact](sketches/b-compact.png), [C / Open](sketches/c-open.png).
- [Original Foldscape](references/foldscape.png), preserved for comparison.
- [Complete generation prompts](prompts.json).
- [Local browser verification](verification/browser-check.json).

Mode: built-in `image_gen` reference edits. The original Foldscape was the sole image input for all three independent variations. The PNGs are copied unchanged from the tool's saved outputs. No CLI fallback, manual raster retouching or Python image editing was used. The viewer applies identical CSS padding and circular clipping for presentation.

These remain raster concept sketches. Exact palette values, flat fills, geometrically clean seams, and final optical proportions should be resolved in the selected vector master. Prompt constraints describe intended construction; generated details are assessed visually, not claimed to be exact mathematical geometry. Avatar samples use the full source sketches, not separately redrawn optical versions.

## Reproduce

```sh
node docs/brand/tincta/artwork-study-04/build.mjs
python3 -m http.server 8128 --bind 127.0.0.1 --directory docs/brand/tincta/artwork-study-04
node docs/brand/tincta/artwork-study-04/verify.mjs
```

The study updates the local review at port 8128. Prior studies remain on disk. No production artwork, approved Ligature identity, social template, immutable NFT artwork or season data is changed. No deployment or X upload occurred.

## Verification scope

The isolated viewer reuses study 03's CSS and controls. Browser verification covers images, square/circle framing, avatar resizing, reference disclosure, keyboard, responsive layout and automated accessibility. App builds and hosted/wallet checks are outside this artifact-only change. Actual browser results are recorded after execution.

Executed locally in Chromium 145.0.7632.6: all ten tested widths from 320 to 1440 px had no horizontal overflow. Images, square/circle framing, avatar resizing, keyboard activation and the original-reference disclosure passed. No page errors or axe violations were detected. The labeled comparison and circular crops were visually inspected. This is local artifact verification, not physical-device or manual screen-reader acceptance.
