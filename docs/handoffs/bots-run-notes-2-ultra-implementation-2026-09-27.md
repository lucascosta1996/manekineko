# Bots notes 2 — U1–U6 implementation and verification

This report implements the scope assigned by [the attached Ultra handoff](bots-run-notes-2-astra-ultra-2026-09-27.md). The companion M1–M4 visual redesign is separate. Existing uncommitted recovery work is preserved. No deployment, hosted migration/configuration edit, new season, wallet export, transaction, fund movement or X post was performed.

## Current state, independently reconciled

The older paused-run notes describe historical observations. A new read-only audit on **2026-09-27 at 23:05 UTC** verified Sepolia block **11796506**, hash `0xbc3252922ece15f8b952d86adce3db925a1d7d8c22b410867a04bee722bd844c`, timestamp `1790550300`. The chain adapter matched both V10 executable runtimes against the pinned local compiler artifacts, verified the V5/V6 registry pins/lineage, read every award at that block, and rechecked the block hash afterward.

| Collection | Contract | Minted / circulating | Awards | Balance / protected / ordinary / growth available |
| --- | --- | --- | --- | --- |
| Lunar Stone | `0xaeCf42388f3Df8A92279d68065920745B73Ad728` | 1,000 / 1,000 | 6 / 6 paid; 6 ETH total | All 0 ETH |
| Satin Echo | `0x67b59F893C8de118b11F06689E174Cc744bfd612` | 1,000 / 1,000 | 6 / 6 paid; 6 ETH total | All 0 ETH |

Both contracts report `complete`, `revealed`, and `readyForNextRound`. Both have zero enrolled affiliates, zero accrued commissions and zero outstanding commission liability. The “4 of 4” observation cannot be associated with either current deployed award set; the software reads configured counts rather than hard-coding four or six. This audit confirms the two collection lifecycles are complete. It does not imply that the requested manual affiliate flow has been exercised.

Round runtime hashes at that block:

- Lunar Stone: `0xa5c785a97304edecce69ea63381e69725d33dd2ba4db36859f66f1b6a7dcd24a`.
- Satin Echo: `0xa5ef9beaa16dead1ef5a58aaf31109103ffe83bbccac574c169afaaff01f3039`.

The registered two-step runtime is now `completed`; its requested state remains `running` and its final recorded heartbeat was 22:36:32 UTC. Preserve that journal and the superseded ten-step run. The worker report below records the independent social-state audit.

## U1: lifecycle, counts and clocks

`packages/contracts/src/lifecycle.ts` defines `collectionLifecycle`, `seasonLifecycle`, `observedClock` and `FeaturedCollectionSummary`. Web adapters are in `apps/web/lib/seasons/model.ts` and `featured.ts`. Launch consumes the same lifecycle model for fresh canonical observations.

- A sequence is complete after each actual collection has finalized its draw or entered the unsold/refundable outcome. Outstanding prizes, commissions, social delivery and worker status remain separate facts.
- Unknown/stale/inconsistent observations return `unavailable`, null completion/payment counts and explicit last-observed feedback. Missing data is never a zero balance or a current mint clock.
- Feature precedence is a verified live mint, then a real published future opening, then the latest collection outcome. Processing copy appears only while draw processing is observed. Paid outcomes remove collection claim invitations; the global prize-discovery link remains available.
- Published run IDs define the actual sequence. The public schedule reader chooses the latest published run for each chain/season, leaving prior runs as private audit history. Color palettes no longer fabricate forthcoming collection/season cards. Airy Garden exposes two real collections.
- Cumulative `totalMinted` drives sold/remaining quantities. `totalSupply = totalMinted - refundedCount` describes circulating NFTs and does not restore primary-mint allowance.
- Browser time advances from a server time sample using monotonic elapsed time. Deployed countdowns additionally require a recent verified chain-block timestamp. Refresh, visibility/resume and online events resynchronize; a worker pause never changes immutable times. A published predeployment time is labeled a schedule.

**Migration 029** adds nullable `observed_block_at` to the canonical snapshot. The indexer writes that block timestamp atomically with block/hash/state; existing rows remain unknown until a real observation. Web reads `synced_at`, not the greatest of metadata/deployment edit timestamps. The reader tolerates the pending column through `to_jsonb`. The indexer's default reconciliation interval is now 120 seconds; explicit configured overrides still apply. Deploy migration 029 **before** the new Indexer; configure/review `INDEXER_RECONCILE_SECONDS=120` if the environment overrides the default. The Web/Landing update should be released together because the featured-summary API gained lifecycle and clock fields.

### Deployed authority audit

The audit covered the actual V10 round runtime/ABI, its ERC-721/Ownable2Step/ReentrancyGuard inheritance, the pinned Eligibility V5 and Winner Credits V6 code/lineage, renderer calls, and the actual VRF coordinator dependency. No round upgrade entry point, pause/unpause function or owner-controlled mint/claim suspension flag exists. Source inspection alone was not used as proof of deployed identity.

| Authority or dependency | Material reach |
| --- | --- |
| Round owner | One-way activation after immutable opening, registry admission and VRF subscription funding; protected-balance-limited proceeds/growth withdrawals; recovery of unused VRF funds only after entropy or unsold expiry; two-step ownership transfer. Cannot move frozen opening/deadline, choose winners, submit a holder's claim, or pause an activated sale. |
| Eligibility registry owner / admission signer | Append-only factory approval/collection registration and admission signatures can gate enrollment/initial activation. No unregistration/pause switch; existing registered collection and claim rights remain intact. |
| Winner Credits owner / sponsorship | Factory approval and sponsorship availability govern sponsored tickets. They do not freeze paid minting or prize claims. Prior lineage retirement and lifetime-use checks remain enforced. |
| Immutable round time/state | Start/deadline, sellout, quantity/recipient caps and valid unsold cancellation restrict minting. Refunds burn NFTs. These are contract rules, not a worker pause. |
| NFT transfer rules | Sellout-to-finalization and unpaid winning tickets are transfer-locked by existing V10 rules. Current holder alone can claim; paid holder/recipient history must not be reassigned after a later transfer. |
| Chainlink VRF | Subscription funding, proving-key availability, callback gas/configuration and oracle fulfillment are external dependencies. Coordinator ownership can deregister keys, change configuration and cancel subscriptions, including with pending requests. This can interrupt a pending draw even though Tincta has no pause switch. Once revealed, ordinary prize claims do not call the coordinator. |

The coordinator at `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B` has runtime hash `0x5e22d4163e7c1b059a946f0600759a4d38eb3e04592d0e359def022cec36bdbc` at the audit block; its public explorer bytecode exactly matched the RPC bytecode. [Blockscout's verified source](https://eth-sepolia.blockscout.com/address/0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B?tab=contract) identifies `VRFCoordinatorV2_5`, no proxy, and owner `0xB5a7310940D8F610782613cE0741c7bB3f1Ac5eA`. Its inherited `SubscriptionAPI.ownerCancelSubscription` explicitly allows cancellation with pending requests. No pause function exists in that coordinator ABI/source, but this is **not** a claim of authority-free liveness. A stronger dependency-independence requirement needs a prospective versioned randomness design and security review; a frontend edit cannot remove these deployed gates.

A credentialed Etherscan source request was rejected by automatic approval review. No Etherscan credential was transmitted in this work; public Blockscout source plus canonical RPC bytecode comparison completed the audit instead.

## U2 / U4: wallet, claims and referral journey

See [wallet implementation and verification](bots-run-notes-2-wallet-implementation.md). It covers provider/account selection, optional mobile sessions, explicit per-prize feedback, durable pending receipt recovery, indexing-lag overlays, verified referral attribution and canonical-event in-app notification.

Mobile sessions use Reown AppKit/WalletConnect while preserving injected EIP-6963 providers. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` and the intended origin's project configuration remain deployment prerequisites. Installing an SDK and mocked provider tests do not establish real MetaMask/Trust/mobile device behavior.

## U3 / U4: social delivery and manual next run

See [worker implementation and evidence](bots-run-notes-2-worker-implementation.md) and its concrete manual rehearsal run plan. Reservations prevent bots from consuming the manual buyer/affiliate actions and gas, or claiming/sweeping the selected actual post-VRF winner. The encrypted selected-role export is a separate explicit local action; it was tested only with synthetic keys.

Read-only event and exact X post verification distinguishes two cases:

- Lunar Stone draw: 00:54:36 UTC; primary results post confirmed 00:55:37, about 61 seconds later. Its prizes were paid much later at 17:21–17:29 UTC. Confirmed post: `2104012045137895565`.
- Satin Echo draw: 21:30:48 UTC; prizes paid 21:33–21:44 UTC; primary results post confirmed 21:49:00, about 18 minutes later. Confirmed post: `2104327470967083227`. Its root already said all prizes were claimed but retained a claim-link footer; the new copy fixes future all-paid delivery.
- The two-collection completion post `2104327574566412589` was confirmed 21:49:25 UTC. It correctly reported 2/2 collections, 2,000 NFTs and 12 ETH in prizes.
- The snapshot contained 33 confirmed posts and 24 failed supplemental replies. The 403 bodies report not-authorized-for-resource; they do not establish a billing cause. No unconfirmed image roots required migration. Confirmed payloads and IDs remain immutable.

The old runner ordered automated claims before results delivery; evolving payment state could repeatedly invalidate the root's pre-send check. New durable results intents are created before bot claims, payment summaries have distinct identities, and unsent payload revisions retain history. Failed supplemental delivery remains visible and does not suppress primary results or later authorized lifecycle work.

## U5 / U6: earnings and Launch synchronization

See [Launch implementation and verification](bots-run-notes-2-launch-implementation.md). Authenticated staging reproduction succeeded on the existing deployment: Sepolia returned three registered collections, Mainnet returned its legitimate empty result, and anonymous access returned 401. The reported hosted failure could not be reproduced.

The new source reader separately verified both Airy collections' current zero balances, historical 2 ETH ordinary withdrawals and 2 ETH growth withdrawals each. The older Cinder collection's initial historical event scan was unavailable independently of its verified zero current funds. After bounding event scans into provider-compatible chunks, the final reader check at block **11796558** verified accounting and withdrawal histories for all three registered collections. A separate transient RPC failure correctly returned partial availability rather than zero funds. Page navigation remains read-only, network URLs survive navigation/reload, late responses are discarded, and fresh chain lifecycle dominates prepared-artifact workflow state. Restricted read grants remain minimal.

## Verification boundaries and release dependencies

| Boundary | Evidence / pending work |
| --- | --- |
| Source/tests | See final totals below and the three scope reports. Solidity and deployed NFT SVGs are unchanged. |
| Local browser | Updated Web views inspected using read-only staging projections; actual two-collection sequence and honest stale feedback verified. SDK compatibility was exercised during local bundle checks. Mock wallet checks are documented separately. |
| Database persistence | Migration 029 and indexer canonical timestamp/reorg behavior tested against a disposable local PostgreSQL 16 container on port 54349. No hosted migration/grant/projection rewrite. |
| Hosted authenticated UI/API | Existing staging earnings page/API/login/logout and anonymous boundary verified. New source has not been deployed. |
| Real wallet/device behavior | Pending: installed extensions, QR/mobile deep links, canceled/expired real sessions, selected-role imports and manual on-chain enrollment/mint/claims. |
| Canonical chain | Both deployed V10 rounds, all twelve claims, current liabilities and dependency runtime checked at pinned blocks; exact block hashes are recorded above and in scope reports. |
| Confirmed X delivery | Existing post IDs/readbacks verified. New scheduling/idempotency behavior tested locally; no new post was sent. |

Release must apply migration 029 first, review indexer reconciliation frequency, deploy compatible Web/Landing/Launch/Indexer revisions, configure the intended WalletConnect project/origin if mobile sessions are wanted, then verify fresh hosted views. The separate manual sellout rehearsal still needs approved target IDs/dates, verified affiliate eligibility, role addresses, budgets and explicit live execution. The pre-existing three-mint/30-minute refund scenario remains separate. No key export or new live operation is implied by this implementation.

### Final local regression results

| Package / boundary | Result |
| --- | --- |
| Web | 279 tests passed, zero failures/skips, including all three database-gated cases against isolated PostgreSQL; typecheck and production build passed. |
| Launch | 218 tests passed, zero failures/skips against isolated PostgreSQL; typecheck and production build passed. |
| Indexer | 80 tests passed, zero failures/skips; migration 029 observation timestamp and canonical replacement behavior included; typecheck and production build passed. |
| Season worker | 161 tests passed in the standard 164-case suite; all three database-gated cases additionally passed in a separate 6/6 integration run, including restricted worker grants and atomic outbox history. Typecheck passed. |
| Landing | 15 tests passed; one unrelated newsletter database case skipped. Typecheck and production build passed. |

The first consolidated Web database run encountered sandbox `connect EPERM` on localhost. The same suite reran successfully with approved local-database access; it did not load hosted fixture destinations. Browser checks inspected the actual two-collection season, stale observations and the six paid Satin cards with payment links and no collection claim action. Separate simulated wallet checks exercised provider/account choice, wrong holder, rejection, one active prize, durable receipt recovery without resubmission and disconnection. The temporary browser fixture was removed. The selected-account export test used synthetic random wallets only.

The mobile bundle uses AppKit's Universal Adapter with the existing EIP-1193/ethers transaction path. The unnecessary ethers adapter was removed after its transitive optional payment modules caused a local bundle failure; the final production build checks the corrected dependency graph. No SDK adapter is allowed to replace the explicitly chosen injected provider.
