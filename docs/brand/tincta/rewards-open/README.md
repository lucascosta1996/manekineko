# Tincta Rewards — Open

Approved 22 October 2026 from artwork study 06, variation C.

Open is the Rewards artwork: unequal folded wings open around a separate center, suggesting discovery and a reward revealed. The intended association is not a guarantee that every participant wins. The parent Tincta Ligature wordmark and TC favicon remain the approved parent identity.

## X / Twitter profile picture

Use **`tincta-rewards-pfp-400.png`** for the profile picture. `tincta-rewards-pfp-1024.png` provides a larger version. Both are square, opaque white PNGs with the same inset, keeping every tip inside a circular crop. Do not crop tightly or enlarge the artwork inside the square.

The `tincta-rewards-pfp-kit.zip` contains both PNG sizes, the white-background PFP SVG, a transparent SVG and 1024 px transparent PNG for design work, and this guide. The transparent files are supporting assets; the white PNGs are the intended profile uploads. No account image has been uploaded or changed.

## Canonical artwork

`geometry.json` is the authored vector reconstruction of [the approved sketch](../artwork-study-06/sketches/c-open.png). The ten planes retain its silhouette and separate center; precise solid colors replace the raster's slight shading. The immutable collection/NFT artwork remains separate.

Generate/check every derivative with:

```sh
node scripts/generate-tincta-brand.mjs
node scripts/generate-tincta-brand.mjs --check
```

The generator produces the shared `RewardsArtwork` component, all three public SVG copies, social-image signature and PFP exports from this master. Do not edit generated copies independently. Standard artwork keeps its 1254-square view box. Profile exports use the documented 0.86 inset.

## Application

- Parent Landing: Rewards project panel.
- Rewards Landing: hero, header and footer.
- Web/docs: shared header/footer and wallet collection welcome artwork.
- Launch: shared branding in login, sidebar, mobile navigation and loading/error/not-found shells.
- Generated Mainnet X images: Open artwork beside the Ligature wordmark. Sepolia retains its existing neutral network branding.

The artwork keeps its approved warm palette; it does not cycle through season colors or rotate. Existing seasonal palettes, Morph/Assembly artwork, protocol behavior and frozen exports are unchanged. This is a local implementation; publishing the apps or updating an X account is separate.

The Rewards hero has a user-requested floating animation (23 October 2026): the folds gently open and settle while the center lifts independently over eight seconds. Landing-scoped CSS translates the original planes without changing their paths, palette or orientation. The reserved square prevents layout movement. Motion pauses offscreen/in hidden tabs and reduced-motion preferences show the canonical static composition, including before hydration. Other placements remain static. The existing hero pause-control exception in the visual standard applies.

Local verification and remaining evidence boundaries are recorded in `verification.md`.
