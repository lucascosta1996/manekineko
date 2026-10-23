# V12 architecture review and social update

2026-10-22. Review of the **undeployed V12 source** and its direct-chain UI, preparation, executor and social tooling. This is an engineering review with regression tests, not an independent audit or certification of Mainnet safety. Existing deployed V8–V11 contracts, saved exports and sent X posts are unchanged.

## Subsequent remediation

The user accepted open NFT-based participation and the immutable 72-hour refund cutoff after reviewing their limitations. The [readiness follow-up](v12-mainnet-readiness-2026-10-22.md) adds complete deployment verification and separately bounded execution/recovery funding. It supersedes the reward-only executor limitations below. The original verification counts remain evidence for this earlier review, not the later changes.

## Conclusion

The architecture separates participant liabilities from operator proceeds and execution budgets, and removes discretionary cancellation of live collections. The review found additional authority and availability problems, fixed below. It also identified economic and oracle assumptions that cannot honestly be described as risk-free. **Mainnet is not qualified by this review.**

## Findings addressed locally

| Finding | Impact | Change and evidence |
| --- | --- | --- |
| High: Credits V8 accepted new owner-approved factories after launch | A malicious newly approved factory could attest fake winning collections, issue credits and consume sponsorship in a live official collection. It would not directly withdraw existing mint receipts, but it could take sponsored inventory away from legitimate winners. | `sealFactories()` irreversibly freezes the approved factory set; `sealCatalog()` requires this seal. Ownership transfer cannot reopen approvals. Regression tests reject post-seal approval and still advance/register the next legitimate collection. All intended factories must be reviewed and approved during setup; future controllers need a separately reviewed migration or prior approval. |
| Medium: the genesis affiliate exception was only a deployment convention | A migration declaring historical winners or a previous registry could incorrectly enable first-round enrollment without an NFT. | The controller rejects bootstrap mode with declared registry ancestry or a historical winner root. At catalog sealing it also requires an empty collection registry. This checks declared history, not the existence of unrelated contracts elsewhere on Ethereum; canonical migration review remains necessary. |
| Medium: permissionless finalization races stopped the executor watcher | Another caller could finalize after the snapshot but before gas simulation, causing the watcher to exit instead of following the next collection. Transport failures also stopped watch mode. | Recheck stage after a simulation revert; exit that attempt without signing if already finalized. Retry classified transport failures with bounded backoff through the same durable transaction journal. Pin, nonce, journal and unexplained revert errors still stop for inspection. Tests exercise a competing finalizer and same-hash recovery after an uncertain broadcast. |
| Medium: an unresolved X delivery did not block later queue entries | A subsequent invocation could publish later lifecycle events before resolving an earlier uncertain public write. | Block the entire publishing queue on `intent`/`uncertain`; retain exact original text/media for reconciliation. Pending entries can adopt updated templates; sent or uncertain entries cannot. Explicit API rejection stays pending; only ambiguous delivery or a crash requires reconciliation. Intent files and directory entries are flushed before public writes. |
| Low: lifecycle catch-up order and copy were misleading | Randomness/refund messages could precede the opening/sellout milestones, and sellout copy could suggest an already expired draw was still pending. | Chronological stage order, historical milestone wording, distinct refund reasons, and affiliate claims mentioned only after results finalize. Text validation covers the maximum onchain name length and both networks. |

Factory seals are **one-time setup transactions**, not extra signatures between collections. The operator's combined settlement transaction remains available. The 60/20/20 allocation, minimum 0.01 ETH price, minimum 1,000 supply, one-referral affiliate qualification, NFT snapshot voting, mint cap, claims and refund rules remain in place.

## Remaining assumptions and risks

1. **Oracle availability versus fairness is unresolved by a timeout.** Before entropy is recorded, withholding or prolonged censorship can cause the fixed 72-hour refund branch. The operator cannot selectively cancel or reroll, and recorded results never expire. Nevertheless, Chainlink explicitly cautions against discarding unfavorable randomness. The fixed cutoff needs independent review as an application policy; it cannot prove unbiased completion under oracle failure. See [Chainlink's VRF security guidance](https://docs.chain.link/vrf/v2-5/security) and the [existing policy analysis](v12-draw-failure-policy-2026-10-22.md).
2. **Funded execution is not guaranteed execution.** A transaction still needs inclusion. The separate 0.01 ETH reward may not cover finalization at high gas prices; `fundExecution` allows permissionless top-ups. The optional runner also needs a funded gas wallet, a working RPC, supervision and deployment. No independent public-chain runner is active as a result of this work. Concurrent callers can spend gas on a reverting transaction. Extremely rare rejected candidate batches retain a public progress path that the reward-seeking runner deliberately does not execute without an immediately payable reward.
3. **Open affiliates are wallet-based, not person-based.** Same-wallet self-referrals are blocked. One person can use several wallets and eligible NFTs, occupy multiple of the ten slots, and use another wallet for a qualifying paid referral. Snapshot NFT voting similarly permits concentration of voting power and borrowing across the snapshot. Preventing these requires changing the identity or economic policy; the requested rules were preserved.
4. **The operator's 20% is revenue, not guaranteed profit.** At minimum terms, a successful 10 ETH collection allocates 2 ETH ordinary operator proceeds. A failed/timeout collection allocates zero and refunds principal. VRF, sponsorship, preparation, executor rewards and transaction gas are separately funded costs. Zero-qualifier affiliate funds/dust remain a separately identified growth reserve, following existing policy; they are not reported as ordinary 20% earnings. Recovering pending VRF subscription funds can remain blocked by the coordinator even while participant refunds work.
5. **Deployment establishes a lasting trust boundary.** A controller runtime pin alone does not certify its bound deployer, stored creation code, Credits registry, historical factories or ancestry. Review and independently verify the complete dependency graph and exact constructor state before sealing. Approved historical factories must themselves be immutable and trustworthy. The new seal cannot repair a malicious factory approved during setup.
6. **Historical lifetime rewards require migration discipline.** The old registry cannot learn about redemptions in a future registry. Its funded mint destinations must be permanently retired, ancestry and canonical historical winner data independently verified, and duplicate redemption paths closed before activation. Merely withdrawing its current balance is insufficient if it can be funded and used again.
7. **Immutable authority has recovery costs.** The collection's operator address cannot be rotated by this protocol. Losing an EOA key can strand operator-only proceeds/recoveries. Choose a reviewed recoverable wallet/multisig before deployment if key recovery is required. Participant claims, refunds, finalization and next preparation remain permissionless under their onchain conditions. A receiver that rejects ETH can break the combined operator payout transaction; separate public finalization/preparation remain available.
8. **An unsold genesis has no successful NFTs for the following ballot.** The published fallback option keeps minting possible, but the first-collection no-NFT affiliate exemption does not repeat. A later collection may therefore have no eligible affiliates until a collection succeeds. This is existing policy, not a reason to silently relax eligibility after failure.

## Mainnet release gates still open

- Resolve the documented saved-catalog ID discrepancy/read-only database export failure before uploading/sealing migrated identities. The checked-in names/colors do not by themselves establish continuity with saved season plans.
- Independent contract and economic review, especially the fixed oracle cutoff, approved legacy dependencies, permanent-number/rank algorithm, snapshot voting and migration ancestry.
- Verify the entire deployed contract graph and chain-specific VRF settings. The pinned Ethereum coordinator and 200-gwei lane match the [official network reference](https://docs.chain.link/vrf/v2-5/supported-networks) checked during this review; live subscription funding and fulfillment are separate checks.
- Live Sepolia exercises: sellout/VRF/claims, unsold refunds, request failure, late callback/timeout, operator absence, competing executors, gas spikes, RPC outage, complete migration lifetime history, and X ambiguity/reconciliation.
- Verify hosted wallet transactions and deploy/supervise separately funded executors. A WebSocket or browser countdown does not execute a transaction.

## Twitter/X behavior and branding

V12 now generates an image alongside each lifecycle message using the existing canonical `season-social-image.ts` renderer. Mainnet uses the approved **Open artwork + Ligature TINCTA** signature; Sepolia retains its approved neutral signature and explicit **SEPOLIA TEST · TEST ETH** label. Season IDs, names, palette order and geometric motifs are preserved. No minted NFT image or historical post changes.

Nine stages are covered: prepared, voting opened, minting opened, sold out, randomness recorded, missing-randomness refunds, unsold refunds, finalized results, and all winning prizes claimed. Images describe milestones; links lead to current status. “All winning prizes claimed” does not imply affiliates have claimed. No voting preview economics are presented as final.

The observer reads finalized blocks, rejects a finalized snapshot older than one hour, checks the configured network/controller pin and round binding, and keeps per-network credentials/account verification. Publishing uploads a generated PNG, records its media identity, waits for successful processing, sets alt text, and rechecks canonical observations before the public POST. Reconciliation verifies the exact author, text and media. An explicit API rejection (for example 403/429) leaves the entry pending for a later corrected attempt. A crash or uncertain response requires reconciliation; this tool intentionally does not promise exactly-once delivery from X. Media-upload failures can leave an unused remote media object but do not publish a post or block the protocol.

Generate local, explicitly marked previews without RPC or credentials:

```sh
node --import tsx scripts/protocol-v12/preview-social.mts
```

Output: `output/social/v12/index.html`, with 18 SVG/PNG examples across the two networks. Previews are illustrative lifecycle states, not live announcements. No X write, public-chain transaction, database mutation, deployment or Git push was made during this review.

## Verification

See the final check record below. Earlier architecture records retain their own dated counts; those are not substitutes for the checks of this change. No Web/Launch page layout was changed in this review, so the previous browser suite is historical evidence only.

| Check run for this review | Result |
| --- | --- |
| Full Solidity suite (`npm run contracts:test`) | **442 passed**, including 34 V12 tests. Covers the new factory seal, ownership-transfer bypass, genesis history guards, continued catalog progression, competing finalizer, uncertain broadcast recovery, timeout/refund reserve boundaries and earlier protocol regressions. |
| V12 preparation/operator/executor/social tests (`npm run protocol:v12:test`) | **19 passed**. Includes network branding, 280-weight limits at maximum name length, stage ordering, immutable delivery evidence, queue blocking, explicit rejection versus ambiguous delivery, and retry classification. |
| Shared X client/social regression tests (`node --import tsx --test scripts/season-runner/social*.test.ts`) | **19 passed**; mocked requests, no live X delivery. |
| Contracts strict TypeScript and build | Passed. |
| V12 social/preview/executor TypeScript check | Passed. |
| Generated brand parity | **55 artifacts verified** against the approved source. |
| Offline visual generation | **18 SVG/PNG previews rendered**; representative Mainnet randomness-recorded/refund and Sepolia finalized-results PNGs visually inspected. This is static-image acceptance, not hosted browser/wallet verification. |
| ABI/source export and size checks | Updated only undeployed Controller V12 and Credits V8 exports. Controller runtime/initcode **11,649 / 37,649 bytes**; Credits **13,199 / 14,193 bytes**, within Ethereum limits. The unchanged Round V12 remains **24,500 bytes** runtime, only 76 bytes below EIP-170. Future round edits must keep the size gate. |
| Whitespace validation | `git diff --check` passed. |

Local diagnostic logs are `/tmp/tincta-security-final-contracts.log`, `/tmp/tincta-security-protocol.log`, `/tmp/tincta-security-social-shared.log`, `/tmp/tincta-security-contract-types.log`, `/tmp/tincta-security-tools-types.log`, `/tmp/tincta-security-brand.log`, `/tmp/tincta-security-exports.log`, and `/tmp/tincta-security-previews.log`. These temporary logs are not deployment evidence.
