# V11 full equal affiliate pool

Approved on 2026-10-05. V11 changes affiliate allocation only. Existing V10 contracts, exports, catalog drafts, and claims retain their original rules.

At sellout, an enrolled affiliate qualifies with at least one paid attributed ticket. The full affiliate pool is divided by the number of qualifying affiliates using integer wei arithmetic. Referral count does not cap or weight the payout. Empty positions and zero-referral affiliates receive nothing. One qualifier receives a 2 ETH pool in full; five qualifiers receive 0.4 ETH each. Equal division may leave less than one wei per qualifier. If nobody qualifies, the full pool remains unallocated. Unallocated funds remain a separate growth reserve, withdrawable only after reveal. Unsold collections pay no affiliate commission and retain the existing refund path.

`affiliate-v11` retains `unique-rank-v6`, permanent Solidity-generated combinations, equal prizes, one post-sellout VRF draw, exact mint payments, and the cumulative 20 primary mints per recipient. No mint caller supplies numbers or a seed. Unclaimed prizes, allocated commissions, and refund liabilities remain protected.

The compatible `affiliatePayoutCapBps` configuration/getter is fixed at **0**, meaning no cap; `minAffiliateReferrals` is fixed at **1**. Launch schema version 1 identifies V11 by `unique-rank-v6` with cap `"0"`; nonzero-cap V10 artifacts retain their version and hash. New V11 plans use the V11 parser, factory, renderer, and round deployer. Historical editable drafts are not silently upgraded.

Eligibility V6 admits V11 and verified historical NFT sources. The private first-season review uses a fresh Sepolia registry with no source imports so its first collection has real bootstrap admission. Later review affiliates qualify with NFTs from its first collection.

Winner Credits V7 preserves the V6 predecessor and its entire lifetime-redemption history. Prior sponsorship must be drained to its verified operator funder, and every old destination must be closed before the worker writes. A zero sponsorship balance alone does not close an old, permissionlessly fundable collection. The new review verifies this before freezing any opening. Mainnet is unchanged.

Migration 032 adds version constraints and runtime/export support without updating collection or draft rows. Local verification uses `scripts/verify-v11-database.mjs` against an isolated local database ending `_v11_test`; never seed a hosted database.

## Replacement review

Private launcher: `.private/review-season-v11/run.sh`. One season has Ruby Signal, Coral Pause, and Amber Relay. Factory execution is split across the refund boundary, while the app keeps one season identity.

- Ruby Signal: 1,000 tickets at 0.01 ETH; one manual paid referral, remaining automated purchases direct; sole qualifying affiliate gets 2 ETH at sellout.
- Coral Pause: exactly three mints, 30-minute mint deadline, then holder refunds.
- Amber Relay: all ten affiliate slots filled, exactly five qualify and receive 0.4 ETH each.
- Each fresh stage opens minting 30 minutes after successful preparation, with a 15-minute enrollment window. No clock starts while prerequisites fail.
- Affiliate wallet: `0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145`; referral buyer: `0xE9d5303480E33cfa4310576967C62cBd2bEC8B87`. The script never signs with these external wallets.
- The encrypted replacement vault reuses 49 managed wallets and replaces the old reserved prize wallet, preserving its keys and claim for the user. Settled managed proceeds are reused between stages; external and reserved balances are excluded.

The prior active V10 destination `0xae7a8d842c3a81b45e4eefb6f019b3dcfa25ca0b` expires at **2026-10-06 00:16:11 UTC** (2026-10-05 21:16:11 São Paulo). A fresh chain check, rather than this date alone, determines whether V11 can start. Infrastructure deployment and draft creation do not authorize or start the timed review.

## Evidence boundaries

V11 unit and integration tests are separate from live wallet acceptance. The new three-stage review has not run. No new V11 mint, referral, sellout, VRF result, commission claim or refund should be reported as live-tested until its receipts are verified. See the private setup proof and preflight output for current funding and deployment state.

## October 5 setup verification

The previous Prism Review is archived from public and Launch projections; its frozen records and existing on-chain claims remain intact. Its old `run.sh` now exits with a retirement notice. Mainnet drafts were preserved. Replacement season ID: `0x3dcfebceaf43c07cec33b2d7b75c8d9deaec85f73970d0ac884482efc423e5bc`. The restricted Launch reader confirms one season with three draft collections and no queued run.

| Sepolia component | Verified address |
| --- | --- |
| Eligibility V6 | `0x0Fc60986A24B0130E0D90B9cbeCc9df196503E4B` |
| Winner Credits V7 | `0x5db2d8c0d9ea3F759E613FD74310098a4843ecC9` |
| V11 sellout factory | `0xf5bC4B248C095066afef4D24a69731a19fBba2b4` |
| V11 refund factory | `0x4A03aCe646969A0b82A491f8f3bf61E47923cdf8` |

Both factories have zero rounds; the fresh eligibility registry has zero collections. Owner, runtime hashes, factory approvals and deployment receipts are recorded in `.private/review-season-v11/setup-proof.json`. Recovery returned the operator's 2 ETH withdrawal and five operator-funded 0.06 ETH sponsorship deposits, plus unused VRF funds. The prior reserved 2 ETH prize remains unclaimed and protected; its wallet was excluded from the replacement vault.

Transfer `0xe7d9cb3638b13cb64de6c5b74ac74b40d10197e072e43237487005c493d342bc` confirmed **3.187697517544624502 Sepolia ETH** to the operator. At block **11848529**, first-stage usable funds were **11.182023229827494167 ETH**, against a conservative **11.1576 ETH** requirement. Surplus external balances, the old reserved prize and future income were excluded. The worker tops up both external manual wallets to their required balances. Later stages recheck actual balances after settlement and reuse; reserved/manual payouts can require another top-up.

Migration 032 was applied to staging with existing collection rows unchanged. Web deployment `dpl_FxGymvHkVrsUsfwSuQYiJH7GuAcA`, Launch `dpl_aDGZ6TKaApNceEFQkwZ5de9pQiYB` and Indexer `dpl_4KKc8H8tYPbapQA613NUURNF7FRk` are Ready on their existing aliases. Public readback confirms V11 terms, the old collection returning 404, and Winner Credits V7 at block 11848540. Deployment used an isolated source snapshot; unrelated Landing and docs-shell edits were excluded. This is a direct staging deployment, not a Git push or CI claim.

Verification: 408 contract tests passed, including sole-qualifier/full-pool, five-qualifier, dust, refund, reserve and predecessor-registry cases. Worker, Web, Launch and Indexer suites and relevant typechecks passed; explicitly skipped database tests are not counted as executed. Fresh isolated migration checks passed. Mobile (390 px) and desktop (1440 px) Chromium fixtures passed with rendered V11 terms and no horizontal overflow. No connected-wallet V11 transaction has been exercised.

Run from the repository root, after the old destination closes:

```bash
# Read-only prerequisite check; never schedules a collection.
bash .private/review-season-v11/run.sh 1

# Starts stage one and streams its logs in this terminal.
bash .private/review-season-v11/run.sh 1 --execute
```

After each stage and its required manual claims finish, use the same command with `2` and then `3`. Each stage receives its own fresh opening only after checks pass. Current preflight correctly stops with `previous_winner_credit_target_still_open`; no countdown has been frozen. No background review worker is running.
