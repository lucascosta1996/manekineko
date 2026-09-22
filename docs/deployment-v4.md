# Deploying a collection with configurable V4 economics

V4 deploys to Ethereum Mainnet (chain 1) or Sepolia (11155111), not Vercel. The web app and automated admission service deploy to Vercel. This runbook prepares a deployment; no checked-in credential or example activates a real sale.

## Prepare

1. Copy `apps/contracts/round-v4.sepolia.example.json` outside source control. Set a real round owner and a distinct enrollment-service EOA address. Never put the private key in this JSON. Choose 1–100 affiliate positions, `prizeBps`, and either an explicit `affiliateRatesBps` array or `affiliateAllocationBps` for equal rates. These numeric configuration fields are canonical decimal strings. For ten positions, `affiliateAllocationBps="1000"` produces ten 1% referral rates and `"2000"` produces ten 2% rates. Only an affiliate whose link is used earns commission; this shortcut creates no shared revenue pool. Each position rate plus the prize share must fit within 10,000 basis points. Choose an exact price divisible by 10,000 wei, supply, mint duration and a separate VRF funding budget. Keep `activateSale=false`.
2. Configure the RPC and deployer using `apps/contracts/.env.example` or the Hardhat keystore. Set `V4_CONFIG_PATH` to the reviewed JSON. For a successor round, set `FACTORY_ADDRESS` to the existing matching V4 factory.
3. Run `npm run v4:preflight:sepolia --workspace @manekineko/contracts`. For Mainnet use `v4:preflight:mainnet`. These commands use accounts-free networks and `V4_BROADCAST` defaults to `0`.

The script pins a preflight block, checks the official coordinator/key registration and limits, verifies an existing factory against locally compiled runtime while checking its renderer and factory-only deployment helper separately, and requires the previous round's successful prize delivery. It validates exact affiliate terms and estimates transaction and VRF funding separately. When the factory does not exist yet, the report explicitly budgets eight million gas for the round: its renderer does not exist until the factory constructor runs, so an exact round estimate is made immediately before submission instead. This is a budget, not a quoted fee.

For unequal positions, replace the equal-allocation field with an explicit ordered schedule. This fragment gives the first position a 1% referral rate, the second 2%, and the third 3%, while setting the winner's prize to 60%:

```json
{
  "maxAffiliateSlots": "3",
  "prizeBps": "6000",
  "affiliateRatesBps": ["100", "200", "300"]
}
```

Keep the rest of the reviewed deployment configuration. Array order determines position IDs starting at one. The admission service offers the lowest vacant position; a signed offer never switches to a different position or rate. Use a new round for the next promotion rather than attempting to modify an existing collection.

## Broadcast the reviewed configuration

Only the deployment commands with `V4_BROADCAST=1` submit transactions. Keep that setting out of routine preview environments. The script:

- Creates a transaction journal before submission, preserving intent, sender nonce, destination/data, expected addresses, hashes and receipts.
- Deploys the factory and its immutable renderer and deployment helper if required, creates the round, checks deployed code, the prize share and every immutable position rate, and funds its dedicated VRF subscription.
- Records the actual factory runtime hash needed by the web service.
- Stops with `funded-enrollment-open`. It does not mint, enroll anyone, request randomness or activate minting.

If a transaction result is uncertain or any postcondition fails, the journal becomes `needs-reconciliation`. Inspect its recorded nonce/hash and on-chain state before retrying. Never rerun a partly completed deployment blindly. Use one serialized deployment writer per signer.

Verify the factory, deployment helper, renderer and round on the explorer with the pinned Solidity 0.8.37 compiler, optimizer 200 and Cancun target. `scripts/verification-args-v4.cjs` reads `[config, renderer]` from `V4_JOURNAL_PATH` for the round constructor. The factory constructor takes its initial owner. The renderer and deployment helper have no constructor arguments; the helper records its creating factory. Verify `deployer.factory()` and the locally compiled helper runtime before trusting a factory hash. Each created round has full independent bytecode, with no proxy or mutable implementation. Preserve the original journal and compiler input.

## Configure the web admission service

Set `AFFILIATE_PUBLIC_ORIGIN`, the server-only enrollment private key matching the round's immutable signer, `AFFILIATE_IP_HASH_SECRET`, `TURNSTILE_SECRET_KEY` and the public Turnstile site key. Register the exact public hostname with Turnstile. Live admission uses `AFFILIATE_TRUSTED_PROXY=vercel` and the real Vercel environment; local fake headers do not qualify.

For the selected chain configure `AFFILIATE_RPC_URL_<chainId>`, `AFFILIATE_TRUSTED_FACTORY_V4_<chainId>` and `AFFILIATE_TRUSTED_FACTORY_CODEHASH_V4_<chainId>` from `apps/web/.env.example`. Separate V3 pins remain available for earlier deployments. The factory hash comes from the successfully verified journal, not a browser-supplied value. Store the collection with financial version `affiliate-v4`, its configured prize share, matching deployment record and complete ordered program rate schedule in PostgreSQL, with a verified initial chain snapshot. These records must match on-chain terms exactly. Collection and position terms become immutable when inserted; publish a new collection for later promotions. Never relabel a V1 demo deployment as a V4 live contract.

Exercise wallet authentication, challenge validation and enrollment through the actual Vercel edge before opening enrollment publicly. Check that the signed authentication and permit show the same position and rate. Test a concurrent enrollment that takes the offered position: the old offer must fail and require a fresh signature, never silently select another position. After the announced enrollment window, the round owner activates minting. Membership freezes even if not all positions are filled. Do not activate minting at deployment and accidentally eliminate the enrollment window.

## Required operational checks

- Monitor admission availability, abnormal enrollment bursts, unconsumed permits and the dedicated VRF subscription's balance. A failed admission service does not authorize a bypass.
- Schedule `npm run db:prune:affiliates` to prune expired admission records in bounded batches. Apply Vercel edge request limits to public affiliate GET/resolve routes to bound their RPC fanout; wallet/bot admission quotas alone do not protect public reads.
- Monitor sellout, fulfillment and prize delivery under the existing [V2 randomness runbook](deployment-v2.md). Affiliate claims can begin at sellout independently of that process.
- Verify that operator withdrawal leaves all unpaid affiliate balances in the round. Claims from previous collections remain available after successor creation.
- Preserve the distinction between local mocks, Sepolia transactions, explorer verification and an independent audit. All are separate evidence, and a mock callback is not real Chainlink qualification.
