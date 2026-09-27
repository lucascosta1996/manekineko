# Airy Garden handoffs: implementation and recovery review

Implementation date: **2026-09-27 UTC**. Read the folder README first; source work then followed specs **01 → 06**, with integration corrections after the six scopes. This report distinguishes implemented source, local validation, dated live reads and pending operations. Existing unrelated worktree changes were preserved. Nothing was committed, pushed or deployed by this task.

## 01 — Public lifecycle and presentation

- Added shared lifecycle labels, a three-minute observation freshness check, distinct enrollment/mint clocks and reduced-motion-aware live/busy badges.
- Published future schedules survive stale readiness observations. A paused plan displays its fixed dates without an active countdown. Undeployed, deploying and awaiting activation remain different states; reaching a date does not assert activation.
- Sold-out collection pages foreground draw progress, immutable total prize amounts, ranked results and the prize/affiliate claim entry points. Draw stages show indexed request/fulfillment/finalization events and transaction links, where available; unknown events have no invented timestamp or ETA.
- Mint allowance copy is shorter, with the cumulative 20-mint explanation in expandable details. No purchase controls remain in the sold-out layout.
- Landing reads a narrow, uncached Web summary through its server route. It selects a freshly observed live mint, otherwise the next published running schedule, otherwise an explicit empty/unavailable state. Configure its existing `NEXT_PUBLIC_WEB_URL` for the intended Web origin when releasing; no hosted setting changed here.

Key files: `packages/contracts/src/lifecycle.{ts,css}`, Web `components/{announced-season,collection-activity,draw-progress,mint-experience}.tsx`, `lib/seasons/featured.ts`, `/api/seasons/featured`, Landing `components/live-collection.tsx` and `/api/live-collection`.

### Artwork inventory and boundary

| Surface | Treatment |
|---|---|
| Mint-page surrounding labels/captions | Shortened to “Illustrative artwork”; accessible text still distinguishes a sample from an assigned token. |
| Illustrative SVG shared by Web/Launch/Landing | `packages/contracts/src/tincta-artwork.ts` retains the actual V10 layout and embedded wording. |
| On-chain V10 SVG | `ManekinekoRendererV10.sol` embeds “COMBINATION CODE”, “PERMANENT EDITION” and “Numbers fixed at mint”. Its deployed bytecode and token metadata were not changed. |
| Historical V8/V9 and frozen exports | Preserved with their actual version and renderer. |

Removing embedded V10 wording prospectively requires a separately versioned renderer/round/deployer/factory artifact set, exact executable and immutable pins, updated local previews and new-deployment tests. It cannot remove words from Lunar Stone's existing immutable SVG. No prospective version number or new deployment was invented in this task.

## 02 — Affiliate enrollment and commission journey

- Availability now distinguishes scheduled, closed, full, enrolled, wallet-ineligible and temporarily unavailable states. Configuration failures are separate from genuine NFT eligibility failures.
- Server diagnostics contain only booleans for origin, signer match, bot secret/site, IP hashing and trusted proxy configuration. Public copy remains concise; keys and private configuration values never enter it.
- Enrollment opens at the published enrollment time and closes at the contract's mint opening. Signed challenge expiry is capped to the remaining enrollment/sale window. Existing origin, bot, nonce/replay and wallet/NFT checks remain in place.
- Historical eligible-NFT discovery, wallet selection, referral mints and explicit commission claims remain the genuine contract path; the rehearsal does not manufacture eligibility or bypass bot verification.

Read-only evidence: Lunar Stone belongs to Eligibility V5 sequence **2**, with `bootstrap=false` and `sourceOnly=false`. Being collection one of Airy Garden does not reset registry bootstrap. Its public affiliate endpoint returned a closed enrollment window and `nft_holder` eligibility. That current closed response cannot establish the cause of an earlier open-window configuration failure. The deployed enrollment signer matched the recorded signer and its database program was enabled; hosted bot/origin/proxy readiness during the earlier window remains unverified.

## 03 — Treasury and explorer verification

Creator earnings now reconcile actual ETH balance with ordinary withdrawals, remaining growth reserve, unpaid prizes, accrued/unclaimed affiliate rewards, unsold refund liabilities and other locked principal. Totals exclude failed reads and keep growth funds separate. All fields for a report use one canonical block, followed by a reorganization check.

The existing owner routes are `withdraw(recipient, amount)` for ordinary proceeds and `withdrawGrowthReserve(recipient, amount)` for released unallocated affiliate funds after reveal. Both require the actual owner; source verification is not a prerequisite for calling them with the correct ABI. A future larger prize requires a new reviewed collection configuration and separately authorized funding. Existing prize/affiliate entitlements never become operator revenue.

### Lunar Stone balance evidence

Read at **2026-09-27 01:49:31.942 UTC**, Sepolia block **11790154**, hash `0xf509e84f1ad511aa39deb9dab90aae8d743ef0dc7fc0f971b337246ffcee6808`:

| Category | ETH |
|---|---:|
| Actual collection balance / primary revenue | 10 / 10 |
| Unpaid prize liabilities: six awards, zero paid | 6 |
| Accrued, claimed or unpaid affiliate commissions | 0 |
| Remaining unallocated affiliate growth reserve | 2 |
| Ordinary withdrawable proceeds | 2 |
| Total owner-accessible amount after reveal | 4 |

Thus **10 = 6 + 2 + 2 ETH**. `withdrawableBalance()` excludes the separate growth reserve; the apparent missing 2 ETH is accounted for. No growth withdrawals were recorded. The owner was `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223`; runtime hash `0xa5c785a97304edecce69ea63381e69725d33dd2ba4db36859f66f1b6a7dcd24a`. These are dated observations, not a promise of the present balance.

### Verification implementation

The version-pinned factory creates full Round contracts through its RoundDeployer and shared Renderer; these are not described as minimal clones. Worker deployment now queues exact compiler standard-JSON input, compiler version, constructor encoding and contract path for its Factory, Renderer, RoundDeployer and Round. Existing deployment maintenance reconstructs and verifies saved constructor/runtime identities first. An existing factory is queued only if its original creation transaction is present in that journal; it never guesses the constructor owner.

Jobs persist pending/verified/failed state, immutable input fingerprints, GUID, attempt count and next retry. Source input is referenced by build-info ID plus SHA-256 rather than repeatedly copying compiler sources into encrypted worker state. Changed/missing input fails before submission. A saved GUID resumes polling. At most one bounded explorer operation occurs per normal tick, eight attempts are allowed, missing API keys defer for an hour, and explicit retry resets a rejected job. Explorer outages do not redeploy contracts. Explorer verification is observable but does not replace or weaken on-chain launch gates. The standalone historical deployment scripts retain their existing workflow; the automatic integration is in the season worker.

The read-only maintenance command reconstructed these jobs, all **pending, zero submissions**:

| Component | Address | Input fingerprint |
|---|---|---|
| Round | `0xaeCf42388f3Df8A92279d68065920745B73Ad728` | `8b57e5bf4249cee910cc25cc133cf38b06ed2f26a367a6ad7d4479a1df57ebc6` |
| Renderer | `0x89fD90dA28b05E149BD5196EE8187Ed178e9f3Bf` | `6505c5799f78d1a9e152fd8fef73379622f32800badc47c95408b288d7d3f876` |
| RoundDeployer | `0x47c493D70708260043A1C69E697Ac6f3bf8A6516` | `6ffc671f9ef645c91ef56e144d5714577f54fa554d6e79e1d112c555c4be4278` |

Anonymous Etherscan browser checks on September 27 showed **“Verify and Publish”** for all three addresses: source remains unverified. A credentialed API status lookup was rejected by automatic approval review because it would send the local API key to Etherscan without destination-specific approval; the anonymous pages supplied the status instead. No key was sent by that rejected lookup and no submission was attempted. Factory source status was not independently established here.

Read-only command (use the existing private environment files; keep their contents private):

```sh
npm run season:run:sepolia -- --run-id 257c7ab9-9e56-4daf-b5db-917a05d15d1c \
  --env-file /absolute/private/worker.env --verify-explorer
```

After explicit authorization to send compiler source/API credentials to Etherscan and persist maintenance state, adding `--execute` submits/polls the queue while the run remains paused. `--retry-verification ADDRESS` additionally retries one reviewed failed job. This mode has no chain-transaction or X-post capability. Preserve exact build-info files. API references: [source submission](https://docs.etherscan.io/api-reference/endpoint/verifysourcecode), [status polling](https://docs.etherscan.io/api-reference/endpoint/checkverifystatus).

## 04 — Wallet prize claim hub

- Added `/prizes` and navigation/results links. Discovery pages through indexed sold-out collections and checks current ownership against canonical, version-pinned contracts, so an indexed holder cache cannot grant a claim after transfer.
- Available claims, this wallet's payment history and already-paid winning collectibles have separate presentations. Historical claimant and recipient are checked against canonical payment receipts/logs; a later owner is not credited with an earlier payout.
- Each claim requires an explicit wallet action, fresh ownership/terms checks, the correct chain, contract simulation and the existing durable transaction journal/recovery path. There is no batch auto-signing or duplicate automatic retry.
- Pagination, partial RPC/indexing failures, stale observations, payment delays and history still indexing are explicit. Discovery is limited to indexed collections; it is not an assertion that an unindexed collection has no prize.

Local browser validation covered the disconnected entry page. Connected-wallet claims, account/chain changes, mobile layout and hosted payment history remain release checks; no real prize was claimed in this task.

## 05 — Launch operations and duration policy

- Added authenticated `/active-collection` and `/upcoming-collection` pages with explicit network selection, frozen run steps, indexed observation times, draw/claim state, scheduled enrollment/mint/deadline, verification status, errors and links to the exact season, public collection, explorer and canonical Treasury reader.
- Deployed collections remain in Active when minting has finished, including unpaid prizes. Upcoming keeps undeployed paused/missed schedules visible. Views show the latest 100 run steps and disclose truncation; standalone draft browsing remains in Seasons/Collections.
- Season deep links select the requested automation/network. Superseded run history is labeled and cannot be resumed when a newer run for that same network/season exists. The earlier catalog-order fix remains intact; it was not replaced or claimed as newly deployed.
- Newly editable ordinary windows default to **86,400 seconds** and validate **3,600–86,400 seconds** on create, edit, validation, new preparation and new mock import. Reading/exporting frozen historical terms retains their actual duration. For scheduled V7–V10 terms, deadline is scheduled `saleStartAt + duration`; older versions retain their original deployment-anchored interpretation.
- The narrow exception requires Sepolia, V10/`unique-rank-v6`, `sepoliaRehearsal: "refund-3-30m"`, exactly **1,800 seconds**, and supply above three. Mainnet rejects the marker and rehearsal options before private-service work; its entry point never loads the Sepolia wallet/scenario runtime. The shared validator only accepts the exception on chain 11155111.

Local authenticated browser checks confirmed paused deployed and undeployed collection cards, separate clocks, stale observation text, network controls and exact season selection. Hosted authenticated acceptance is pending deployment.

## 06 — Rehearsal scenarios and recovery integration

The private scenario file is validated against a strict field list, chain, collection UUID, outcome and the worker's exact spending/fee caps. Both scenarios require a **single collection** and the existing encrypted 50-wallet vault. Public manifest data is persisted with recipient bindings; signing keys remain encrypted. Adding/changing a scenario after recorded purchases is refused.

### Three tickets / 30-minute unsold scenario

Prepare a new Sepolia V10 draft with the existing 1,000-ticket supply, the exact refund marker above and a full independent enrollment/deployment lead. Run-day preparation budgets **three mint prices**, plus explicit VRF, sponsorship and gas allowances; its default opening leaves the complete enrollment window plus one hour for preparation. This does not start the 30-minute sale during deployment or enrollment.

Manifest shape (replace the collection ID and both cap placeholders with reviewed values; placeholders intentionally fail validation):

```json
{
  "kind": "refund-3-30m",
  "chainId": 11155111,
  "collectionId": "REVIEWED_COLLECTION_UUID",
  "mintTarget": 3,
  "durationSeconds": 1800,
  "expectedOutcome": "unsold/refundable",
  "maxTotalSpendWei": "REVIEWED_POSITIVE_INTEGER",
  "maxFeePerGasWei": "REVIEWED_POSITIVE_INTEGER"
}
```

The first three vault wallets each mint one NFT. Restart reconciliation first confirms the saved signed transaction. Canonical total supply and recipient primary counts must agree, never exceed three, and stop further purchases at three. After the actual deadline, the runner follows the existing unsold/refund transition, verifies no VRF/affiliate entitlement, reconciles all three refund receipts, total refunded value and burns, then records the terminal evidence. An unexpected purchaser, out-of-vault transfer or unjournaled burn fails closed. Unsold termination prevents later collection deployment. Local simulation does not establish a real 30-minute Sepolia result.

### Separate affiliate sellout scenario

Use another one-collection Sepolia V10 plan, ordinary 24-hour window, 1,000 tickets and the persistent 50-wallet vault. Its private manifest uses `kind: "affiliate-sellout"`, chain 11155111, the exact collection ID, `affiliateWallet`, actual enrolled `affiliateId`, `expectedOutcome: "soldout/commission-claimed"` and both reviewed spending caps.

The selected managed affiliate must first enroll through the real eligible-NFT/signature/bot flow during its enrollment window. The worker verifies that the on-chain slot belongs to that wallet before any purchases. Other managed buyers mint using that slot; the affiliate's own wallet uses direct minting. After sellout, accrued commission must be positive, equal the contract's equal share and fit within the pool/qualification cap. The actual affiliate signs its claim; claimed value must reconcile with accrual. This scenario cannot substitute for real enrollment acceptance. Winner prizes and optional owner/growth/unused-VRF recycling use their separate journaled paths. Lifetime sponsored-credit redemption remains a separate acceptance case.

Read-only preflight for either prepared scenario:

```sh
npm run season:run:sepolia -- --run-id REVIEWED_NEW_RUN_UUID \
  --env-file /absolute/private/worker.env --sepolia-rehearsal \
  --sepolia-scenario /absolute/private/scenario.json \
  --wallet-vault /absolute/private/existing-wallets.enc --once
```

The preflight reports the exact scenario, chain, collection and caps. **No new run or real scenario manifest was persisted on staging here.** New preparation/queueing and execution still require a reviewed run ID, future schedule, funding/caps, vault and destination-specific authorization; do not run placeholder commands with `--execute`.

### Existing Airy Garden incident: proposed recovery order

1. Keep active run `257c7ab9-9e56-4daf-b5db-917a05d15d1c` paused while reviewing. Preserve all 108 confirmed chain actions, 16 confirmed X actions, encrypted transaction journals and wallet vault. The superseded ten-step run `971a0f25-992c-4bde-ba50-c9afb9fe329d` is never a recovery target.
2. Release the reviewed Web/Launch/Landing/worker source through the normal explicitly approved application workflow; verify hosted enrollment diagnostics, claims discovery and authenticated operations output. No schema migration is introduced by these handoffs. Confirm existing restricted grants for all queried tables rather than granting broad access.
3. Refresh Lunar Stone's canonical/indexed projection and independently reconcile every original receipt before authorized claims. The audit found the public worker projection still `sold_out` at block 11789873 although the chain had revealed winners. The new worker publishes canonical observation before supplemental social replies. Six unpaid holder claims and optional operator withdrawals remain separate actions with explicit recipients/amounts; this task did not execute them.
4. Review the X 403 at `369e50fc-47f3-496f-938d-53e5ea0f9d02:winners-revealed:winner:1`. Preserve confirmed winner root `2104012045137895565` and results reply `2104012056181588393`. No Satin Echo post was attempted. Status alone does not establish permissions, billing or rate-limit cause; the reported “0.22 cents” and $15 balance have not been verified as billing units/current funds. New errors retain bounded numeric codes/known problem types, never raw bodies or credential-bearing details. Supplemental winner/recap replies stop at a failure and remain pending operator review; required launch roots retain their gates. Ambiguous delivery requires exact-post reconciliation, never blind reposting.
5. **Do not simply resume the old two-step schedule.** Satin Echo's frozen September 27 UTC times were announcement **01:08:24**, enrollment **01:23:24**, mint **01:38:24**, all missed. Leave those artifact dates intact. Proposed continuation: review a new standalone plan for the undeployed Satin Echo identity/colors/economics, with a new future clock and explicit 24-hour duration decision, using the verified predecessor/factory if its current terms permit. Verify that the new plan's step ID, collection ID and factory round provenance are unique/compatible before queueing. Preserve the original paused history and do not relabel a frozen export. This proposal has not been prepared, saved or executed.
6. Complete source verification as separately approved paused-run maintenance, then run the refund and affiliate scenarios independently with new plans, bounded caps and expected event checklists. Record collection/run IDs, canonical blocks, transaction hashes, refund/prize/commission receipts, verification GUID/status and confirmed post IDs in a sanitized run report. Do not include wallet keys, signatures, raw authenticated URLs or credential bodies.

## Validation and remaining acceptance

| Boundary | Result |
|---|---|
| Web tests, including isolated SQL | 266 passed, zero skipped. |
| Launch tests, including isolated SQL | 205 passed, zero skipped; offline launch preparation 4 passed. |
| Worker tests | 138 passed, zero skipped, with isolated SQL enabled and serial test-file execution. Refund restart, paid referral, enrolled-wallet claim and exact-input verification tests pass. |
| Landing tests | 13 passed; optional newsletter database test and optional setup database test skipped. Newsletter code was not changed. |
| Builds | Web, Launch and Landing production builds passed. Web/Launch were rebuilt after final presentation corrections; worker TypeScript checks passed. |
| Database writes | Disposable local Docker databases only, never staging fixtures. Local browser fixtures used a disabled fictional X profile and no real chain identity. |
| Browser | Desktop Web prize entry/sold-out results, Landing empty-state summary, authenticated local Launch active/upcoming/network/season selection verified. |
| Mobile | Unverified: the browser viewport API accepted 390 × 844, but both existing/new tabs still reported 1280 × 720. The temporary override was reset. Responsive CSS exists; this is not a mobile browser pass. |
| Chain | Dated read-only Lunar Stone accounting, registry identity and exact verification input reconstruction, as recorded above. |
| Hosted/new external writes | No deployment, migration, source submission, worker resume, schedule edit, X post, mint, claim, refund, withdrawal or secret change. |

Before release acceptance, verify connected-wallet transfer/account/chain/rejection/recovery cases, claim/payment history on the hosted site, real enrollment configuration during an open window, mobile layouts, live/upcoming Landing summaries, Etherscan completion, actual 30-minute expiry/refunds, qualified affiliate sellout/claim, sponsored-credit behavior and the explicitly approved incident recovery. These remain separate from source/test completion.

The existing 40 ms RPC limiter timing test failed once while full suites/builds ran concurrently, then passed in the complete serial worker run. Its production implementation and assertion were not weakened. Final logs are local QA artifacts under `/private/tmp/airy-*-tests.log` and `/private/tmp/airy-*-build.log`; they are not live-run receipts. `git diff --check` passed. Temporary preview servers and the explicitly disposable browser database were cleaned up after inspection.
