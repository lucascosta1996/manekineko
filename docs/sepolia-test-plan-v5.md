# Historical V5 Sepolia test plan

Archived instructions and checkpoints for the original V5 rehearsal. They do not qualify the current architecture. For new tests, use the [V8 Sepolia plan](sepolia-test-plan.md).

Updated on 2026-09-17 for the current V5 contracts. The first collection deployment, 0.30 Sepolia ETH subscription funding, source verification and web publication are confirmed; the complete lifecycle remains to be tested.

## Objective and current boundary

Prove the complete collection lifecycle using real Sepolia transactions and Chainlink VRF: enrollment, minting, one winner, correct affiliate allocation, payout, withdrawal, refunds and successor deployment. Then qualify the public UI and automated execution against that lifecycle.

The deployment/preflight scripts exist. They stop after funding a collection with enrollment open. The launch automation page persists prepared plans, but has no connected transaction worker. A manual verified database synchronization command now exists. A continuously running blockchain observer must still be connected before automatic history updates and unattended operation can be accepted. Contract testing can start with manual operations while this integration is completed.

The original rehearsal below uses V5 and retains its original enrollment behavior. For new V6 rehearsals, also use [V6 deployment](deployment-v6.md) and [NFT holder eligibility](affiliate-holder-eligibility.md): register the completed V5 collection as a source, enroll a current holder into the next collection, reject a non-holder and reuse of the same NFT, and verify that a later transfer does not revoke the registered position. The first-collection exception is network-wide, not per factory or automation.

Use [the V5 deployment runbook](deployment-v5.md), [affiliate accounting](affiliate-pools.md) and [automation boundaries](launch-automations.md) alongside the historical rehearsal plan.

## 1. Prepare an isolated environment

**Staging progress (2026-09-17):** the protected web/launch deployments, isolated Neon database, staging operator, real Turnstile widget, separate test wallets and server-side Sepolia restriction are configured. Hosted login, persistence and chain rejection checks passed. A dedicated QuickNode Sepolia endpoint and separate Etherscan API key were created and passed read-only provider checks. Wallet funding and first-collection configuration finalization are complete; see [the verified record](sepolia-20-ticket.md) and [staging setup and evidence](staging.md). Connected-wallet checks and actual enrollment qualification remain to be performed.

- Use Ethereum Sepolia, chain ID `11155111`, throughout. Use a dedicated RPC endpoint and an Etherscan verification API key.
- Deploy `apps/web` and `apps/launch` as separate Vercel staging projects, with HTTPS origins and an isolated PostgreSQL database. Provision a staging launch operator through the existing account CLI. The landing page is optional for this rehearsal.
- Configure real Turnstile and trusted Vercel proxy handling for affiliate admission. Localhost can exercise UI and local tests, but cannot establish that production admission controls work.
- Use a dedicated testnet owner/deployer, a separate server enrollment signer, three affiliate wallets and two buyer wallets. Keep the enrollment signer unfunded; it signs admission vouchers rather than blockchain transactions. Affiliate and buyer wallets need transaction gas.
- Use authorized testers on their normal networks for admission checks. Exercise same-network rate limits separately; do not disable those controls to fill the test positions. IP checks are abuse signals, not proof of unique people.
- Store secrets in the appropriate local secret store or server environment, never in the exported configuration or client variables. Keep Mainnet signing credentials out of staging.

**Pass:** staging login works, migrations succeed, RPC reports Sepolia, wallet network checks work, and web admission is configured with the intended staging origin and signer.

## 2. Fund and freeze the first test configuration

**Completed (2026-09-17):** configuration `3342c115-3d41-4cb4-be45-fa103178f0ff` is finalized at revision 4. Its saved record, export and prepared CLI file have matching hashes. At the funding checkpoint, the deployer retained 0.399891071562781 Sepolia ETH after five confirmed 0.02 ETH test-wallet transfers; the enrollment signer remains unfunded. Read-only deployment preflight passed. [Terms, hash and receipt links](sepolia-20-ticket.md) are recorded separately; the subsequent deployment and 0.30 ETH VRF deposit are now confirmed in step 3.

Start with approximately **0.5 Sepolia ETH total**, distributed across the operator and test wallets. Obtain test tokens from a [Sepolia faucet](https://faucets.chain.link/sepolia). This is a planning allowance for the small test, assuming transaction gas prices around 5 gwei or below; deployment estimates determine the actual requirement.

| Setting | First collection |
| --- | --- |
| Contract model | V5 shared affiliate pool |
| Supply | 20 NFTs |
| Mint price | 0.0001 ETH |
| Winner share | 50% |
| Affiliate pool | 10% of total primary mint revenue |
| Affiliate positions | 20; enroll three test affiliates |
| Lifetime | 24 hours from deployment, including enrollment |
| Initial sale state | Inactive; activate after enrollment |
| VRF confirmations | 64 |
| VRF callback gas limit | 200,000 |
| Initial VRF reserve | Plan 0.30 Sepolia ETH; check live requirements before requesting |

The repository's example currently uses 1,000 NFTs, 10 positions and 0.10 ETH randomness funding. A separate reviewed 20-ticket Sepolia configuration is now finalized with the values above and real owner/signer addresses. Use that finalized export; do not broadcast the example unchanged.

The randomness reserve is **not a fixed fee**. Only actual VRF charges are consumed; eligible unused funding can be recovered. The contract creates its own subscription, funded through `fundRandomness`; this flow uses native ETH and does not require LINK. Buyers pay mint transaction gas, while the operator separately funds VRF. See [Chainlink subscription funding](https://docs.chain.link/vrf/v2-5/overview/subscription).

For the four core rehearsals below, provisionally budget **3 Sepolia ETH**, assuming gas around 5 gwei or below and reserving up to 0.30 ETH per collection. This allows roughly 0.31 ETH of mint principal, 1.20 ETH of VRF reserves, 0.75 ETH for transaction gas and 0.74 ETH contingency. Recalculate after the first real deployment; these are allowances, not a fee quote. Extended edge-case collections require additional budget. Returned principal and recovered reserves can be reused.

**Pass:** the finalized launch record, exported configuration and expected hash agree; all addresses and financial terms are reviewed; wallets and subscription funding have sufficient headroom.

## 3. Run local gates, preflight, deploy and verify

**Deployment completed (2026-09-17):** three confirmed transactions created the factory, renderer, helper and 20-ticket round, then funded its dedicated native-ETH VRF subscription. The round is `0xAfFd7dc1B6A0D8974040F3216316240B724715A9`, with pending activation and zero mints in its registered confirmed snapshot. Actual transaction gas was **0.012002427042770458 ETH**; the **0.30 ETH** reserve is separate. The immutable deadline is **2026-09-18 23:02:24 UTC**. See [the deployment record](sepolia-20-ticket.md#confirmed-deployment). All four contracts are source-verified on Etherscan, with independent Sourcify exact creation/runtime proof of the factory’s Cancun build. The live UUID is registered in PostgreSQL; verified factory pins are configured and the affiliate program is enabled. Eight hosted checks passed: one real catalog collection, zero completed history outcomes, one in-progress collection, valid detail pages, old mock URL 404 and verified affiliate readiness (`canEnroll=true`, `canMint=false`). The local demo rows were removed. Actual wallet admission and the remaining lifecycle are next.

1. Run `npm run test`, `npm run contracts:export`, `npm run typecheck` and `npm run build`. The export checks contract size, including the deployment helper.
2. Run the database checks against a disposable test database: `npm run db:test`, `npm run db:test:affiliates`, `npm run launch:db:test:auth`, `npm run launch:db:test:config` and `npm run launch:db:test:automations`. Confirm database checks actually execute instead of being skipped.
3. Prepare the finalized export using `npm run launch:prepare` with its separately obtained expected hash. Configure the generated V5 file, Sepolia RPC and intended preflight address.
4. Keep broadcasting disabled and run `npm run v5:preflight:sepolia --workspace @manekineko/contracts`. Inspect estimated gas, live VRF configuration, ownership and funding. Set an operational gas-price ceiling before sending.
5. Deploy through the V5 Sepolia deployment script using the reviewed configuration. Set `V5_JOURNAL_PATH` explicitly and keep its version-2 journal, signed transaction hashes, original timestamp and receipts. The script uses a per-signer lock and a 5 gwei default ceiling. Resume the same journal to reconcile uncertain submissions without duplicate deployment or funding.
6. Verify the factory, helper, renderer and round on Sepolia Etherscan using the pinned compiler/settings. Read immutable on-chain terms back and compare them with the launch record.
7. Preview and write a new live V5 public collection and verified initial snapshot with `scripts/sync-staging-collection.mjs`; see [the sync runbook](live-collection-sync.md). Configure the verified V5 factory address and runtime hash in web admission. Do not repurpose a mock or historical V4 collection.

**Pass:** verified explorer source and runtime correspond to the reviewed build; the correct collection is visible at `/mint/<collectionId>`; enrollment targets the actual Sepolia contract.

## 4. Complete the 20-ticket lifecycle

**Next qualification:** the deployed collection is visible in the web Collections and History sections. Qualify real hosted Turnstile admission and affiliate enrollment before activating the sale. Its deadline is already fixed at **2026-09-18 23:02:24 UTC**; registration, page refreshes and deployment-script retries do not extend it. Re-run the manual sync command after test transactions to refresh database displays.

1. Enroll affiliates A, B and C through the staging UI. Verify wallet/slot binding and reject invalid, expired or replayed admission vouchers. Confirm enrollment cannot exceed capacity.
2. Activate the sale with the owner. Mint 4 tickets using A's link, 6 using B's link, and 10 directly. C receives no referrals. Test both single and batch minting, rejection of incorrect payment and rejection after sellout.
3. At sellout, read all referral counts and accrued affiliate balances. Claim one affiliate's balance and leave another unclaimed to test reserve protection.
4. Call `requestRandomness` once, wait for real Chainlink fulfillment, then call `finalizeDraw` with a valid bounded attempt count. Record the request and fulfillment transaction. Do not issue another request or substitute randomness if delayed.
5. Read all 20 scores; verify distinct ranks, exactly one highest score and the expected winning token. Inspect `tokenURI` and its embedded SVG before and after reveal.
6. Exercise token transfers at permitted lifecycle stages and confirm ownership rules: the prize follows the contract's current-holder rules, while historical referral counts do not move with NFTs.
7. Call owner `distributePrize`; verify the actual recipient and amount. Check that premature or excessive operator withdrawals fail, then withdraw the permitted operator amount while the second affiliate's entitlement remains protected. Claim the remaining affiliate balance and reject repeat claims.
8. Recover eligible unused randomness funding. Record actual VRF cost separately from transaction gas and mint revenue.

Expected mint-revenue accounting, excluding transaction gas and separate VRF funding:

| Recipient | Expected amount |
| --- | --- |
| Winner | 0.001 ETH |
| Affiliate A: 4 of 10 referred tickets | 0.00008 ETH |
| Affiliate B: 6 of 10 referred tickets | 0.00012 ETH |
| Affiliate C: no referrals | 0 ETH |
| Operator | 0.0008 ETH |
| **Total primary sales** | **0.002 ETH** |

The 20 available positions do not multiply the pool. A receives 40% and B receives 60% of the same 0.0002 ETH pool. Organic purchases contribute to that pool but do not add to referral counts.

**Pass:** transaction receipts and balances reconcile exactly; the winner is unique; unauthorized operations fail; no withdrawal consumes another recipient's entitlement.

## 5. Rehearse scale and failure paths

Run these core collections in order, reusing the verified factory where eligible:

| Run | Supply / mint activity | Main acceptance criteria |
| --- | --- | --- |
| A | 20 / sell out | Complete the lifecycle and accounting above |
| B | 1,000 / sell out | Read every score; one maximum; measure batch mint and settlement gas |
| C | 2,000 / sell out | Repeat at intended scale; verify different immutable launch terms and accounting |
| D | 20 / mint 5, let deadline expire | Current holders recover full mint principal; no affiliate payout; no draw |

Before each successor, prove that creation is rejected until the previous collection has sold out and its prize has been paid. Run the unsold/refund collection **last or in a separate factory**: an unsuccessful round blocks normal progression in its series.

Before Mainnet qualification, add dedicated tests for:

- **No referrals:** a sold-out collection with only direct purchases, confirming the unused pool's operator treatment.
- **Maximum affiliate load:** the final mint with 100 active, referring affiliates. Measure actual gas; empty slots do not exercise this path. Use authorized test participants to validate real admission; keep synthetic load testing separate from abuse-control acceptance.
- **Prize recovery:** withhold owner payout on a dedicated finalized collection; confirm the winning holder cannot claim early and can claim after the actual seven-day delay. Schedule this early so its waiting period overlaps other work.
- **Interrupted operations:** simulate process/RPC failure, reconcile journaled transactions and prove no duplicate deployment, payment or randomness request. Exercise wrong-chain protection and refusal to proceed without sufficient funding before submission.
- **Local fault tests:** use controlled local tests for coordinator failure, malicious receivers and chain reorganizations that cannot safely or reliably be induced on a public testnet. Label this evidence as local, not Sepolia execution.

**Pass:** every core run has recorded receipts and reconciled balances; extended cases have separate evidence and no unresolved fund-safety failures. A full public-network prize-recovery test necessarily takes more than seven days from that collection's finalization.

## 6. Connect and qualify automation

This is implementation still required after the manual lifecycle is established:

1. Extend the existing manual snapshot synchronization into a continuously running blockchain observer connected to the staging database. Index confirmed deployment, mint, referral, draw, payout and refund events; handle duplicate delivery, restart, backfill and reorganizations. Confirm history and affiliate views match chain state after reloads.
2. Connect the prepared-plan execution worker with exclusive entry claims, one writer per signer, transaction journaling, budgets, gas ceilings and pause/recovery controls. Revalidate configuration hashes, deadlines, ownership and balances at execution time.
3. Run two small consecutive collections automatically. The next deployment must occur only after confirmed predecessor sellout and prize payment. Verify configured enrollment windows, activation, draw, settlement and interval behavior.
4. Stop/restart the worker mid-operation and verify reconciliation. Expired deadlines, missing funding and an unsold predecessor must pause the plan with an actionable status rather than silently skip or extend it.

**Pass:** an operator can follow each plan entry from configuration to confirmed transactions and correct public history; restarts create no duplicate actions; no next round starts while its predecessor gate is unsatisfied.

## Evidence and completion

For each run retain: configuration/hash, build identifier, chain and contract addresses, verification links, deployment journal, VRF request ID, transaction receipts, gas and actual VRF charges, expected/actual payouts, and UI/database observations. Record separately whether each check was local, real Sepolia, authenticated staging UI or automated execution.

The first milestone is one verified 20-ticket collection with real VRF and reconciled payouts. Completing this plan establishes testnet evidence; independent contract review and operational launch qualification remain separate Mainnet gates.
