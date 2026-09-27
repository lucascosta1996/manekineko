# Second Airy Garden notes: worker/social and manual rehearsal implementation

Date: 2026-09-27. Scope: U3 and runner-side U4 of the Astra Ultra handoff. These changes are local source. This task did not run a worker, send a post, mutate a hosted database, fund a wallet, export an existing wallet, or submit a transaction.

## Read-only diagnosis of the completed run

The actual run `257c7ab9-9e56-4daf-b5db-917a05d15d1c` is **completed**, with `desired_state=running` and its last recorded heartbeat at 22:36:32 UTC. This means the persisted run permits continued maintenance; the old heartbeat does not establish that a process is currently running. The configured Sepolia X profile is revision 6, `@luckyOne9619`, account `805459104844103680`.

The 23:09–23:13 UTC audit found **33 confirmed posts and 24 failed supplemental replies**, with no unconfirmed image roots. Every relevant recorded draw/claim block hash matched a fresh RPC block lookup. Exact author, text, media and root identity of the three result/summary posts were independently checked through X's read API:

| Collection/event | Canonical chain timing (UTC) | Confirmed X result |
| --- | --- | --- |
| Lunar Stone draw | Block 11789881, `0x959c279ada537478f3c278cae3bd98e2f142528e925829e6932c5459e5ce1e5c`, 00:54:36 | [Results](https://x.com/luckyOne9619/status/2104012045137895565), 00:55:37.263, about 61 seconds later |
| Lunar Stone six payments | Blocks 11794790–11794831, 17:21:12–17:29:24 | Its primary result correctly preceded payment. Supplemental winner/payment replies failed. |
| Satin Echo draw | Block 11796036, `0x10f609ccbae94d6389f60066ded9746cf111e88f70ab619559cbd2d5e4c55726`, 21:30:48 | [Results](https://x.com/luckyOne9619/status/2104327470967083227), 21:49:00.693, about 18 minutes 13 seconds later |
| Satin Echo six payments | Blocks 11796047, 11796057, 11796066, 11796077, 11796088, 11796101, 21:33:00–21:44:00 | All six payments preceded the first persisted results root, created at 21:48:48.914. Its text acknowledged all prizes claimed but still advertised a claim link. |
| Two-collection completion | Both actual collections terminal | [Season summary](https://x.com/luckyOne9619/status/2104327574566412589), 21:49:25.336: 2/2 collections, 2,000 NFTs, 12 ETH prizes paid, zero affiliate claims |

These observations establish six awards per actual collection at this snapshot. They do not identify which earlier screen or collection the user's “4 of 4” observation described. The implementation uses actual award arrays/counts, not a hard-coded four or six.

Newer rejected replies retain HTTP **403**, problem **`not-authorized-for-resource`**, no provider numeric error codes. The oldest failed reply predates structured diagnostics. This proves a resource authorization rejection; it does not establish a billing cause. No credential or account setting was changed. Existing confirmed payloads and post IDs remain untouched.

The source ordering explains a specific starvation path: a terminal bot claim ran before the results intent, then the fresh pre-post check rejected the stale unpaid snapshot because another prize had just changed. Repeated claims could keep the first result unposted until the collection was fully paid. The Satin timeline is consistent with that path. It is not a reconstruction of every historical exception, since the earlier worker did not retain transition-to-enqueue timing.

Private sanitized evidence: `.private/bots-notes-2/social-audit.json`, `chain-audit.json`, and `manual-role-candidates.json`. No keys, authenticated RPC URLs or credentials are included in those reports.

## U3 source changes

- `runner.ts` durably enqueues newly observed verified results before any bot prize claim, then attempts the primary result ahead of supplemental sellout threads. The existing urgent opening checkpoints and required announcement/activation gates remain in force.
- The root records first local observation time, canonical block/hash, and unpaid award count. Fast claims before the first observation are honestly recorded as already paid; earlier eligibility remains traceable through `AwardDetermined`/`WinnerDetermined` events.
- `winners-revealed` remains the original durable identity. New `prizes-paid` identifies a separate all-paid summary. Individual payment replies keep their transaction-hash/log-index identities under the results thread. The all-paid summary does not duplicate individual payment replies.
- If delivery is delayed, known-unsent copy/image changes to “All prizes have been paid” and “Results and payment history”; no claim invitation remains in its headline, footer, body or results link. Confirmed roots retain their original text.
- `outbox.ts` persists `attempts`, `lastAttemptAt`, fixed `nextAction`, sanitized provider diagnostics, retry time, and `observationToDeliveryMs`. Media rejection now leaves an actionable durable failure. Provider Retry-After is honored; absent a supplied interval, a rejected X request waits five minutes before retry.
- `store.ts` atomically archives each superseded known-unsent payload/result/status/error under `result.payloadHistory`. Refresh clears obsolete media state without deleting observation history. Confirmed, sending and uncertain actions cannot be replaced. Ambiguous sends require exact author/text/media/reply-parent reconciliation and are never automatically reposted.
- Results/summary delivery failure does not reverse a terminal season or block bot claim/public projection maintenance. A required confirmed predecessor results root is still required for successor activation. Supplemental failed/ambiguous replies retain their review state, while other independent maintenance can proceed.

The normal worker interval defaults to 3 seconds (configurable 1–30 seconds), plus confirmation depth (Sepolia default two blocks), indexing, RPC and outbox work. Enqueue occurs in the first successful eligible snapshot tick, before automated claims; this is a scheduling property, not a guaranteed wall-clock SLA during outages or fixed-opening priority. The stored times make observation-to-post delay measurable going forward. Historical confirmed posts do not acquire invented fresh observation timestamps.

There are no pending Airy Garden image roots to migrate. Its 33 confirmed posts remain immutable, including old “Color study” artwork/text. For a future queued branding revision, review its exact root/status/payload/media first: confirmed/ambiguous items retain their identity and content; only a known-unsent replacement may use the audited refresh path, which archives the complete old intent. Newly generated artwork presentation remains M3's companion scope.

## U4 source and access boundary

`manual-affiliate-sellout` extends the existing Sepolia scenario parser, encrypted vault and journal pipeline; it is not a separate buyer engine. It requires one fresh V10 collection, the ordinary full 24-hour sale, 1,000 tickets, explicit matching fee/spending caps and no treasury recycling. The manifest binds two distinct existing vault addresses before purchases. Mainnet rejects the scenario before private services; its entry point does not import the wallet adapter.

`state.rehearsal.manual[round]` persists the public affiliate/buyer addresses, source observation block, enrollment slot, canonical referral receipt identities, selected actual winning NFT/holder/rank/block and checkpoint. Checkpoints survive restarts. Bots cannot mint/sign, claim prizes/commission, donate or recycle from the reserved wallets. The winner is selected only after a verified draw, must differ from the affiliate and buyer and still hold an unpaid winning NFT. All prizes held by any reserved role remain manual, including multiple winning NFTs in one wallet. An unavailable distinct winner, changed owner, reorg, changed manifest or incompatible resumed mode fails closed.

There are exactly 50 vault wallets and a cumulative 20-mint recipient cap. Reserving both affiliate and buyer from all bot signing leaves **48 × 20 = 960** automatic mints. The concrete plan therefore includes **20 direct mints by the affiliate** and **20 referred mints by the buyer**. This extra affiliate purchase is explicit; the worker does not secretly sign it or gift tokens into the manual accounts. The buyer's 20 canonical `AffiliateReferralRecorded` quantities must bind its own payer and recipient and the actual enrolled affiliate ID before bots begin the remaining 960 mints. The worker validates equal-share allocation at sellout and waits for the user's commission and prize claims before completing the manual checkpoint.

`scripts/season-runner/manual-wallet-access.ts` provides a read-only public run sheet by default. With a separate explicit `--execute`, it exports exactly one reserved account from the original encrypted vault as a password-encrypted Ethereum JSON keystore. The output directory must be owned mode 0700, output file mode 0600, and existing files/symlinks are refused. A live winner export rechecks Sepolia, fresh canonical evidence, saved runtime hash, V10, draw, token, current holder and unpaid status before opening the vault. The helper acquires the existing network lock; stop the worker before using it. It never returns/logs plaintext keys and cannot export the whole vault.

## Concrete next-run plan (prepared for review; not run)

Use a **new one-collection Sepolia V10 draft/run**, with unchanged normal economics: 1,000 × 0.01 ETH, six configured awards, qualified equal affiliate share, one paid referral threshold, 20 lifetime primary mints per recipient, and 24-hour mint duration. The new collection/run/round IDs have not been created; they must be recorded in the run sheet after the separately authorized preparation/deployment. Do not attach this scenario to the completed Airy run or its existing rounds.

Candidate public roles were read from the original run's saved public address list, without opening its wallet vault. At Sepolia block **11796551**, hash `0x0de5005d25298008c106e4a4ed223ea92052b67481d23bb3ba4259569736b1e6`:

| Role | Existing managed address | Verified preparation evidence |
| --- | --- | --- |
| Affiliate | `0xC3471b4fF2DDeB16E7d43bFd0e18fd4F11aD02Fb` | Holds Lunar Stone NFT #1 and 20 Lunar Stone NFTs total; balance 0.011844801306908288 test ETH |
| Referred buyer | `0x513551382c81E03B4F2832484230150b9087b677` | Holds Lunar Stone NFT #21 and 20 Lunar Stone NFTs total; balance 0.011887676232608512 test ETH |
| Winning holder | Selected after the **new** verified VRF draw | Must be another original-vault wallet, still holding an unpaid winning NFT; no winner is promised in advance |

Lunar Stone source round is `0xaeCf42388f3Df8A92279d68065920745B73Ad728`. Ownership of #1 is genuine historical evidence, not proof of admission to an undeployed target. On run day, verify Eligibility V5's actual `eligibilityStatus(newRound, affiliate, sourceRound, 1) == 0`, registry/factory code pins, source completion, unused source-token admission, actual enrollment window and bot verification. Do not reset bootstrap, import fictional history or transfer an eligibility NFT.

Proposed limits for review: **5 gwei maximum fee**, **25 ETH aggregate journal spending cap**, and a planned **12 ETH starting liquidity** across the explicitly bound operator/vault accounts, subject to fresh balance/gas/VRF/sponsorship preflight. Mint principal alone is 10 ETH. At the 5 gwei ceiling, the current per-wallet 2,500,000-gas reserve is 0.0125 ETH; each manual buyer/affiliate initially needs 0.2125 ETH including its 20 mints. The aggregate cap counts internal funding transfers and subsequent mint sends separately, so it must exceed principal. These are proposed testnet limits, not a guarantee of sufficient future gas or an authorization to move funds; validate exact immutable VRF/sponsorship amounts and all recorded spend before execution.

Private manifest shape (the new collection UUID must replace the intentionally invalid placeholder):

```json
{
  "kind": "manual-affiliate-sellout",
  "chainId": 11155111,
  "collectionId": "NEW_REVIEWED_COLLECTION_UUID",
  "affiliateWallet": "0xC3471b4fF2DDeB16E7d43bFd0e18fd4F11aD02Fb",
  "buyerWallet": "0x513551382c81E03B4F2832484230150b9087b677",
  "manualMintsPerWallet": 20,
  "expectedOutcome": "manual-prize-and-commission-claimed",
  "maxTotalSpendWei": "25000000000000000000",
  "maxFeePerGasWei": "5000000000"
}
```

1. Prepare the independent future opening with at least one hour for deployment/confirmation **in addition to the entire configured enrollment window**. Bind reviewed IDs, original 50-wallet vault, version/registry/factory pins, X profile and exact caps. Run the existing Sepolia read-only preflight with `--sepolia-rehearsal --sepolia-scenario PRIVATE_MANIFEST --wallet-vault ORIGINAL_PRIVATE_VAULT --once`. No placeholder command is executable evidence.
2. After separate execution authorization, start only one existing Sepolia worker. It deploys and funds the reserved roles before purchases; no automatic purchase occurs until both manual allocations and actual referral evidence exist. Stop the process after role reservations are persisted and before exporting. Do not pause/restart merely to shift a deadline: all deployed times stay fixed.
3. Read the role sheet: `node --import tsx -- scripts/season-runner/manual-wallet-access.ts --chain 11155111 --run-id NEW_RUN_UUID --round NEW_ROUND --role affiliate --env-file PRIVATE_ENV`. Separately approved local export adds `--execute --wallet-vault ORIGINAL_PRIVATE_VAULT --password-file PRIVATE_PASSWORD_FILE --output-directory PRIVATE_0700_DIRECTORY`. Use a mode-0600 password file with at least 16 characters; never put the password on the command line. Repeat only for `buyer`; `winner` is unavailable before the verified selection. Store the printed **public** addresses/IDs/observation in the sanitized run sheet, never the keystore/password.
4. MetaMask **Extension** supports JSON import: account selector → Add wallet → Import an account → Select Type → JSON File → choose the one selected keystore → its export password → Import. This password differs from the MetaMask application password. Enable test networks and choose Sepolia; check chain ID **11155111**, selected address and test ETH before each signature. Official [import instructions](https://support.metamask.io/start/use-an-existing-wallet) and [test-network instructions](https://support.metamask.io/configure/networks/how-to-view-testnets-in-metamask) were checked. MetaMask Mobile does not import JSON keystores; the initial private import rehearsal therefore targets the extension. A mobile-compatible selected-wallet import method/device session remains a separate acceptance dependency; do not paste plaintext keys into chat or assume imported accounts synchronize to mobile.
5. Resume the same worker with the original manifest. During the full actual enrollment window, use the affiliate account through the app's real NFT eligibility, bot verification and signature flow. Record the `AffiliateEnrolled` transaction and ID; the worker discovers `affiliateIdOf` from chain. Missing enrollment stops rehearsal purchases; it never bypasses admission or extends the window.
6. Once the actual mint activates, the affiliate makes 20 direct mints (one 20-ticket transaction if supported by the wallet/UI). The distinct buyer opens its referral link, inspects the full verified affiliate address and collection/network, and signs 20 referred mints. Record the canonical `Minted`/`AffiliateReferralRecorded` receipt and in-app referral notification. Worker checkpoints wait until these exact conditions are confirmed, then the other 48 wallets purchase the remaining 960.
7. At sellout, inspect qualified/accrued/available affiliate commission against actual equal-share/cap reads and make its explicit app claim. Wait for the real VRF reveal. The worker durably chooses an unpaid winning holder from the other wallets, funds its gas if needed, and skips every prize belonging to reserved role addresses. Stop the process, export/import only that selected `winner` keystore through the same procedure, then resume the original run unchanged.
8. Connect the winner in the app, inspect the exact NFT/rank/amount and pending wallet prompt, claim and record the transaction/hash/payment history and removed paid CTA. If a reserved address owns additional winning NFTs, claim them explicitly too. Reconnect the affiliate/buyer to verify retained activity and paid commission state. No transfer/sweep or operator-directed settlement consumes these manual actions.
9. Preserve sanitized enrollment, referral, prize and commission transaction hashes, canonical blocks/log identities, final NFT rights, ETH balances, provider/account/network identity and UI outcomes. The chain may become terminal while manual claims remain outstanding; the reservation checkpoint is complete only after its required rights are paid. Resume observes this rather than re-signing. Explicitly review any failed social work separately. Keep this sellout rehearsal separate from the three-mint/30-minute refund scenario.

## Verification boundaries

Local tests cover durable enqueue-before-claim ordering, rapid all-paid observations, queued copy/history, supplemental 403, retry timing, ambiguous success/restart, capacity-preserving manual roles, actual referral-event binding, winner reservation/restart/transfer, both manual claim checkpoints, mode isolation and synthetic encrypted selected-account export. Validation passed: `npm run season:typecheck`; `npm run season:test` ran 164 tests, with 161 passing, zero failures and three isolated-database-gated skips. The separate store/provision/registration integration command then passed **6/6 with no skips** against the dedicated disposable local PostgreSQL container on port 54349, including all three gated cases. Those tests create unique databases/roles, apply migrations through 029, verify worker/Web grants and atomic payload-history retention, and clean up afterward; they did not seed a hosted database. `git diff --check` passed for the touched worker/shared-social files. Both new available/paid image variants were rendered and visually inspected at 1600 × 900: all-paid output contains results/payment-history copy without a claim invitation. The existing companion M3 branding remains visible in this scope’s previews.

Canonical chain/X/database **reads** above were performed against the existing completed run. No new database state was persisted. The new worker behavior, new summary type, manual scenario and selected-access CLI have not been deployed/run against a live collection. No real import, mobile/extension signing, enrollment, referral, commission claim or new prize claim was tested in this implementation. The new run IDs/schedule, exact fresh eligibility/funding review, hosted app/worker release, real wallet device and user-controlled execution remain explicit external acceptance steps.
