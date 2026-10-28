# Tincta Ligature

**C / Ligature** from [logo study 02](../logo-study-02/README.md) was selected by the user on 2026-10-21 for all websites/apps, favicons and generated Twitter/X images. It supersedes direction 06, whose study remains historical. The selected TC monogram and spaced uppercase TINCTA outlines are preserved exactly.

“Tincta” remains the written name in prose, metadata and accessible labels. The lettering uses Instrument Sans at weight 500 with the study's explicit tracking and pair adjustments; the included [SIL Open Font License](InstrumentSans-OFL.txt) records its source. No installed or remote font is needed to render the logo.

## Usage

- Use the outlined wordmark in headers, sign-in, workspace/recovery shells and the off-chain mint preview signature. Preserve the `3947 × 780` view box and natural aspect ratio. Desktop wordmarks use 72 px; mobile wordmarks use 64 px, within the existing accessible link targets.
- Use the TC companion in parent-brand square positions. SVG favicons and the 16/32/48 px ICO use the selected optical micro drawing on the existing dark rounded tile. Apple touch icons are 180 px PNGs. Rewards product artwork uses the separately approved Open form.
- Generated Genesis, season and collection social-image headers use the TC glyph alone (user selection, 2026-10-28). The parent TC + TINCTA lockup remains available for parent-brand uses. All lettering and symbols are paths, never font approximations. Parent static assets use #111111 or reversed white; Open retains its warm palette.
- Provide an accessible name for standalone logos; use `title=""` inside an already named home link. Keep at least 12 px exterior clear space around the lockup; its internal symbol, wordmark and badge gaps follow the shared 8 px token.
- Do not stretch, retype, add a period, or combine old and new marks. Season colors and artwork retain their exact existing identities.

## One authored source

[geometry.json](geometry.json) owns both drawings. Regenerate and verify:

```sh
node scripts/generate-tincta-brand.mjs
node scripts/generate-tincta-brand.mjs --check
```

The generator produces 55 artifacts: parent wordmarks/marks/lockups, transparent campaign references, app logo components, SVG/ICO/Apple icons, the shared Open artwork component and public SVG copies, Open PFP exports, and the path-only social signature in `packages/contracts/src/tincta-brand.ts`. App copies are self-contained for independent deployment. Never patch generated copies individually.

The worker and Launch social preview share `season-social-image.ts`. Both Mainnet and Sepolia images use the canonical 56 px TC glyph in the existing 1600 × 900 frame. Sepolia retains visible test labels. The local social-template and upcoming-season renderers use the same generated glyph. Saved gallery images remain dated review artifacts until regenerated.

Existing minted artwork, immutable contract renderers, saved deployment exports, sent posts and historical campaign originals retain their recorded signatures. This identity change is not a protocol, token-metadata, queue replay or X-account update. For new raster campaigns, use the canonical assets here as logo references; historical prompts under `output/social` are provenance, not the current identity specification.

## Verification

Parent identity validation is recorded in [the Ligature acceptance record](ligature-verification.md); the subsequent Open artwork update has [its own verification record](../rewards-open/verification.md). Previous direction-06 verification remains in Git history and the first study; it does not establish acceptance of this change. Hosted deployment and live X delivery require separate evidence.

## Tincta Rewards subproject lockup · 2026-10-09

The approved quiet label identifies the current application as **Tincta Rewards**, a subproject of Tincta. In the Rewards landing (`/rewards`) and Web headers and Launch branding, wrap the unchanged canonical wordmark in `RewardsBrand` from `@manekineko/ui/rewards-brand`. This approved subproject descriptor is the exception to the prohibition on adding a second name beside the logo; never recreate or alter the parent wordmark.

Use the shared 8 px gap and title-case “Rewards” label: system sans, 12 px/18 px, weight 500, no added tracking, 2 px vertical / 8 px horizontal padding, 3 px corners, #fafafa surface, #ddd border and #555 text. Dimensions scale in rem. Retain documented desktop/mobile wordmark sizes. The label is not a button. Home links are named “Tincta Rewards home”; standalone lockups are named “Tincta Rewards”. Parent-brand assets, favicons and artwork signatures remain Tincta. The parent Tincta landing page lives at `/` and uses the unmodified parent wordmark. Rewards keeps its complete landing experience at `/rewards`.

## Rewards artwork update · 2026-10-22

The approved [Open artwork](../rewards-open/README.md) now accompanies the Ligature wordmark on Rewards surfaces and Mainnet social signatures. Its canonical master is separate from the parent mark. `generate-tincta-brand.mjs` also generates its shared component, public SVG copies and PFP exports. The parent wordmark, TC mark and favicons are unchanged by this artwork selection.

## Footer identity · 2026-10-24

Every app footer uses the canonical TC glyph alone, 28 px square, through the shared `FooterBrand`. No footer wordmark, Open symbol or Rewards badge. Header badges remain visible and framed. The compact visual standard governs spacing and typography; generated geometry is unchanged.
