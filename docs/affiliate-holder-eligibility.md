# Affiliate NFT ownership eligibility

> Current local integration uses Eligibility V5 for V10, with reviewed completed V6–V9 historical imports before any new target. V9 keeps Eligibility V4. For ranked versions, completion uses finalized draw and backed liabilities, not necessarily every prize claimed; enrollment closes at immutable sale start. See [the current handoff](permanent-combinations-v10.md#registry-lineage-and-migration-requirements). The original V6 behavior below is historical; live V10 setup remains pending.

New V6 collections require an applicant to hold an NFT from any earlier **completed official collection** when enrollment executes. Completed means sold out, revealed and successfully paid its winner. NFTs from failed, refunded, unknown or current collections do not qualify. Enrollment still closes when minting is activated, so buying from the current collection cannot establish eligibility.

The first collection registered in the canonical eligibility registry on each network is the bootstrap exception and accepts enrollment without an earlier NFT. Creating a different factory does not reset this exception. Existing completed V5 collections can be registered as historical sources: registering the completed Sepolia rehearsal first makes the next V6 collection require a holding from that rehearsal.

## Ownership and reuse

The applicant chooses a qualifying NFT. The registry checks `ownerOf(tokenId)` on the source contract during the enrollment transaction and records `(destination collection, source collection, tokenId)` as used. That NFT cannot unlock another position in the same destination, even if transferred to a different wallet. It can qualify its current holder in a later destination. Each destination also retains its existing one-position-per-wallet limit.

The NFT is not escrowed and remains tradable. A subsequent sale does not revoke enrollment, move the affiliate position to the buyer, or remove earned commission. There is no continuing holding requirement. A transfer before enrollment confirms causes that enrollment to fail. This adds utility and makes reuse harder; it does not establish unique human identity or prevent someone with several NFTs and wallets from occupying several positions. Existing automated abuse checks remain in place.

Prize reserves, referral attribution and the shared affiliate pool are unchanged. Ownership alone earns no payment. An enrolled affiliate with no referred purchases earns zero. See [pool accounting](affiliate-pools.md).

## Contract and admission enforcement

`ManekinekoAffiliateEligibility` is one canonical registry per network, with version `affiliate-eligibility-v1`. Its owner approves reviewed factory runtime hashes and registers official collections in a single sequence. These are collection-governance actions, not manual approval of applicants. Factory approval is append-only. Source and target checks verify factory mappings and the registered runtime hashes.

The next official collection can register only after the preceding one completes or becomes refundable. A V6 destination must point to this registry and register before activation, minting, expiry or cancellation. V6 activation requires registration. Historical completed V5 registrations are sources only, never new enrollment destinations. A failed first collection does not restore the bootstrap exception; a subsequent collection can sell organically without affiliates until a completed source exists. Factory rollover separately requires success, so recovery from a failed collection uses a new reviewed factory.

V6 EIP-712 enrollment uses domain name `ManekinekoAffiliateEnrollment`, version `4`, the destination round as `verifyingContract`, and the chain ID. Its signed fields include the applicant, position, pool terms, source collection, source token, nonce and deadline. Bootstrap uses the signed zero-address/token-zero pair. Changing the source NFT invalidates the signature. Only the registered destination can consume its permit and NFT eligibility atomically. V5 keeps its original version-3 signature and behavior.

The web API uses database holdings to suggest candidates, then checks the pinned registry and live ownership/eligibility. It rechecks before issuing a permit; the wallet flow checks before authentication and submission. The contract remains authoritative if state changes afterward or enrollment is submitted outside the app. The NFT selector explains unavailable and already-used holdings; enrollment fails closed if the registry is missing or unverified.

Migration `017_affiliate_holder_eligibility.sql` adds the selected source pair to enrollment challenges. New V6 challenges require an immutable valid pair. Historical rows remain readable, but old V6 challenges without the pair cannot issue new permits. V5 challenges cannot gain V6 proof fields. No historical mint, NFT or affiliate balance is rewritten.

## Deployment workflow

1. Compile and export with `npm run contracts:export`. Prepare the canonical registry's unsigned deployment:

   ```sh
   node --import tsx scripts/affiliate-eligibility-operations.mjs deploy \
     --chain 11155111 --owner <governance-address> --output <new-plan.json>
   ```

   Deploy and verify it separately. The registry uses Solidity 0.8.37, Cancun, optimizer runs 200, no viaIR. V6 components retain their own viaIR/runs-1 settings. Configure `AFFILIATE_ELIGIBILITY_ADDRESS_11155111` and `AFFILIATE_ELIGIBILITY_CODEHASH_11155111` together in the web and operations environments. Mainnet uses suffix `_1`. Reuse this registry across factories; replacement would reset collection order and NFT-use records.

2. On Sepolia, prepare registration of the completed V5 rehearsal as a historical source before any new V6 target:

   ```sh
   node --env-file=.env.staging.local --import tsx scripts/affiliate-eligibility-operations.mjs legacy \
     --chain 11155111 --factory <reviewed-v5-factory> --round <completed-v5-round> \
     --factory-owner <expected-factory-owner> --output <new-legacy-plan.json>
   ```

   The helper checks compiled bytecode, factory/component bindings, completion and current canonical order at a confirmed snapshot. It prepares zero-value owner calls to approve the factory and register the source; it sends nothing. Mainnet's first collection needs no historical import.

3. Set `operations.affiliateEligibilityAddress` in Launch or Automations. It is required for new V6 finalization and bound into the reviewed configuration hash. An automation sequence shares this canonical address. There is no per-collection switch to bypass ownership. Historical exports remain readable without silently changing their hashes.

4. Run `launch:prepare`. It emits `affiliate-eligibility-plan.json` and sets `V6_AFFILIATE_ELIGIBILITY_ADDRESS` in the deployment plan. The V6 deployer also verifies this address against the canonical address/hash environment pair. The gate is injected into the constructor without changing the portable financial terms JSON. A funded unregistered deployment ends in `funded-awaiting-affiliate-registration`; enrollment cannot open yet.

5. Prepare the target's ordered unsigned registration calls:

   ```sh
   node --env-file=.env.staging.local --import tsx scripts/affiliate-eligibility-operations.mjs collection \
     --manifest <finalized-export.json> --expected-hash <trusted-configuration-hash> \
     --factory <deployed-v6-factory> --round <deployed-v6-round> --output <new-registration-plan.json>
   ```

   Execute reviewed calls in order, rechecking live state before signing. The helper produces no calls for a matching completed registration and refuses conflicting ownership, code or reviewed terms. The staging sync tool requires canonical registration before enabling admission.

6. Apply migration 017 after validating it on an isolated database. Deploy the web/launch/indexer bundle and ABI exports consistently. Configure indexing for both historical source holdings and the target. Complete the separate [winner-credit registration and sponsorship](winner-credits.md), then enroll affiliates before activating minting.

## Validation and release boundary

Contract regressions cover bootstrap, completed and failed sources, spoofed factories, ownership transfer, signed-proof changes, nonce replay, duplicate NFT use, factory changes and canonical sequence ordering. Web tests exercise both versions, stale challenges, selection changes, live ownership and trust checks. The isolated SQL regression tests migration constraints and immutable proofs. The local chain/database rehearsal completes a V6 collection, enrolls its holder into a second collection, then transfers the source NFT and verifies that the new owner cannot reuse it in that destination.

```sh
npm run contracts:test
npm run web:test
npm run launch:test
npm run eligibility:test
# Explicit local-only database test; skips by default and rejects remote hosts:
TEST_AFFILIATE_ELIGIBILITY_DATABASE=1 node --env-file=.vercel/test-v6/local-db.env \
  --test scripts/affiliate-eligibility-database.test.mjs
```

These changes are locally implemented and validated. No eligibility registry, updated V6 deployment or remote migration was executed by this implementation task. Existing deployed V5 collections remain unchanged. A live V6 Sepolia rehearsal and independent contract review remain required before Mainnet release.
