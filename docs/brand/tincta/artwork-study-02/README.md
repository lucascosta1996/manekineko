# Tincta artwork study 02 — color

2026-10-21. Exploratory compositions; no direction selected or deployed.

The user rejected study 01 because its heavy bands and irregular silhouettes did not resemble Tincta Morph and Assembly closely enough. This round starts from the actual SVG construction in `apps/landing-page/components/research-art.tsx`, rather than from text descriptions of the reference art.

## What is preserved

- Morph: 2-unit contour strokes, contracting square frames, gradual corner rounding, controlled rotation and exact season 8 colors.
- Assembly: 4 × 4 grid, 72-unit tile faces, 6-unit gutters, quarter-circle geometry and exact season 15 colors.
- The warm alternative uses season 1's existing crimson/red/orange catalog colors. `seasons.json` is read without modification.
- Flat artwork on the same quiet light surface, without shadows, textures or dimensional rendering.

The source-derived reference SVGs retain the original geometry and palette, recentered on a square canvas for comparison. Existing Assembly's two low-opacity cells are retained in its reference. New compositions use solid catalog fills.

## Four directions

| ID | Direction | Construction change |
| --- | --- | --- |
| A | Drift | The aperture moves off-center as 32 frames shrink, turn and round. |
| B | Counterturn | Rotation reverses midway through 32 contracting frames, changing the contour envelope. |
| C | Confluence | Quarter-circle tiles create two positive circular groups and two negative ones. |
| D | Relay | Convex and concave quarter-circle cells alternate to carry curves through the grid. |

All four have both reference-family and warm Tincta versions. They are directly authored SVG sketches, not recolorings of the rejected raster concepts. This round did not use image generation or image-editing tools. The complete construction is in [generate.mjs](generate.mjs); there is no image-generation prompt set.

## Review files

- [Interactive study](index.html): original references, palette switch, square/circle frames and 32/48/96 px plus adjustable avatars.
- [Reference-color comparison](comparison.png).
- [Warm-color comparison](comparison-warm.png).
- Eight vector masters in `sketches/`, and eight browser-rendered 1024 px PNGs in `exports/`.
- [Browser verification](verification/browser-check.json).

Run from the repository root:

```sh
node docs/brand/tincta/artwork-study-02/generate.mjs
python3 -m http.server 8128 --bind 127.0.0.1 --directory docs/brand/tincta/artwork-study-02
node docs/brand/tincta/artwork-study-02/verify.mjs
```

This replaces the local review served at port 8128. Study 01 remains on disk as history. Application artwork, the approved Ligature logo, season definitions, immutable NFT renderers and social-post templates are unchanged by this round. No deployment or X upload occurred.

## Decision and refinement

First choose the visual relationship: a contour construction (A/B) or a tile construction (C/D). The green/blue toggle deliberately keeps the reference palettes visible; the warm alternative shows how each composition relates to the existing parent/Rewards palette. Palette is still a review choice.

The avatar rows use the complete drawing at actual CSS sizes, not optical simplifications. Fine contours merge at 32 px, as they do in the original Morph. A chosen line direction will need a separately simplified avatar drawing. Modular options preserve more solid color at that size. No assertion of worldwide uniqueness or trademark clearance is made.

## Verification boundary

The static study is separate from production applications. Its own HTML uses the visual standard's system font, neutral UI colors, focus treatment and control dimensions. It does not introduce a new app component or modify shared tokens. Only the preview's relevant loading, palette, frame, responsive and keyboard behavior is checked; production builds and wallet/hosted checks are not applicable to this isolated artifact. Browser checks are recorded when executed, not inferred from this document.

Executed locally in Chromium 145.0.7632.6: image loading, palette/link updates, square/circle framing, keyboard activation, avatar resizing and ten viewport widths from 320 to 1440 px passed. No horizontal overflow, page errors or axe violations were detected. The reference-color board, warm board and mobile layout were visually inspected. Eight 1024 px PNGs were exported. This is local study verification, not production, physical-device or manual screen-reader acceptance.
