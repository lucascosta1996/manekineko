# Three-collection Sepolia workflow review

**The replacement is ready for the user to start. The old run remains paused.** The replacement is one saved **Prism Review** season with three collections sharing season ID `0xd7510f0ac6ad86f76d7c7624c3f45b37f3d0712c18e991478ec28fdda10fa5f0`. It uses three separate execution artifacts/runs because a refunded V10 factory sequence cannot continue. Migration 030 and the replacement drafts are persisted; all 48 preexisting automation rows and frozen exports remained unchanged. No replacement collection has been queued or started.

The old run `4fca383b-5550-4e90-aef0-8889d7b5320f` is persistently paused. Ruby Signal at `0xA16194c52d61cd530Ada23587cd8Be8d86Ee7BEb` had zero mints and zero enrolled affiliates at the September 30 audit. Its opening was missed, so its frozen clock is not reused. The old records are retained as superseded history; their command and resume controls are blocked.

| Step | Saved draft / collection | Expected outcome | Mint window |
| --- | --- | --- | --- |
| 1 | Prism Review / Ruby Signal | 1,000 tickets sold; manual referral, commission and fresh winner claim | 24 hours |
| 2 | Prism Review / Coral Pause | Exactly three paid mints; all three refunded and burned | 30 minutes from sale opening |
| 3 | Prism Review / Amber Relay | 1,000 tickets sold; all 10 affiliate slots occupied; exactly 5 have paid referrals, 5 have zero | 24 hours |

All three retain 0.01 ETH tickets, six equal prizes, the 20-primary-mint recipient cap, one paid referral to qualify, the 2 ETH sellout affiliate budget and its existing equal-share/cap calculation. Stage three routes automatic purchases only to selected successful IDs 1–5, avoiding self-referrals. It verifies actual occupancy, referral counts, qualified count and accrued amounts; it fails on unexpected slot ownership or a referral to slots 6–10. This is controlled fixture behavior, not a change to public admission or economic rules.

## Saved identities

| Step | Automation ID | Collection ID |
| --- | --- | --- |
| 1 | `57743b50-9c7c-49b3-88b9-b532d580222d` | `16e4b567-8e01-45c6-bd50-4beedcf3e46f` |
| 2 | `2c22e052-e935-4333-ada4-765223a82501` | `34311c80-25fe-47c4-8f68-65e838a4c05a` |
| 3 | `3a41c084-6b06-471e-a72f-9a0f8d026256` | `ff238ac6-6c6f-4f27-ade5-27ab7e4fac03` |

The current private manifest is `.private/review-season-v2/review.json`. Openings remain unset until each script starts. Launch displays a single season card and all three collections; changing the selected collection inspects its own draft/frozen artifact. The public season appears only after the script confirms its initial announcement. Subsequent runs append their results under the same season identity. The previous `.private/review-season/review.json` is audit history and rejects execution.

## Wallet access and manual steps

The local access sheet is `.private/review-season/wallet-access/README.md`. Exactly three selected original-vault accounts were exported as password-encrypted Ethereum JSON keystores, decrypted locally to verify the public address, and stored with mode 0600 inside an owned mode-0700 directory. Passwords are separate local files; keys and passwords are not in this document, source control or conversation.

- Affiliate: `0xC3471b4fF2DDeB16E7d43bFd0e18fd4F11aD02Fb`, confirmed owner of Lunar Stone #1.
- Referral buyer: `0x513551382c81E03B4F2832484230150b9087b677`, confirmed owner of Lunar Stone #21.
- Historical winner: `0xb084c84a95d6Db66f34b2FD6527221dE94A3dCaE`, confirmed owner of Lunar Stone #208, rank 1. **That historical prize was already paid.** This account can review historical ownership/payment/credit behavior; it does not provide another claim on the paid prize.

The role observation was anchored to Sepolia block 11804083, hash `0x2b8086075ece4a69ceae46f2e323f47b107adde7225912ea48aeb26a50300f41`. NFT ownership and admission must be checked again for each newly deployed target. No transfer or synthetic eligibility record was needed.

For each sellout:

1. Start its run on the intended review day. The script freezes a new mint opening **30 minutes after preparation**, allowing 15 minutes for deployment/confirmation followed by the full **15-minute enrollment window**. For stages 2/3, preparation follows fund recovery and the fresh funding check. Keep the terminal running. Its `manualReview` output records the current checkpoint and selected winner.
2. In the affiliate account, open that collection's affiliate page, select Lunar Stone #1, complete the ordinary UI checks and enroll. For stage three choose **slot 1**; the script fills slots 2–10 with nine distinct eligible vault holders using Sepolia-only admission permits. These bot permits still pass the real immutable eligibility registry; they do not exercise the public bot challenge. Your own enrollment does.
3. After minting opens, buy **one NFT with the buyer through that affiliate's referral URL**. No purchase is required from the affiliate account; it already owns the eligibility NFT. The runner verifies that one buyer referral from canonical receipts, then a bot pays for 20 direct gift mints to the affiliate and 19 to the buyer. The other 48 wallets receive the remaining 960 tickets. Each recipient remains within the immutable 20-mint cap, and bots never sign from the two manual accounts. The explicit `one-referral-then-gifts` manifest policy preserves the older 20-plus-20 manual scenario unchanged.
4. On the buyer's mint screen, verify the full affiliate beneficiary address, network and collection. On the affiliate page, keep the affiliate account connected to see verified referral activity and the new-referral notification. This is an in-app indexed-event notification, with polling/indexing delay; it is not a push or email notification.
5. At sellout, review accrued/claimable commission and submit its claim in the app. Stage three's other qualifying bot affiliates claim to their own addresses; the human affiliate's claim remains manual. Unqualified affiliates receive zero.
6. After the actual VRF draw, the runner reserves another distinct unpaid winning holder and leaves its prize untouched. Stop the worker, use `manual-wallet-access.ts` with the recorded run ID/round, `--role winner`, original vault, an owned private password file and a new private export directory, then resume the same run. This account is selected from real results; the historical winner in the initial access pack is not promised to win again.
7. Import that fresh winner, connect it, and claim the prize through the app. Claim any other winning NFTs held by the manual roles too. The next stage remains blocked until the prior sellout's manual claims or the refund stage's three refunds are confirmed.

Do not sign unrelated transactions from an automated vault participant while a worker is using it. Affiliate and buyer nonces are explicitly reserved during each sellout. Finish the manual claims, let the worker confirm completion, then stop it before starting the next stage. Claim to the original holder wallet to keep the proceeds available for the following collection.

## Reuse funds between collections

The private manifest now enables `completed-stage-to-operator-v1`. Starting stage 2 or 3 with `--execute` first acquires the previous run's exclusive Sepolia worker lock and completes a separate recovery phase. The next opening remains unset until recovery finishes and a fresh liquid-balance check passes.

1. Verify the previous frozen run, original 50-wallet vault, exact contract pins and owner. The previous worker must have completed its scenario with all transactions confirmed. A sellout needs all prizes and accrued commissions paid, including every manual claim. The refund needs exactly three paid mints and all three refunds confirmed.
2. Withdraw the previous collection's available ordinary proceeds, released growth reserve, unused VRF funding and remaining sponsorship to the original operator. Protected liabilities are never withdrawn.
3. Return surplus ETH from the original rehearsal wallets to that operator, including the manual wallets **only after their claims are complete**. Each wallet that returns funds retains a 0.0125 ETH gas buffer at the configured 5 gwei ceiling, plus any unused transfer-gas allowance. Smaller balances are left in place; ordinary next-stage funding tops them up as needed. No NFT is transferred. External donor wallets are not swept.
4. Recheck confirmed liquid balances before freezing the next stage's opening. Expected prizes, refunds and contract reserves are not treated as cash already received. An insufficient balance stops preparation; rerunning resumes the same recovery journal and does not return the same wallet's funds twice.

Each handoff has its own encrypted `.private/review-season-v2/reuse-before-<next-collection-id>.enc` journal, a **15 ETH cumulative transfer-and-gas cap**, and the existing **5 gwei fee ceiling**. Each collection retains its separate **25 ETH** execution cap. Saved transaction bytes and canonical receipts are reconciled before another action. Keep these journals with the manifest and vault when resuming; an earlier stage cannot be restarted through the review wrapper after its handoff has begun.

During the collection, the existing manual-role protections remain active: the worker does not submit the human enrollment, referral purchase, commission claim or selected winner's prize claim. The recovery phase only moves already-settled ETH. There is no automatic recovery after stage 3, so its final review proceeds stay in their recipient wallets.

## Current command

The local convenience launcher preserves the reviewed manifest, wallet vault and environment order:

```sh
# Read-only check
bash .private/review-season-v2/run.sh 1

# Start the replacement first collection when ready
bash .private/review-season-v2/run.sh 1 --execute
```

Use stage 2 or 3 only after completing the previous stage. The equivalent full command below is read-only; its displayed opening is a preview and is not saved:

```sh
npm run season:review:sepolia -- \
  --manifest .private/review-season-v2/review.json \
  --stage 1 \
  --wallet-vault .private/season-runner/sepolia-wallets.enc \
  --env-file .env.staging.local \
  --env-file .env.staging.wallets.local \
  --env-file .private/v10-setup-2026-09-25/worker.env \
  --env-file .private/review-season-v2/review.env
```

Add `--execute` to start stage 1. The same command with `--stage 2` or `--stage 3` checks the previous outcome, completes the authorized fund recovery, checks liquid funding, and only then freezes the next 30-minute opening. Stop the previous worker before starting the next stage. Do not use the old manifest or resume its missed opening.

## Funding and factory verification — September 30

Read-only stage-one checks passed at Sepolia block **11811264**, hash `0xaad646afabfb97cdc97914a0546cef223e571ef50934a8d412ddb0183344bf27`:

- Confirmed liquid funds: **12.205380943253598874 ETH**.
- Conservative stage-one requirement at the 5 gwei fee ceiling: **11.1576 ETH**, leaving **1.047780943253598874 ETH**.
- Affiliate balance and target: **0.0125 ETH**.
- Referral buyer balance and target: **0.0225 ETH**.
- No future prize, commission, refund or locked reserve was counted.
- The saved Sepolia X account was verified by authenticated GET as `@luckyOne9619`. No X post was sent by this correction.

The worker checks and funds those exact manual addresses before announcing enrollment. A confirmed earlier funding transfer is never reused as a new top-up after the wallet spends gas; additional transfers get distinct durable intents and remain receipt-reconciled.

The two new sellouts use the previously unused V10 factory `0x0C4B50081c917a82AD9B3e482f71f27F9657B361`, with runtime hash `0xa0a6699930e4a5ff9858ba7ff60d46d89ace83194c154512c8af6fc64e62a904`. The new middle refund uses `0x8Fec8b9ed1F96BB11c39A704E5BB309724619CD1`, runtime hash `0x9b573853504ff5f311dd0ffbe85fde2ca153cec31561aa9f030fe711fed04c29`. Its deployment and V5/V6 approvals are confirmed:

- Deployment: `0x8fbd62c262c07858929c914a6c665e49cf5ce50fd43d3e106caab380f3d775e7`.
- Eligibility approval: `0xe5950e4b3c7edb0d0c22a16497d1201c23ad4c1e0546c868dc0704fcf21be47c`.
- Winner Credits approval: `0x460b380726ff1156d8b83d854060664aa8ce4248fd6697c13f2e52374305ff15`.

Both old factory pins remain configured. The prior zero-mint collection's VRF/sponsorship funding remains in its original contracts and is excluded from liquid funding. No collection minting, claims, refunds or between-stage recovery was executed during this correction.

## Enrollment and browser checks

Cloudflare widget `0x4AAAAAAE6_EzmUX3zRrZqj` is the key served by the hosted app. Its hostname list was missing `app.tincta.xyz`. After the editor finished loading its custom-hostname option, `app.tincta.xyz` was added and saved. The returned widgets list confirms **2 hostnames**, **Managed** mode and **No pre-clearance**. The original `manekineko-staging-web.vercel.app` hostname and secret remain unchanged. The configuration defect is fixed; a real new wallet challenge and on-chain enrollment still belong to the user's next review run.

Web now deduplicates equivalent opening timestamps, hides only the native ticket input spinners, keeps custom plus/minus and keyboard controls, adds 24 px before the confirmation button, and invalidates expired/error/old-widget tokens before allowing enrollment. Verification failures provide a retry and sanitized server diagnostics; hostname, action, challenge binding and server validation remain required.

Local evidence: 12 focused browser checks passed across Chromium, Firefox and WebKit, including mobile/desktop countdowns and spacing, stale token callbacks, quantity controls and three-collection Launch selection. The final Launch numbering was checked again after visual review. Unit/type checks and isolated PostgreSQL tests cover grouping, immutable historical exports, forbidden direct starts, refund/sellout projection merging, duplicate factory round numbers and repeated wallet top-ups. These fixture checks do not establish a real CAPTCHA, extension wallet signature, mint, referral notification, commission claim or VRF result.

The [September 29 setup record](handoffs/review-season-2026-09-29.md) is superseded historical evidence.


## Hosted release verification — September 30

- Web `dpl_BJUMDkaYRGPcNksyANbP76pofGbA`: READY and active at `app.tincta.xyz`.
- Launch `dpl_DUu1Bk2NjvgiC9n32U1YybBx7VEj`: READY and active at its existing staging aliases. Authenticated browser inspection confirmed one Prism Review card, three selectable collections, and consistent 01–03 numbering.
- Indexer `dpl_3fQZZEeTNfCJZa6UP2vTQimsv5t3`: READY with both minute cron jobs active. Authenticated status returned four monitored collections with no last-error codes and observations 28–29 seconds old. Anonymous status access remains 401.
- Hosted NFT metadata, historical paid prizes, Winner Credits V6 and affiliate configuration reads passed. The live quantity input uses `appearance: textfield`.
- Migration 030 checksum: `ea08095bfc390b188fe8ba31af2b5c96a62f9a4b94e49c9786ab23d4f760b736`. The existing Launch role can read grouping metadata but cannot write it; public Web has no access to the private membership tables.
- Final local suites: 286 Web tests, 217 Launch tests plus 4 preparation tests, 183 season-worker tests, plus the focused three-test funding/retry suite; no failures. The separate isolated runtime database test also passed. Intentional opt-in tests outside those scopes remained skipped.
- The funding gate also covers the worker's urgent-opening path, so nearing the opening cannot bypass manual-wallet funding. No replacement runtime exists, and the old run's desired and actual statuses remain paused. All 12 selected role/cohort NFT owners were reverified.

Source snapshots excluded private journals, environment files and credentials. No Git commit or push was performed.

The final read-only balance preflight uses batches of four with 650 ms spacing and at most three backoffs (1/2/4 seconds) for provider throttling. Other errors fail immediately; no transaction submission uses this retry helper. A provider limit before preparation cannot freeze an opening or queue a run.

The macOS convenience launcher then passed its read-only end-to-end preflight: one Prism Review season, three collections, funding pass, expected X identity and a 30-minute preview opening. This preview was not persisted and no new run was queued.
