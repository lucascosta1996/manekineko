# V9 wallet mint limit and affiliate payment history

> V9 version record. The local integrated default is now V10, which inherits this cap and adds permanent numbers from mint. Explicit V9 execution/recovery remains available and existing contracts/exports retain their version. See [V10 integration and rollout](permanent-combinations-v10.md).

## Mint allowance

`ManekinekoRoundV9` fixes `MAX_MINTS_PER_WALLET` at 20. The contract records cumulative primary mints in `mintedPerWallet` and exposes `remainingMints(address)` for clients.

The allowance belongs to the mint recipient. Direct paid mints, referral mints, gifted mints and sponsored winner-credit mints all consume that recipient's same allowance. A different payer cannot mint an additional ticket to an exhausted recipient. One payer can fund tickets for different recipients; the rule does not identify people or prevent one person from controlling multiple wallets.

The contract checks and reserves the allowance before invoking ERC-721 receiver callbacks. A failed transaction rolls the counter back. Transfers, refund burns and splitting purchases across transactions do not restore consumed allowance. Secondary-market receipts do not count as primary mints. Each new collection starts a separate allowance.

A 1,000-ticket sellout therefore needs at least 50 recipient wallets. The locally tested rehearsal uses 50 wallets with 20 tickets each and checks six holder-only prize claims, affiliate settlement and sponsored-mint limits.

## History accounting

The History summary and collection details display **Affiliates paid**. This is the sum of confirmed, indexed `AffiliateCommissionClaimed` amounts for the collection. It measures completed withdrawals, not the configured pool or unclaimed entitlement. Totals are separated by network/currency and use integer wei arithmetic. Canonical event indexing supplies duplicate prevention and reorganization recovery.

The staging History page currently records 2 Sepolia ETH paid to the affiliates of the completed V8 Cinder Study collection.

## Launch and deployment

V9 launch configurations require the fixed `maxMintsPerWallet: "20"` marker and export as V9. Historical V8 configurations remain readable. Upgrading an old draft preserves its names, artwork and economic terms, and requires selecting compatible deployment components. It never changes an existing deployed contract.

V9 uses Factory V9, Round V9, Renderer V9, Affiliate Eligibility V4 and Winner Credits V5. Registry lineage checks preserve historical eligibility and lifetime winner-credit rules. The indexer and web readers use separate V9 factory trust pins; V8 pins must not be reused as V9 pins.

For an explicitly requested V9 Sepolia rehearsal:

1. Upgrade and finalize the chosen draft, then prepare its V9 export with `launch:prepare -- --expected-version affiliate-v9` and the trusted manifest/hash/output arguments. `launch:prepare:current` now requires V10.
2. Deploy and verify the V9 components and compatible registries; complete their existing registration, sponsorship and VRF funding requirements.
3. Register the collection, configure V9 factory address/code-hash trust pins in web and indexer, deploy the updated indexer, and include the new round in the QuickNode webhook filter.
4. Verify indexing of a direct contract mint. Mint to a wallet up to 20 across repeated calls and confirm that its 21st mint reverts. Complete the sellout with at least 50 recipient wallets.

The staging database migration, History display and launch UI are deployed. V9 contract behavior and deployment sizes are tested locally; **V9 has not yet been deployed to Sepolia**. Completed immutable V8 contracts keep their original mint rules. Local validation is not independent security review or Mainnet qualification.
