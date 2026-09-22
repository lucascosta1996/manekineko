# Tincta NFT artwork

The first implemented Tincta artwork is a portrait color edition for **new V8 collections**. Internal package and contract names remain Manekineko. This change does not deploy contracts or change existing minted tokens.

## Design

- 640 × 800 SVG; one solid collection color, with the existing automatically selected black or white foreground.
- Small Tincta signature and a padded token serial; season and collection names remain the primary identity.
- The 22 catalog seasons each have a distinct original motif: blooms, arcades, currents, halos, spindles, pulses, fans, chevrons, knots, gyres, interference, facets, ribbons, crescents, vaults, triads, crowns, hearts, butterflies, scallops, weaves and lattices. Sixteen layers of four cubic curves form each centerpiece.
- Each collection's RGB channels introduce small changes in width, height and shear. The existing token/result input contributes only a subtle additional variation. All 216 catalog collections have distinct geometry within their season when compared with identical ticket data. The geometry is decorative and never affects randomness, rank, or prize eligibility.
- Four clearly labeled numbers, score, lifecycle state, and an award label for prize-winning NFTs. No invented numbers or winner information appears before reveal.
- Sealed, revealed, winning, and refundable states. A winning edition remains a winning edition after its prize is claimed; the artwork does not represent a live claimable balance.
- Names are XML-escaped and conservatively fitted, including UTF-8. System sans-serif and monospace fonts keep the SVG self-contained without remote font assets.

Collection names/colors and their ordering continue to come from the saved season definitions and `seasons.json`; the artwork does not create a new palette. Contrast is calculated before deployment and is immutable in the collection.

## Implementation

- `apps/contracts/contracts/ManekinekoRendererV8.sol` produces the actual SVG inside Base64 JSON `tokenURI`. Metadata includes `artwork_version: tincta-v2`; contract/algorithm identifiers, number traits, ranking and prize logic remain unchanged.
- `packages/contracts/src/tincta-motifs.ts` is the authored curve catalog. Its compact numeric data is embedded directly in Solidity, without a runtime dependency on a file or service. The existing imported season IDs map one-to-one to the 22 motifs and retain their identity after a draft rename. Mainnet and Sepolia IDs for the same catalog season map to the same motif. The public `artworkMotif` view exposes that mapping. Custom IDs outside this catalog select deterministically from these 22 motifs; they do not reserve a new unique motif automatically.
- `packages/contracts/src/tincta-artwork.ts` provides the matching preview. Contract tests compare its SVG bytes with the real Solidity output across lifecycle states, colors, long names and escaped text.
- Launch, mint and collection previews select this design only for `unique-rank-v5`. Prior versions retain their original rendering.
- My NFTs and NFT details continue to read actual on-chain metadata; they never replace legacy tokens with a generated Tincta image. Their image layout supports portrait and square artwork.
- The web metadata reader accepts only the necessary passive SVG elements/attributes. URLs, scripts, transforms and unbounded/malformed path data remain rejected.

## Review

Open [motifs-preview.html](./motifs-preview.html) for the 22-season monochrome overview, or [artwork-preview.html](./artwork-preview.html) for three collection variants per season, ordered exactly as `seasons.json`. All 66 seasonal specimens use the same ticket and result so the season/collection differences can be compared directly. The original six `edition-*.svg` lifecycle samples are also refreshed. These use a fixed demonstration key, not real minted tokens or predictions.

Regenerate the specimens after an artwork change:

```sh
node --experimental-strip-types scripts/generate-tincta-motifs.mjs
node --experimental-strip-types scripts/generate-tincta-motifs.mjs --check
node --experimental-strip-types scripts/preview-tincta-artwork.mjs
```

Contract tests compare all 216 catalog collections on both network namespaces (432 SVG pairs) byte-for-byte with the preview, check distinct paths independently of color/text, and verify the mapping survives name changes. Gas tests include every season with long XML-escaped names. Deployment checks include factory constructor arguments in the initcode size.

The renderer is read during `tokenURI` calls; the geometry is not stored per mint and no external image service is required. Tests bound SVG size, RPC rendering gas, and renderer/factory deployment bytecode. This does not guarantee a third-party explorer will immediately refresh or render its cached metadata. External-site verification requires a newly deployed V8 test collection.

The broader app rebrand, landing page, and deployments are separate follow-up work.

## Social announcement artwork

[The social kit](social/README.md) extends the approved upcoming-season image
into affiliate, mint, sellout, verified-winner, refund and season-recap designs.
It includes local PNG/SVG exports, dynamic review rendering, post/thread copy
and event-specific publication conditions. Sample data is labeled explicitly;
this artwork kit does not enable an X publisher or protocol automation.
