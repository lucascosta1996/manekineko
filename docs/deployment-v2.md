# Ethereum VRF V2 qualification and deployment

The V2 code is implemented and locally exercised. The next external milestone is a real Sepolia deployment, explorer verification and Chainlink fulfillment. This repository does not yet contain that evidence or an independent audit. All persistent seeded collections remain explicit V1 mock data.

## Configuration

Use `apps/contracts/round-v2.sepolia.example.json` or `round-v2.mainnet.example.json` as a template. Replace the intentionally invalid zero owner, confirm the supply/price/duration and choose the separate VRF funding amount. Example prices and the 0.1 ETH funding value are illustrative, not a fee quote. V2 live deployment duration must be at least one hour; its immutable deadline starts from the deployment preflight block, so allow time for deployment, funding, ownership operations and activation.

Supply is 1–65,536. Mint price must be an even number of wei, at least two, so half the proceeds is exact. Confirmations are 64–200; callback gas is 100,000–2,500,000. Defaults are 64 confirmations and 200,000 callback gas. The selected Mainnet gas lane is 200 gwei, and Sepolia is 500 gwei. The contract pins the reviewed coordinator/lane for each chain; a coordinator migration requires a new contract version, not an owner setter. [Official coordinator configuration](https://docs.chain.link/vrf/v2-5/supported-networks)

Set `MAINNET_RPC_URL` or `SEPOLIA_RPC_URL`, `V2_CONFIG_PATH` and `V2_PREFLIGHT_FROM`. A broadcast also needs `DEPLOYER_PRIVATE_KEY`; keep it out of the Web app, client environment and repository. A multisig can be the configured round owner, with `activateSale: false` and a subsequent multisig activation. The deployment signer owns a newly created factory; transfer that ownership through its two-step handoff when appropriate. Factory ownership and round ownership are separate.

## Read-only preflight

From the repository root, with `V2_BROADCAST=0`:

```sh
npm run v2:preflight:sepolia --workspace @manekineko/contracts
npm run v2:preflight:mainnet --workspace @manekineko/contracts
```

Workspace config paths resolve from `apps/contracts`. Read-only network configurations have no signer accounts and need no private key. The script checks:

- Exact chain and explicit owner/terms; live coordinator code, registered proving key, confirmation limits and callback gas limit.
- Existing factory runtime parity and prior-round payment before permitting a successor.
- Contract size limits, sender balance, separate subscription funding and transaction gas estimates.
- The recorded preflight block hash before any later broadcast in that process.

Preflight prints a report and sends no transactions. Gas estimates are not guaranteed prices or certified VRF funding requirements. A nonzero subscription balance alone does not ensure fulfillment: monitor the live budget and top up as needed. The official coordinator can accept an underfunded request and wait for funding; it must not be replaced with a new request. [VRF billing](https://docs.chain.link/vrf/v2-5/billing)

## Explicit deployment

After reviewing the terms and preflight, set `V2_BROADCAST=1` for the intended deployment command:

```sh
npm run v2:deploy:sepolia --workspace @manekineko/contracts
```

Mainnet uses `v2:deploy:mainnet` after Sepolia qualification and audit. Deployment commands still default to preflight unless the broadcast variable is exactly `1`. Restore it to `0` after a deployment. `FACTORY_ADDRESS` optionally reuses a matching V2 factory; omit it for a new series.

The script creates the factory if needed, creates a round with its own subscription, verifies every configured term, funds the subscription and checks its owner/sole consumer/balance. It activates only when explicitly configured and the signer is the round owner. Otherwise it leaves the funded round awaiting owner activation. Minting is disabled before activation; the owner cannot pause or change terms after activation.

A journal is reserved and printed before the first transaction under `apps/contracts/deployments/`. Before every send it records the action, nonce, calldata, value, fee caps and predicted factory address if applicable. It then records the returned hash and confirmed block/hash. Writes replace the journal atomically. Use one serialized writer per deployment signer.

An RPC timeout may mean a transaction was accepted. A journal marked `needs-reconciliation` is not permission to resend blindly. Inspect the prepared nonce, sender, payload, predicted address and any known receipt, reconcile canonical chain state, and continue from the existing factory/round. The script does not automatically replace ambiguous transactions. Preserve journals and build artifacts securely; these files are ignored by Git and are not a durable server-side deployment ledger.

## Explorer verification

The installed Hardhat toolbox includes its verification plugin. Set `ETHERSCAN_API_KEY` and `V2_JOURNAL_PATH` to the recorded deployment journal, then run from `apps/contracts`:

```sh
npx hardhat verify --network sepoliaReadOnly --build-profile default --constructor-args-path scripts/verification-args-v2.cjs ROUND_ADDRESS
npx hardhat verify --network sepoliaReadOnly --build-profile default FACTORY_ADDRESS ORIGINAL_FACTORY_OWNER
```

For Mainnet use `mainnetReadOnly`. The constructor helper reads the original V2 tuple from the journal; it does not recompute a deadline. For an existing factory use its original constructor owner, not a later owner. The explicit `default` build profile matches deployment compilation. Preserve the pinned compiler, all source files (including the vendored Chainlink interfaces/license and UniqueRank), optimizer settings and build-info for reproducibility. Source browsing in the Web UI is not a substitute for successful explorer verification.

## Live lifecycle qualification

1. Verify constructor terms, subscription ownership/consumer, funding and explorer source before activating the intended test sale.
2. Mint the full configured supply with multiple wallets. Confirm transfers work while minting and lock at sellout.
3. Call `requestRandomness()` once. Record the request ID from the confirmed receipt. Observe a real coordinator proof verification and callback; mock fulfillment is insufficient evidence.
4. Confirm the stored word and matching request, then call `finalizeDraw(8)`. Independently reconstruct the candidate stream, offset, four-number encodings and unique winning token.
5. Exercise owner payment and a separate test round's delayed holder claim after seven days. Verify exactly half the receipts reached the intended destination and transfers unlocked only after payment.
6. Exercise a rejecting wallet, an underfunded pending request followed by a top-up, unsold expiry/refunds and successor creation after actual payment. Never simulate recovery by replacing a live request or seed.
7. Run an independent security audit and measure live gas, request fees and confirmation latency for the intended maximum prize exposure.

## Operator and database integration

The operator should derive actions from confirmed on-chain state: fund/activate, request once, wait for fulfillment, finalize, pay, then create the successor. Request and finalization are permissionless; payout remains owner-triggered with a winner-only recovery claim after seven days. These scripts do not implement a persistent operator, event indexer or connected-wallet mint UI.

V2 uses immutable `algorithmVersion = unique-rank-v2` and `randomnessProvider = chainlink-vrf-v2.5`. Project `settled_count` as supply when `revealed()` is true, otherwise zero; V2 has no settlement scan. Legacy reveal block/seed fields stay null, and the received word belongs in `randomness_word`. Record both the winning holder and actual recipient from `PrizeDelivered`; they can differ for a recovery claim. Preserve reorganization handling and event idempotency when adding the indexer. Local migrations 004–006 provide version/holder fields and support the full uint256 request-ID range without relabeling existing data.

## Local evidence collected on 2026-09-10

- Full contract tests cover both V1 and V2, including 1,000/2,000-ticket uniqueness, single payment, callback authentication/replay/zero values, separate funding, delayed claims, refunds and factory size/rollover limits.
- The local deployment rehearsal verified preflight nonce unchanged, then four confirmed, journaled actions. It used mock coordinator contracts and fictional ETH on chain 31337. No public-chain transaction was sent.
- Measured local gas: factory deployment 5,003,111; round creation 3,981,671; VRF funding 68,629; sale activation 67,562. A real coordinator changes some costs, so these are not Mainnet fee quotes.
- Consumer callback gas measured through the mock was 41,163 for zero and 61,063 for a nonzero word, below both the tested 100,000 minimum and 200,000 default. These exclude real proof verification/coordinator costs.
- Runtime sizes: RoundV2 18,446 bytes, FactoryV2 22,827 bytes, both below Ethereum's 24,576-byte limit. The factory has limited remaining size headroom.

Outstanding external inputs are the intended owner addresses, final economic configuration, RPC endpoints, funded Sepolia signer and explorer credentials. Production publication must use live qualification and audit evidence, not these local measurements alone.
