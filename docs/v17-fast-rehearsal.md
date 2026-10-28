# V17 accelerated Sepolia rehearsal · October 29, 2026

This replaces the proposed eleven-day **test schedule**, preserving the unstarted V16 contract and its frozen vault/runner. V17 is a new deployment. Mainnet remains unconfigured.

The user can attend for up to half a day. Target approximately **1–3 hours** for six live collections, subject to real block production, Chainlink, user actions and defect recovery. Never promise a fixed completion time or record a simulated receipt as live evidence.

## Verified deployment and new wallet handoffs

- Contract: [0x39f625904CC50C08797e52b909EE51F6eB66d26E](https://sepolia.etherscan.io/address/0x39f625904CC50C08797e52b909EE51F6eB66d26E#code). Exact source published; both RPCs agreed on code, all settings, three options, six catalog entries and inactive state. [Public deployment evidence](../output/v17-fast-rehearsal/deployment.json).
- Runtime: `0x1e3bef6ef6d189205f9da3537b5dd5e530d05a6af67a708a49a386187c7c563c`.
- New bank: `0xe8e110B2b9344200300Eb9528671A47337aBAb78`.
- Manual affiliate wallet 0: `0xd20d2De0f415ef35948699B6f663A9B6f827bA92`.
- Manual buyer wallet 1: `0xDADbF94Fde7ac02f229a27919c820e2BA39128D3`.
- Private run: `/Users/admin/.local/share/tincta/v17-fast-rehearsal-2026-10-29/`. Handoffs are under `handoffs/wallet-0/` and `handoffs/wallet-1/`; import their local encrypted keystore or private-key file without sharing it.
- Frozen runtime SHA-256: `32ea0c7bf01f379d1f21f3fc90c277e6a69a1bcbd371a23b50249a6687d90e47`.
- Frozen plan SHA-256: `3e726da1c7a49a97cbe5963216e4d86b5b2c6444c53137fe2cfaedf94c13a878`.
- Read-only preflight passed. Pause marker present; zero bank funding, signed journals, Genesis mints and prepared collections. Contract remains unsealed. No live rehearsal transaction has been sent.

`command.mjs` loads owner-only credentials from `/Users/admin/.config/tincta/v17-fast-rehearsal-2026-10-29.env`. Use the website's verified V17 pin before opening Genesis.

```sh
V17_RUN=/Users/admin/.local/share/tincta/v17-fast-rehearsal-2026-10-29
V17_PLAN=3e726da1c7a49a97cbe5963216e4d86b5b2c6444c53137fe2cfaedf94c13a878
node "$V17_RUN/command.mjs" preflight
node "$V17_RUN/command.mjs" status
# After the confirmed 0.15 Sepolia ETH bank transfer:
node "$V17_RUN/command.mjs" funding 0xACTUAL_FUNDING_HASH
node "$V17_RUN/command.mjs" resume
node "$V17_RUN/command.mjs" run --execute "$V17_PLAN" --wait
# For each displayed transaction checkpoint; omit the hash for readiness gates:
node "$V17_RUN/command.mjs" ack GATE_ID "Observed result and evidence" 0xACTUAL_MANUAL_HASH
node "$V17_RUN/command.mjs" handoff WALLET_INDEX
node "$V17_RUN/command.mjs" pause
# After completion and final review:
node "$V17_RUN/command.mjs" recover --execute "$V17_PLAN"
```

## Immutable profiles

One V17 implementation has an immutable constructor `rehearsal` flag. Accelerated mode is permitted only on Sepolia and the isolated local chain. Mainnet rejects it. Disabling it retains production minima: 1,000 Genesis, two lifetime primary Genesis mints per wallet, at least 64 VRF confirmations, at least a one-hour ballot/paid window, at least 1,000 paid NFTs and 0.01 ETH, 72-hour randomness timeout and 0.01 ETH executor reserve. These rules cannot be changed after deployment.

The accelerated profile has 20 Genesis NFTs, ten minting wallets, the same two-mint lifetime allowance, no Genesis deadline, a sellout-only first ballot, three-minute ballots, a one-second next-ballot delay, three real VRF confirmations, a fifteen-minute randomness timeout and a 0.0001 ETH executor reserve.

| Option | Supply | Price | Equal prizes | Each prize | Paid mint window |
|---|---:|---:|---:|---:|---:|
| 1 | 20 | 0.0001 ETH | 6 | 0.0002 ETH | 10 minutes |
| 2 | 40 | 0.0002 ETH | 4 | 0.0012 ETH | 3 minutes |
| 3 | 20 | 0.0001 ETH | 10 | 0.00012 ETH | 10 minutes |

The full 60/20/10/10 allocation, zero-qualifier 30% treasury rule, affiliate eligibility, 20 paid primary mints per recipient, VRF authentication, permanent identities, NFT-holder prizes/refunds, sponsored lifetime limit and first-5% holder pool remain the production logic. The application shows a visible accelerated-test notice and reads the actual Genesis supply and timeout. Version, runtime and profile checks fail closed. V16 pins are never reinterpreted as V17.

## Six live collections

Names, colors and season IDs are copied in source order from the first three collections of each of the first two Sepolia seasons. They are a separate six-entry deployment: its internal IDs 1–6 correspond to original catalog positions 1,2,3,11,12,13. Original catalog files, historical addresses and Mainnet drafts remain intact.

| Internal ID | Season / collection | Option | Intended result | Main observation |
|---|---|---:|---|---|
| 1 | Aster Study / Aster Atlas | 3 | Sellout | Manual Genesis vote, Genesis affiliate, referred mint, ten prizes |
| 2 | Aster Study / Aster Beacon | 1 | Sellout | Paid snapshot vote, three affiliates, sponsored redemption, six prizes |
| 3 | Aster Study / Aster Current | 2 | Three mints then refund | Full-price manual refund, burned NFT metadata, first season holder pool |
| 4 | Beryl Study / Beryl Atlas | 1 | Sellout | No-vote option-1 fallback; manual Genesis affiliate in another season |
| 5 | Beryl Study / Beryl Beacon | 2 | Sellout | Four prizes; no qualifying affiliates and protected 30% treasury |
| 6 | Beryl Study / Beryl Current | 2 | Three mints then refund | Second refund and second season holder pool |

Real winners are reserved after genuine VRF fulfillment. Human custody persists across every later round and recovery. Bots can fund these accounts but cannot sign or sweep them. All human transaction checkpoints require exact confirmed transaction hashes; a gate cannot reuse another gate's receipt. Recorded manual receipts are rechecked against canonical ancestry on resume.

Other bots broadcast concurrently by distinct signer. Bank funding is serialized. The final paid mint is withheld until earlier chunks confirm, so its estimate includes sellout accounting and the VRF request. A failed parallel job waits for its siblings to settle before returning; signed journals remain durable and restartable.

## Operator workflow

Use only the new V17 bank and handoffs from the verified release. **Do not fund the old V16 bank for this run.** Import manual affiliate wallet 0 and referred-buyer wallet 1 locally. The winning/refund wallet indices appear in subsequent gates and are exported only after custody reservation. Keep all keys, passwords, signed journal bytes and authenticated RPC URLs private.

Recommended initial funding is **0.15 Sepolia ETH**; the script requires at least 0.1 ETH, protects 0.01 ETH of liquid bank funds and caps external funding at 0.5 ETH. The pinned source/final recovery address remains `0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145`. Verify control of it before funding. Fees are capped at 0.5 gwei; 0.05 ETH of recorded gas plus known VRF fees triggers a cost review. These are ceilings and stops, not forecasts.

1. Run read-only preflight/status. Verify contract pin, runtime/plan hashes and both wallet imports. Send initial funding from the pinned source and register the confirmed transaction hash.
2. Resume and invoke `run --execute PLAN_HASH --wait`. It stops at `start-genesis`; review and acknowledge it. Mint two free Genesis NFTs from each manual account, acknowledging each receipt separately. Test that a third primary mint is unavailable.
3. Be present at `before-genesis-sellout`. The final mint starts the fixed first ballot immediately. Enroll wallet 0 in slot 1 with the specified Genesis NFT and vote Option 3 with its two Genesis NFT numbers. Each action has its own receipt checkpoint. In the second season, follow the no-vote scenario and enroll without casting a vote.
4. At each manual sale checkpoint, use wallet 1, the copied affiliate URL, one NFT and the exact current price. Confirm account, Sepolia, contract, collection, recipient and referral before signing.
5. At the winning-wallet checkpoint, export/import that actual account and claim each requested prize through Rewards. Claim affiliate earnings with wallet 0. Use the winning account for collection 2's sponsored redemption and later holder reward. Refund gates identify their own actual holder accounts.
6. Observe the season pool locked before all three outcomes, then unlocked with the correct first-5% limit and fixed amount. Your confirmed holder claim precedes bot claims.
7. During the run return excess manual-wallet funds to the V17 bank, retaining sufficient gas. At completion, reconcile liabilities and manual balances, acknowledge final review, and recover automation balances. Return manual balances yourself to the pinned recovery address. Protected holder division dust and gas reserves remain explicitly reported.

The `--wait` option retries only time/VRF waits. It never acknowledges a manual/readiness gate. Its default wait budget is 180 minutes; `--max-minutes` accepts 1–240. The pause marker stops further bot signatures; it never pauses contract clocks. If a deadline is missed, record the actual outcome, inspect the incident and use the explicit reconciliation/refund path. A UI update cannot reopen a ballot or sale.

## Reports and acceptance

Every status/execution checkpoint refreshes private `report.json` and readable `report.md`, including anchored actual outcomes, transaction hashes, manual test notes, gas, VRF fees, custody balances, incidents and independent exact-wei liability reconstruction. A final execution pass requires six expected terminal outcomes, all relevant payouts/refunds, both holder limits filled, zero collection liabilities and balanced reserves. Errors remain visible; reconciliation does not convert a failed test into a pass. Raw private `state.json` is never a shareable report.

The complete 216-collection / 22-season catalog also runs locally against V17 with controlled time and mocked VRF: 172 sellouts, 44 refunds, all payouts and holder pools, with exact residual liabilities after every collection. This does not claim 216 live collections. The same implementation with the production profile runs the established production semantic cases at real supplies, prices and timing boundaries, using local time advances.

The closing report separates local tests, isolated SQL, hosted rendering/indexer, real-wallet actions and genuine VRF. It lists defects/fixes, expected negative tests, untested paths, returned funds and remaining liabilities. X publishing is separate and is not activated by this runner.

**No test report promises 100% correctness or automatically approves Mainnet.** The current approximately 40 KB runtime exceeds the traditional 24,576-byte Mainnet limit. Verify active network rules and qualify the exact production artifact, constructor settings, deployment cost, external services, security review and remaining acceptance items before a Mainnet release. [EIP-7954](https://eips.ethereum.org/EIPS/eip-7954) is a network-upgrade proposal, not proof of activation. See the [readiness report](v17-readiness-report-2026-10-29.md).
