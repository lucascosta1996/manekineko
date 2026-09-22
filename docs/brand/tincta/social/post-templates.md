# Tincta social images and post templates

The approved upcoming-season image is expanded into seven event templates. Every image is 1600 × 900, with an editable SVG and metadata/alt text. The review examples use Season 01, Crimson & Blood Orange, and Collection 01, Velvet Ember. Dates, terms, figures and links are fictional placeholders. The unsold/refund branch is an alternative scenario.

## Copy decisions

Mint opening remains fixed: a full affiliate program does not start it earlier. Sellout makes earned affiliate commissions claimable; the draw and NFT-holder prize claims happen separately. The winners thread lists verified token IDs and holder wallets. Append payment receipts only after confirmed claims. Refunds require a holder claim, burn the NFT and exclude gas. Season totals labeled claimed use actual successful claim events, with one network/currency and a stated snapshot block.

## Dynamic values

The image renderer reads catalog names, ordered colors and the established motif; it does not invent season identity. Input dates are UTC. Relative countdowns in these previews use the explicit example timestamps. A future publisher must regenerate them at send time, verify eligibility/event state and resolve actual public URLs. Amounts enter as decimal strings. Full winner/claim records are intentionally absent from sample data because no live winner or payment has been verified for these designs.

The JSON is an independent copy specification. It is not compatible with the existing Launch three-template parser without an adapter. It does not enable automated posting. The preview renderer checks text fitting and a preliminary 280-code-point budget for main posts and static replies. A future publisher must use X's weighted text/URL validation after all substitutions, including repeated replies, and deduplicate confirmed events.

Fields: `{{affiliateUrl}}`, `{{awardEth}}`, `{{claimantWallet}}`, `{{collectionCount}}`, `{{collectionName}}`, `{{collectionNumber}}`, `{{collectionUrl}}`, `{{collectionsSoldOut}}`, `{{commissionUrl}}`, `{{docsUrl}}`, `{{enrollmentCountdown}}`, `{{enrollmentOpensAtImage}}`, `{{enrollmentOpensAtText}}`, `{{holderBlock}}`, `{{holderWallet}}`, `{{mintCountdown}}`, `{{mintDeadlineText}}`, `{{mintPriceEth}}`, `{{mintUrl}}`, `{{networkName}}`, `{{nftUrl}}`, `{{prizeClaimUrl}}`, `{{prizePerWinnerEth}}`, `{{rank}}`, `{{receiptUrl}}`, `{{recipientWallet}}`, `{{refundUrl}}`, `{{saleStartAtImage}}`, `{{saleStartAtText}}`, `{{seasonAffiliateClaimedEth}}`, `{{seasonName}}`, `{{seasonNftsMinted}}`, `{{seasonNumber}}`, `{{seasonPrizesClaimedEth}}`, `{{seasonSnapshotAtText}}`, `{{seasonSnapshotBlock}}`, `{{seasonUrl}}`, `{{supply}}`, `{{tokenId}}`, `{{winnerCount}}`.

## Upcoming season

Publication condition: The season identity and palette are explicitly approved for public announcement. Do not disclose unpublished names automatically.

### Main post

```text
Coming next: Season {{seasonNumber}}.
{{seasonName}}.

{{collectionCount}} colors. One new season of Tincta.

Color, collected.
```



## Affiliate enrollment opening soon

Publication condition: An approved future enrollment opening and working admission configuration exist. Recompute the countdown immediately before publication; discard the post if stale.

### Main post

```text
Season {{seasonNumber}} · {{collectionName}}

Affiliate enrollment opens in {{enrollmentCountdown}}.
{{enrollmentOpensAtText}}

Check eligibility and get ready. Guide in the thread.
```

### Reply 1

```text
{{seasonName}} · Collection {{collectionNumber}}

Read the eligibility, qualification and commission terms before joining:
{{docsUrl}}
```

## Affiliate enrollment is open

Publication condition: Enrollment is currently available, with unfilled positions, a working admission service and chain time before saleStartAt. A permit alone is not enrollment. A filled program does not move minting earlier.

### Main post

```text
Season {{seasonNumber}} · {{collectionName}}

Affiliate enrollment is open.
Minting is scheduled in {{mintCountdown}}: {{saleStartAtText}}.

Join through the link in the thread.
```

### Reply 1

```text
{{seasonName}} · Collection {{collectionNumber}}

Check eligibility and enroll:
{{affiliateUrl}}
```

### Reply 2

```text
Enrollment closes at {{saleStartAtText}}, or earlier if all positions fill. Minting cannot begin before its scheduled opening and requires activation.
```

## Collection minting is live

Publication condition: Confirmed activation, chain time within the immutable sale window, and remaining supply. Read price, supply and prizes from this collection's version-specific frozen terms. Countdown zero alone is insufficient.

### Main post

```text
Season {{seasonNumber}} · {{collectionName}} is live.

{{supply}} NFTs · {{mintPriceEth}} ETH each.
{{winnerCount}} prizes of {{prizePerWinnerEth}} ETH after sellout and the verified draw.

Deadline: {{mintDeadlineText}}.
Mint link in the thread.
```

### Reply 1

```text
{{seasonName}} · Collection {{collectionNumber}}

Mint and read the collection terms:
{{mintUrl}}
```

### Reply 2

```text
Prizes are claimed by the winning NFT holders after the verified draw. Qualified affiliates can claim commissions after sellout. If the collection expires unsold, NFT holders can claim mint-price refunds.
```

## Collection sold out; draw pending

Publication condition: Confirmed canonical sellout and affiliate entitlements. This variant is for a draw that is still pending; do not publish stale 'Draw next' copy after reveal. Do not imply prizes were paid or invent winner identities.

### Main post

```text
Season {{seasonNumber}} · {{collectionName}} is sold out.
{{supply}} / {{supply}} NFTs minted.

The verified draw is next. Qualified affiliates can claim their commissions.

Claim link in the thread.
```

### Reply 1

```text
{{seasonName}} · Collection {{collectionNumber}}

Qualified affiliates: check your earned balance and claim:
{{commissionUrl}}
```

### Reply 2

```text
Winning NFTs will be announced after the draw is verified. Prize claims are separate from sellout. Follow the collection here:
{{collectionUrl}}
```

## Verified winning NFTs

Publication condition: The canonical draw is finalized and verified. List actual winning token IDs and holder addresses at the stated confirmed block. This claim-open version requires unclaimed prizes; switch wording if all prizes were already claimed.

### Main post

```text
Season {{seasonNumber}} · {{collectionName}}

The draw is verified: {{winnerCount}} winning NFTs, {{prizePerWinnerEth}} ETH each.
Winning NFT holders can claim their prizes.

Results and claim link in the thread.
```

### Reply 1

```text
{{seasonName}} · Collection {{collectionNumber}}

View the verified results and claim an unclaimed prize if you hold a winning NFT:
{{prizeClaimUrl}}
```

### Repeat for verifiedWinningNft

After verified draw only. Use the current holder at the pinned block, not the minter or a guessed payment recipient. Emit one reply per award, even if a wallet holds multiple winners.

```text
Award #{{rank}} · NFT #{{tokenId}} · {{awardEth}} ETH
Holder at block {{holderBlock}}: {{holderWallet}}

Verified NFT:
{{nftUrl}}
```

### Repeat for confirmedPrizeClaim

Only after a successful, confirmed canonical prize-claim receipt. A winning NFT or a pending transaction does not prove payment. Publish once per collection/rank/claim transaction.

```text
Prize claimed · Award #{{rank}} · NFT #{{tokenId}}
{{awardEth}} ETH
Claimant: {{claimantWallet}}
Recipient: {{recipientWallet}}

Confirmed receipt:
{{receiptUrl}}
```

## Unsold collection refunds

Publication condition: The collection is unsold and its canonical refund state is active. Late randomness for a sold-out collection never qualifies. Do not imply refunds were automatically transferred.

### Main post

```text
Season {{seasonNumber}} · {{collectionName}} did not sell out before its deadline.

NFT holders can now claim a refund of {{mintPriceEth}} ETH per NFT.

Refund link and details in the thread.
```

### Reply 1

```text
{{seasonName}} · Collection {{collectionNumber}}

Current NFT holders can claim their mint-price refund here:
{{refundUrl}}
```

### Reply 2

```text
Refunds require a claim from the current NFT holder. Each refunded NFT is burned. Network gas is not refunded. This unsold collection distributes no prizes or affiliate commissions.
```

## Season complete with statistics

Publication condition: Explicit season closure after all intended collection outcomes are terminal and all required draws verified. Reconcile one chain/currency at a stated confirmed block. 'Claimed' totals sum actual successful claim events, not allocations. Completion does not imply outstanding claims vanish.

### Main post

```text
Season {{seasonNumber}} is complete.
{{seasonName}}.

{{collectionsSoldOut}}/{{collectionCount}} collections sold out · {{seasonNftsMinted}} NFTs minted.
{{seasonPrizesClaimedEth}} ETH in prizes claimed.
{{seasonAffiliateClaimedEth}} ETH in affiliate commissions claimed.

Color, collected. Thank you.
```

### Reply 1

```text
Season results and collection history:
{{seasonUrl}}
```

### Reply 2

```text
Totals as of {{seasonSnapshotAtText}} · {{networkName}}, block {{seasonSnapshotBlock}}. Claimed amounts reflect confirmed transfers. Any outstanding prize, commission or refund claims remain subject to each collection's terms.
```
