# Season images and X delivery

The approved visual system is in [the social review kit](brand/tincta/social/index.html): a 1600 × 900 white frame, Tincta wordmark, ordered season palette, stable geometric linework, and collection names over the colors. The original PNG/SVG review files remain unchanged. Their sample dates, sample totals and `example.invalid` URLs are design specimens, never inputs for publication.

The production implementation uses [season-social.ts](../packages/contracts/src/season-social.ts) for copy and validation, [season-social-image.ts](../packages/contracts/src/season-social-image.ts) for a pure SVG renderer, and [the worker image adapter](../scripts/season-runner/social-image.ts) for PNG rendering and a content hash. These share the existing `tincta-motifs.ts` and `season-appearance.ts` artwork, not a generated replacement brand. The Launch console imports the same pure modules as the worker. PNG output requires the workspace's Sharp runtime.

## Frozen identity and evidence

`SeasonSocialInput` takes a stable bytes32 season ID, exact season name, season number, ordered hex palette and exact collection name/color/position. It works with the Mainnet catalog and fictional Sepolia seasons. Changing network must not regenerate a season's ID or reorder its colors. Supply, price, award count and award amount come from the collection's immutable V9/V10 terms. Dates are UTC; amounts are decimal strings. The module does not fetch, guess or verify chain state itself: the runner is responsible for canonical receipts, confirmation depth and event eligibility before calling it.

The explicit contract version selects copy: V10 explains permanent numbers from mint and later results, while V9 keeps its historical reveal wording. Unknown versions fail validation.

No sample defaults exist in the production template builder. Required fields, invalid timing, unresolved placeholders and missing public links fail closed. All Sepolia main posts begin with `[Sepolia test]`, and every Sepolia image carries `SEPOLIA TEST · TEST ETH`. Launch previews add `DESIGN PREVIEW`; a preview is never proof of an on-chain transition. Use the configured public Web/docs URLs as inputs, with the correct chain and collection path. The builder rejects private and reserved sample URLs; deployment/release validation must also verify those public destinations resolve correctly.

## Events and wording

| Event | Required evidence before publication | Image/copy |
| --- | --- | --- |
| `upcoming-season` | Started, frozen and publicly approved season | Season name, exact colors and collection count |
| `affiliate-opening-soon` | Valid future enrollment opening and a prepared admission path | Recomputed opening countdown, UTC date and documentation reply |
| `affiliate-enrollment-open` | Enrollment actually available, seats remain, chain time before sale start | Enrollment link and fixed mint start; a full program cannot move minting earlier |
| `collection-live` | Confirmed activation, sale window open, tickets remain | Exact supply, price, prizes and deadline |
| `collection-sold-out` | Confirmed canonical sellout and affiliate allocation | Affiliate claim link; distinguish pending draw from an already verified draw |
| `winners-revealed` | Verified canonical draw and all configured winning NFTs | One reply per award, token and holder at a pinned block; unpaid-prize or fully-claimed wording |
| `refunds-available` | Expired unsold collection, canonical refund state | Holder-initiated mint-price refund, NFT burn, gas excluded |
| `season-complete` | All planned outcomes terminal, required draws verified, reconciled season snapshot | Sold-out collections, minted NFTs, actual prizes claimed and actual commissions claimed |

Sellout is not evidence that prizes were paid. V9/V10 prizes are claimed by winning NFT holders after the verified draw; qualified affiliates claim their earned commissions after sellout. A delayed VRF callback for a sold-out collection never qualifies it for the unsold-refund post. Completion does not extinguish outstanding prize, commission or refund claims.

The winners input includes each rank, token ID, holder address and pinned holder block. A confirmed payment includes its rank/token, award amount, claimant, recipient, transaction hash and log index. Claim receipt URLs use the correct Mainnet/Sepolia Etherscan host. Payment replies have stable `payment:<transactionHash>:<logIndex>` identities. The worker can append newly confirmed payment replies to the original winners thread without reposting its main image or earlier replies. Reconciliation must derive payment data from successful canonical claim logs, not an allocation, submitted transaction or winning NFT alone.

## X account setup

Use a test X account for Sepolia and the production account for Mainnet. Each chain's connection stores an expected numeric X account ID, display handle and four OAuth 1.0a user-context credentials: API key, API key secret, access token and access token secret. An API key or app-only bearer token alone cannot publish as a user. Enable user authentication with write permissions in the X Developer Console, and authorize/regenerate the user token when changing account or permissions. The app must have access/credit for the required endpoints under its current X plan.

The adapter checks `GET /2/users/me` against the expected account ID before every upload, metadata update and post. The current username is read from X rather than trusted as identity; handles can change. A mismatch stops before the write. Configure the numeric ID independently; changing only a display handle cannot silently retarget the worker. Keep all secrets server-side. Launch's saved settings encrypt the credentials; the runtime receives a decrypted server-side copy and never includes secrets in public payloads, source files, response logs, image metadata or social copy. Rotating a connection while a run is publishing must pause/review that run before continuing its thread under another identity.

The adapter uses these current v2 endpoints:

- `GET https://api.x.com/2/users/me` — authenticated user check.
- `POST https://api.x.com/2/media/upload` — JSON with base64 PNG and `media_category: tweet_image`; maximum local upload size is 5 MiB.
- `GET https://api.x.com/2/media/upload?media_id=…&command=STATUS` — wait for asynchronous media processing if returned.
- `POST https://api.x.com/2/media/metadata` — image alternative text, at most 1,000 characters.
- `POST https://api.x.com/2/tweets` — image post or a reply using a previously persisted post ID.

The [official X OpenAPI schema](https://api.x.com/2/openapi.json) lists OAuth 1.0a `UserToken` support for those endpoints; the media metadata schema includes `alt_text.text`. Reference pages: [media upload](https://docs.x.com/x-api/media/upload-media), [media metadata](https://docs.x.com/x-api/media/create-media-metadata), and [authentication mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping). These were checked for this implementation; authenticated production access still needs an actual account rehearsal.

## Durable publishing contract

The low-level adapter never retries a write. Its functions are deliberately independent so the worker can commit each result to the outbox:

1. Validate the event's fresh confirmed snapshot and URLs, build copy, render PNG, and persist the content plus PNG hash. Messages include a generation time and validity boundary: relative countdowns expire after at most 60 seconds or their opening boundary, and mint-live posts expire at the immutable deadline. A known-unsent `pending`/`failed` entry can refresh from a new valid message and discard its old upload. A `sending`, `uncertain` or `confirmed` entry cannot refresh or auto-repost.
2. Verify the configured account. Upload the PNG and immediately persist its media ID, upload time, expiry and processing state. If processing is pending, poll its status and persist progress. Never create the post with unfinished media.
3. Set the alt text, then persist that stage. If an upload expires before posting, replace the upload through a new persisted media stage; never reuse expired media indefinitely.
4. Persist a `sending` intention before `createXPost`. Persist its returned post ID before attempting any reply.
5. For each reply, persist its stable identity, parent post ID and `sending` state first, then persist its returned ID. Resume at the first uncompleted reply, preserving the thread order.

Immediately before the public POST, after the account lookup, the outbox rechecks its validity boundary and invokes the runner's fresh protocol-state guard. If an upload took too long, it returns a retryable content-expired condition before publication so the next cycle can generate a fresh countdown. A confirmed root is returned without a write, and its remaining static link replies can finish after the opening window; a separate reply guard can still revalidate canonical claims. Explicit numeric `Retry-After` delays are persisted and respected across retries.

`createXPost` throws `AmbiguousDelivery` when a network timeout, server error, malformed response, partial success, missing post ID or oversized response prevents a reliable result. The post may already exist. The outbox must stop and mark the write as uncertain; it must never retry that entry automatically. A process crash after a persisted `sending` intention has the same ambiguity. Reconcile the account's actual posts and record the matching post ID (or independently establish non-delivery) before proceeding. The X endpoint does not supply an idempotency key used by this implementation. A retry loop cannot turn it into exactly-once delivery.

`verifyXPost(credentials, candidateId, recordedIntent, options)` performs read-only reconciliation using [post lookup](https://docs.x.com/x-api/posts/get-post-by-id). It requires the configured author ID, exact stored text after X's URL expansion, original reply parent and uploaded media ID. Only X's verified trailing attachment URL is removed from the comparison. It does not trust a supplied ID or matching text alone, and it never publishes a replacement. Both the current `post.fields` API naming and the earlier `tweet.fields` naming are supported for lookup. A candidate mismatch leaves the uncertain outbox entry unresolved.

Explicit HTTP rejections such as 401/403/429 are `XApiError` results. A numeric `Retry-After` is exposed for rate-limit scheduling. Errors intentionally omit response bodies, auth headers and underlying network exception text, which can contain credentials. Requests refuse redirects, have a bounded timeout and accept at most 64 KiB of response JSON. Media upload/alt stages do not create a public post; their retries still belong to the persisted worker state.

Post text follows X's [weighted character rules](https://docs.x.com/fundamentals/counting-characters), using NFC normalization, the documented single-weight Unicode ranges, weight 2 elsewhere, and 23 characters for a standalone validated HTTPS URL. The implementation deliberately does not collapse multi-code-point emoji: it may reject some otherwise valid posts but will not undercount those emoji. Generated links are always standalone lines. Every main post, ordinary reply and repeated winner/payment reply is checked after substitution. Long custom names or amounts can require editing the frozen plan/copy before starting; the worker must not truncate financial facts to make them fit.

## Verification and future changes

Run:

```sh
node --import tsx --test scripts/season-runner/social.test.ts scripts/season-runner/social-image.test.ts
```

The tests cover all eight PNG dimensions, all 22 catalog identities, fictional Sepolia identity, stable output hashes, visible preview/test labels, weighted lengths, timing and URL rejection, complete winners and claim receipt identities, the published OAuth signing vector, account mismatch before write, v2 upload/alt/reply payloads, rate rejection and ambiguous-delivery behavior. They use injected HTTP responses; they do not authorize or publish an X post. A local contact-sheet inspection confirmed the palette, headings, motif and information hierarchy. End-to-end proof additionally requires the encrypted settings database, a running worker, a funded V9 deployment, canonical indexing, a connected holder wallet for claims, and real test-account X upload/post permissions.

When adding an event, update the shared event union, copy builder, renderer if layout changes, worker eligibility/outbox mapping, Launch preview and focused tests. Keep old approved specimens as review references. Do not replace real-run evidence with an attractive sample image, and do not turn a publish timeout into a duplicate post.
