# Historical V8 Sepolia qualification plan

> This is the V8 rehearsal plan, retained as historical procedure. New editable defaults and current preparation/deployment shortcuts target V10; explicit V9 commands remain available for old exports. Read [the current release gaps](architecture.md#known-gaps-before-the-next-release) and [V10 rollout requirements](permanent-combinations-v10.md) first. The completed V8 rehearsal does not establish V9/V10 qualification.

New architecture tests must use a **new V8 deployment**. The completed collection `3342c115-3d41-4cb4-be45-fa103178f0ff` remains V5 at `0xAfFd7dc1B6A0D8974040F3216316240B724715A9`; neither its source page nor its outcomes should be relabeled V8. Its [historical test plan](sepolia-test-plan-v5.md) and `scripts/run-sepolia-rehearsal.mjs` apply only to that pinned V5 contract.

This plan does not attest to a deployed or qualified V8 collection. See the [V8 implementation and release gates](season-v8-implementation.md) for architecture, economic rules and remaining release work.

## 1. Prepare staging and freeze V8 terms

- Use Ethereum Sepolia (`11155111`), separate staging wallets and an isolated database. Apply and verify migrations through `021_equal_awards_v8.sql` before serving V8 records.
- Create a new season/collection in Launch. New forms default to `affiliate-v8`, algorithm `unique-rank-v5`, and six equal prizes. The algorithm's v5 suffix does **not** mean a V5 round.
- Use a small six-winner smoke collection first (supply at least six), then a 1,000-ticket rehearsal with representative referral thresholds. Lowering the test mint price also lowers the prizes proportionally; record the expected amounts from the finalized terms.
- Set explicit sale opening, immutable deadline, season identity, colors, owner, admission signer, VRF settings and affiliate terms. Plan deployment and enrollment ahead of opening.
- Use eligibility **V3** and winner credits **V4**, with reviewed Sepolia addresses and runtime hashes. Seed the canonical eligibility history so a new factory cannot reset first-collection eligibility. Verify prior credit-registry retirement before funding V4.

## 2. Prepare and verify the intended version

Run the local test suites, contract export/size checks, app type checks and builds. Then obtain the finalized export and its trusted hash separately from Launch:

```sh
npm run launch:prepare:current -- --manifest /absolute/path/export.json --expected-hash TRUSTED_HASH --output /absolute/path/new-directory
```

This command rejects historical exports before writing deployment files. Check `deployment-plan.json` says `affiliate-v8` / `unique-rank-v5`, emits `round-v8.json` with the intended `winnerCount`, and keeps `V8_BROADCAST=0`. Preparation is offline and sends no transaction.

Set the generated V8 environment, the reviewed registry pins and staging RPC. Run the read-only preflight:

```sh
npm run v8:preflight:sepolia --workspace @manekineko/contracts
```

Review live gas and VRF funding estimates before broadcasting. Generic `deploy:local` and `deploy:sepolia` commands now route to V8 and require reviewed V8 configuration. Explicitly named `legacy:deploy:*` commands retain the original demo tooling.

## 3. Deploy a separate collection and publish verified data

- Use `v8:deploy:sepolia` with explicit `V8_BROADCAST=1`, a durable `V8_JOURNAL_PATH` and the reviewed staging signer. Retain the journal for retries; do not reuse V5 addresses, factory pins or journals.
- Verify the factory, helper, renderer, round and registries against the exact compiled sources and constructor arguments on Sepolia Etherscan. Read back `CONTRACT_VERSION() = affiliate-v8`, `ALGORITHM_VERSION() = unique-rank-v5`, award count and immutable terms. The V8 deployer checks these identifiers as well as runtime bytecode.
- Register the collection and registries in the version-aware backend/indexer. Configure V8 admission pins, fund the reviewed sponsorship budget, and verify enrollment readiness before activating the sale.
- Confirm `/mint/<new-id>/contract` shows `ManekinekoRoundV8`, `MultiAwardRank.sol`, the V8 renderer and the new Sepolia Etherscan address. Keep the old V5 page available as historical evidence.

## 4. Rehearse the current lifecycle

1. Enroll eligible NFT holders through hosted admission; reject nonholders, duplicate source NFTs, replayed vouchers and enrollment after opening.
2. Mint through affiliate URLs and directly through Etherscan. Confirm canonical indexing updates the database, mint UI, My NFTs and history without a browser callback.
3. Exercise qualified and unqualified affiliates. Reconcile equal payouts and the referral-revenue cap against the frozen terms; confirm sponsored mints do not count as paid referrals.
4. Sell out, request real Chainlink VRF once and finalize the deterministic draw. Verify unique scores and six distinct winning NFTs. One wallet may own several winners.
5. Claim each award through its current holder, including one wallet with multiple awards and a delayed claimant. Reject owner-only, approved-operator, nonholder and repeated claims. Confirm unclaimed liabilities stay reserved.
6. Check on-chain SVG/metadata, season/collection appearance and external explorer rendering. Verify transfer locks and metadata updates after reveal and claims.
7. Redeem an eligible winner's single lifetime sponsored mint into a later collection; test duplicate and insufficient-sponsorship rejection. Verify the full mint price is funded.
8. Prepare a successor only after the predecessor reveals with fully backed liabilities, without waiting for every claim. Check the season's fixed next-launch and announcement timestamps. Automation and social dispatch remain separate future work.
9. Use a separate unsold collection to test expiry, current-holder refunds, NFT burning and protected balances. Reconcile gas, VRF consumption, awards, affiliate claims and owner withdrawals separately.

## Acceptance evidence

Retain configuration hashes, version identifiers, addresses, verified-source links, canonical transaction receipts and reconciled balances for each case. Run hosted connected-wallet checks and indexer/reorg recovery checks. Existing V5 receipts and local mock-VRF tests do not establish that this V8 end-to-end rehearsal has passed. Independent audit and operational release qualification remain separate Mainnet gates.
