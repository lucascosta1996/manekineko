**Manekineko — proposed season economics**
Prepared September 19, 2026. Planning only; no saved launch settings, contracts, or schedules have been changed.

I recommend a stable 0.005 ETH ticket, a 70% winner allocation, an affiliate budget capped at 10%, and at least 20% operator gross proceeds. Begin with 100-ticket collections and increase supply only after demand is demonstrated. The 22 seasons in `seasons.json` are a conditional catalog, not a commitment to launch all 216 collections on a fixed date.

This is a pilot hypothesis, not an established optimal price or payout ratio. The operator's return comes from useful operations and sustained collector demand; it should not depend on increasing prices, speculative resale assumptions, or using new sales to pay old liabilities.

**Proposed settings across the catalog**

Every collection within a season uses its season's supply, price and economic terms. Names, colors and their order remain exactly as supplied in `seasons.json`. The accompanying workbook lists every season and all 216 collections individually.

| Seasons | Collections | Tickets per collection | Price, ETH | Winner prize per collection, ETH | Affiliate budget per collection, ETH | Operator gross per collection, ETH | Affiliate positions |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1–2 | 20 | 100 | 0.005 | 0.350 | 0.050 | 0.100 | 5 |
| 3–6 | 40 | 150 | 0.005 | 0.525 | 0.075 | 0.150 | 5 |
| 7–12 | 60 | 200 | 0.005 | 0.700 | 0.100 | 0.200 | 10 |
| 13–18 | 60 | 300 | 0.005 | 1.050 | 0.150 | 0.300 | 10 |
| 19–21 | 30 | 400 | 0.005 | 1.400 | 0.200 | 0.400 | 15 |
| 22 | 6 | 500 | 0.005 | 1.750 | 0.250 | 0.500 | 15 |

Prizes assume sellout. Operator proceeds in this table assume the entire 10% affiliate budget is paid. More affiliate positions divide the same budget; they do not enlarge it. Prefer fewer useful positions at first, because very small commissions can be unattractive after mainnet claim fees.

Other initial settings: 14-day collection lifetime including a 48-hour enrollment window; one collection minting at a time; a provisional weekly cadence; 24 hours between confirmed prize payment and the next collection's eligible start. Enrollment consumes part of the next collection's lifetime. Neither cadence nor a saved earliest start guarantees a launch date. In the present contract, a later collection waits for the previous sellout and prize payment, so delayed winner claims delay the sequence. Unsold expiry triggers refunds and a pause, not automatic continuation.

Keep the same mint price throughout the modeled catalog. If ETH/USD affordability materially changes, review the price only for unlaunched collections and publish revised terms and projections. Do not change immutable terms for an already deployed collection.

**Affiliate rule to improve before mainnet**

The current V6 contract splits a percentage of *all* sales among the referred sales. For a 100-ticket collection, one referred purchase costing 0.005 ETH can capture the entire 0.05 ETH pool if every other mint has no referral. A second wallet controlled by an affiliate can exploit that incentive. NFT eligibility, IP checks and same-address referral rejection do not eliminate it.

Proposed replacement, requiring a contract change and tests:

`Released affiliate pool = min(10% × total mint revenue, 20% × eligible referred revenue)`

`Affiliate earnings = released pool × their referred revenue / all eligible referred revenue`

When there are no referrals, release zero. Full-budget distribution occurs when at least half of revenue is referred. A single 0.005 ETH referral can earn at most 0.001 ETH. If the full pool is released, an affiliate bringing 20% of referred sales still receives 20% of that pool. Define rounding, refunds, attribution and sponsored-mint exclusion on-chain. Operator-sponsored winner redemptions earn no affiliate commission.

Any unallocated budget remains an explicitly disclosed operator-held growth reserve, not an automatic personal bonus. The workbook assumes the entire 10% is paid, so it does not rely on reduced referral payouts to look profitable. The cap is a new proposal, not an existing configurable field or a claim that wallets identify unique people.

Keep open enrollment with existing holder eligibility and abuse checks. Do not promise every NFT owner an affiliate position or income. Enroll before activation; later official collections require an NFT from an earlier completed official collection. The first canonical collection has the bootstrap exception. A higher supply tier is not a reason to sell more affiliate slots if referral activity is weak.

**All-sold-out accounting**

| Item | ETH |
|---|---:|
| 53,000 tickets × 0.005 ETH | 265.000 |
| Winner prizes, 70% | 185.500 |
| Affiliate budget, 10% | 26.500 |
| Operator gross allocation, 20% | 53.000 |

This describes what happens *if* every collection sells out; it does not estimate the probability of doing so. The 265 ETH includes any operator-sponsored ticket purchases. At most 215 new prior winners can redeem inside this 216-collection horizon, assuming no pre-existing mainnet credits and strict sequence, so external buyer receipts would be 263.925 ETH if all 215 redeem. The final winner's credit is a future obligation beyond the catalog. Fewer distinct winning wallets means fewer credits under the one-per-wallet lifetime rule.

Provision 0.005 ETH for each newly eligible winning wallet. A conservative maximum at that redemption price for 216 different winners is 1.08 ETH, including the final winner's future credit. The contract pays the target collection's mint price: if a future collection costs more, including a post-catalog destination for the final winner, increase the backing accordingly. Actual redemptions consume sponsorship cash; unredeemed funded credits remain reserved assets/liabilities rather than spent gas. Fund a central reserve and move it into collection sponsorship accounts as needed; allocating only one sponsored ticket to each collection does not accommodate several previous winners choosing the same collection. Do not withdraw credit backing as personal earnings.

**Illustrative operator cash budget**

These allowances are editable assumptions, not vendor quotes, measured V6 mainnet costs, or a promise of profit. ETH/USD is held at a hypothetical $3,000 for the entire calculation solely to translate USD expenses. No current or future exchange-rate prediction is intended.

| Item | Assumption | ETH impact |
|---|---|---:|
| Operator gross allocation | Full affiliate budget paid | 53.0000 |
| Recurring chain costs | 216 × 0.04 ETH, including a planning allowance for deployment, operator transactions and VRF | −8.6400 |
| Winner-credit backing | 216 × 0.005 ETH, including future obligation | −1.0800 |
| One-time launch allowance | $30,000 for audit, legal/security review and setup; replace with actual quotes | −10.0000 |
| Ongoing cash allowance | $500/month × 50 months for infrastructure, monitoring, support and modest community work; replace with quotes | −8.3333 |
| Modeled surplus after these budgets | Before tax and unbudgeted expenses | **24.9467** |
| Additional retained protocol reserve | 10% of operator gross; this is retained cash, not an expense | −5.3000 |
| Potential owner distribution | After the above cash reserves | **19.6467** |

At the hypothetical conversion rate, 19.6467 ETH is approximately **$58,940 over the entire catalog**, not annually. The 50-month budget assumes weekly completion; claim delays and pauses extend the horizon, adding $500 for each extra month under this assumption, plus costs of unsuccessful launches. The estimate excludes additional development salaries, a paid acquisition team, unforeseen audits, failed launch attempts beyond the successful-collection budget, and taxes. Add those costs before treating the result as spendable personal income. Actual ETH/USD movements change both affordability and the ETH required for USD expenses. The initial audit/setup allowance is paid before launch and cannot be funded by assuming the full catalog sells.

Keep at least the credit backing plus six months of quoted operating expenses and the next three collections' gas/VRF budget in treasury. Retaining 10% of operator gross is an ongoing contribution to this reserve, not evidence that the reserve is sufficient at launch. Supply initial working capital separately and sweep owner distributions only after settlement, liabilities and actual expenses have been reconciled.

| Average chain cost per successful collection | Total chain cost, ETH | Surplus after other modeled budgets, ETH | After retaining 5.3 ETH, ETH |
|---|---:|---:|---:|
| 0.02 ETH | 4.32 | 29.2667 | 23.9667 |
| 0.04 ETH — planning case | 8.64 | 24.9467 | 19.6467 |
| 0.12 ETH — gas stress | 25.92 | 7.6667 | 2.3667 |

The 0.04 ETH allowance is not a fixed fee. Historical V5 test receipts indicate roughly 5.10 million recurring operator gas units including round creation and funding, before V6-specific work and the VRF charge. At 5 gwei that is about 0.0255 ETH; at 20 gwei it is about 0.1019 ETH. A factory and supporting contracts also have one-time deployment costs. Benchmark the final V6 flow and refresh live gas/VRF estimates before applying these settings. A VRF funding buffer remains recoverable to the extent unused; do not expense a 0.30 ETH deposit as though it were all consumed. Ethereum documents gas as gas used times the effective fee, while Chainlink bills verification/callback work and applicable premiums. [Ethereum gas documentation](https://ethereum.org/en/developers/docs/gas/), [Chainlink VRF billing](https://docs.chain.link/vrf/v2-5/billing).

Buyer minting gas is paid by the buyer in the current flow, and affiliate/prize claims by the claimant. Those costs still affect willingness to participate. Set a prelaunch target that an ordinary mint's estimated gas is below 10% of ticket price; postpone new launches when it is not. Continue necessary settlement and refund operations for already launched collections. Batch minting can reduce per-ticket overhead but does not justify encouraging larger purchases.

If all 216 collections remained at 100 tickets, gross operator allocation would be only 21.6 ETH. With the same illustrative 50-month costs and credit provision, modeled surplus would be approximately **−6.45 ETH before any additional retained reserve**. That does not justify forcing supply growth; it means pausing or changing future operating costs/pricing is better than committing to an uneconomic roadmap.

**Conditions for increasing supply**

Apply these provisional targets before each tier increase. They are management hypotheses to test, not industry benchmarks or guarantees:

- The last three collections sold out within seven days, without operator purchases to complete them. Record sponsored tickets separately from organic sales.
- Distinct externally paying wallets number at least 40% of supply, and the top five wallets buy no more than 25% of tickets. Analyze linked-wallet evidence where available; wallet counts are not counts of people.
- At least 25% of paying wallets return within the next three collections, without extra paid rebates. Measure satisfaction and voluntary return rather than inducing loss-chasing.
- No single affiliate contributes more than 50% of referred tickets as a concentration review trigger; evaluate aggregate buyer funding patterns and actual acquisition quality. A trigger pauses expansion for review, not a retroactive change to earned payouts.
- The next collection remains contribution-positive after a conservative chain-cost estimate and full credit funding, and treasury meets its operating reserve requirement.

If a target is missed, keep the current tier or pause. Never expand solely because the next season number has arrived. A failed unsold collection means refundable liabilities, not partial operator earnings; fixed and chain expenses can still cause a loss. Review the failed sequence rather than silently relaunching or extending an on-chain deadline.

**Reasons to collect and return**

Use the color catalog as an art series: a season gallery, ownership-based color checklist, shareable collection pages, and clear on-chain provenance. Cosmetic completion badges or gallery recognition should not require new recurring cash subsidies. Avoid trading-volume contests, paid streak multipliers, artificial floor support, promised appreciation or guaranteed yields.

Keep verifiable draw results and an accurate winner history. A single ticket has a 1/N chance of winning in a sold-out N-ticket collection; doubling supply reduces that chance even though the prize grows. At a 70% prize share, the prize-only expected payout of a 0.005 ETH ticket is 0.0035 ETH before gas, a 0.0015 ETH expected shortfall. Collectible value and affiliate opportunity may matter to buyers, but cannot be assumed to cover that shortfall. If people do not value the NFT or experience independently, a percentage split alone will not sustain repeat demand.

Make post-settlement utility specific: eligibility to apply for future affiliate positions, ownership of the artwork and participation in the season gallery. Holding a completed NFT does not automatically pay another prize or recurring earnings. The current contract locks transfers between sellout and prize payment; after settlement, resale value depends on collector demand. Keep primary sales and royalties separate in the forecast. Royalty revenue is modeled at zero because marketplace enforcement depends on the venue and contract setup. [OpenSea creator earnings](https://support.opensea.io/en/articles/8867026-how-do-i-set-creator-earnings-on-opensea).

Publish payout terms and odds where buyers can review them, even if the homepage focuses on art and the prize. Hiding material terms is not a retention strategy. Provide voluntary spending limits and pauses; do not target previous losses as a reason to buy again.

**Order of work**

First approve the pilot economics and obtain actual operating/security/legal estimates for the intended markets. Next specify, implement and test the affiliate payout cap as a new contract change; benchmark the final mainnet gas flow. Then set only Season 1's launch-ready values, fund the operating/credit reserves, and run a small end-to-end rehearsal. Launch and evaluate the first three collections before scaling the rest of the season. Keep all later seasons as editable drafts until their demand and treasury gates pass.

There is no automatic profit guarantee or assured secondary market. The proposed plan deliberately keeps personal distributions behind operating costs and liabilities, while giving collectors a larger prize allocation and keeping future rewards bounded.

Local evidence reviewed: `seasons.json`; `apps/contracts/contracts/ManekinekoRoundV6.sol`; `ManekinekoFactoryV6.sol`; `ManekinekoWinnerCredits.sol`; `docs/affiliate-holder-eligibility.md`; `.vercel/sepolia-20-ticket/rehearsal-final-costs.json` and deployment receipt records. Historical test gas is evidence of computational work, not a present mainnet fee quote.
