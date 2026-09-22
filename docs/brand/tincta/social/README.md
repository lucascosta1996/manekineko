# Tincta social artwork and copy

The **upcoming season** design was approved in the design conversation.
Its original Season 01 PNG/SVG remain unchanged. Seven matching event images
extend that layout, using **Crimson & Blood Orange / Velvet Ember** for review.
The new dates, terms, totals and links are fictional sample data, visibly
identified on each image. The refund image illustrates an alternative unsold
outcome; it does not describe a later state of the sold-out example.

Open [the review gallery](index.html) for every full-size image, post and thread,
or [the contact sheet](contact-sheet.png) to compare the set.

| Template | Main image copy |
| --- | --- |
| Upcoming season — approved | Crimson & Blood Orange |
| Affiliate opening soon | Enrollment opens in 24h. |
| Affiliate enrollment open | Enrollment is open. |
| Collection live | Minting is live. |
| Collection sold out | Sold out. Draw next. |
| Verified winners | Winners revealed. |
| Unsold / refunds available | Refunds are open. |
| Season recap | Season 01 complete. + four statistics |

Every image has a 1600 × 900 PNG, editable SVG and JSON containing alt text,
catalog identity and image metadata. New image metadata also contains its
example post, thread replies and publication condition. Collection images
underline the active collection's number in the palette.

[post-templates.json](post-templates.json) is the reusable copy specification;
[post-templates.md](post-templates.md) explains its fields and event conditions.
[example-posts.md](example-posts.md) contains the rendered review copy.
Winner-wallet and payment-receipt replies are separate repeatable templates.
No fictitious wallets or transaction receipts are fabricated for the examples.

The design reuses the white framing and typography from
[`web-identity.md`](../web-identity.md), the exact ordered palette from
[`seasons.json`](../../../../seasons.json), and the existing season motif from
[`tincta-motifs.ts`](../../../../packages/contracts/src/tincta-motifs.ts).
Each band represents one collection. Catalog names and colors remain exact.
Artwork uses the existing season motif with its collection-color variation;
the season recap uses the season's first-color motif. Text fitting is measured
with the same local renderer as the PNG export, and foregrounds adapt to the
palette. The first season teaser does not need dates or collection terms.

Regenerate the seven event images, gallery, copy and contact sheet:

```sh
node --import tsx scripts/render-social-templates.mjs
```

Use another review data file or output directory:

```sh
node --import tsx scripts/render-social-templates.mjs --data /absolute/path/preview.json --output /absolute/path/output
```

Start with [example-data.json](example-data.json). Set its catalog season and
collection numbers, UTC dates, decimal-string ETH amounts and sample totals.
The renderer requires `status: "design-preview"` and always labels event cards
as sample data. `render-data.json` records the input used for the exported set.
This is a design renderer; it does not verify events or render publication-ready
claims from arbitrary input.

Regenerate an upcoming-season specimen separately:

```sh
node --import tsx scripts/render-season-announcement.mjs 1
```

For that original script, the optional second argument sets the output
directory. The new renderer reuses an existing upcoming-season image if one is
available; it does not overwrite that approved artifact. Both scripts read
the catalog without modifying it and use local `tsx` and `sharp` dependencies.
The SVG uses local system fonts; the PNG freezes the reviewed rendering.
Match the rendering environment when exporting future images to keep
typography consistent.

The copy follows the current V9 source behavior: minting cannot start before
its fixed opening; earned affiliate commissions are claimable at sellout;
prizes require the verified draw and holder claims; unsold refunds require
holder claims. Recap amounts labeled **claimed** must come from confirmed
claim events, with a network/block snapshot.

This directory does not change the Launch planner, protocol contracts or
runtime templates. Its placeholder vocabulary is independent of the current
Launch parser. An event/data adapter, actual public URLs, X weighted-text
validation, idempotent publication and live event verification remain future
integration work. No X posts, transactions or schedules are created here.
