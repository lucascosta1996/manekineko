# V17 rehearsal readiness report · October 29, 2026

Status: **deployed and source verified; live rehearsal started and waiting at the first manual Genesis mint; Mainnet not ready**.

The user requested a faster alternative to the V16 eleven-day schedule and can attend for up to half a day. The [accelerated workflow](v17-fast-rehearsal.md) specifies six live collections across two seasons, with the full 216-collection catalog tested separately locally. Historical V16 and its paused run remain intact.

## Live rehearsal observations

The user started the V17 run in Opera on October 29. Funding of 0.15 Sepolia ETH from the pinned source was confirmed through two independent RPCs: [receipt](https://sepolia.etherscan.io/tx/0xfac9c203ccd4d0d559c48f36fc6e43ae12e2c873e5276c0b61d69b9e9eb699bf). Both fresh manual accounts were imported by the user. The runner funded operating requirements, sealed the catalog, funded manual wallet 0 and stopped at `genesis:0:1`. Genesis is open, with zero manual mints at this checkpoint; the first paid ballot has not started.

The first real MetaMask rejection passed: the mint was not sent and the action became available again. The user identified a presentation defect: normal wallet confirmation also displayed receipt-recovery fields and an extra rejection action. The shared Web/Launch feedback now separates the active wallet prompt, submitted transaction and interrupted/restored request. Recovery fields remain available only for the latter, under a disclosure. Hosted acceptance of this fix is recorded with subsequent live observations. The contract and frozen runner/plan are unchanged.

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
| Live release | Exact source, immutable/profile/settings/catalog readback through independent RPCs | Passed through both RPCs; unsealed, zero mints/funding |
| Hosted application | Correct V17 pins, visible accelerated notice, desktop/mobile layouts, indexer catching up | Passed on hosted desktop/mobile Web and authenticated Launch; V17 gallery count/SVG are 20; all four indexer sources caught up |
| Human wallets | Real Genesis, affiliate, referral, prize, sponsored, refund and holder receipts plus observed UI behavior | Pending live checkpoints |
| Chainlink | Genuine request/fulfillment and actual fees for the four live sellouts | Local coordinator is mocked |
| Final reconciliation | Six actual outcomes, claims, bank/manual returns, gas, fees, dust and all liabilities | Produced during/after the live run |
| Production profile | Exact frozen real settings and production artifact qualification | Local semantic tests only |
| Mainnet deployability | Active code/initcode and transaction/block gas limits verified against the exact artifact | **Not qualified: runtime is 39,924 bytes, above the traditional 24,576-byte limit** |
| Security and operations | Independent review, unresolved defects closed, production infrastructure and wallet/device acceptance | Open |

No combination of local or compressed live passes proves universal correctness. Mainnet readiness must remain false while a material item above is open. Future `report.md`/`report.json` record actual evidence and failures; this preparation report is not a completed live audit.
