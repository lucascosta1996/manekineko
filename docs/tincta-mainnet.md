# Tincta Rewards · Mainnet launch

Production draft approved on 30 October 2026. **No Mainnet contract has been deployed.** The manual deployment page is `/deploy?chainId=1` in Launch. Creating a contract, uploading its catalog, funding it, opening Genesis, publishing app pins and enabling X are distinct steps.

## Fixed rules

| Package | NFTs | Price per NFT | Equal prizes | Mint window |
| --- | ---: | ---: | ---: | --- |
| Option 1 | 1,000 | 0.01 ETH | 6 | 24 hours |
| Option 2 | 2,000 | 0.02 ETH | 4 | 24 hours |
| Option 3 | 1,000 | 0.01 ETH | 10 | 24 hours |

Every ballot lasts 24 hours. Later ballots begin 60 seconds after preparation; minting opens at ballot close. The package with most votes wins; ties choose the lower option number, and no votes selects Option 1. Genesis has 1,000 free NFTs and two cumulative lifetime primary mints per wallet. It has no mint deadline. Its last mint starts the first full ballot. Paid NFTs have a cumulative 20-primary-mint cap per recipient per collection, including sponsored mints.

Randomness must arrive within 72 hours of sellout. Timely recorded randomness permanently commits the draw; permissionless finalization uses that same entropy. An unsold collection or expired randomness window permits full mint-price refunds to current NFT holders, burning those NFTs. Refunds never expire. An accepted request cannot be rerolled.

Successful collections allocate 60% to distinct winning NFTs, 20% equally to qualified affiliates, 10% to the season holder pool and 10% to treasury. One paid referral qualifies an enrolled affiliate. If none qualifies, the affiliate pool joins treasury. Genesis qualifies for affiliate enrollment throughout the catalog but not season holder payouts. The season pool unlocks after all its collections settle; the first 5% of eligible successfully drawn NFTs can claim, in transaction order. Claims and reserved obligations have no operator sweep.

The prize claimant earns one lifetime sponsored mint across later collections, subject to available sponsorship. This entitlement follows the recorded claimant, not a later NFT transferee. Winning NFTs cannot transfer before their prizes are claimed. A sponsored NFT still counts against the primary mint cap and can receive a full refund if its collection fails; the lifetime redemption stays consumed.

## Contract identity and architecture

The deployment is **TinctaRewards**, ERC-721 name **Tincta Rewards**, symbol **TINCTA**, metadata identity `tincta-rewards-1`. Its constructor creates **TinctaEngine**, an immutable helper for permanent artwork, number encoding and pure draw calculations. All NFTs, custody, accounting, voting and claims remain at the root address. There is no proxy, upgrade mechanism or replaceable renderer.

The two Tincta contracts, their dependency graph, the standard compiler input and public metadata contain only current branding. Internal package/database identifiers and authentic historical deployment records are not renamed. The existing 22-season, 216-collection names, IDs, order, colors and motifs are preserved.

The [whitepaper](https://tincta.xyz/whitepaper) allows immutable helper contracts. Chainlink randomness is an explicitly disclosed external dependency; this release does **not** claim unqualified TAS-1 certification or that randomness originates entirely onchain.

Solidity 0.8.37, Cancun EVM, via-IR and the exact size-oriented optimizer sequence in the exported standard JSON input are pinned. The root uses transient reentrancy protection. Rebuilding with different settings requires new size, gas, artifact and behavioral verification.

## Wallet and manual approval

1. Sign in to Launch and open **Deploy**. Use **Choose wallet**, select an installed Ethereum provider or configured WalletConnect provider, then select the authorized account. No rehearsal account is hardcoded. The wallet must support ordinary Ethereum contract-creation transactions; wallets that only expose smart-account batch operations need an appropriate Ethereum deployment account.
2. Keep **Ethereum Mainnet** selected. **Check deployment and fees** verifies two independent RPCs, the randomness dependency, account nonce, balance and estimated creation gas. Another pending transaction blocks the review. Changing wallet/network or waiting over 90 seconds requires another review.
3. **Approve Mainnet deployment → Continue to wallet** requests contract creation with **0 ETH value plus gas**. The selected account becomes the fixed operating/treasury recipient. It cannot change frozen economics or withdraw reserved user funds. Review that address carefully; it is immutable.
4. A pending request is saved before the wallet opens. Rejection clears it; a lost/uncertain response remains blocked. Recover using the transaction hash. Two agreeing canonical receipts and matching root, helper and coordinator code are required before success is shown. A reverted deployment remains recorded for investigation. Never clear browser storage to work around an uncertain creation request.
5. Download the deployment record. The same page then exposes the existing transaction review workflow for catalog setup. Reconnect the operating account there. Upload batches of at most ten collections, keeping their exact reviewed order. Every batch is checked against the existing onchain prefix before signing.
6. Fund the first collection separately: **0.46 ETH**, less any already-funded amount. Then stop before **Approve opening Genesis** until the source publication, public app/indexer pins and Mainnet X account are verified.

The deployment page does not automatically transfer operating funds, seal the catalog, open Genesis, publish app pins or enable X.

## Oracle and operating budget

Mainnet coordinator: `0xD7f86b4b8Cae7D942340FF628F82735b7a20893a`. The fixed key hash selects the 200-gwei lane; confirmations are 64 and callback gas is 200,000. Native ETH subscription funding is separate from mint proceeds.

The initial per-collection budgets are **0.25 ETH randomness**, **0.20 ETH sponsorship**, and **0.01 ETH execution**. The sponsorship reserve covers ten sponsored mints even at Option 2's price; credits still require available funding. Unused funds are recoverable through named contract buckets after their applicable conditions. An unresolved Chainlink request can delay subscription recovery without blocking holder refunds.

At the reviewed 24% native premium and zero flat native fee, the documented conservative estimate `(200,000 verification + 200,000 callback gas) × 200 gwei × 1.24` is **0.0992 ETH**. The 0.25 ETH reserve is approximately 2.52 times that estimate. It is not the amount guaranteed to be spent, and neither fees nor service availability are guaranteed forever. Recheck the actual coordinator configuration and subscription balance before launch and each collection; add funding through Launch if needed before the immutable cutoff. Never wait until the last block to top up.

Sources: [Chainlink supported networks](https://docs.chain.link/vrf/v2-5/supported-networks), [billing and minimum balance](https://docs.chain.link/vrf/v2-5/billing).

## Publication after the owner deploys

Run the read-only admission command with the confirmed creation transaction:

```sh
npm run tincta:verify -- --transaction 0xCONFIRMED_CREATION_HASH
```

This writes `.private/tincta-mainnet/deployment.json` and `publication.json` after checking both RPCs, exact creation data, root/helper code, immutable settings and the uploaded catalog prefix. It loads no private key and sends no transaction.

Publish both root and helper source on Etherscan using the supplied standard JSON bundle, Solidity compiler identifier and constructor arguments from the deployment record. The root constructor is `(operator, 250000000000000000, 200000000000000000)`; the helper has no arguments. Hardhat's `mainnetReadOnly` network can verify with `--contract contracts/TinctaRewards.sol:TinctaRewards` and `--contract contracts/TinctaEngine.sol:TinctaEngine`; keep RPC and Etherscan credentials in environment variables. Read back the explorer results before marking source verification complete.

Apply migration `040_tincta_production.sql` before new source activation. Merge the generated indexer source and gallery pin with the existing historical lists; do not replace or relabel old entries. Publish the generated `NEXT_PUBLIC_TINCTA_MAINNET_*` values to Web and Launch, then verify aliases, Genesis status, collection gallery and connected-wallet activity. Landing reads the public Web status API. The Mainnet NFT/wallet mirror waits twelve blocks, so recently confirmed payments can appear after a short delay.

The internal adapter discriminator is 18; the public contract identity is `tincta-rewards-1`. Historical adapters keep their original identities. A partial Mainnet pin fails closed.

## Following an open collection

Watch Launch for the ballot result, paid mint deadline, sellout, randomness and finalized winners. The final mint attempts the randomness request automatically. If it was never accepted, **Request the draw** retries that request; it cannot replace an accepted request. After entropy arrives, **Finalize the draw** processes bounded attempts against that same entropy. Anyone can perform permissionless progress and claim the reserved execution reward if they finalize the draw.

This preparation does not install a Mainnet transaction-signing daemon. Use the visible Launch actions for finalization, funding and preparation of the next collection, or separately configure and qualify an executor before promising unattended season progression. The always-running X sender observes and publishes; it has no authority to send blockchain transactions. A delay in finalization after timely randomness cannot turn a committed draw into refunds.

Only prepare the next collection when its full 24-hour ballot can be announced. Later collections never start merely because the previous mint deadline elapsed. The fixed operating recipient handles treasury and unused-budget recovery; unpaid user claims remain reserved.

## X delivery

The hosted sender and independent watchdog already run continuously. Production support uses separate `SOCIAL_MAINNET_RPC_PRIMARY` and `SOCIAL_MAINNET_RPC_SECONDARY` endpoints, a Mainnet X profile, a separately registered disabled source and the explicit `SOCIAL_MAINNET_ENABLED=true` switch. No Mainnet source, account or delivery is activated by deployment or this preparation.

Before activation, verify the intended Mainnet X author, media permissions, public app origin and both chain projections. Approve that account's publication scope and register the exact production address/code hash. Enable the source only after those checks. The durable outbox preserves opening → sellout → results order, retries explicit failures and reconciles uncertain accepted posts before retrying. Monitor `/api/social-sender/status`; a stale source, rejected credential or unresolved post requires attention. Normal delivery aims for the next minute after chain confirmation. X rate limits and outages can still delay posts; no system can guarantee zero delay.

## Evidence and remaining launch steps

See [production verification](tincta-mainnet-verification.md) and the [portable owner checklist](../output/pdf/tincta-mainnet-launch-2026-10-30.pdf). Local tests, read-only deployment estimates, a disposable fork, hosted UI checks and actual Mainnet execution are different evidence. Owner approval is still required for the real deployment, followed by explorer verification, source activation and opening Genesis. This preparation is not an independent security audit or a guarantee of defect-free operation.
