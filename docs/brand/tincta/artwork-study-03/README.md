# Tincta artwork study 03 — motion through structure

2026-10-21. Exploratory concepts; no direction selected or deployed.

The user found study 01 too far from Morph and Assembly, and study 02 too similar. The revised brief is an independent visual language with comparable dynamism, precision and memorability. The reference qualities are rhythm, optical movement and deliberate construction; the new art must not reuse rotating square frames or quarter-circle tile grids.

## Three directions

| ID | Direction | Distinct construction | Refinement needed |
| --- | --- | --- | --- |
| A | Ribbonfield | Colored filaments compress into an open asymmetric twist and expand into fans. | Clean the crossing, reduce filament count for an avatar. |
| B | Foldscape | Broad angular planes step around an off-center spine. | Resolve joins and pointed edges, improve optical balance. |
| C | Phasefield | Separate ellipses change scale, spacing and orientation along a flow. | Reduce tiny particles and strengthen the silhouette when small. |

The three use the same warm palette intention, so color does not determine the initial choice. These are generated color concepts: tones are not yet mapped to exact catalog hex values. Some generated tonal variation and imperfect joins remain. They are not production vector masters or claims of globally unique/trademark-cleared geometry.

## Files and method

- [Interactive viewer](index.html), served locally at port 8128.
- [Labeled comparison](comparison.png), [circular comparison](comparison-circles.png).
- Original generated PNGs: [A](sketches/a-ribbonfield.png), [B](sketches/b-foldscape.png), [C](sketches/c-phasefield.png).
- [Complete prompts](prompts.json), including the shared brief and reference-image roles.
- [Viewer source](build.mjs), [styles](style.css), [verification script](verify.mjs).
- [Local browser results](verification/browser-check.json).

Mode: built-in `image_gen`, three independent reference-guided generations. Both original Morph and Assembly screenshots were supplied as references for quality and energy, explicitly excluding their construction. No CLI fallback was used. The original 1254 px PNGs were copied without editing from the Codex generated-images folder. The viewer adds equal CSS padding and circular clipping for review; it does not retouch the source PNGs.

The 32/48/96 px avatar samples use the complete source images at actual CSS sizes. They are not separately simplified PFP masters. A chosen direction should be refined into a controlled construction, a detailed website version and an optical avatar version before palette finalization and replacement.

## Reproduce the review

```sh
node docs/brand/tincta/artwork-study-03/build.mjs
python3 -m http.server 8128 --bind 127.0.0.1 --directory docs/brand/tincta/artwork-study-03
node docs/brand/tincta/artwork-study-03/verify.mjs
```

Studies 01 and 02 remain on disk as review history. Study 03 updates only the local artifact viewer served at port 8128. Application artwork, the approved Ligature logo, season definitions, immutable NFT renderers and social-post templates are untouched. No deployment or X upload occurred.

## Verification scope

The viewer reuses the preceding study's neutral UI and visual-standard control treatment. It is an isolated review artifact, not an app/shared component change. Browser checks cover image loading, frame/size controls, reference disclosure, keyboard, responsive layout and axe scanning. App builds, protocol tests, hosted UI and wallet checks are not relevant to this artifact. Actual results are recorded by the verification script.

Executed locally in Chromium 145.0.7632.6: ten viewport widths from 320 to 1440 px had no horizontal overflow; frame changes, avatar resizing, keyboard activation and the reference disclosure passed. All images loaded, with no page errors or axe violations detected. The labeled board, circular crops and desktop page were visually inspected. This does not establish physical-device or manual screen-reader acceptance.
