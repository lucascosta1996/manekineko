# Seasons and collection appearance

Read [the architecture handoff](architecture.md) for current versions, deployment evidence and migration gaps. The local Launch/preparation/worker baseline is V10, including permanent-number previews, versioned registry pins and migration 026. Live database/registry rollout, hosting and rehearsal remain pending; see [the V10 handoff](permanent-combinations-v10.md). Appearance introduced in V6 remains supported by version-specific migrations. Existing saved drafts, catalog season identities, order/names/colors and finalized exports are preserved; a new default never silently rewrites them.

The launch console manages a season as a named, revisioned group of one to ten collections. A season receives a nonzero 32-byte ID when its draft is created. Every collection in that season carries the same ID and season name, and keeps its own collection name, six-digit hex background color, supply, price, prize terms and deadline.

The existing authenticated automation APIs and audit tables persist this aggregate. Saving is an editable draft; preparation freezes the reviewed payload and hash. Preparation alone does not deploy anything or start a worker. A future executor still needs a pinned chain preflight, the preceding collection’s confirmed sellout, verified draw and fully backed prize liabilities, and the existing failure/expiry gates. Current V8/V9 rollover does not wait for every holder to claim.

## Network workspace and current defaults

The season page has separate **Ethereum Mainnet** and **Sepolia testnet** views. The 22 catalog seasons (216 collections) belong to Mainnet. Existing fictional test configurations, including Aster Vale / Cinder Study, appear in the Sepolia view as finalized season references. The switch filters saved plans by their persisted chain ID; it does not rewrite a selected season's network or submit transactions. Unsaved edits require an explicit discard before switching.

New editable collections default to **1 paid referral to qualify**. All 216 Mainnet catalog collection drafts use that value and the V9 wallet limit inherited by V10. The configured affiliate pool and payout cap remain independent settings. The payout example assumes every offered position qualifies at the minimum and recalculates when the position count changes. With a 0.01 ETH ticket, one referral and a 30% common payout cap, each affiliate receives 0.003 ETH in this minimum-referral example; more positions change the aggregate distribution even if the individual cap remains the same. Finalized or deployed test collections retain their original immutable qualification terms.

The private staging database may store Mainnet season **drafts**, but its API and database still block preparing Mainnet deployment artifacts. Standalone configurations, deployed collection records and indexing remain Sepolia-only in this environment. Mainnet execution needs a separately configured environment; this switch is planning separation, not an enabled Mainnet deployment service.

Migration `023_season_network_planning.sql` adds this narrow draft exception to the staging season constraint. `node scripts/organize-season-networks.mjs` previews the saved-plan transition; `--apply` backs up and updates the editable catalog records using revision checks. IDs, names, artwork colors and ordering are preserved. Old Sepolia deployment addresses and opening dates are cleared when moving a draft to Mainnet, and finalized snapshots are checked for exact preservation. Re-running the script is idempotent.

## Collection naming catalog

`seasons.json` remains the source of season order, themes and exact colors. `collection-names.json` assigns a distinct creative name to each season/color pair. The naming catalog is used by private launch tooling and artwork previews; upcoming public teaser cards continue to expose only colors. See [the full naming guide](brand/tincta/collection-names.md).

To apply these names to the original imported local drafts, run `node --env-file=apps/launch/.env.local --import tsx scripts/name-season-drafts.mjs` for a dry run, then repeat with `--apply`. The operation checks canonical season IDs and color order, refuses customized names or prepared seasons, and updates only collection names and step labels using revision-checked saves. It saves a private backup before committing. It does not alter colors, economics, timing, deployed collection records or finalized exports.

Regenerate the artwork review boards with `node --import tsx scripts/preview-tincta-artwork.mjs`. Future launches receive the saved name through the existing contract name field and on-chain SVG renderer. Existing deployed NFTs retain their original names.

## Appearance

New season-aware V6 launch terms include `seasonId`, `seasonName`, `collectionColor` and `textColor`. Names and colors are included in the finalized content hash and passed to the deployment CLI. The NFT SVG displays the season name in place of the fixed protocol title and the collection name in place of the round label. The collection color fills the NFT background; the launch preview uses the same color for the collection name badge.

`@manekineko/contract-abi/season-appearance` normalizes `#RRGGBB` and chooses whichever of black and white has the higher relative-luminance contrast. This calculation runs before deployment. The reviewed text color is stored with the other appearance terms, so the SVG remains entirely on chain and independent of the launch frontend after deployment. A submitted text color that disagrees with the calculated value is rejected. Season names are limited to 64 UTF-8 bytes; collection names retain the contract’s name limit.

## Persistence and compatibility

Migration `018_collection_seasons.sql` adds nullable appearance fields to `manekineko_collections`. Null values preserve historical collections without changing their metadata. Appearance rows must have all four fields and canonical values. Migration 018 introduced V6 support; later migrations extend the version constraints through V9. A database guard serializes collection registration per network and season ID, limits the season to ten collections, requires consistent season naming, and prevents appearance changes after registration.

Existing finalized configurations, prepared automations, and their hashes are never rewritten. Historical V4/V5/V6 exports remain readable. A historical V6 export without season appearance cannot be prepared for deployment with the current season-aware V6 implementation; create a new draft and explicitly review its season appearance instead.

Migration files must be tested against an isolated database before remote rollout. These changes do not update already deployed contracts or start automated deployments.
