# V17 Sepolia rehearsal closeout · October 30, 2026

**Settlement is complete. The planned six-scenario rehearsal did not pass. Mainnet is not qualified.** Two collections completed real Chainlink draws; four planned scenarios failed or remained incomplete. Financial recovery is complete within the custody boundaries below, with an exact zero-wei accounting difference. No new wallet signatures are required to settle this deployment.

This closes the user's October 29–30 accelerated test and autonomous continuation. It does not certify 100% correctness, upgrade any deployed contract, or authorize a Mainnet launch. The session exceeded the promised timing; the short mint windows and foreground execution were not reliable enough. These operational failures are retained as failures.

## Live outcome

The active Sepolia contract is [`0xdb0A3f76DE225377B7B6D1b70C14F1A12aDbe480`](https://sepolia.etherscan.io/address/0xdb0A3f76DE225377B7B6D1b70C14F1A12aDbe480). Genesis minted all 20 NFTs. The six paid collections ended as follows:

| Collection | Planned exercise | Actual live result | Acceptance |
| --- | --- | --- | --- |
| Aster Atlas | Option 3: sell out 20 NFTs, draw 10 prizes | Sold out; oracle underfunded; randomness deadline expired; all 20 NFTs refunded | Failed draw; timeout refund verified |
| Aster Beacon | Fallback Option 1: 20 NFTs, six prizes, three qualified affiliates | Real VRF; all six prizes paid; equal affiliate payouts completed | Successful live draw and payments |
| Aster Current | Option 3: 20 NFTs, 10 prizes; sponsored mint | Mint deadline missed at 17/20; all 17 refunded, including the sponsored NFT | Failed sellout; sponsored redemption/refund verified |
| Beryl Atlas | Fallback Option 1: 20 NFTs, six prizes, one qualified affiliate | Real VRF; all six prizes paid; Wallet 0 received the entire 0.0004 ETH affiliate pool | Successful live draw and payments |
| Beryl Beacon | Option 2: 40 NFTs, four prizes, no qualified referrals | Mint deadline missed at 32/40; all 32 refunded | Failed sellout; no-referral draw distribution untested live |
| Beryl Current | Option 2: intentionally mint three NFTs, then refund them | Read transport failed before minting; collection expired with zero NFTs | Incomplete; an empty expiry does not test three refunds |

Totals: **12 paid prizes, 69 burned/refunded NFTs, and both season holder pools fully paid**. The paid prizes totaled 0.0024 ETH. Refund principal totaled 0.0101 ETH, including 0.0001 ETH from the sponsored NFT. Each season's holder claim paid 0.0002 ETH. Holder claims preserved the qualifying NFTs.

At the common audit anchor, block **12,023,585**, both independent RPCs agreed that the active contract and the earlier V17 contract had **zero ETH balances and zero accounted liabilities**. Every prepared paid collection's subscription was closed; execution and sponsorship reserves were zero. This is evidence about these deployments at that block, not a guarantee about other contracts or future funds sent to them.

## What went wrong

- **Aster Atlas oracle funding:** the initial 0.01 ETH subscription reserve was inadequate for the configured Chainlink lane. A late top-up mined at the immutable cutoff and reverted. This was not an intentional timeout exercise. The request was subsequently resolved and unused collateral recovered without reopening the draw. Later draws verified a reviewed 0.25 ETH reserve before minting.
- **Aster Current timing:** the paid mint, sponsored mint, verification and bot confirmations used the available window. The final mint deadline was 16:47:49 UTC on October 29. The unsold result and complete refund cleanup do not establish the intended ten-prize draw.
- **Beryl Beacon timing:** historical report generation and repeated checks consumed its three-minute mint window. The last eight-NFT transaction was signed but never broadcast. Both RPCs verified the absent hash and unchanged nonce before that candidate was retired. It incurred no gas. The original signed journal remains private and preserved. New execution writes the full report at checkpoints or completion instead of between timed waits.
- **Beryl Current transport:** the runner stopped on `ECONNRESET` at 19:31:15 UTC on October 29, before the 19:37:37–19:40:37 mint window. Resumption occurred after expiry. No NFT was minted. There is no evidence establishing machine sleep as the cause. New read transport retries only a bounded allowlist of idempotent RPC reads; submissions and signing requests are never automatically replayed. This fix has local regression evidence, not a fresh successful live six-collection run.
- **Smart-account prize claim:** one recorded Wallet 2 claim reverted inside the MetaMask EIP-7702 execution envelope. Trace evidence identified insufficient inner-call gas. The client stopped imposing a direct-call gas limit on wallet submission and retained exact intent verification. Subsequent claims succeeded. Failed-transaction gas is included in the accounting; a failed claim did not consume the prize.
- **Report completeness:** a terminal refund state alone was too weak to prove the intended refund scenario. New reports check original immutable terms, intended mint count, and every intended payout. An empty collection cannot pass the three-NFT case. Frozen reports are retained; this closeout explicitly corrects the coverage interpretation.

The remaining live gaps include successful four-prize and ten-prize draws, the no-qualified-affiliate successful-draw distribution, and the intended final three-NFT refund exercise. Local tests cover those branches, but the live rehearsal did not.

## Exact funding and recovery

Both deposits together supplied **0.36 Sepolia ETH**. The audit compares 327 receipts from two RPCs, deduplicates expenses, checks the common canonical balance anchor, and separates refundable oracle principal from actual oracle fees. Exact machine-readable evidence is in [the accounting supplement](reports/v17-closeout-accounting-2026-10-30.json).

| Allocation | Sepolia ETH |
| --- | ---: |
| Returned to the original funding account | 0.307800200290244037 |
| Remaining in the four imported wallets | 0.033630533247956503 |
| Small bot, bank and operator gas reserves | 0.000154999988856960 |
| Execution gas, including failed transactions and the earlier V17 attempt | 0.018357944109625912 |
| Actual Chainlink VRF charges | 0.000056322363316588 |
| **Total accounted** | **0.360000000000000000** |
| **Unexplained difference** | **0.000000000000000000** |

The original account also paid **0.000338400003588600 ETH** in gas for its two funding transfers. That expense was paid in addition to the 0.36 ETH delivered to the bank and is therefore outside the table's deposit equation. The operator's pre-existing balance was preserved and excluded from test funds.

Recovery destination: **`0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145`**.

| Transfer | Amount | Receipt |
| --- | ---: | --- |
| Rehearsal bank return | 0.293716043597691798 ETH | [Confirmed bank return](https://sepolia.etherscan.io/tx/0x08715aea022a7edc2e6b033976a8803d1139717c32288b07ced53c5228b16eb6) |
| Operator and earlier V17 reserve return | 0.014084156692552239 ETH | [Confirmed operator return](https://sepolia.etherscan.io/tx/0xc810feded940c1f8f4dd8ef669b8755ac3e422e709fcf8dda48644b4c3f1b2fc) |

The second transfer includes recovery from the original V17 contract [`0x39f625904CC50C08797e52b909EE51F6eB66d26E`](https://sepolia.etherscan.io/address/0x39f625904CC50C08797e52b909EE51F6eB66d26E): 0.0001 ETH execution reserve, 0.001 ETH sponsorship reserve and 0.01 ETH oracle reserve. Its frozen runner remains paused. V16 and its vault/pause marker were not resumed or modified.

Two successful Wallet 2 transactions were absent from the frozen runner's gas ledger: its [Aster Current vote](https://sepolia.etherscan.io/tx/0x642d0ea057ac58d3b86743853c754b703b41620083fd9d096df8d9acc3ea8f16) and [paid mint](https://sepolia.etherscan.io/tx/0xd8422ecbcc868b9b4eeb540de40466c32524a57282cb2a82493a3549410a96a8). Their canonical receipts add 386,769,003,867,690 and 1,132,822,511,328,225 wei of gas respectively. The vote was located by reconciling the wallet's transaction and authorization nonces. These are explicit supplements; the frozen ledger was not rewritten and neither expense is counted twice.

### Imported wallets and remaining ETH

These wallets remain under manual custody. Autonomous settlement did not sign from them or sweep them. Balances below are as of the audit block and exclude later transactions:

| Wallet / MetaMask label | Address | Remaining Sepolia ETH |
| --- | --- | ---: |
| Wallet 0 / Imported Account 5 | `0xd20d2De0f415ef35948699B6f663A9B6f827bA92` | 0.008511396480385066 |
| Wallet 1 / Imported Account 6 | `0xDADbF94Fde7ac02f229a27919c820e2BA39128D3` | 0.009859887995305472 |
| Wallet 2 / Imported Account 7 | `0x472E1F008DaDC5f8AC666Bf1699a8c5cB5bFc02c` | 0.005352480775198285 |
| Wallet 4 / Imported Account 8 | `0x4AB1023896b83974F3c2DC25445E07d61bc0C5BE` | 0.009906767997067680 |

When you want to consolidate these balances, use MetaMask in **Opera**, select **Sepolia**, select each listed account, and send **Max** to `0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145`. Review the network, source and destination before signing. The wallet must retain/pay the transfer fee; do not expect the full listed balance to arrive. Send to the original account, not the settled contract or rehearsal bank. Keep the wallet keys if you want to retain the NFTs. No prize/refund claim remains outstanding in these two test contracts.

## Wallet, affiliate and UI findings

Genesis supplies votes for the first paid ballot and affiliate eligibility across collections and seasons. Later ballots use snapshots of qualifying earlier paid collections; owning Genesis alone does not grant another ballot vote.

“19 primary mints remaining” was the wallet's remaining primary-mint allowance for that collection after one mint (the fixed cumulative cap is 20), not a count of affiliates. Under the tested rules, qualified affiliates share the collection's 20% pool equally after a successful draw. One paid referral qualifies an enrolled affiliate. Aster Beacon exercised three qualified affiliates; Beryl Atlas exercised one, so Wallet 0 received the full 0.0004 ETH pool. There is no unallocated balance held for absent affiliates in that one-affiliate case. A successful draw with no qualified affiliates allocates that portion according to the contract's treasury rule; this branch has local evidence, not successful live evidence from Beryl Beacon. Refunded collections do not pay an affiliate reward.

The following source fixes were published and exercised in native Opera during this session:

- Immediate action/loading feedback, bottom-left transaction notifications and wallet warnings, and correctly centered idle buttons without reserved spinner space.
- Wallet selection and network checks, including an authorized secondary account, navigation/reload persistence, and direct MetaMask account-change handling. Wallet 0's Beryl affiliate claim completed and displayed **Already claimed: 0.0004 ETH**.
- Removal of the requested accelerated header sentence and restoration of Genesis deployment/status in Launch.
- Refund preflight now hides the form for an empty collection, distinguishes Genesis from paid tickets, and checks minted serial and current ownership. The first refund complaint concerned paid NFT #1 in the earlier zero-mint deployment: it did not exist, so that attempt was rejected before broadcast and incurred no gas. The displayed timeout now comes from contract state; this rehearsal uses 15 minutes.
- Gallery links accepting the contract's full global token IDs; Aster Beacon's gallery loaded its 20 NFTs. The prior 65,536 limit was a client link-validation defect.
- Connected-wallet activity, gross claimed rewards and separate refunds, owned NFTs, canonical receipt links, and actual collection names in selectors. Wallet 1 showed one 0.0002 ETH prize, its 0.0001 ETH refund separately, and three current NFTs at the final inspection.

A final read-only Opera check of Wallet 2 showed 0.000933333333333333 ETH in rewards: three prizes totaling 0.0006 ETH, one 0.000133333333333333 ETH affiliate payment and one 0.0002 ETH holder payment. Its two refunds totaled 0.0002 ETH separately; six NFTs remain owned. Switching to Wallet 2 and back to Wallet 1 succeeded without signing. A later Launch reload required sign-in because its session had expired; it was not counted as a new authenticated dashboard acceptance.

Wallet activity is an indexed view and may lag the receipt. That delay is not evidence of a failed payment. MetaMask's transaction summary may omit an incoming contract payout; Tincta's review shows the exact gross claim, and the receipt/events establish payment. Gas can exceed these deliberately tiny test rewards. The page reports gross receipts rather than pretending gas-adjusted profit.

## X delivery

The authorized account was **@luckyOne9619**, with the Sepolia label and Tincta artwork. The final outbox contained **37 sent entries and zero pending, uncertain or in-flight intents**. API checks matched account ID, text and media for the recovered Beryl milestones. Beryl Atlas's [mint opening](https://x.com/luckyOne9619/status/2115867326327541865), [sellout](https://x.com/luckyOne9619/status/2115870600283746440), [results](https://x.com/luckyOne9619/status/2115870766550118754) and [paid prizes](https://x.com/luckyOne9619/status/2115876909632700463) were delivered. The final [Beryl season completion](https://x.com/luckyOne9619/status/2115978713544507806) was also delivered.

**Timeliness did not pass.** The finalized-chain head lagged live state by roughly 14–16 minutes during accelerated tests, and the stopped sender delayed the last collection's posts further. It correctly did not invent sold-out/winner posts for collections that refunded. Delivery after recovery is not proof of always-on operation. A supervised sender, restart/reconciliation checks and a timing policy suitable for the actual production windows remain required.

## Verification boundaries and release status

| Evidence | Result and limit |
| --- | --- |
| Live settlement | Two independent RPCs; exact funding reconciliation; zero contract liabilities; real receipts for all resulting payouts |
| Real randomness | Two successful six-prize draws; other planned prize counts remain unproven live |
| Local complete catalog | Separate 216-collection / 22-season local EVM exercise: 172 sellouts, 44 refund collections, 1,376 prizes, 132 refunds, 150 affiliate claims, 172 holder claims and one sponsored redemption; mock VRF, not 216 Sepolia collections |
| Local contract suite | Earlier full suite: 569 passing; subsequent focused V17 and both guided/autonomous local runner modes passed |
| Latest runner changes | 14 focused rehearsal tests plus both local EVM runner modes passed; V17 rehearsal TypeScript passed |
| Latest UI fixture changes | 12 source-policy tests and visual TypeScript passed; these do not establish browser acceptance |
| App suites | Web 317 passed / 3 existing DB skips; Launch 197 passed / 6 existing DB skips; isolated indexer 95 passed; no fixture seeding against staging |
| Native browser | Opera checks above, including real user-signed transactions; this is separate from remote browser automation |
| Hosted publication | Tested source `7cdcfac` reached Ready on all five projects, with stable aliases matching the commit. This closeout publication changes documentation and its PDF only |
| Remote CI | [Checks `41005791206`](https://github.com/lucascosta1996/manekineko/actions/runs/41005791206) passed on `7cdcfac48a28cad1b316d35e0df0106fb67cdf81`, including the dedicated V17 safety gate. [Visual `41005791163`](https://github.com/lucascosta1996/manekineko/actions/runs/41005791163) failed: Chromium 415 passed / 3 skipped; WebKit 293 passed / 125 skipped; Firefox 291 passed / 125 skipped / 2 failed |

The Firefox failures remain unresolved. One wallet-navigation test connected the fixture wallet but still showed “Loading collection details” when its ten-second mint-button wait expired. The animation case exceeded its 120-second aggregate budget while advancing its final simulated clock interval; earlier loop, visibility and motion assertions completed. Retained logs, page contexts and traces support these observations, but do not establish a single underlying cause. Neither failure is a passing gate. The 125 secondary-engine skips comprise 122 viewport samples and three live-server development cases; Chromium skips those same three development cases.

The [wallet activity acceptance record](design/wallet-activity-2026-10-30.md) preserves the complete CI history and terminal evidence. Full cross-browser acceptance is **not achieved**. Hosting readiness and native Opera checks remain separate evidence. No further blockchain actions were taken during report preparation.

## Before Mainnet

The production constructor profile fixes Genesis at 1,000 NFTs, requires at least 1,000 paid NFTs and 0.01 ETH per option, permits ballots from one hour to seven days and paid mint windows from one to 24 hours, requires 64–200 VRF confirmations, and uses a 72-hour randomness timeout plus a 0.01 ETH execution reserve. These are enforced bounds, not an approved final deployment configuration. The accelerated flag is rejected on Mainnet. See [the immutable profile specification](v17-fast-rehearsal.md#immutable-profiles) and the current contract constructor for the remaining constraints.

1. Run a clean live rehearsal that actually achieves every intended scenario, with a reliable executor and enough mint-window headroom for all receipts and verification. Keep historical failures intact.
2. Complete the missing live four- and ten-prize, no-referral successful-draw, and controlled three-NFT refund cases. Repeat the affected wallet and social flows after the fixes.
3. Establish a supervised worker/sender with restart, connection-loss and backlog recovery evidence. Do not depend on this interactive session remaining continuously active.
4. Obtain terminal passing required CI/browser gates and resolve any remaining failures, keeping local, hosted, simulated-wallet and real-wallet evidence distinct.
5. Review the exact production profile, deployment artifact, immutable terms, oracle funding/lane configuration and independent security findings. Verify the target network's active code-size and gas rules against the approximately 40 KB runtime before deployment; local unlimited-size EVM results do not qualify it.
6. Prepare a separate Mainnet release decision. Accelerated Sepolia settings must never be presented as production qualification.

The autonomous continuation's plan SHA-256 is `e4cdcc12dc16c62a673bf6467dbafb061d09cdbee4f3d1fcb1e7747c49a5bcde`; frozen runtime SHA-256 is `3a965f69803fdd6515e7768e942d7f40be3381e91953c7d6fd066a0f0c8d5b95`. Its final checkpoint is clear and completion flag is true, but execution acceptance remains false. Final review was performed by the agent under the user's delegation; it is not recorded as an additional human UI approval. Private vaults, signed journals and earlier frozen reports are retained locally and excluded from Git.

Operational credential note: a private RPC endpoint appeared in a diagnostic tool response in this chat. It was not committed to the repository or included in this report. Rotate that endpoint credential before another operational run; no evidence of external misuse was observed.
