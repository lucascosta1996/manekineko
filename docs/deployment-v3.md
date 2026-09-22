# Deploying an affiliate-enabled V3 collection

V3 deploys to Ethereum Mainnet (chain 1) or Sepolia (11155111), not Vercel. The web app and automated admission service deploy to Vercel. This runbook prepares a deployment; no checked-in credential or example activates a real sale.

## Prepare

1. Copy `apps/contracts/round-v3.sepolia.example.json` outside source control. Set a real round owner and a distinct enrollment-service EOA address. Never put the private key in this JSON. Choose 1–100 affiliate positions, an exact price divisible by 100 wei, supply, mint duration and a separate VRF funding budget. Keep `activateSale=false`.
2. Configure the RPC and deployer using `apps/contracts/.env.example` or the Hardhat keystore. Set `V3_CONFIG_PATH` to the reviewed JSON. For a successor round, set `FACTORY_ADDRESS` to the existing matching V3 factory.
3. Run `npm run v3:preflight:sepolia --workspace @manekineko/contracts`. For Mainnet use `v3:preflight:mainnet`. These commands use accounts-free networks and `V3_BROADCAST` defaults to `0`.

The script pins a preflight block, checks the official coordinator/key registration and limits, verifies an existing factory against locally compiled runtime while checking its renderer separately, and requires the previous round's successful prize delivery. It validates exact affiliate terms and estimates transaction and VRF funding separately. When the factory does not exist yet, the report explicitly budgets eight million gas for the round: its renderer does not exist until the factory constructor runs, so an exact round estimate is made immediately before submission instead. This is a budget, not a quoted fee.

## Broadcast the reviewed configuration

Only the deployment commands with `V3_BROADCAST=1` submit transactions. Keep that setting out of routine preview environments. The script:

- Creates a transaction journal before submission, preserving intent, sender nonce, destination/data, expected addresses, hashes and receipts.
- Deploys the factory and its immutable renderer if required, creates the round, checks deployed code and immutable terms, and funds its dedicated VRF subscription.
- Records the actual factory runtime hash needed by the web service.
- Stops with `funded-enrollment-open`. It does not mint, enroll anyone, request randomness or activate minting.

If a transaction result is uncertain or any postcondition fails, the journal becomes `needs-reconciliation`. Inspect its recorded nonce/hash and on-chain state before retrying. Never rerun a partly completed deployment blindly. Use one serialized deployment writer per signer.

Verify the factory, renderer and round on the explorer with the pinned Solidity 0.8.37 compiler, optimizer 200 and Cancun target. `scripts/verification-args-v3.cjs` reads `[config, renderer]` from `V3_JOURNAL_PATH` for the round constructor. The factory constructor takes its initial owner, and the renderer has no constructor arguments. Preserve the original journal and compiler input.

## Configure the web admission service

Set `AFFILIATE_PUBLIC_ORIGIN`, the server-only enrollment private key matching the round's immutable signer, `AFFILIATE_IP_HASH_SECRET`, `TURNSTILE_SECRET_KEY` and the public Turnstile site key. Register the exact public hostname with Turnstile. Live admission uses `AFFILIATE_TRUSTED_PROXY=vercel` and the real Vercel environment; local fake headers do not qualify.

For the selected chain configure `AFFILIATE_RPC_URL_<chainId>`, `AFFILIATE_TRUSTED_FACTORY_<chainId>` and `AFFILIATE_TRUSTED_FACTORY_CODEHASH_<chainId>`. The factory hash comes from the successfully verified journal, not a browser-supplied value. Store the collection's existing deployment record and V3 program configuration in PostgreSQL, with a verified initial chain snapshot. Never relabel a V1 demo deployment as a V3 live contract.

Exercise wallet authentication, challenge validation and enrollment through the actual Vercel edge before opening enrollment publicly. After the announced enrollment window, the round owner activates minting. Membership freezes even if not all positions are filled. Do not activate minting at deployment and accidentally eliminate the enrollment window.

## Required operational checks

- Monitor admission availability, abnormal enrollment bursts, unconsumed permits and the dedicated VRF subscription's balance. A failed admission service does not authorize a bypass.
- Schedule `npm run db:prune:affiliates` to prune expired admission records in bounded batches. Apply Vercel edge request limits to public affiliate GET/resolve routes to bound their RPC fanout; wallet/bot admission quotas alone do not protect public reads.
- Monitor sellout, fulfillment and prize delivery under the existing [V2 randomness runbook](deployment-v2.md). Affiliate claims can begin at sellout independently of that process.
- Verify that operator withdrawal leaves all unpaid affiliate balances in the round. Claims from previous collections remain available after successor creation.
- Preserve the distinction between local mocks, Sepolia transactions, explorer verification and an independent audit. All are separate evidence, and a mock callback is not real Chainlink qualification.
