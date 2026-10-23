# V12 material-risk remediation and release evidence

2026-10-22. **Status: locally hardened and tested; Mainnet launch remains blocked.** This record covers undeployed V12 source and operational tooling. It is not an independent audit, public deployment or certification. The earlier [architecture review](v12-architecture-security-review-2026-10-22.md) supplies the original findings.

## Decisions confirmed by the user

- Keep open NFT-based participation. An eligible NFT can supply snapshot voting power once; affiliate eligibility cannot be reused by transferring the same source NFT. One wallet cannot enroll twice or qualify through same-wallet self-referrals. Multiple wallets can still belong to one person; the system does not claim one-person enforcement. No identity credential or admission authority was added.
- Keep the immutable full-refund cutoff at `soldOutAt + 72 hours` if no randomness was recorded. The user accepted the oracle-withholding/censorship tradeoff. Accepted requests cannot be replaced, funding/retries cannot extend the cutoff, and on-time recorded results cannot expire. Independent review must assess this selected policy; it is no longer an unresolved policy choice.
- Preserve the 60% winning NFTs / 20% qualified affiliates / 20% ordinary operator proceeds allocation, minimum 0.01 ETH price, minimum 1,000 supply, snapshot voting, claim rights, enrollment and one-referral qualification. Failed collections refund full mint principal and yield zero ordinary operator proceeds. The 20% is gross revenue before operating costs.

## Controls implemented

### Complete deployment verification

`scripts/protocol-v12/verify-deployment.mts` checks the actual controller, voting contract, renderer, Credits V8 registry, round deployer, both stored creation-code contracts and every prepared round against compiled artifacts. It compares executable runtime **and every immutable value**, including private deployer lengths without public getters. Matching only the controller's hash is insufficient.

It also verifies the fixed operator, registry owner, irreversibly sealed factory set, the sole approved controller's exact code hash, registry creation receipt, all catalog identities/order, every economic option, prepared ballots, protected balances, separately committed execution/sponsorship funding, subscription ownership/consumer and pre-request VRF funding. Missing expected catalog/economic fields fail verification. Public-network coordinator/lane and confirmation/callback limits are checked even before the first round is prepared.

The CLI requires two RPC endpoints on distinct hosts and agreement at one fresh finalized block. Reports bind the compiled build, expected deployment, catalog, dependency addresses/code hashes and block hash. The report says `verified`; it does **not** say audited or Mainnet-ready. Different hostnames are a configuration check: operators must actually choose independently operated providers.

This verifier deliberately supports **fresh genesis only**. It rejects nonzero historical roots, previous registries or imported voting sources. A migration must separately prove permanent retirement of earlier redemption destinations and complete lifetime history; a fresh empty registry cannot be used to bypass that work. The intended new Mainnet launch has no configured historical deployment, but that assumption must be checked against the canonical deployment inventory before signing.

```sh
npm run protocol:v12:verify -- /private/deployment-expectation.json /private/verification.json
```

Set `V12_VERIFY_RPC_URL` and `V12_VERIFY_SECONDARY_RPC_URL` privately. The expected manifest is the `DeploymentExpectation` type in the verifier: explicit chain/controller/runtime pin, operator, Credits address and creation transaction, zero genesis ancestry/root, all deployment settings, complete catalog and exact integer-string economic options. Derive these from reviewed deployment receipts and the reconciled catalog; do not fabricate addresses or copy a test manifest. Reports use exclusive creation and never overwrite existing evidence.

### Funded recovery without operator authority

The executor can now fund a VRF shortfall up to its explicit target, retry a request that was never accepted, advance rare rejected draw batches, and finalize even when gas exceeds the 0.01 ETH reward. It can submit only `fundRandomness`, `requestRandomness` or `finalizeDrawAndClaim` to controller-bound rounds. Its gas key cannot withdraw the operator's 20%, take participant reserves, change terms or reroll an accepted request.

Each round has a reviewed maximum subsidy. Before signing or rebroadcasting, the runner requires:

`maximum gas charge + ETH top-up <= subsidy ceiling - recorded net expenditure`

The estimate includes a 20% gas margin, a maximum gas limit and a fee ceiling. A prospective reward never makes an unaffordable transaction pass: a competing finalizer might receive it instead. Only an actual reward in a canonical finalized receipt reduces recorded expenditure. Successful VRF top-up value and all transaction gas, including reverted transaction gas, count against the ledger.

A flushed private intent precedes broadcast. Uncertain submission reuses the same signed transaction/hash, not a new nonce. Receipt accounting is idempotent across crashes, and the intent is retained until its receipt is canonical and finalized. Network faults rotate configured RPCs with bounded backoff. Binding, nonce and journal failures stop execution. Fee/subsidy exhaustion is a visible status and never authorizes spending participant funds.

Signing startup requires a reviewed deployment manifest, two independent RPC checks, a pinned dedicated wallet distinct from the operator, positive recovery budget/VRF target and initial gas funding. A service template is included at `scripts/protocol-v12/ops/tincta-executor@.service`; it has not been installed or started.

Illustrative private config shape, **not an approved spending budget or gas estimate**:

```json
{
  "chainId": 11155111,
  "controller": "<verified controller address>",
  "codeHash": "<verified runtime hash>",
  "wallet": "<dedicated gas wallet address>",
  "expectationFile": "/etc/tincta/sepolia-deployment.json",
  "rpcUrls": ["<private HTTPS provider A>", "<private HTTPS provider B>"],
  "maxFeeGwei": "50",
  "maxGasLimit": 2000000,
  "maxSubsidyEthPerRound": "0.25",
  "vrfFundingTargetEth": "0.05"
}
```

Use `TINCTA_EXECUTOR_PRIVATE_KEY` in the protected service environment, never source control. Compile reviewed artifacts before installing the read-only application directory. Each instance needs its own dedicated wallet, durable private state directory and host/provider arrangement. Back up the intent and ledger together; deleting a ledger loses its spending history. The cap is enforced by this runner, not an onchain restriction on a compromised key, so limit each wallet's funded balance as well.

The process preserves pending transactions rather than inventing replacements. If fees prevent inclusion, a different executor can still act; the affected wallet's nonce must be reconciled before reuse. Never automatically remove a lock after a crash. Configure independent health/funding alerts and exercise recovery before activation. There is no promise of inclusion under indefinite censorship, exhausted budgets or gas above the reviewed ceiling.

The operator's normal combined settlement remains one signature between successful collections: finalize if needed, withdraw the remaining ordinary 20%, and prepare the next ballot, with the exact operating top-up if needed. An independent finalizer does not take those proceeds. Setup, optional fund recovery, wallet recovery and exceptional operational maintenance are separate actions.

## Verification performed for this change

| Check | Evidence |
| --- | --- |
| Full Solidity suite | **445 passed**, including **37 V12 tests**. |
| V12 tooling tests | **21 passed**. |
| Contracts strict TypeScript/build | Passed. |
| Executor/verifier TypeScript | Passed. |
| Focused deployment rejection tests | Altered voting/round code, stored creation code, private immutable lengths, incomplete economic manifests and incorrect catalog identities fail. |
| Recovery and accounting tests | Failed requests, bounded VRF funding before/after request acceptance, unchanged request/cutoff, rare progress batches, exhausted budget, unearned reward, competing finalizer, uncertain broadcast, lagging finality and crash-idempotent accounting pass. |
| Protocol reserves | Tests preserve full refund principal and ordinary operator proceeds during executor funding/progress. Existing 60/20/20, voting, affiliate and claim regressions pass. |
| Contract size | Solidity unchanged by this follow-up. Round V12 remains 24,500 runtime bytes, 76 bytes below EIP-170. Existing runtime/initcode assertions pass. |
| Whitespace | `git diff --check` passed. |

Diagnostic logs: `/tmp/tincta-readiness-all-contracts-final.log`, `/tmp/tincta-readiness-contracts-v3.log`, `/tmp/tincta-readiness-tooling-v3.log`, `/tmp/tincta-readiness-contract-types-final.log`, `/tmp/tincta-readiness-tools-types-final.log`. They are local test evidence. No UI changed in this follow-up; earlier browser/wallet-fixture results are not new hosted verification.

A read-only Sepolia check reached chain 11155111 at block **11969739**, hash `0x6cc3e3c189f9f5159bc5cb49147fa517267568b662a34907d89fe0b7551ed923`. The coordinator at `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B` had code hash `0x5e22d4163e7c1b059a946f0600759a4d38eb3e04592d0e359def022cec36bdbc`. This proves read availability at that block, **not V12 deployment, VRF delivery or a rehearsal**. No V12 public deployment was found in this task's configuration.

## Remaining launch gates and concrete blockers

1. **Saved catalog reconciliation:** the read-only saved-plan query failed with SQLSTATE `53000`; the provider response identified an exceeded quota/resource limit. Existing names/colors and locally generated IDs do not prove saved-plan continuity. Restore database capacity, then compare the complete saved Mainnet/Sepolia identities before approving any replacement/export/seal. The export script preserves existing files and now reports this resource failure clearly. No database data or billing setting was changed.
2. **Independent review:** deliver the source packet described below for contract/economic review. Review the fixed oracle cutoff, snapshot/affiliate concentration, ranking/permanent identities, accounting, callback behavior, deployment graph and executor threat model. No independent auditor report exists from this work. Resolve findings and bind sign-off to the reviewed source/build hashes.
3. **Public V12 Sepolia rehearsal:** deploy the reviewed fictional catalog, verify the full graph, fund dedicated execution wallets and exercise genuine VRF fulfillment, claims, unsold/72-hour refunds, rollover and operator absence. Exercise request failure, late delivery, RPC/fee faults and competing workers in controlled local tests and suitable public-network scenarios; do not pretend to control the real oracle or induce an outage. The existing mocks cannot establish live proof verification or service availability.
4. **Production operation and wallets:** select and verify the immutable operator wallet, including receive-ETH and combined-call behavior. If key recovery is required, choose a reviewed recoverable smart wallet before deployment; this protocol cannot rotate a lost EOA key. Activate funded independent executors, supervision and hosted connected-wallet checks. Verify Mainnet dependencies and actual constructor state, then obtain deployment approval for that concrete manifest/budget.

The two accepted policy tradeoffs remain disclosed assumptions; these four launch gates require evidence, not wording changes. Nothing in this follow-up deployed contracts/apps, signed a public-chain transaction, sent X posts, changed a database or pushed Git.

## Independent review packet

Generate an immutable source snapshot with:

```sh
npm run protocol:v12:audit-bundle -- /absolute/new-output-directory
```

The allowlist contains the six compiled protocol/dependency artifacts, exact Solidity standard-JSON inputs with transitive source dependencies/compiler settings, policy source, relevant tests/tooling and these review records. `manifest.json` hashes every included file with SHA-256. It excludes credentials, private journals, environment files, DB exports and deployment keys. The packet is review input; tests run in the matching repository checkout, and the packet itself is not an audit result.

Prepared packet: [v12-audit-2026-10-22.zip](../output/security/v12-audit-2026-10-22.zip). Source folder: `output/security/v12-audit-2026-10-22/`.

## Two-season rehearsal tooling follow-up

The user selected **15-minute votes and 15-minute mint windows** for the accelerated Sepolia rehearsal. [The runbook](v12-two-season-rehearsal.md) contains the exact commands, private configuration, funding requirements, UI connection, recovery procedures and remaining user-owned gates. The first two fictional catalog seasons are covered in full (20 collections): 18 sellouts plus two unsold-refund outcomes. Real network execution waits for real VRF with 64 confirmations and retains the 72-hour missing-randomness cutoff. Production Solidity timing and existing deployments are unchanged.

The new self-contained runtime bundles its dependencies and plan, verifies file hashes, and stores encrypted wallets and durable transaction intents outside UI processes. UI edits/rebuilds can continue while it runs. The full-graph verifier accepts an explicitly supplied compiled-artifact loader for the accelerated runner; its normal CLI still uses production artifacts.

Local checks: **445 existing contract tests**, **2 new rehearsal tests**, **25 V12 tooling tests** and **18 durable transaction-pipeline tests** passed, along with strict TypeScript checks and a standalone offline bundle smoke test. The full local engine run traversed both seasons, checked exact operator withdrawals, participant liabilities, refunds, sponsorship and restart recovery. Its local mock VRF and advanced clock are not public rehearsal evidence. The Mainnet guard was also checked with otherwise valid dependencies. The prior audit packet remains unchanged; the packet generator now includes this rehearsal tooling and its supporting transaction journal sources in new review packets.

No public V12 deployment/run, database repair, external audit, production key selection, service installation or hosted UI verification was performed. The release gates above remain open.
