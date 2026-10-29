# V17 rehearsal readiness report · October 29, 2026

Status: **first attempt paused after a missed first vote; refund UI correction published and checked in Opera; ten-minute retry verified and stopped; Mainnet not ready**.

The user requested a faster alternative to the V16 eleven-day schedule and can attend for up to half a day. The [accelerated workflow](v17-fast-rehearsal.md) specifies six live collections across two seasons, with the full 216-collection catalog tested separately locally. Historical V16 and its paused run remain intact.

## Live rehearsal observations

The user started the V17 run in Opera on October 29. Funding of 0.15 Sepolia ETH from the pinned source was confirmed through two independent RPCs: [receipt](https://sepolia.etherscan.io/tx/0xfac9c203ccd4d0d559c48f36fc6e43ae12e2c873e5276c0b61d69b9e9eb699bf). Both fresh manual accounts were imported by the user. The runner funded operating requirements and sealed the catalog. Each manual wallet confirmed two Genesis mints in MetaMask; both wallet limits were observed in Opera. Bot minting initially brought Genesis to 19/20 and held at `before-genesis-sellout`. After the user confirmed readiness, the run advanced to 20/20 and encountered the timing incident below. The original attempt is now paused with zero paid mints.

The first real MetaMask rejection passed: the mint was not sent and the action became available again. The user identified a presentation defect: normal wallet confirmation also displayed receipt-recovery fields and an extra rejection action. The shared Web/Launch feedback now separates the active wallet prompt, submitted transaction and interrupted/restored request. Recovery fields remain available only for the latter, under a disclosure. Hosted acceptance of this fix is recorded with subsequent live observations. The contract and frozen runner/plan are unchanged.

The user requested removal of the accelerated-test header sentence from Web and Launch. Launch's reported disconnected state was an explicitly selected Mainnet view (`chainId=1`); a bare dashboard already defaults to Sepolia and correctly reads 19/20 Genesis mints. The Mainnet empty state now names its network and offers a Sepolia status link. A separate presentation defect labeled the prepared first paid collection as current while Genesis was still minting. The operator summary and catalog now wait for the actual Genesis sellout marker before showing the paid ballot as current. These source corrections do not change network pins, contract behavior or the frozen runner; hosted acceptance is recorded after publication.

## First-ballot and refund UI incident

After the user confirmed readiness, the last Genesis mint opened the immutable 180-second ballot. Wallet 0 successfully enrolled as affiliate position 1 ([receipt](https://sepolia.etherscan.io/tx/0x8b20d276bfb3b6e726596bbe563d3a332e956308d85973d56e8e17aac53df755)). Guided enrollment and wallet confirmation left insufficient time for the vote. The ballot fell back to Option 1 rather than planned Option 3. The runner returned `ballot-result` and sent no paid mint. This is a failed manual timing test, not a completed six-scenario rehearsal. The user subsequently requested preparation for later without starting another deadline. Future deployment settings use ten-minute ballots; the old deployment and frozen records retain their actual 180 seconds.

The user then attempted a refund using NFT number 1. Two independent RPCs agreed at block 12018381: collection 1 had zero paid mints, zero revenue and zero refunds; paid token 131073 did not exist; Genesis token 1 belonged to Wallet 0. Wallet 0 had nonce 3 with no additional pending transaction, matching its two Genesis mints and affiliate enrollment. The refund failed during preflight without a broadcast or gas charge. The UI wrongly offered an action without a minted ticket and showed a generic error plus a production-only 72-hour sentence. Source now removes the empty-collection form, distinguishes free Genesis from paid tickets, validates minted serial/current ownership, handles burned NFTs separately from unavailable verification, and uses the onchain randomness deadline. Its actual V17 timeout is 900 seconds. Positive paid-ticket refund and wrong-holder/burned-token cases passed against the local V17 EVM; these do not constitute a live Sepolia refund test. Hosted acceptance of the correction is recorded below.

The correction is published at application commit `d89aaccf9c39ec29951afca58d556c4ba04301d0`. All five Vercel projects reached Ready with matching production aliases. Native Opera acceptance against the original contract at block 12018488 confirmed: no refund button or NFT input; “No ticket refunds to claim”; the free Genesis distinction; “No tickets minted” timing; no 72-hour text or stale generic error. Private incident, screenshot and acceptance records are retained with the original run. The eligibility defect was in shared application code and could have affected a future Mainnet deployment; the correction is not Sepolia-only.

Affected validation passed: Web 304 tests / 3 database skips; Launch 197 / 6 database skips; 12 UI source checks; Web and Launch typechecks/builds; four runner guards and runner typecheck. The actual local V17 EVM adapter test refunded a paid ticket and verified that the holder's balance increase plus transaction gas equals the full mint price, with wrong-holder and already-burned cases rejected. **A real paid-ticket refund has not yet been exercised on Sepolia.** GitHub Checks passed at this application commit; Visual UI contracts was cancelled and is not recorded as passing. The local browser suite was not rerun; user-facing acceptance used Opera only.

## Prepared retry, still stopped

The separate [ten-minute V17 contract](https://sepolia.etherscan.io/address/0xdb0A3f76DE225377B7B6D1b70C14F1A12aDbe480#code) was deployed at block 12018451 and its exact source published. Both RPCs verified the same V17 runtime, accelerated profile, 600-second ballots, three options and six catalog entries. It remains unsealed with zero Genesis mints and zero prepared collections. Deployment/catalog preparation did not open a ballot or paid mint window.

The new private runner is frozen and paused at `/Users/admin/.local/share/tincta/v17-ten-minute-rehearsal-2026-10-29/`. Read-only preflight passed. Runtime SHA-256 is `b9147cd9a61a818330ee03ca2ea131b1ca9c59ad7b79c70dec28b20c1b98bcca`; plan SHA-256 is `d84f85fce65ed87bd05c5556648e82b0e3c9b540181c60ef0da7b87788626742`. Its readiness instruction reads the frozen ballot duration. The original frozen attempt is preserved and remains paused.

The retry reuses the existing bank and eleven accounts, retaining human custody of Wallets 0 and 1. No new deposit or wallet import was requested. The original 0.15 ETH receipt is registered as existing funding evidence; count it **once across both attempts**, not as a second deposit. A two-RPC opening-balance snapshot at block 12018476 and private `carryover.json` preserve the handoff. The remaining recorded gas/VRF review allowance is 0.046240272731655316 ETH after the first attempt's 0.003759727268344684 ETH; source funding gas and deployment fees are separate recorded costs. Final recovery must combine both attempts and preserve both contracts' liabilities.

Hosted apps still point to the original attempt. Before a later start, switch and verify Web/Launch/indexer pins against the new release, then obtain the user's readiness before opening Genesis. **Do not resume either runner or start new deadlines now.**

## Confirmed local evidence

- The accelerated profile and Mainnet rejection tests pass. Production-mode V17 enforces the original minimums and constants.
- All 27 established production semantic cases pass against V17 with rehearsal disabled, including exact prizes for all three production packages, refund reserves, hostile receivers/reentrancy, snapshots, affiliate allocations and holder/sponsored limits.
- The full local catalog completed 216 collections / 22 seasons, 172 sellouts and 44 refunds. Every settled collection matched independently expected residual liabilities. Detailed machine evidence: [`local-catalog.json`](../output/v17-fast-rehearsal/local-catalog.json). Coordinator and elapsed time are simulated.
- The actual runner completed all six scenarios locally through signed EVM transactions, exact manual receipts, persistent custody, final accounting and recovery. Human signing was simulated locally; it does not prove an extension/device or Sepolia transaction.
- V17 Web/Launch signing and mirror adapters were exercised against actual local contract state, including burned metadata.
- Four runner guard tests cover plan separation/budget, encrypted fresh wallet custody, accounting tampering and concurrent funding/failure settlement.

Confirmed gates: **38 V17 EVM cases**, **4 runner guard cases**, **8 isolated PostgreSQL cases**, workspace typechecks and all five application builds. The final runner replay after parallel canonical-receipt verification also passed. Chromium at 1440/390 has three test packages, zero horizontal overflow, zero axe violations and an exact vote rejected by a simulated wallet. Production-size Genesis preview artwork is preserved; accelerated preview captions are checked against the actual V17 tokenURI. These browser and wallet simulations are local evidence.

Migration 037 was applied to staging after isolated SQL tests. Historical legacy collections/tokens and V16 projection counts/content hashes are unchanged; Web remains read-only and indexer privileges restricted. Exact source and six-entry deployment are [publicly recorded](../output/v17-fast-rehearsal/deployment.json). The release used two transactions, 68,664,153 gas and 1,369,049,732 wei of actual fees, separate from the future rehearsal budget.

The repository-wide test stage passed **569 contract cases**, Web **300 passing / 3 database skips**, Launch **197 passing / 6 database skips** plus **5 preparation cases**, indexer **73 passing / 9 database skips**, Credits **35**, Eligibility **11 / 1 skip**, and Landing **35 / 1 skip**, with one further database-gated suite skipped. The new four runner guards also pass and are included in the root test command. The aggregate check found a missing JSON import attribute in the shared preview helper during its typecheck stage; it was corrected and workspace typecheck/build stages were rerun. Hosted publication and genuine wallet/VRF tests remain separate.

## Defects found during preparation

1. Concurrent mint estimates could omit the final sellout/VRF branch. The runner now confirms the earlier chunks before estimating and submitting the final chunk.
2. Restarting after a refund could ask for ownership of a burned NFT. Confirmed canonical manual/bot receipts now prove a completed refund; unexpected ownership failures remain errors.
3. Previously accepted manual receipts were not rechecked on resume. V17 now verifies their successful receipt and canonical block ancestry again before continuing.
4. Shared V16 assumptions in supply, timeout, metadata version, catalog and gallery collection IDs required explicit V17 handling. Historical V16 behavior retains its own version and pins.
5. The accelerated Genesis preview and gallery initially retained the 1,000-supply caption. The shared preview now matches the actual deployment supply and has exact parity with V17 onchain SVG output; default production artwork is unchanged.
6. The NodeNext contract typecheck required an explicit JSON import attribute in that preview helper. It was added and the affected stages rerun.
7. Winning/refund accounts needed an explicit manual-gas reserve. The runner now refills accounts below 0.005 ETH to 0.01 ETH before a pending manual transaction. Its complete six-collection replay passed again. The final runtime was frozen while paused/unfunded, preserving all wallet identities and archiving the prior bundle.

These are preparation findings fixed locally. They are not incidents observed on live Sepolia.

The initial application commit `35ab3cc` reached Ready on all five Vercel projects with matching production aliases. Hosted Web and authenticated Launch were checked at 1440/390 against V17: zero Genesis mints, 0/6 prepared collections, two seasons and disabled minting. The V17 indexer source was caught up; one combined request returned 503 because another worker held the historical V16 lease, recorded as concurrency rather than hidden or removed. The gallery denominator and placeholder were then corrected to use each deployment’s supply. Final hosted acceptance at application commit `61cc4ec` verified the 0/20 gallery and decoded SVG caption as well as Web and authenticated Launch at both widths. A later authenticated indexer scan returned HTTP 200 with **all four sources caught up**; unauthenticated access returned 401. [Public hosted evidence](../output/v17-fast-rehearsal/hosted-verification.json). All five Vercel projects reached Ready at that application commit, with every production alias matching. GitHub Checks and Visual UI contracts were still in progress at verification; local passing checks and Vercel Ready do not substitute for those workflow results. The following publication adds only documentation and sanitized evidence.

## Required remaining evidence

| Area | Required evidence | Current boundary |
|---|---|---|
| Live release | Exact source, immutable/profile/settings/catalog readback through independent RPCs | Original release verified and used; separate ten-minute retry verified, unsealed and unstarted. |
| Hosted application | Correct V17 pins, actual supply/deadlines, desktop/mobile layouts, indexer catching up | Initial hosted acceptance passed on desktop/mobile Web and authenticated Launch; V17 gallery count/SVG are 20; all four indexer sources caught up. The initial notice was subsequently removed at the user's request; see live observations above. |
| Human wallets | Real Genesis, affiliate, referral, prize, sponsored, refund and holder receipts plus observed UI behavior | Original attempt: four manual Genesis mints, rejection and affiliate enrollment observed. First vote missed; paid referral, prize, sponsored, refund and holder checkpoints remain untested live. |
| Chainlink | Genuine request/fulfillment and actual fees for the four live sellouts | Local coordinator is mocked |
| Final reconciliation | Six actual outcomes, claims, bank/manual returns, gas, fees, dust and all liabilities | Produced during/after the live run |
| Production profile | Exact frozen real settings and production artifact qualification | Local semantic tests only |
| Mainnet deployability | Active code/initcode and transaction/block gas limits verified against the exact artifact | **Not qualified: runtime is 39,924 bytes, above the traditional 24,576-byte limit** |
| Security and operations | Independent review, unresolved defects closed, production infrastructure and wallet/device acceptance | Open |

No combination of local or compressed live passes proves universal correctness. Mainnet readiness must remain false while a material item above is open. Future `report.md`/`report.json` record actual evidence and failures; this preparation report is not a completed live audit.
