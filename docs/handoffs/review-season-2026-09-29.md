# Superseded review setup record

Historical September 29 setup; its three distinct season drafts were replaced on September 30 after the first was paused during enrollment. Do not execute the commands below. Use the current [review guide](../sepolia-three-collection-review.md).

## Commands and live prerequisites

The stage command is read-only without `--execute`:

```sh
npm run season:review:sepolia -- \
  --manifest .private/review-season/review.json \
  --stage 1 \
  --wallet-vault .private/season-runner/sepolia-wallets.enc \
  --env-file .env.staging.local \
  --env-file .env.staging.wallets.local \
  --env-file .private/v10-setup-2026-09-25/worker.env \
  --env-file .private/review-season/review.env
```

When ready to run the reviewed stage, add `--execute`. For stages 2 and 3, this first recovers the previous stage's funds as described above. Once recovery and current funding checks pass, it freezes/queues only the selected stage with minting 30 minutes later and starts its existing Sepolia worker, including configured X announcements. Use stage 2 and then stage 3 only after the preceding manual checklist is complete and its worker is stopped. Reuse the manifest, vault and environment unchanged when resuming. A read-only handoff reports its next recovery action without signing or qualifying hypothetical recovered funds. The script does not auto-start later stages or move frozen openings.

The private manifest's `mintOpeningDelaySeconds: 1800` applies this requested timing only to the review. All three saved drafts use `enrollmentWindowSeconds: "900"`; their absolute openings remain unset until execution. The mint durations remain 24 hours / 30 minutes / 24 hours. The refund deadline is still 30 minutes **after minting opens**. Existing prepared schedules and ordinary preparation defaults retain their original behavior. No command-line change is needed.

**Dedicated refund factory: completed 2026-09-29 UTC.** The following command is retained for read-only inspection or durable setup recovery; a second factory deployment is not needed:

```sh
npm run season:review:refund-factory -- \
  --manifest .private/review-season/review.json \
  --env-file .env.staging.local \
  --env-file .env.staging.wallets.local \
  --env-file .private/v10-setup-2026-09-25/worker.env \
  --env-file .private/review-season/review.env
```

Without `--execute` this only checks the current owner, V5/V6 lineage and fee policy. An explicit execute deploys the dedicated V10 factory, approves its exact code in both registries, updates only the still-unstarted refund draft and matching manifest, and writes `.private/review-season/refund-factory-proof.json`. Its encrypted journal survives interruption. It does not edit hosted configuration or start a collection.

The Web source and exact additional pin are deployed to the existing staging Web project, serving `https://app.tincta.xyz`. Indexer's existing `INDEXER_TRUSTED_FACTORIES_JSON` now includes the new factory alongside the previous V8/V10 entries. The same extra Web pin is saved in the private review environment. All other configuration entries were preserved. Gallery, metadata, prizes, enrollment and winner-credit readers select the appropriate explicitly pinned factory; no database-discovered factory is automatically trusted.

### Funding result: stage one passes; later stages reuse confirmed proceeds

The user's **1.3 Sepolia ETH** transfer was confirmed in [transaction `0x3521c767…f17e`](https://sepolia.etherscan.io/tx/0x3521c767ad075ea6ddb7d118d39987fbd97601774cb10aa6252769c0e3fdf17e), block **11810481**, with **188 confirmations** at the 2026-09-29 22:58 UTC check. The receiver is the configured operator, `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223`. No funds were moved by this verification.

The September 29 **23:12 UTC** refresh at Sepolia block **11810734**, hash `0x84d952a0f2d7da3e87f46430f6a10d04ef9b484ab21ba8cd08aa87d16e9ca303`, confirmed unchanged balances: the operator held **5.704795587361978501 ETH** and all 56 configured accounts held **12.582463186002668262 ETH**. The previous balance/distribution reports were preserved before refreshing them. Factory setup had consumed **0.010971253479258554 ETH** across its three confirmed transactions.

The fee ceiling remains **5 gwei**, with a **25 ETH cumulative journal cap per stage**. That cap counts funding transfers and gas; it is not a required balance or cost estimate.

| Funding check | Current result |
| --- | --- |
| Stage-one aggregate allowance | 11.1576 ETH, including mint principal, VRF, sponsorship and conservative gas allowances; passes against the confirmed balance |
| Stage-one donor-order simulation | **Passes with no further top-up**: all 1,000 mints and claim gas are covered using the worker's donor order and single-donor funding rule |
| Comparison without future income/reuse | 22.9428 ETH aggregate allowance; the donor-order simulation needs another 11.4 ETH in 0.1 ETH increments |
| Conditional full sequence with reuse | A further **0.1 ETH buffer** passes the conservative donor-order simulation in 0.1 ETH increments, covering all 2,003 paid mints and claim gas. With no buffer, this stress forecast stops 20 tickets short in stage 3 |

**The first collection passes funding checks.** The reuse forecast assumes all claims return to the original controlled wallets, no unrelated outflows, and recovery between runs. It counts no unused VRF refund from the first sellout, returns the refund run's unused VRF and sponsorship, and budgets gas for recovery calls and transfers. It counts neither stage-three prizes nor stage-three recovery as advance funding. Gas and any VRF service costs remain consumed, so reuse does not eliminate operating costs.

The 0.1 ETH figure is a conservative planning buffer, not a confirmed current shortage or an instruction to transfer again. Actual gas may be lower. After each settlement, the wrapper checks current balances against the next stage's allowance before scheduling it; the private donor-order simulation additionally checks how balances are distributed under the worker's funding rule. Future payments are never passed off as confirmed funds. These allowances are not transaction gas caps or actual gas estimates.

Enabling reuse changed only the three draft notes and the private manifest policy. Revisions are now **2 / 3 / 2**, with null openings and no runtime; all 45 other plans remained unchanged. No collection was queued, deployed or started by this change. The command now reports its separate confirmed-balance check before the configuration preparation result.

Private evidence is stored in `.private/review-season/topup-confirmation.json`, `funding-check.json`, `funding-distribution.json`, `fund-reuse-enabled.json` and `prepared-verification.json`. To refresh, run the read-only balance audit `.private/review-season/funding-check.mts` first, then `.private/review-season/funding-distribution.mjs`. The balance report preserves the comparison excluding future income; the distribution report distinguishes that comparison from the conditional reuse forecast. No funding check starts a mint clock.

### Completed factory and hosted setup

- Dedicated factory: [`0x0C4B50081c917a82AD9B3e482f71f27F9657B361`](https://sepolia.etherscan.io/address/0x0C4B50081c917a82AD9B3e482f71f27F9657B361), runtime hash `0xa0a6699930e4a5ff9858ba7ff60d46d89ace83194c154512c8af6fc64e62a904`. Factory owner, renderer/deployer/build identity, both registry approvals and zero deployed rounds were verified.
- Deployment transaction: [`0xb046…3920`](https://sepolia.etherscan.io/tx/0xb04680563806c4f092734f5a4034ec342ba3cd7c1ef478fef743a653d7b53920), block 11804183. Eligibility approval: [`0x15ea…2bd5`](https://sepolia.etherscan.io/tx/0x15ea0324b395352de029202859bb8d2c5489474de1b1037bc79f3093c5bd2bd5), block 11804186. Credits approval: [`0x26a5…9a3d`](https://sepolia.etherscan.io/tx/0x26a5cc749d10f9abb3fd24edd6d1993d8e05ca305bb2901aa081a0c102229a3d), block 11804190.
- At factory setup, the refund draft became revision 2 and referenced that factory; first/third were revision 1 on the original factory. The later reuse-note update raised these revisions to 3 and 2/2 respectively without changing factory pins, economics or schedules.
- Web deployment `dpl_DZfex9Gd48sjry98Q32GTd2WkRP6` is **READY** and active at `app.tincta.xyz`. Indexer deployment `dpl_EJcxkrftVfuuaQoiKgTDGGPwJhCK` is **READY**, with both minute schedules attached. The reviewed source snapshot excluded private files and local environment files; no commit or Git push was performed.
- Anonymous pages, historical V8/V10 NFT metadata, the exported winner's paid-prize history, Credits V6 and V10 affiliate reads passed. The closed collection's challenge returned the expected `409 enrollment_closed` after checking signer/origin/bot/IP configuration; no permit or enrollment was created. Indexer remains protected (`401` anonymous); authenticated status/cycle returned `200`, with all three historical collections caught up through block 11804212 and no errors.
- Private evidence: `refund-factory-proof.json`, `prepared-verification.json`, `hosted-applied.json`, `hosted-verification.json`, `funding-check.json`, and `funding-distribution.json` under `.private/review-season/`.
- The new refund collection does not exist yet. Its connected-wallet admission, mint/refund UI and event ingestion will be tested during the actual run. The completed setup is not a claim that those future interactions have already passed.

## Verification record

- Staging: three new unscheduled drafts persisted and read back; 45 prior plans unchanged. No schema change or fixture seed.
- Initial preparation: role/NFT ownership and balances were read at anchored blocks. The subsequent authorized factory deployment and three confirmed transactions are recorded above; no collection or rehearsal transaction has run.
- Stage-one read-only command passed, verified `@luckyOne9619` through an authenticated GET, and returned an illustrative fresh opening. That timestamp was not saved.
- Dedicated factory deployment, canonical approvals, hosted releases and configuration checks are complete as recorded above. The confirmed 1.3 ETH top-up satisfies stage-one funding checks; later stages need a fresh funding review, and run execution remains pending.
- Local tests cover exact half qualification, source ownership, eligibility, source runtime, occupied/wrong slots, reorganization, nonself referral routing, stable enrollment intents, independent draft identities, Mainnet rejection, encrypted export and version/network-scoped multi-factory pins. Recovery tests cover unfinished manual/refund settlement, owner/runtime/vault mismatch, lock loss, canonical receipts, exact pending-byte recovery, individual and aggregate caps, gas retained in returned wallets and repeated completion without duplicate transfers. The opening funding tests reject unavailable manual-wallet surplus and count only unique liquid accounts.
- Before reuse, local validation was season worker **168 passed / 3 isolated-database tests skipped**; Web **282 passed / 3 database tests skipped**; worker/Web TypeScript checks and Web production build passed. The gift-allocation regression verifies one genuine manual referral followed by bot-paid 20/19 gift allocations, restart reconciliation and zero reserved-wallet signatures. No hosted database was used for test fixtures. The reuse validation is recorded below; no Web source or hosted release was changed for reuse.
- Reuse validation: full worker suite **179 passed / 3 isolated-database tests skipped**, worker TypeScript check and `git diff --check` passed. The focused recovery suite also passed after adding explicit growth-reserve coverage. Stage-one read-only preflight passed its confirmed-balance check with a **1.424863186002668262 ETH** allowance margin at block **11810742**, verified the configured X account via GET and reported the enabled reuse policy. Its illustrative opening was not saved. Independent database/factory verification at that block confirmed revisions 2/3/2, no runtime or opening, unchanged approvals, and zero collections on the refund factory.
- Opening adjustment (2026-09-30 UTC): all three drafts were verified unstarted, then their enrollment windows and explanatory notes were saved at revisions **3/4/3**. All 45 other plans remained unchanged. The manifest now specifies a 1,800-second opening delay. Full worker tests **181 passed / 3 isolated-database tests skipped**, TypeScript and whitespace checks passed. The read-only preflight at 00:01 UTC proposed 00:31 UTC, returned opening delay 1,800/enrollment 900 seconds and passed funding. That illustrative date was not saved; an independent read confirmed null openings and no runs. Private evidence: `opening-delay-updated.json` and `prepared-verification.json`.
- Real extension imports, connected-wallet enrollment/mints/claims, live notifications, new VRF, new X delivery and collection-level hosted extra-factory behavior remain the purpose of the upcoming review. No visual component was changed in this preparation.
