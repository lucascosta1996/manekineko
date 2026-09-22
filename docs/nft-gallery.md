# NFT gallery

The web app's **My NFTs** section shows real, confirmed Tincta tickets from registered V5–V10 collections. Visitors can connect a wallet for address access or enter a public address; viewing does not require a signature, chain switch, or transaction.

It also shows past wins and the wallet's [lifetime winner reward](winner-credits.md), verified against the canonical on-chain registry. A winning wallet can redeem one operator-sponsored mint in a later eligible collection; further wins do not add more. Missing registry configuration displays an unavailable state; eligibility is not fabricated from database rows.

## V10 architecture and verification boundary

V10 contract source gives each NFT permanent Solidity-generated numbers and finished on-chain artwork from mint. Its numbers encode token identity, while one post-sellout VRF draw supplies the final scores and configured winning NFTs. Buyers pass no numbers or seed to mint. Permanent JSON/SVG deliberately omit score, prize, award rank and changing lifecycle status, so explorers do not need a reveal refresh to acquire the numbers.

The local gallery queries, canonical reader, trait validator, previews and score presentation support V10. The reader verifies permanent `combination` data and `tokenIdForCombination` before finalization, validates exactly the five numeric identity traits, and rejects mutable Score/Status/award/prize fields. Pending score is `null`, never a settled zero; after finalization strict `score` and `scoreCombination` reads verify the separate result. Factory/version/code-hash pins, token existence and canonical block checks still apply. Visible numbers do not prove the draw is complete. See the [V10 handoff](permanent-combinations-v10.md).

V8/V9 keep their actual sealed/revealed artwork and their immutable historical terms. V10 removes that metadata transition but cannot guarantee an explorer's initial indexing time or rendering support. No V10 explorer or connected-wallet verification is recorded here.

## Routes

| Route | Purpose |
| --- | --- |
| `/my-nfts` | Wallet picker and NFT gallery. |
| `/my-nfts?wallet=0x…` | Shareable, read-only portfolio for a public address. |
| `/nfts/[collectionId]/[tokenId]` | Shareable ticket page with original SVG, combination, score, collection status, ownership, and external links. |
| `/api/nfts?wallet=0x…&view=minted&status=all&page=1` | Confirmed portfolio data, counts, and pagination. |
| `/api/nfts/[collectionId]/[tokenId]` | Verified on-chain metadata and the corresponding indexed ticket record. |

The gallery API accepts `view=minted|held`, `status=all|ongoing|completed|refundable`, and pages from 1 to 10,000. Page size is fixed at 12. Invalid, duplicate, or unknown parameters return HTTP 400. Database/RPC failures return a sanitized HTTP 503; an unknown confirmed ticket returns HTTP 404 from the detail API. Responses are not cached by the browser or CDN.

## Indexed provenance and ownership

Data comes from `manekineko_chain_events`, deployments, collection state, checkpoints, and winner records in PostgreSQL. There is no mock-data fallback or separate ownership indexer.

- **Minted** includes tickets the address paid to mint and tickets originally minted to that address. `mintedBy` identifies the payer; `mintedTo` identifies the original recipient. A gifted ticket therefore appears in both parties' mint histories.
- **Held** uses the latest confirmed ERC-721 `Transfer` recipient. Incoming transfers appear here even when a different address originally minted the NFT.
- Transferring a ticket away does not erase its mint history. A burn produces a null current owner; `Refunded` logs identify redeemed refunds.
- Ongoing collections exclude `complete` and `refundable`. Completed collections have a delivered prize; refundable collections have their own filter.
- Minted and held counts cover the full wallet history. Ongoing and completed counts follow the selected view, independently of pagination and the status filter.

Each request uses one parameterized PostgreSQL statement, giving counts and rows one consistent database snapshot. Events are bounded by the associated collection state's confirmed block. A trusted indexer checkpoint must cover that block and match its hash when both are at the same height. The existing indexer atomically replaces orphan events and projections after a reorganization, so there is no secondary ownership cache to repair.

Only deployed V5–V10 collections with the exact supported contract/algorithm pair and their independently configured trusted factories are eligible: V5 uses `unique-rank-v2`, V6 uses `unique-rank-v3`, V7 uses `unique-rank-v4`, V8/V9 use `unique-rank-v5`, and V10 uses `unique-rank-v6`. V6–V9 combinations use the round's on-chain `scoreCombination` decoder; the displayed packed code is not its score. `MANEKINEKO_CHAIN_ID` isolates a deployment to its configured network. Existing factory address/code-hash settings also govern gallery eligibility. Public responses omit internal factory-verification fields.

## Integrated V5–V9 SVG and numbers

The metadata reader verifies the configured RPC network, pinned factory runtime hash, factory-to-round registration, renderer address, version, round ID, supply, revealed state, and NFT ownership. Contract reads use EIP-1898 block-hash tags with `requireCanonical: true`; a final block-hash check rejects a reorganization during the request.

The image comes directly from the contract's base64 JSON `tokenURI` and embedded base64 SVG. The server accepts only the immutable versioned renderer's passive SVG elements and attributes, with bounded payloads. Remote assets, scripts, event handlers, styles, external entities, and unknown markup are rejected. The browser displays the validated URI as an image, never injected SVG markup.

Revealed A/B/C/D values and score must match both `combination(tokenId)` and the metadata traits. Only V5 uses the direct rank formula:

```text
score = 1 + (A - 1) × 4096 + (B - 1) × 256 + (C - 1) × 16 + (D - 1)
```

V6–V9 instead decode the score permutation through the actual round. The formula above must not be used as their score or as a V10 score. V10 uses the shared permanent-identity decoder and separate draw-state verification, because its metadata has no Score trait.

Unrevealed V5–V9 tickets remain sealed; the app does not invent numbers for those tickets. Burned tickets stay in mint history, but `ownerOf` and `tokenURI` no longer exist for them, so their detail response explicitly reports a burn without invented artwork.

## External links and limits

Ethereum mainnet tickets link to OpenSea and Etherscan. Sepolia tickets link to Blockscout for external artwork and traits, with Etherscan retained as a public explorer record. OpenSea no longer provides testnet support, so no obsolete OpenSea testnet URL is generated. See [OpenSea's testnet retirement notice](https://support.opensea.io/en/articles/11833955-farewell-testnets).

On September 18, 2026, the existing Sepolia rehearsal's NFT #16 was verified rendering its original on-chain SVG on [Blockscout](https://eth-sepolia.blockscout.com/token/0xAfFd7dc1B6A0D8974040F3216316240B724715A9/instance/16), with numbers `1 / 1 / 1 / 13` and score `13`. Its previously cached `Sealed` metadata required an explicit refresh. This changes only Blockscout's cache: the contract, token URI, artwork, ownership, and prize remain unchanged.

The completed refresh pass verified that all 20 tickets' complete external metadata, images, and traits matched their canonical on-chain `tokenURI` values. The winning ticket #3 was also visually verified on Blockscout with numbers `1 / 1 / 2 / 4` and score `20`. The local verification report is `.vercel/nft-gallery/blockscout-refresh.json` (public chain data only; excluded from deployment uploads).

The contract supports ERC-721 metadata and ERC-4906, and emitted `BatchMetadataUpdate(1,20)` when revealed. That event does not guarantee every explorer refreshes its cache. Blockscout's [ERC-4906 implementation issue](https://github.com/blockscout/blockscout/issues/11236) was still open at verification time. Etherscan Sepolia continued displaying an image placeholder and stale `Sealed` traits; no self-service refresh control was exposed on that page, and no supported NFT refresh API was found. Do not report Etherscan's preview as fixed merely because the contract or another explorer renders correctly.

### V8 sealed cache investigation (2026-09-21)

The completed Cinder Study V8 collection, `0xf564cc9cA88A036211dC37cBDc4F116f18a22cb2`, reproduced the same explorer cache issue on [token #81](https://eth-sepolia.blockscout.com/token/0xf564cc9ca88a036211dc37cbdc4f116f18a22cb2/instance/81). A direct Sepolia read at block **11747890** verified `totalMinted = maxSupply = 1000`, `revealed = true`, `prizePaid = true`, and `claimedAwardCount = 6`. Its current `tokenURI(81)` contains numbers **5 / 7 / 16 / 11**, score **81**, award rank **0**, and SVG status **REVEALED**. Blockscout's cached JSON instead contained only `Status: Sealed` and the old sealed SVG.

The deployed round supports ERC-4906 and emitted `BatchMetadataUpdate(1,1000)` at block **11746758**, in [the reveal transaction](https://eth-sepolia.blockscout.com/tx/0x124c0d93c8d0b9f09213df5150e852f32295915cb72e2cb5a0ad204122b86d4b). No contract or renderer mutation is needed to reveal this NFT. The renderer replaces the sealed status trait with number/score traits; the revealed outcome label is in its SVG. Prize claims do not change the artwork back to sealed.

The existing refresh tool submitted one metadata refresh for #81. Blockscout acknowledged it, but the cache failed to match during the initial 60-second polling window and a read-only check at block **11747902**. After the provider's delayed processing, a fresh check at block **11747946** confirmed the complete JSON, SVG and traits matched the contract. The public-data-only local reports are `.vercel/nft-gallery/v8-token81-live.json`, `.vercel/nft-gallery/v8-token81-refresh.json`, `.vercel/nft-gallery/v8-token81-recheck.json` and `.vercel/nft-gallery/v8-token81-confirmed.json`. This single-token repair used no chain transaction or deployment.

[NftMetadataLifecycle.ts](../apps/contracts/test/NftMetadataLifecycle.ts) now verifies both V8 and V9 from sold-out/sealed through reveal and all six prize claims. The two local tests passed and prove correct generated metadata and ERC-4906 signaling, not automatic explorer refresh. V9 can encounter the same external cache issue; do not alter historical contracts or relabel a deployment to address it.

### Refreshing historical Sepolia explorer metadata

For supported V5–V9 collections, after a reveal or refund status change, compare external metadata against `tokenURI` and refresh stale entries:

```sh
node --env-file=.env.staging.local scripts/refresh-nft-explorer.mjs \
  --contract 0xAfFd7dc1B6A0D8974040F3216316240B724715A9 --from 1 --to 20

node --env-file=.env.staging.local scripts/refresh-nft-explorer.mjs \
  --contract 0xAfFd7dc1B6A0D8974040F3216316240B724715A9 --from 1 --to 20 \
  --refresh --output .vercel/nft-gallery/blockscout-refresh.json
```

The tool uses `SEPOLIA_RPC_URL` only for reads and needs no wallet or signing key. Check mode does not request refreshes. Refresh mode uses the documented single-instance `PATCH /api/v2/tokens/{address}/instances/{id}/refetch-metadata` endpoint, then verifies the resulting image and metadata against the contract. A queue acknowledgement alone is not a successful refresh. Requests are sequential and bounded; stop on a rate-limit or authorization challenge. The verified Blockscout version's default allowance is [50 refreshes per hour per IP](https://github.com/blockscout/blockscout/blob/a6f05591/apps/block_scout_web/priv/rate_limit_config.json), subject to deployment overrides and worker throttling. For larger collections, schedule bounded batches within the provider's quota or obtain supported provider access; do not increase concurrency or bypass CAPTCHA.

This manual operator tool is separate from the [durable Indexer refresh queue](nft-metadata-refresh.md), implemented on 2026-09-21 and kept local at the user's request; staging activation is deferred. The queue verifies results across cron invocations, so a response delayed beyond 60 seconds is recoverable without another manual request. External refresh work stays separate from settlement, so an explorer outage cannot block prize delivery. Before any V5–V9 mainnet launch, independently verify sealed artwork, revealed artwork, and traits on the intended marketplace/explorer; Sepolia Blockscout success does not qualify Etherscan or OpenSea mainnet by itself. The NFT remains fully on-chain: there is no hosted image URL, mutable renderer, or off-chain metadata replacement.

This is a gallery for registered V5–V10 collections, not an index of every NFT in a wallet. New mints and transfers appear after indexer confirmations and the next UI refresh, including transactions submitted outside this website. Artwork loading also depends on the configured RPC provider. The UI keeps a retry path for unavailable metadata. External marketplaces control their own indexing and image availability.

## Database access and validation

The web runtime needs `SELECT` on `manekineko_chain_events` and `manekineko_indexer_checkpoints`, in addition to its existing collection/winner read permissions. It receives no write permissions on these tables. The staging helper validates the pinned Sepolia database marker, exact database identity, and restricted role before applying only those two grants:

```sh
node scripts/setup-nft-gallery-staging.mjs          # verify only
node scripts/setup-nft-gallery-staging.mjs --apply  # apply the two staging SELECT grants
npm test --workspace @manekineko/web
npm run typecheck --workspace @manekineko/web
npm run build --workspace @manekineko/web
node --test scripts/refresh-nft-explorer.test.mjs
```

The SQL integration regression is opt-in and uses only connection-local temporary tables, removed by rollback. Supply a local development database URL through the environment; do not put remote credentials in command history:

```sh
TEST_NFT_DATABASE=1 node --experimental-strip-types --test apps/web/test/nft-gallery.test.ts
```

`TEST_NFT_DATABASE_URL` must already contain the local connection URL. The regression covers batch mints, third-party payers/recipients, transfers in and out, burns/refunds, winner state, phase filters, pagination, chain/factory isolation, confirmation boundaries, event ordering, and reorganization cleanup. Metadata and wallet tests cover canonical reads, ABI/trait agreement, SVG rejection, errors, and account-change invalidation.
