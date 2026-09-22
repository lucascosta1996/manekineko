# Collection affiliate programs

New V6 collections combine [the shared affiliate pool](affiliate-pools.md) with [NFT holder eligibility](affiliate-holder-eligibility.md). After the first official collection on each network, applicants must hold any NFT from an earlier completed official collection. Completed means sold out, revealed and paid its winner; the ticket need not be a winning NFT. Enrollment closes before minting, so current-collection NFTs cannot qualify.

Each wallet can enroll once per collection, and each qualifying NFT unlocks one position per destination even after transfer. Ownership is checked when enrollment executes. Later transfers do not move or revoke the affiliate position or earnings; the NFT can qualify its current holder again for another collection. Automated checks still apply, positions are limited, and the applicant pays enrollment gas. Only successful referrals earn a share of the pool; no referrals or an unsold collection earn no payout.

The enrollment page displays these rules before wallet connection, identifies the first-collection exception from verified registry data, and preserves the original terms for older deployments. The mint entry, enrollment review and contract source page use the same version distinction. See [V6 deployment](deployment-v6.md) for the new release and [V5 deployment](deployment-v5.md) for existing pool collections.

## Historical V4 behavior

The remaining sections document the historical V4 per-referral model. Existing V4 records keep these rules; they do not gain an NFT requirement or shared-pool accounting through a UI update.

V4 adds configurable prize and referral rates to the collection affiliate program. It retains the V2 unique ranking and single Chainlink VRF request. V1/V2/V3 deployments and historical records retain their original behavior. Artwork and accounting remain on-chain; enrollment deliberately trusts an automated off-chain admission service. IP addresses and bot challenges reduce abuse, not establish distinct human identities.

## Immutable program rules

- Each collection configures 1–100 positions (`maxAffiliateSlots`; examples use 10), a separate EOA `enrollmentSigner`, `prizeBps`, and an `affiliateRatesBps` array with one rate per position. One basis point is 0.01%. Rates and prize share allow 0–10,000 basis points; each position's rate plus the prize share must be at most 10,000. Terms are fixed at deployment, before enrollment or minting, with no owner override.
- Anyone who passes automated admission can enroll. The applicant must submit their own enrollment transaction. Each wallet can register once per collection. Positions and beneficiaries are not transferable or administratively reassigned.
- Enrollment is possible before mint activation and before the mint deadline. Sale activation freezes membership. Deployment leaves the sale inactive so enrollment has an opportunity to occur; an owner activation transaction starts minting after the enrollment window. A permit binds an exact position and rate but does not reserve it. If another eligible applicant takes that position first, enrollment fails and a fresh offer needs new authentication; the rate never changes silently.
- The advertised mint price includes commission. For example, a referred 0.01 ETH ticket with a 60% prize and a 2% referral rate reserves 0.006 ETH for the winner and credits 0.0002 ETH to its selected affiliate. The remainder belongs to the operator. Direct purchases credit no affiliate. Gas fees and secondary sales do not earn commission.
- Mint prices must be divisible by 10,000 wei. Batch and individual purchases produce identical commissions. A purchase can credit exactly one registered affiliate. Direct self-referrals by payer or NFT recipient are rejected; another wallet can still belong to the same person.

The deployment convenience input `affiliateAllocationBps` divides equally across the configured positions, requiring an exact integer basis-point rate. An allocation of 1,000 over ten positions gives each a 100-basis-point rate; 2,000 gives each 200 basis points. This is only a configuration shortcut: it does **not** earmark that fraction of every collection sale for a shared pool. Each affiliate earns only on its own referrals. Alternatively, specify `affiliateRatesBps` for unequal rates; the two inputs are mutually exclusive. Solvency checks use the highest applicable rate, since each sale has only one affiliate, rather than summing unrelated positions.

The UI emphasizes ETH prizes, referral activity and earned balances. Exact applicable rates remain in expandable program terms and the enrollment/purchase review. Removing prominent allocation marketing does not conceal or change the terms participants sign. Existing V3 programs retain their fixed 100-basis-point commission and 5,000-basis-point prize; they cannot acquire V4 rates through a database update.

## Admission and trust boundaries

1. The service checks the collection against a configured Ethereum/Sepolia factory address and deployed runtime hash, its factory round registry, immutable renderer, protocol version and collection terms at a consistent chain snapshot.
2. The applicant signs a short-lived, collection-scoped authentication challenge including the exact offered position and commission rate. Authentication is not a payment or token approval. EOA and ERC-1271 wallet authentication are supported by the service.
3. The backend validates the Turnstile token with Siteverify, including the expected hostname and enrollment action. Durable PostgreSQL counters throttle bursts by wallet and by trusted edge IP; this is not a permanent one-person-per-IP rule.
4. Successful checks produce an EIP-712 enrollment permit. V4 domain: `ManekinekoAffiliateEnrollment`, version `2`, current chain ID, and the collection contract. Type: `Enrollment(address applicant,uint256 affiliateId,uint256 commissionBps,bytes32 nonce,uint256 deadline)`. The wallet authentication domain is separately named `ManekinekoAffiliateAuthentication`, version `2`; its type also binds collection ID and site origin. V3 keeps its version-1 messages.
5. The contract verifies the service signature, bound applicant/caller, expiry, nonce, membership and capacity. There is no alternate public enrollment path that bypasses the permit.

Live admission trusts only the explicitly configured Vercel edge path. A supplied JSON IP, arbitrary forwarded header, cookie, or bot-widget client result is not an authorization. Credentials and IP-derived abuse data never appear in NFT metadata or transactions. The signer is a separate unfunded enrollment key, never a deployer, prize or operator wallet.

Signer compromise can allocate remaining positions but cannot change commission percentages, move existing positions, mint without payment, or withdraw anyone else's money. Admission-service downtime stops new enrollment. There is no fail-open enrollment fallback, and this version does not rotate its immutable signer. Minting and existing affiliate claims do not require this service's authorization.

## Referral attribution

Canonical links use `/mint/<collection UUID>?affiliate=<position>&collection=<contract address>`. A referral identifies a position within a particular collection. The checkout resolves its beneficiary from the verified contract, displays the beneficiary and exact commission, and includes the selected position in the buyer-authorized mint transaction.

Malformed, duplicate, incomplete or cross-collection referral parameters must be visibly rejected; they must never silently turn into an unattributed paid mint. Direct minting remains available when the buyer deliberately uses a URL without a referral. Links are intentionally reusable. Copying one does not create commission without another successful paid mint. A link cannot supply a payout address or rate.

The blockchain records the selected attribution, not browser clicks or causation. Someone can replace a complete link with another valid affiliate's link. No public reusable-link signature or cookie can prove original discovery or prevent this. Transaction submission and receipts, not the database or a redirect service, determine financial attribution.

## Earnings and solvency

| Dashboard state | Meaning |
| --- | --- |
| Not enrolled | This wallet has no position in this collection. |
| No referrals | Registered, but no successful paid mints have credited this position. It does not mean the URL has never been clicked. |
| No commission | Successful referrals exist, but this position's fixed rate is zero. Referrals are counted independently of accrued earnings. |
| Pending sellout | Commission has accrued and remains reserved until the collection sells out. |
| Claimable | The collection sold out; unpaid commission can now be withdrawn. VRF fulfillment/prize delivery is not a prerequisite. |
| Paid | Accrued commission has been claimed; the UI shows the total received. |
| Refunded | An unsold collection expired; provisional commission is void so NFT holders retain full mint-price refunds. |

Claims aggregate the affiliate's earnings into one transaction. Only the enrolled wallet can claim its balance and choose the receiving address. State is updated before external transfers with reentrancy protection; a rejected payment reverts without destroying credit. There are no payouts to affiliates during mint callbacks.

Before sellout all mint receipts are reserved against full refunds. At sellout the contract owes the unpaid configured prize plus unclaimed affiliate commissions. Operator withdrawals remain blocked until prize delivery and then subtract unclaimed affiliate liability. Unrelated ETH does not increase commission. A zero-prize configuration still determines one winner and records completion through the prize function; a full-prize configuration permits only zero-rate positions.

An old collection's unclaimed commissions remain reserved indefinitely and do not block the next collection once sellout and prize delivery satisfy the factory's existing rollover rule. The next collection has its own enrollment and balances.

## Database and runtime

Migration `007_affiliates.sql` introduced program configuration, explicitly fictional dashboard fixtures, single-use authentication challenges and durable abuse counters. Subsequent V4 migrations add immutable financial versions, prize and position rates, and exact enrollment offers. Collection and archive records preserve their own payout terms. A signed permit is returned only after atomic challenge consumption; permit signatures are not stored as database balances or financial authority. Database seeds supply dashboard scenarios for the existing undeployed demo collection, with a clearly prospective V4 affiliate program. Its original V1 NFT and prize terms remain unchanged. These examples do not issue permits, send wallet transactions or represent real earnings.

Live account balances are read directly from Ethereum at a consistent block; they do not depend on a stale payout index or a database-maintained balance. PostgreSQL is needed for enrollment state and public collection configuration. Database/RPC failures remain visible and cannot silently produce demo data or a permit.

Balance reads and existing commission claims do not require enrollment credentials or a public enrollment origin. If `AFFILIATE_PUBLIC_ORIGIN` is missing or invalid, the API omits the optional share URL while preserving verified membership, referral totals, prior payments and available commission. Enrollment POST routes still require their exact HTTPS origin, signer, bot verification and trusted gateway. Configure the official hosted origin locally if share links should point to that site; do not enable or imitate a Vercel gateway on localhost.

“Refresh on-chain data” reads the latest enrollment, referral and payment state. It costs no gas and does not claim funds. A failed account read displays unavailable data, never an inferred zero balance or “Not enrolled.” Fully claimed positions display “Commission already paid”; owning an NFT alone is not proof of affiliate enrollment.

Admission uses temporary ten-minute quotas: 30 challenge attempts per network, five per network-and-wallet pair, three permit attempts per network and five authenticated permit attempts per wallet. Unauthenticated callers cannot consume another wallet's global quota. A network cooldown never permanently owns an affiliate position or proves that its users are the same person.

Run `npm run db:prune:affiliates` from a trusted scheduled job to remove expired challenges and rate buckets older than 24 hours. Each invocation removes at most 1,000 of each using `SKIP LOCKED`; schedule enough runs for the observed volume. It never deletes program configurations, financial records or on-chain nonce protections. Before public launch configure Vercel edge request budgets for affiliate GET/resolve endpoints as well as POST endpoints: live verified reads perform multiple RPC calls, so enrollment quotas alone do not protect the RPC budget.

The browser integration targets injected EIP-1193 wallets with direct Ethereum transactions. It rechecks the selected account/network and contract terms before writes. Transaction intent and nonce are saved before submission; unknown results block automatic retries. If a wallet did not return a hash, the user can supply it from wallet activity, and recovery checks sender, destination, calldata, value, chain and nonce before accepting its receipt. Smart-wallet authentication through ERC-1271 is supported by the backend; ERC-4337 user-operation and relayer transaction recovery need a dedicated adapter before those wallet formats are advertised as supported.

Local setup and validation:

```sh
npm run db:setup
npm run db:test:affiliates
npm run contracts:test
npm run web:test
npm run typecheck
npm run build
```

Use `/mint/8fa5f8c0-6ef4-47f6-9af3-60b8101c9321/affiliates` to inspect the database-backed demo states. Wallet enrollment and claims are enabled only for a verified live deployment with the necessary configuration. See `apps/web/.env.example` and [V4 deployment](deployment-v4.md). Historical V3 tooling remains documented in [V3 deployment](deployment-v3.md).

## Qualification before Mainnet

V4 local verification on 2026-09-13 passed 190 contract tests, 68 web tests, 37 existing history/database checks and 15 affiliate PostgreSQL checks. Workspace TypeScript checks and production builds passed. Database checks executed the real migrations in a disposable schema, including concurrent V4 nonce consumption, exact slot/rate substitution rejection, immutable financial versions, custom and zero prize payouts, zero-rate referral counts and repeatable seeds. Migration `008_configurable_affiliate_terms.sql` and the new demo seed were applied to local PostgreSQL.

A local chain rehearsal verified read-only preflights, deployment of all four V4 components, funding, exact-offer enrollment, referred minting, mock VRF, a configured 60% prize, operator withdrawal and affiliate claim. Its journal is under `apps/contracts/deployments/31337-v4-1789304147919-1.json`. The maximum-config factory and round deployment gas were 6,921,317 and 6,556,854; deployed code sizes were 2,298 and 19,524 bytes. The fixed deployment helper uses 24,472 bytes, leaving 104 bytes under EIP-170. These results do not use real Turnstile credentials or transact on a public chain.

Browser checks covered all six database-backed states, expandable individual terms, the configured 1.5% position's 0.0018 ETH earnings from twelve referrals, the zero-rate position's working referral URL, and the versioned source viewer. The 390px layout had no horizontal overflow. These are demo UI checks; they do not prove connected-wallet behavior against a deployed public contract.

The code and demo do not imply a live deployment or an independent audit. Qualify a funded Sepolia V4 deployment with real Turnstile verification, authenticated enrollment through Vercel, unequal referral rates, sellout, actual Chainlink fulfillment, the full configured prize, affiliate claim and operator withdrawal. Separately exercise an expired unsold round with full refunds. Verify factory, immutable deployment helper, renderer and round sources on the explorer, protect and monitor the enrollment signer, and commission an independent contract/security review before Mainnet funds are accepted.

The V4 factory shares an immutable on-chain SVG renderer and a factory-only deployment helper containing the fixed round creation template. Every round is a full independent contract, with no proxy or upgradeable implementation. Export tooling checks deployed bytecode and creation sizes for all components; remeasure after any code/compiler change. The helper has little EIP-170 headroom, so even small Solidity edits require a fresh size check. Deployment preflight verifies the helper's runtime and its immutable creating-factory address before publishing a trusted factory hash.

References: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [OpenZeppelin cryptography](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography), [Solidity withdrawal/reentrancy guidance](https://docs.soliditylang.org/en/latest/security-considerations.html), [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Vercel request headers](https://vercel.com/docs/headers/request-headers).
