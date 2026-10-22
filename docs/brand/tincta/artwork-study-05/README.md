# Tincta Rewards — meaning-led Foldscape study

2026-10-21. Exploratory concepts; no final selection or deployment.

## What changed in the brief

The user liked Foldscape's style but challenged whether the shapes meant anything connected to Tincta Rewards. They also clarified that the last variations were too minimal. The prior sketches were intentional formal compositions, but their silhouettes were not grounded in a Rewards-specific concept. It would be misleading to invent that connection after the fact.

This study chooses the intended association before generating the drawing. The core brief is **a collectible carries an opportunity to win a prize**. Visual priorities are anticipation/reveal or recognition/winning. Folded planes are the visual language used to express those ideas, not an explanation by themselves.

## Product grounding

Checked against current local source, not a live-chain or deployment audit:

- Each NFT participates in its own collection's draw. A sellout precedes the prize draw; a win is not guaranteed.
- Winning NFT holders submit direct prize claims. The contract determines the right; a logo does not need to diagram the mechanics.
- Permanent NFT artwork and identifying numbers do not change to show winning status. An unfolding metaphor refers to anticipation/result discovery, not changing NFT metadata.
- Unsold expiry has a mint-price refund path. Affiliate qualification and allocation are separate rules and are not conflated with prize winning.
- The public symbol should avoid suggesting guaranteed growth, automatic payments to every holder, or a fixed number of winners through its facet count.

Sources: [Landing how-it-works and FAQ](../../../../apps/landing-page/app/landing-experience.tsx), [architecture](../../../architecture.md), [V11 affiliate distinction](../../../full-affiliate-pool-v11.md). The Landing contains dated rollout/status wording; this study uses only the durable participation and claim concepts corroborated by architecture, not those historical launch claims.

## Concepts decided before drawing

| Direction | Intended first association | Visible mechanism | Rewards connection | Open question |
| --- | --- | --- | --- | --- |
| A / Unfold | Opening, discovery, anticipation | Several folds open around a separate vivid center | The possibility attached to collecting is resolved when results are revealed | Does the center read as a revealed prize, or mainly as a crystal/crest? |
| B / Award | Recognition, winning, prize | A medallion-like upper mass and two ribbon ends | Winning and the holder's prize entitlement | Can the outline become more distinctive while retaining the immediate award association? |

**Recommendation:** B is the stronger candidate when first-glance reward recognition is the priority. A offers a more interpretive artwork direction. These are design hypotheses, not measured audience responses or a promise that all viewers will interpret them alike. No claim of guaranteed subconscious meaning is made.

Moderate complexity is intentional. These sketches have more facets, rhythm and internal relationships than study 04. The next step is controlled refinement of the selected concept, not further arbitrary reduction.

## Deliverables and method

- [Interactive study](index.html), including a control to hide names/explanations and compare shapes first.
- [Labeled comparison](comparison.png), [circular comparison](comparison-circles.png), and [comparison without names](comparison-unlabeled.png).
- Original outputs: [Unfold](sketches/a-unfold.png), [Award](sketches/b-award.png).
- [Prompts written before generation](prompts.json), containing the intended meanings and physical construction for each.
- [Original Foldscape style reference](references/foldscape.png).
- [Local browser results](verification/browser-check.json).

Mode: built-in `image_gen`, two independent reference-guided generations. The original Foldscape was the sole image input. All PNGs were copied without retouching. The review applies CSS padding and circular framing only. No CLI fallback was used.

These are raster concept sketches. Exact color values, clean vector seams, optical weight and small-size simplification remain refinement work. The generated center in A is faceted and may be read as a jewel; B has a recognizable award outline but still needs a more particular contour. Those observations are part of review, not hidden behind the intended story.

## A short first-impression check

For a small qualitative review, show the comparison without names to people who have not read this rationale. Show at a useful size briefly, then ask: “What does it resemble?” and “What might it belong to?” Record their words before discussing prizes or Tincta. Repeat with the 48/96 px versions and record what remains recognizable. Vary presentation order across viewers.

Look for spontaneous associations with a reveal or an award, and note unwanted readings such as security certification, a political badge, a crystal game or a generic crypto token. Do not count agreement after an explanation as evidence of an immediate association. This is directional feedback, not a statistical study or proof of subconscious effects. No external participants have been contacted and no audience results are claimed.

## Scope

This remains a concept for the Rewards symbol/PFP and associated artwork. The approved parent Tincta Ligature identity is unchanged. No app illustrations, social templates, immutable NFTs, contracts or season data were changed. No deployment or X upload occurred. Previous studies remain available on disk.

```sh
node docs/brand/tincta/artwork-study-05/build.mjs
python3 -m http.server 8128 --bind 127.0.0.1 --directory docs/brand/tincta/artwork-study-05
node docs/brand/tincta/artwork-study-05/verify.mjs
```

Local viewer verification passed in Chromium 145.0.7632.6: all images loaded; ten viewport widths from 320 to 1440 px had no horizontal overflow; frame/size controls, keyboard, reference disclosure and hide/reveal explanations worked. No page errors or axe violations were detected. The desktop page and labeled/unlabeled boards were visually inspected. This verifies the review artifact, not audience interpretation, production deployment or physical devices.
