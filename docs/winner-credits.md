# Winner credits

> Current local integration uses Winner Credits V6 for V10 and preserves V5 for V9. See [the V10 registry handoff](permanent-combinations-v10.md#registry-lineage-and-migration-requirements) for exact pins, previous-ledger lifetime history and retirement of every old mintable destination. Zero sponsorship balance alone is insufficient; old ledgers must not receive new mintable targets later. The earlier V6-round examples below retain their historical meaning. Live V10 registry rollout remains pending.

A winning wallet can redeem **one free NFT in its lifetime**, in a later eligible collection. Winning again does not add another reward. An unused reward does not expire; selling the winning NFT after settlement does not transfer eligibility. The limit applies to each address in the canonical registry on that network; Sepolia and Mainnet have separate registries.

The beneficiary is the wallet holding the winning NFT **when the prize is paid**. V6 stores `winningHolder` and `prizePaidAt` before the prize transfer, and rolls them back if payment fails. An alternate prize recipient or a transfer inside its callback cannot change the beneficiary.

## Operator-funded mints

`ManekinekoWinnerCredits` holds a separate ETH sponsorship balance for each destination collection. Redemption spends exactly that collection's mint price through its ordinary `mint(winner, 1)` function. The winner pays network gas, but sends no mint payment. The NFT uses one supply slot and has the same draw, transfer and refund rights as other tickets.

The entire mint price enters normal primary revenue, so the prize and affiliate pool stay fully funded. Sponsored mints do not attribute a referral. If the destination expires unsold, its current NFT holder can receive the ordinary ETH refund; the credit stays spent, preventing both a cash refund and a reusable free mint.

Redemption requires an active, unexpired, unsold collection with sufficient sponsorship. Credits do not reserve supply or guarantee an unfunded collection can mint. Different winning wallets can save their unused rewards for the same collection, so its sponsorship budget remains necessary to cap spending. Separate wallets have separate eligibility. The registry owner can withdraw unused sponsorship. The UI checks availability before a transaction; the contract remains authoritative if conditions change.

## Ledger and ordering

Deploy **one canonical registry per network**, reused across future official factories. Registry version `winner-credits-v2` records source wins and `redeemedSource(wallet)`, the win used for that wallet's single successful redemption. All qualifying wins share this lifetime limit, including legacy and native V6 wins across different approved factories. A failed mint reverts the lifetime flag, source record and sponsorship changes together. Refunds never reset the flag. There is no reset, beneficiary reassignment or credit-transfer function.

Only the registry owner approves factories. Approval pins their runtime hash and is append-only. Anyone can then register an actual factory round. Approve only reviewed immutable factories: bytecode identity alone does not establish correct behavior, and approval trusts all eligible rounds the factory creates.

Register each destination **before sale activation**, after the previous winner's successful prize payment. Registration must have a strictly later timestamp; wait for the next block in sequential launches. Registrations after activation, expiry, cancellation or minting are marked `rewardsOnly`: their wins can establish eligibility for an unused lifetime reward, but the collection cannot accept sponsored mints. A forgotten source registration therefore does not lose its winner's reward or turn an older sale into a future destination.

Anyone can record a native V6 qualifying win with `claimCredit(source)` before that wallet has redeemed, but only the beneficiary can spend its reward. Multiple recorded wins are alternative proofs for the same entitlement, never additional free mints. The winner chooses which eligible win to use, so a third party cannot force a newer source and exclude an otherwise eligible destination. The UI normally combines issuance and redemption with `claimAndRedeem(source, target)`. No backend signature or database balance authorizes redemption.

Replacing the registry resets its spent-credit ledger. Deployment tooling refuses to prepare a replacement when a canonical address is configured. A deliberate migration needs explicit preservation of both source redemption records and wallet lifetime usage, plus review of the old registry's continued operation; it is not a normal launch. The old unreleased per-win implementation must not be deployed; tooling and web checks require `winner-credits-v2`.

## Existing V5 winner

The immutable V5 contract lacks a permanent winning-holder getter. A one-time legacy Merkle root imports reviewed canonical `PrizeDelivered` events. Leaves bind chain, source collection, holder, winning token, payment timestamp and transaction hash. The constructor fixes the root permanently. This is an administrative snapshot trust boundary, not a trustless EVM proof of historical logs.

The bundled Sepolia manifest contains the verified completed rehearsal:

- Source: `0xAfFd7dc1B6A0D8974040F3216316240B724715A9`
- Winning holder: `0xF0aD291922A954e035323d37F79702e02912e12A`
- Winning ticket: `3`
- Payment transaction: `0x722606a5d1865bdd271a087a530c98ecde4d966bdb808c19c8dcda733a1dac55`
- Root: `0x4f1e5b1d0ba2da324aad43722a213ac1a872695ee4a92fc23ae960c6a74e49f7`

The read-only generator verifies expected V5 bytecode, factory mapping, confirmed canonical receipt and settlement fields. It never loads signing keys or sends transactions:

```sh
node --env-file=.env.staging.local --import tsx scripts/prepare-winner-credit-legacy.mjs \
  --input database/winner-credits/legacy-sources.sepolia.json \
  --output /tmp/reviewed-legacy-credits.json
```

Review the output before updating `packages/contracts/src/winner-credits-legacy.json` or deploying its root. Do not add entries to a root already deployed. Future official collections must use V6 and the canonical registry. No credit is live merely because its manifest is present.

## Launch workflow

1. Run `npm run contracts:export`. Prepare an unsigned registry deployment with the intended governance address:

   ```sh
   node --import tsx scripts/winner-credit-operations.mjs deploy \
     --chain 11155111 --owner <registry-governance-address> \
     --output <new-deployment-plan.json>
   ```

   Deploy and verify that reviewed transaction separately. The registry uses Solidity 0.8.37, Cancun, optimizer runs 200 and **no viaIR**; V6 components keep their separate viaIR/runs-1 settings. Reuse the registry for subsequent collections.

2. Configure `WINNER_CREDITS_ADDRESS_11155111` and `WINNER_CREDITS_CODEHASH_11155111` together in the web and operations environments. Mainnet uses suffix `_1`. Hash the deployed runtime including its immutable root. Keep versioned factory pins and RPC configuration. Staging export allows only the Sepolia pair, only in the web environment.

3. In Launch or Automations, choose the registry and a separate sponsorship budget for each new V6 collection. These are `operations.winnerCreditsAddress` and `operations.winnerCreditSponsorshipWei`, bound into the finalized configuration hash. The budget must cover at least one ticket; capacity is `min(supply, floor(budget / mintPrice))`. Historical exports remain readable unchanged; new V6 finalization requires these fields. Also configure the separate `operations.affiliateEligibilityAddress` using the [affiliate eligibility workflow](affiliate-holder-eligibility.md). Eligibility registration must precede affiliate enrollment; it does not fund or grant winner credits.

4. `npm run launch:prepare -- ...` emits the usual files plus `winner-credit-plan.json`. Deploy V6 and register its affiliate eligibility before opening enrollment. Before activation, prepare ordered unsigned credit approval, registration and funding calls:

   ```sh
   node --env-file=.env.staging.local --import tsx scripts/winner-credit-operations.mjs collection \
     --manifest <finalized-export.json> --expected-hash <trusted-configuration-hash> \
     --factory <deployed-factory> --round <deployed-collection> \
     --registry-codehash <verified-registry-runtime-hash> --output <new-operations-plan.json>
   ```

   The helper verifies network, canonical registry, legacy root, bytecode, component bindings, factory owner and collection/VRF terms. A new-factory configuration requires round 1. It does not approve, register, fund or activate anything. Execute reviewed calls in order, rechecking live state before each transaction. Never blindly replay a saved funding transaction.

5. Funding preparation subtracts `totalFunded(collection)` from the reviewed **cumulative** budget. Spending or withdrawal does not reduce that counter, so repeating setup cannot silently refill it. To intentionally add funds, review a higher cumulative budget. Verify the spendable balance separately before activation.

6. Deploy web/launch changes, apply the existing V6 schema migration and configure the collection/indexer as described in [V6 deployment](deployment-v6.md). Rehearse legacy and native redemption using different winning wallets, repeat-win rejection, direct mint indexing, failed-mint rollback and full prize/affiliate settlement on Sepolia.

The launch console and automation plans still do not hold signing keys or execute transactions. This workflow prepares deterministic operations; it does not add a background signing service.

## Web and indexing

`/my-nfts` shows paginated past wins, lifetime reward status and redeemed NFT links. Multiple wins cannot inflate the available reward count. `/mint/[collectionId]` offers the unused reward when the wallet, collection and funding pass verification. Missing registry configuration displays that the program is not enabled yet.

`/api/winner-credits` discovers wins from confirmed history tables, then verifies canonical RPC state, registry/factory pins, beneficiary, spent state, proofs, destination registration and sponsorship. It simulates the exact redemption from the wallet. The transaction path repeats checks through the wallet provider and preserves pending-transaction recovery. Missed V6 source registration can be completed from the UI.

The existing indexer sees an ordinary paid `Minted` event and transfer, with the registry as payer and winner as recipient. Reorganizations roll back indexed mints and winner history. The API reads on-chain credits, with no mock-credit balance or private ownership ledger.

## Validation and release status

Contract tests cover repeat wins before and after redemption, legacy/native shared limits, payment-callback snapshots, double spending, proof tampering, failed mint rollback, reentrancy, future registration, late source recovery, full revenue accounting and refunds. Web tests cover pins, lifetime status across history pages, simulation failures, wallet changes and recovery. SQL tests use temporary tables and rollback. Local chain integration verifies sponsored mint accounting/indexing, reorg cleanup and rejection of another reward when the sponsored wallet wins again.

```sh
npm run contracts:test
npm run credits:test
npm run web:test
npm run launch:test
node --test scripts/staging-environment.test.mjs
```

Implementation and local validation are complete. The registry, updated V6 contracts and web changes have **not been deployed** by this task. Live Sepolia rehearsal and independent contract review remain release requirements.
