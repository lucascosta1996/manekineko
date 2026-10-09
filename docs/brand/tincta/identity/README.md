# Tincta drawn signature

Direction **06 — Drawn signature** from [logo study 01](../logo-study-01/README.md) was selected by the user on 2026-09-23 UTC for Web, Launch and Landing. The lowercase, path-drawn wordmark is the primary logo. Its compact lowercase **t** is the companion for favicons and wallet/brand moments.

The chosen geometry is preserved: shared t construction, open rounded lowercase lettering, single-storey a and square i dot. The wordmark has no period and needs no symbol beside it. “Tincta” remains the written brand name in prose, metadata and accessible labels.

## Usage

- Use the full wordmark in app headers, footers and the Launch sign-in page. Keep its `270 × 84` view box and natural aspect ratio.
- Use the compact t at square sizes. Favicons use the study’s wider small-size companion on the existing dark rounded tile.
- Inline components inherit `currentColor`. Default static assets use ink `#111111`; reversed assets are white. Season palettes continue to provide contextual color.
- Provide an accessible name for standalone logos. Inside a link already labeled “Tincta home”, use `title=""` to make the SVG decorative.
- Do not add a second typeset name or the old geometric T beside the wordmark. Do not stretch it or replace the paths with a font approximation.

## One authored source

[geometry.json](geometry.json) is the canonical geometry. The app components and public SVGs are generated copies so each independently deployed app contains its complete assets without a new runtime package or remote font.

```sh
node scripts/generate-tincta-brand.mjs
node scripts/generate-tincta-brand.mjs --check
```

The generator writes the wordmark, companion and reversed SVGs into this folder and all three apps’ `public/` folders; it also writes their `components/tincta-logo.tsx` and `app/icon.svg`. Edit the master and regenerate instead of editing generated files individually.

Existing minted artwork, immutable contract renderers, saved deployment exports and historical social studies retain their original signatures. This is application branding, not a protocol or metadata migration. Indexer and worker services have no separate visual app shell.

## Verification

Local verification on 2026-09-23 UTC:

- All 23 generated assets/components match the canonical geometry (`--check`).
- Web, Launch and Landing each pass typechecking and a production build.
- Desktop browser review at 1280 px confirmed wordmark proportions in Web documentation, Launch login/workspace and Landing. All three pages expose the same generated SVG favicon.
- At 320 px, Web’s My NFTs header/footer and companion marks, Launch’s authenticated header/menu, and Landing’s header/footer fit without horizontal page overflow. Web and Launch mobile menus opened and closed with Escape.
- Launch authentication succeeded and the workspace shell rendered, but season data displayed “Launch access is temporarily unavailable.” This review establishes its branding and shell layout, not working season-data access.

This is local implementation and browser evidence. No hosted deployment, database or chain change was performed for the logo update.

## Tincta Rewards subproject lockup · 2026-10-09

The approved quiet label identifies the current application as **Tincta Rewards**, a subproject of Tincta. In Landing and Web headers/footers and Launch branding, wrap the unchanged canonical wordmark in `RewardsBrand` from `@manekineko/ui/rewards-brand`. This approved subproject descriptor is the exception to the prohibition on adding a second name beside the logo; never recreate or alter the parent wordmark.

Use the shared 14 px gap and title-case “Rewards” label: system sans, 13 px/20 px, weight 500, 0.01em tracking, 2 px vertical / 8 px horizontal padding, 3 px corners, #fafafa surface, #ddd border and #555 text. Dimensions scale in rem. Retain existing desktop/mobile/footer wordmark sizes. The label is not a button. Home links are named “Tincta Rewards home”; standalone lockups are named “Tincta Rewards”. Parent-brand assets, favicons and artwork signatures remain Tincta. A separate parent-brand landing page is future work.
