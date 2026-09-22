# Manekineko — 1,000-ticket season plan

Updated September 19, 2026 for **V8: six equal prizes**. This supersedes the earlier two-prize recommendation for new V8 drafts. Existing deployed collections and prepared V7 artifacts retain their original terms. V8 is locally implemented and tested; it has not been deployed or independently audited.

The baseline is 1,000 NFTs at 0.01 ETH: 10 ETH collected at sellout, six distinct winning NFTs receiving 1 ETH each, an affiliate budget of 1–2 ETH and operator gross proceeds of 2–3 ETH. A wallet can own more than one winning NFT and claim each corresponding prize. Six winning NFTs do not guarantee six different wallets or people.

## Collection presets

| Setting | Growth | Standard |
|---|---:|---:|
| NFT supply | 1,000 | 1,000 |
| Mint price | 0.01 ETH | 0.01 ETH |
| Revenue at sellout | 10 ETH | 10 ETH |
| Winning NFTs | 6 | 6 |
| Equal prize per winning NFT | 1 ETH | 1 ETH |
| Total prize reserve | 6 ETH (60%) | 6 ETH (60%) |
| Affiliate budget | 2 ETH (20%) | 1 ETH (10%) |
| Operator gross allocation | 2 ETH (20%) | 3 ETH (30%) |
| Affiliate positions | 10 | 10 |
| Minimum paid referrals to qualify | 100 | 100 |

These ETH amounts depend on the stated supply and price. V8 stores a total prize percentage and a winner count; changing price or supply also changes each prize amount. It supports 1–10 winners, requires enough NFTs for all winners, and requires the positive prize basis points to divide exactly by the winner count. Settings are fixed when deployed.

If a collection expires unsold, receipts remain refundable under the contract's refund rules. Partial sales are not operator earnings and do not vest prizes or affiliate payouts. Randomness funding and unsolicited ETH are not mint revenue.

## Conditional season schedule

Names, colors and order follow `seasons.json`: 22 seasons and 216 collections, each with 1,000 tickets. The initial preset schedule is:

| Seasons | Presets within each season | Collections | Operator gross |
|---|---|---:|---:|
| 1–4 | All 10 Growth | 40 | 80 ETH |
| 5–21 | First 2 Growth, next 8 Standard | 170 | 476 ETH |
| 22 | First 2 Growth, remaining 4 Standard | 6 | 16 ETH |
| Total | 76 Growth; 140 Standard | 216 | **572 ETH** |

Review the first season's sales, acquisition costs, concentration and treasury needs before committing later seasons. Future drafts can change; deployed terms and reviewed prepared artifacts must not be silently rewritten. The catalog is a launch inventory, not evidence of demand or a guarantee of sellout.

The current timing plan is fast paced: the next collection opens one hour after the preceding collection's canonical sellout, with its opening announced thirty minutes after that sellout. These are configurable season settings. The first opening requires an explicit UTC timestamp; the default affiliate enrollment window is fifteen minutes. A collection's mint duration runs from its scheduled opening, not its deployment time. The old weekly completion assumption is no longer the launch cadence.

Results cannot name winners before the verified VRF draw. Draw, deployment, enrollment and announcement readiness must fit the fixed schedule; otherwise the future automation pauses instead of quietly moving the opening. Winner withdrawals do not delay progression when all unpaid awards remain fully backed. The automation worker and actual X posts are a later phase; saving these settings does not execute them. See [V8 implementation and rollout](../season-v8-implementation.md).

## Equal affiliate sharing with a qualification minimum

Enrollment alone earns nothing. An affiliate must receive at least 100 successfully paid, attributed ticket mints in this collection to qualify under the defaults. Sponsored winner-credit mints, secondary sales and clicks do not count. Each paid mint can be attributed to only one affiliate.

At sellout, freeze the qualified set and the common payout:

```
common payout = min(affiliate budget / qualified count,
                    lowest qualifying referred revenue × 30%)
```

All qualifiers receive the same amount. The cap is configurable before deployment. Unfilled positions and affiliates below the minimum receive zero. With no qualifiers the whole budget is unallocated. Remainders and integer rounding stay in the separately accounted growth reserve, not the ordinary operator withdrawal balance.

| Qualified affiliates and referrals | Growth: 2 ETH budget | Standard: 1 ETH budget |
|---|---:|---:|
| 4, each with exactly 100 referrals | 0.30 ETH each; 0.80 ETH unallocated | 0.25 ETH each; none unallocated |
| 4, each with at least 167 referrals | 0.50 ETH each; none unallocated | 0.25 ETH each; none unallocated |
| 5, each with exactly 100 referrals | 0.30 ETH each; 0.50 ETH unallocated | 0.20 ETH each; none unallocated |
| 10, each with exactly 100 referrals | 0.20 ETH each; none unallocated | 0.10 ETH each; none unallocated |
| 0 qualified | 0 paid; 2 ETH unallocated | 0 paid; 1 ETH unallocated |

Before sellout these are estimates: another qualifying affiliate, especially one with fewer referrals, can change everyone's common amount. Claims are independent. The growth reserve has a separate owner withdrawal function and event after reveal; the contract does not enforce how the receiving treasury later spends it. This plan does not count unallocated budgets as extra owner distributions.

The cap limits a self-funded referral rebate when combined with the 60% prize-only expected payout. It does not prove that wallets are distinct people or independent buyers. NFT eligibility and automated abuse checks remain relevant, and strategic qualification still needs independent review. The qualification and cap rules are implemented locally in V7/V8; they are not retroactive changes to the deployed test collection.

## Total revenue and modeled owner cash

| Allocation across all 216 sellouts | ETH |
|---|---:|
| Revenue: 216,000 NFTs × 0.01 ETH | 2,160.00 |
| Prizes: 216 collections × 6 winning NFTs × 1 ETH | 1,296.00 |
| Affiliate budgets: 76 × 2 ETH + 140 × 1 ETH | 292.00 |
| Operator gross proceeds | **572.00** |

This is an accounting scenario conditional on complete sellout, not a sales prediction. Gross allocation is not net profit. The following retains the earlier illustrative cost allowances so the effect of six winning NFTs can be compared. None is a quote or a measured V8 operating cost.

| Cash item | Amount |
|---|---:|
| Operator gross proceeds | 572.00 ETH |
| Chain operations allowance: 216 × 0.10 ETH | −21.60 ETH |
| Lifetime winner-credit backing: up to 1,296 × 0.01 ETH | −12.96 ETH |
| Audit/security/legal/setup allowance | $50,000 |
| Operations/support/content/acquisition allowance | $5,000/month × 50 months |
| Combined $300,000 allowance at hypothetical $3,000/ETH | −100.00 ETH |
| Modeled surplus before tax and unbudgeted costs | **437.44 ETH** |
| Additional retained protocol reserve: 10% of operator gross | −57.20 ETH |
| Potential owner distribution under these assumptions | **380.24 ETH** |

At the hypothetical $3,000/ETH conversion, that distribution is $1,140,720 across the catalog, averaging about 1.76 ETH per collection. The fifty-month operating allowance is retained solely as a comparison input from the earlier weekly model; it is not a duration forecast for the new one-hour rollover policy. Replace it with an actual staffing and launch-duration budget before approving treasury distributions. A faster cadence does not prove lower acquisition costs or sufficient buyer demand.

The same illustrative assumptions yield 254.24 ETH potentially distributable for an all-Growth catalog, or 448.64 ETH for all-Standard. These alternatives change affiliate acquisition budgets and are not additional promised outcomes. Taxes, overruns, repeated reviews, salaries or acquisition costs beyond the allowances reduce distributions. Initial setup and working capital must be funded before relying on sales.

The 0.10 ETH chain allowance is not a fixed protocol charge. Deployment, VRF and finalization costs need a real Sepolia rehearsal and current fee assumptions; six independent prize claims also differ from the earlier two-prize flow. Buyers pay mint gas and holders pay claim gas. Recoverable unused randomness funding is not automatically an expense. [Ethereum gas documentation](https://ethereum.org/en/developers/docs/gas/), [Chainlink VRF billing](https://docs.chain.link/vrf/v2-5/billing).

## Lifetime winner-credit backing

Each settled winning holder can qualify for the one-time lifetime sponsored NFT reward. Holding several winning NFTs or winning again does not increase that wallet's lifetime redemption limit. The operator funds the target collection's full mint price so its prize and affiliate allocations remain funded; the holder still pays network gas. V4 of the reward registry supports all six award ranks and preserves prior spent rewards through its verified predecessor lineage.

Up to 1,296 distinct winning holders across this catalog could require 12.96 ETH at a 0.01 ETH future mint price. Actual backing can be lower when wallets win repeatedly or never redeem. Higher future mint prices require more funding. Credits accumulate; a target collection must not assume exactly six redemptions.

With no entitlements from earlier collections, at most 1,290 of these newly earned credits could redeem inside this catalog: the final collection's six require a later collection. Sponsored tickets count within supply and revenue, so maximum inside-catalog redemptions would reduce outside-buyer receipts to 2,147.10 ETH. The backing allowance above already subtracts the operator's corresponding sponsorship cost; do not treat sponsored mint volume as extra outside demand or subtract it twice.

## Buyer engagement and release gates

For the baseline, each ticket has a **6/1,000 = 0.6%** chance of one prize, with 0.1% for each specific rank. Its prize-only expected payout remains 0.006 ETH against the 0.01 ETH mint price, before gas and any uncertain collectible value. More awarded NFTs spread the same 6 ETH prize reserve across more tickets; they do not create guaranteed buyer profit, liquidity or appreciation.

Use named season artwork, color completion, independently verifiable results, visible claim status and future affiliate eligibility to support the collecting experience. Keep odds and enrollment terms accessible. Evaluate actual paid demand, concentration, acquisition costs and treasury runway during the first season before committing later ones; do not rely on operator purchases to manufacture sellouts.

V8 contracts, shared configuration and the six-award paths have local tests. Before rollout, deploy and verify the versioned factory and registries on Sepolia, pin their runtime hashes, migrate reward lineage without parallel funded old registries, register collections, and rehearse claims, indexing, refunds and sponsored mints end to end. Independent contract and economic review remains a Mainnet gate. Existing V7 contracts and prepared artifacts continue to mean two unequal prizes, not six equal prizes.

The spreadsheets [1000-ticket-economic-plan.xlsx](1000-ticket-economic-plan.xlsx) and [seasons-economic-plan.xlsx](seasons-economic-plan.xlsx) are **historical models**, not updated V8 calculations. The former retains the two-prize assumptions and smaller winner-credit allowance; the latter is an earlier small-collection proposal. Use this document for the current six-prize arithmetic.

Sources within the repository: `seasons.json`, `ManekinekoRoundV8.sol`, `MultiAwardRank.sol`, `ManekinekoWinnerCreditsV4.sol`, shared `v8-config.ts`, and the [V8 implementation notes](../season-v8-implementation.md). The [V7 implementation notes](../season-v7-implementation.md) document the preceding version without changing its historical terms.
