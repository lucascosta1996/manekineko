# First-season Sepolia review — October 5, 2026

**Superseded by V11 on 2026-10-05:** use [the full affiliate pool review](full-affiliate-pool-v11.md) and `.private/review-season-v11/run.sh`. The prior season is archived and its launcher disabled. The remaining content is historical evidence.

This replaces the failed Prism Review attempts. It is **one season with three collections**, implemented as three execution runs because a refunded V10 factory cannot roll forward. The user's current affiliate wallet is `0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145`. It is external to the encrypted rehearsal vault: the script may fund it, but cannot sign, enroll, claim or sweep funds for it.

## Corrected first-collection eligibility

The previous Ruby Signal was eligibility sequence 5, not the first official collection. Its human enrollment was absent when its immutable opening arrived. The replacement uses a dedicated Sepolia Eligibility V5 test registry, `0xCdE3528FB802b468d0B06D69AA81e4df424c487B`, verified with zero registered collections. Its first registered collection therefore uses the existing sequence-1 **no-previous-NFT exemption**. This is an explicitly requested isolated first-season test, not a change to the global first-collection rule or an exemption for every ordinary season.

The existing Winner Credits V6 registry `0x9ffba23cCCe9AcBeeDb16762C4f07967b5D6197C` is retained, including lifetime reward usage and old liabilities. No historical registry is reset or deleted. Solidity is unchanged.

- Eligibility runtime: `0x4385f26cc4e80a18128527b65ea885615c3c64dda69422ff64076bcd642a2dac`.
- Sellout factory: `0x002b03232c2Bb96411ee810C5213C10C82E6358c`, runtime `0xf7bfe16d39697ad9f75d893aaa8a149dc917c19ca3b82e00e192b6b743cf3a4c`.
- Refund factory: `0x8Fec8b9ed1F96BB11c39A704E5BB309724619CD1`, runtime `0x9b573853504ff5f311dd0ffbe85fde2ca153cec31561aa9f030fe711fed04c29`.

Both factories were verified unused and approved before scheduling. The first collection's wrapper rejects a consumed bootstrap registry. Stage 3 resolves ten still-owned NFTs from **this review's completed first collection**, verifies its runtime, completion, ownership and block anchor, and persists the cohort before preparation. Its original source template cannot authorize the stage-3 run without this resolution.

## Cleanup actually performed

The user clarified that only collections that went live should be removed, plus the current review season. Migration 031 provides immutable Sepolia-only archival tombstones and app-role row visibility policies; frozen terms, plans, private runtime journals and on-chain state remain intact. The exact cleanup allowlist hash is `9d79a9bc2e4eb41d9986fb0474572ee797b5275f18a290887f30d0afa4d93504`.

Removed from app visibility: Cinder Study, Lunar Stone, Satin Echo and the two deployed Ruby Signal attempts (five collection IDs), their six associated season execution plans, and four runtime projections. The current run `6289f40c-9d75-4db5-8dfe-0bd6af327d72` is paused. All 48 unrelated saved plans, including all 22 Mainnet drafts and unlaunched Sepolia catalog drafts, were verified unchanged. Hosted collection and schedule APIs both returned zero after cleanup. Old contracts/NFTs cannot be erased from Sepolia; their locked balances were not counted as liquid funds or withdrawn.

## Replacement and command

Season ID: `0x203b064ae745b781c64d726992782b09a5725491912bd4b70127bac5b00e37be`.

| Stage | Collection | Automation | Collection ID | Outcome |
| --- | --- | --- | --- | --- |
| 1 | Ruby Signal | `3e4a6ecc-69a6-43f6-b162-3729dc3fab59` | `858f0813-6164-4dc2-8c8a-85557040955e` | 1,000 sold; manual referral, prize and commission review |
| 2 | Coral Pause | `207c36ae-6a5e-4d57-b1ce-b2dc7ddaa9b7` | `5850e504-a61a-42e5-9baa-7f63e9f75217` | Three mints, 30-minute deadline, three refunds |
| 3 | Amber Relay | `3ffefeff-6896-4a5b-b335-104b0fe507b0` | `066666de-af36-42d1-9bf6-fd70b0c2810f` | All 10 affiliate slots occupied; exactly slots 1–5 successful |

Terms remain 0.01 ETH, six prizes, 20 primary mints per recipient, the same palette and names, and 24-hour sellout mint windows. Each stage starts minting 30 minutes after preparation, with a 15-minute advertised enrollment window. Draft openings remain null until execution.

```sh
# Read-only funding, role, registry, factory and preparation checks
bash .private/review-season-reset/run.sh 1

# Start when ready for the manual enrollment window; keep it running
bash .private/review-season-reset/run.sh 1 --execute
```

Use stage 2 and then stage 3 after completing the preceding manual claims/refunds and stopping its worker. The original vault and 15 ETH fund-reuse cap remain unchanged. The old commands are historical, not the current run.

## Manual workflow and fund reuse

1. Connect **your own affiliate wallet** `0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145` to the first collection's affiliate page during enrollment. No NFT is required for this first collection. Finish both the human verification and the on-chain enrollment transaction before mint opening.
2. Use referral-buyer wallet `0x513551382c81E03B4F2832484230150b9087b677`, whose existing encrypted access pack remains in `.private/review-season/wallet-access/README.md`, to buy **one ticket via the affiliate referral link** once minting opens.
3. The worker verifies the real referral receipt, gifts the remaining manual allocations, completes automated minting, and reserves a real unpaid winner after VRF. It never signs for either manual role. Use the existing manual winner-export procedure from the prior review guide when that checkpoint is reached.
4. Review the referral notification, recipient wallet disclosure, prize claim and commission claim in the app. A missed enrollment now stops with `manual_affiliate_enrollment_deadline_missed`; logs include the enrollment URL and next manual action.
5. For stage 3, bots prepare their nine reserved affiliate slots without consuming the human's slot 1. The human still enrolls through the interface with an NFT from stage 1. Only five IDs receive paid referrals.

Fund reuse sweeps only the original managed vault and settled operator proceeds after all required claims/refunds are complete. **Your external wallet is never swept.** To reuse commission/prize funds paid to that wallet for later collections, return the desired test proceeds manually to operator `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223`, or choose that recipient when claiming if the interface offers it. The next-stage funding check stops before setting an opening if liquid managed funds are insufficient; it does not count external surplus or expected future payouts.

## Verification boundaries

- Live registry, factory ownership/runtime/approval, zero collection counts, restricted-role grouping and unset draft schedules were checked.
- Stage-one preflight passed at block 11845580: available 11.837935002491043751 ETH, requirement 11.1576 ETH, margin 0.680335002491043751 ETH. External affiliate surplus of 1.187479793891812 ETH was excluded. Both manual wallets already met gas/payment targets.
- Worker suite: 187 passed, three opt-in database tests skipped in the broad run. Restricted-role/store and wallet tests separately passed with disposable local PostgreSQL; final focused runner/wallet/cohort/source tests: 55 passed. Worker typecheck passed.
- Web: 287 passed, three database tests skipped. Launch: 190 passed, six opt-in tests skipped. No UI styling changed in this repair; these tests are not evidence of a fresh human verification, wallet signature, referral notification, VRF draw or claim.
- Web and Indexer use configuration-only redeployments of their existing production sources, not a publication of unrelated worktree edits. Both are READY with production aliases assigned: Web `dpl_8hgnDSU54g1XxMV4vfsPsVP14Mkr`; Indexer `dpl_AwdSJ893vcR8JYZLmSmjwwBVWR34`. The record is `.private/review-season-reset/hosted-status.json`.
- Setup incurred one unnecessary zero-value empty deployment transaction (`0xdf640e29a985f11b3db03d6adfa96784bfc29b1a1a78d9dc041fe7bc507c95a8`) due to an unresolved transaction request. It created no runtime code and cost 0.000054650947244 Sepolia ETH in gas. It is retained in the encrypted journal; the corrected registry and all setup receipts were independently verified. The complete setup remained within its 0.25 ETH cap.

No replacement collection was queued or executed during these automated checks. The user must perform the reserved manual actions during the live review; automated fixture tests do not replace that acceptance.

### Manual buyer replacement — 2026-10-05 UTC

For Ruby Signal only, the user minted from external wallet `0xE9d5303480E33cfa4310576967C62cBd2bEC8B87` instead of the originally assigned managed buyer. Referral transaction `0x3891a5317402c4bcaa8e9afeb4cce7b7813e866b99bd20fe4d660395b0dffee0` recorded one ticket for affiliate position 1 at block 11845818. The worker was stopped before updating its encrypted scenario binding and manual buyer reservation; the original encrypted state and private manifest were retained as a private backup. The existing receipt is revalidated by the normal worker checkpoint on resume.

The explicit `externalBuyer: true` scenario option requires the one-referral-then-gifts plan. No external buyer key is requested or stored; the worker cannot sign or sweep that wallet. It remains a reserved recipient for the planned ticket allocation, with other purchases paid by managed wallets. Stages 2 and 3 keep their prior configuration. Focused wallet/scenario tests: 19 passed; worker typecheck passed.

### Fragmented funding recovery — 2026-10-05 UTC

The first collection paused at 940/1,000 mints because funding required a single donor to cover a whole wallet shortfall. The last mint (`0x005609dea8d4bdc68e694be6a3c4cea9d704e47b168d329aefe8dfb28ed93838`) succeeded. A read-only audit at block 11847992 found sufficient aggregate managed liquidity, split across donors below the next full transfer amount.

Funding now prefers a donor covering the full shortfall, then falls back to the largest spendable partial contribution. Each transfer uses the existing durable journal and confirmed top-up numbering; later iterations cover only the remaining shortfall. The original gas reserves, pending-mint reserves, manual-wallet exclusions and spending ceiling remain enforced. Dust contributions smaller than their maximum transfer gas allowance are excluded. Seventeen wallet tests and worker typecheck passed, including restart across two funding donors. The same run was resumed through its normal control API; no new collection or duplicate mint was created.
