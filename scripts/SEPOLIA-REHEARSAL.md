# One 20-ticket Sepolia rehearsal

`run-sepolia-rehearsal.mjs` operates only the existing Sepolia collection `0xAfFd7dc1B6A0D8974040F3216316240B724715A9`. It is not a general automation worker. No mainnet, deployment, enrollment-permit signing, arbitrary recipient, amount, key or RPC overrides exist.

## Before activation

The funded test wallets `AFFILIATE_A`, `AFFILIATE_B` and `AFFILIATE_C` must each enroll through the real hosted application's wallet signature and Turnstile admission flow. This is a separate human-assisted UI test; the runner never creates enrollment permits or bypasses admission. Activation closes enrollment permanently.

The already registered original wallet `0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145` may remain registered, with zero referrals and zero payouts. All other registrations are refused. Affiliate IDs are discovered from the contract, recorded in the private journal, and cannot change during a run.

The three pinned affiliate wallets may have no account code or the exact 23-byte EIP-7702 delegation to MetaMask's v1.3.0 implementation at `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b`, whose runtime hash is pinned as `0x9270f73d98e7ed6978677bf0550038289efd510e67e700d024502d62510fc1e4`. The runner checks both the delegation and implementation code at the same canonical snapshot, then again at latest state before signing and broadcasting. Other account code, delegates, and runtime hashes are rejected. The deployer and both buyers must remain undelegated EOAs. This exception does not create or change a delegation, permits no EIP-7702 authorization transaction, and does not apply to deployment or funding scripts. The implementation address is published in [MetaMask's official deployment list](https://github.com/MetaMask/delegation-framework/blob/main/documents/Deployments.md).

The immutable mint deadline is **2026-09-18 23:02:24 UTC**. The runner stops starting mint actions five minutes beforehand. Keep the dedicated test wallets idle while the rehearsal runs; outside transfers, mints, claims or finalizations trigger reconciliation stops.

## Commands

Run from the repository root. The default status performs RPC reads, does not load wallet signing keys, and cannot broadcast:

```sh
node scripts/run-sepolia-rehearsal.mjs
node --test scripts/staging-rehearsal.test.mjs
```

Once all three admissions are confirmed, execute each stage in order:

```sh
node scripts/run-sepolia-rehearsal.mjs --execute sellout
node scripts/run-sepolia-rehearsal.mjs --execute draw
node scripts/run-sepolia-rehearsal.mjs --execute settle
```

- `sellout`: activate; buyer A mints 4 referred to A; buyer B mints 6 referred to B; buyer A mints 10 organic; request randomness once. Each mint costs 0.0001 Sepolia ETH per ticket.
- `draw`: return `awaiting_real_VRF` until the actual Chainlink coordinator fulfills. Afterwards perform at most one bounded `finalizeDraw(8)` transaction per invocation and verify all 20 on-chain combinations produce unique ranks 1–20, with exactly one maximum. It never retries or replaces a random seed.
- `settle`: owner `distributePrize()` pays the current winning holder 0.001 ETH; A claims 0.00008 ETH; B claims 0.00012 ETH; C and the optional original affiliate earn zero; operator withdraws 0.0008 ETH; recover unused, separately funded VRF subscription balance to the operator. The deployed holder-initiated fallback claim has a seven-day delay; this rehearsal uses immediate owner delivery to the winning holder.

The 0.002 ETH mint revenue excludes transaction gas and VRF costs. Each transaction has a 5 gwei fee cap and a 2,000,000 gas ceiling. High fees stop execution instead of raising the cap.

## Resume and evidence

Every signed transaction is atomically saved, with mode 0600, in `.vercel/sepolia-20-ticket/rehearsal-journal.json` before broadcast. The file contains sensitive signed transaction bytes: do not publish or copy it into chat. Public console reports contain only transaction hashes and outcomes. A process lock prevents simultaneous runner instances.

If interrupted, rerun the same stage using the original journal. The runner reconciles the exact saved hashes and canonical receipts first; it never generates replacement transactions. Before rebroadcasting saved bytes it rechecks confirmed **and latest** collection state, wallet nonces/code/balance and action preconditions. Never delete the journal to restart. A stale lock requires checking the previous process and reconciling its transaction first.

The runner checks factory provenance and deployment terms, expected ownership of every ticket, referral counts, exact payout recipients and amounts, and canonical confirmations. External protocol activity is not silently adopted as rehearsal evidence. Even with preflight checks, another transaction can race in the mempool; the resulting mismatch stops subsequent actions for review.

After settlement, independently verify the indexer's database state, UI collection/history status, prize holder and all SVG metadata. This runner reports on-chain execution only; a passing local test is not proof of successful real UI admission, live VRF fulfillment, or automatic database indexing.
