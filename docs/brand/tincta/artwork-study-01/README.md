# Tincta artwork study 01

Date: 2026-10-21. Status: exploratory, no direction selected or deployed.

The user requested new black-and-white sketches for the parent Tincta and Rewards artworks shown in their screenshots. They found the existing two ellipse-based constructions generic, liked Morph and Assembly, and want to consider the replacement artworks as X profile pictures. Color is intentionally deferred.

## Diagnosis and constraints

The current parent `ResearchArt` field repeats 56 ellipses, varying radius and rotation. Rewards repeats 60 identical ellipses radially around a central sparkle. Both therefore lead with a familiar circular/spirograph outline. Morph instead transforms nested square frames; Assembly composes curved modules on a grid. The useful shared principle is a visible construction rule with a specific silhouette, rather than ever more line density.

Keep the approved Ligature logo as the parent signature. These sketches explore the artwork layer, not a second logo redesign. No production app source, immutable NFT renderers, collection palettes, season identities or deployed data are changed by this study.

## Sketches

| Direction | Visual proposition | Avatar assessment | Next refinement |
| --- | --- | --- | --- |
| A / Incision | Stepped contours interrupted by an oblique open seam | Strong compact outline; fine internal channels become gray at 32 px | Preserve the seam and shoulder; create a fewer-line avatar drawing |
| B / Counterfold | Parallel tracks folded into an asymmetric ribbon object | Version 2 is more compact; the asymmetric fans need optical balancing | Give the crossing more space and simplify the fan geometry |
| C / Cellwork | Unequal curved/rectilinear cells forming one white channel | Clearest solid silhouette in this round | Widen hairline seams; resolve tangencies and tune cell weights |
| D / Branchform | One bundle of tracks dividing into unequal branches | Open and generative; literal tree association and thin tracks weaken the small avatar | Compact branches and simplify; keep only if this organic character is desired |

Suggested shortlist: **A for Tincta; C for Rewards**. This is a design recommendation, not the user's selection. The two can be developed as distinct members of the existing family. No claim of worldwide uniqueness or trademark clearance is made.

## Review

Open [the study](index.html), or serve this directory locally:

```sh
python3 -m http.server 8128 --bind 127.0.0.1 --directory docs/brand/tincta/artwork-study-01
```

The review shows square and circular presentations, black-on-white and reversed views, fixed 32/48/96 CSS-pixel avatar samples, and a 32–128 px adjustable sample. Avatar previews use the same original image with consistent visual padding. They are reduction studies, not separately redrawn optical masters and not an assertion about X's current upload specifications.

This is raster concept exploration produced with the built-in image-generation tool. It is not production vector artwork. The original PNGs are in `sketches/`; their complete generation prompts and any refinement prompts are in [prompts.json](prompts.json). The original tool outputs are retained in the Codex generated-images folder. The review uses presentation-only grayscale/inversion and circular clipping; it does not retouch the saved images.

`references/` contains the user's current-artwork screenshots and local captures of Morph/Assembly. They are contextual references, not new proposed art. The generation prompts describe their construction principles; the first round does not use the screenshots as edit targets.

## Next step after a choice

1. Develop three close variants of the selected silhouette with controlled changes to proportion, open space and rhythm.
2. Draw deterministic SVG geometry for the chosen construction, with a richer website master and a simpler avatar master.
3. Review circular/square composition, 32/48/64/96 px reproduction and reversed use. Remove line collisions and accidental letter/symbol readings.
4. Establish a coherent relationship between Tincta and Rewards, then explore color separately.
5. Only after artwork approval, replace the app illustrations and update the relevant social assets. No deployment is part of this study.

## Refinement record

Counterfold v1 was not shortlisted because of its S-like trajectory. One built-in edit attempt failed with a service network error and produced no image. A fresh built-in generation produced [Counterfold v2](sketches/b-counterfold-v2.png), now used in the comparison. The original remains in `sketches/` as study history. Both refinement prompts and the outcome are included in `prompts.json` and [refinements.json](refinements.json). No CLI/API fallback was used.

## Local review verification

The standalone study was checked in Chromium at 320, 390, 768 and 1440 px with no horizontal overflow or broken images. Square/circle framing, reversed viewing, 32–128 px slider updates and keyboard activation work. The automated accessibility scan reported no violations. See [browser results](verification/browser-check.json). This validates the study viewer, not production artwork geometry or global visual uniqueness.
