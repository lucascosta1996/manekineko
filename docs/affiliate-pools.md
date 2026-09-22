# V5 affiliate pool accounting

V5 replaces individual referral commission rates with one immutable pool percentage per collection. V6 preserves this accounting. Existing V3/V4 contracts and saved financial records retain their original accounting; conversion of editable legacy drafts is explicit.

## Payout formula

At sellout:

```
pool = total primary mint revenue × affiliatePoolBps / 10,000
affiliate payout = pool × affiliate referred tickets / total referred tickets
```

Every ticket in a collection has the same immutable price, so ticket counts represent referral revenue exactly. Direct sales also fund the pool. Each mint can credit only one enrolled affiliate, once. Secondary-market trading does not contribute revenue or referral credit.

Example: 1,000 tickets at 0.01 ETH collect 10 ETH. A 50% prize reserves 5 ETH, a 10% pool reserves 1 ETH, and the minimum operator remainder is 4 ETH before expenses. With 40 and 60 referred tickets from two affiliates, their final payouts are 0.4 and 0.6 ETH. The other 900 organic tickets still fund the pool. Ten, twenty or one hundred available positions produce the same 1 ETH pool. Raising the pool to 20% makes it 2 ETH and the operator remainder 3 ETH. The winner stays at 5 ETH.

Shares are earned rather than assigned to positions. Zero referrals earn zero, including enrolled but unused positions. If a single affiliate supplies every referred sale, that affiliate receives the entire pool, even when many purchases are organic. If there are no referrals at all, no affiliate liability is created and the unused pool belongs to the operator after prize delivery.

## Timing and exact accounting

The UI displays provisional estimates before sellout; these may rise or fall as other affiliates bring sales. `affiliateAccrued` remains zero until sellout. At the final mint, the contract allocates the pool across at most 100 positions. Claims become available immediately, independently of VRF fulfillment. Operator withdrawal remains blocked until the winner is paid and cannot consume unclaimed affiliate balances or VRF funding.

For integer rounding, the contract walks positions by ID and subtracts successive cumulative entitlements: `floor(pool × cumulativeReferrals / totalReferrals) - previouslyAllocated`. Every wei of the pool is allocated, and each payout differs from its exact fractional entitlement by less than one wei. Empty positions receive zero. This does not depend on claim order. The preview helper and regression tests use the same documented rule.

If the collection expires unsold, affiliates receive no payout and each current NFT holder retains the full mint-price refund. Prize plus pool cannot exceed 100%. Prices must be divisible by 10,000 wei. Terms cannot be changed after deployment.

## Attribution and admission

V5 EIP-712 enrollment uses domain version `3` and binds applicant, exact position, `poolBps`, nonce, deadline, chain and contract. The admission service checks immutable pool terms, trusted V5 factory/code, wallet authentication, bot checks, quotas and consumed challenges. A URL selects a registered position; it cannot change its beneficiary or pool terms. Replacing a position in a signed enrollment invalidates it. Direct self-referrals by sender or NFT recipient are rejected.

Wallets and IP addresses cannot prove that buyers are independent people. Multiple wallets, proxy networks and coordinated purchases remain economic abuse risks; the full-pool reward for sparse referral sales is an intentional consequence of this formula. Review these incentives before public launch. Do not describe the system as immune to Sybil attacks or make a URL a secret bearer credential.

V6 additionally requires a currently held NFT from an earlier completed official collection after the canonical first-collection exception. Each source NFT can unlock only one position per destination. Domain version `4` binds this NFT into enrollment; subsequent transfers do not revoke the affiliate position. Automated admission checks and the payout formula above remain unchanged. See [holder eligibility](affiliate-holder-eligibility.md) for enforcement and deployment.

## Version and release boundaries

Migration `013_shared_affiliate_pools.sql` adds V5 terms without rewriting historical collections or finalized exports. New V5 public collections store `affiliate_pool_bps`; their program rate array is empty. The existing database demo fixtures remain V4 illustrations. V5 requires a matching V5 factory, verified deployment record and chain snapshot before live enrollment. The public app supports both models and shows their respective terms.

The implementation is locally tested, including 1,000/2,000 unique ranks, all 100 active positions, rounding, refunds, signatures and reserve protection. It is not an audit or a Mainnet deployment. Follow the [V5 deployment runbook](deployment-v5.md) for public-chain qualification.
