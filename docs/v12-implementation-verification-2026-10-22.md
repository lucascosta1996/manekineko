# V12 implementation verification — 2026-10-22

**Subsequent interface replacement:** Launch and public route changes, shared signing safeguards, new testnet planning catalogs and their additional checks are recorded separately in [the operator interface handoff](v12-operator-interface-2026-10-22.md). The evidence below describes the earlier implementation checkpoint.

Local implementation of the [deadline-governance architecture](deadline-governance-v12.md). Existing deployed contracts and immutable historical exports were not changed. No deployment to a public network, database migration, X post, Git commit or push was performed.

## Implemented

- Immutable ordered catalog, permissionless preparation after reveal or unsold expiry, timestamp opening without owner activation.
- NFT ownership checkpoints and legacy escrow; bounded economic package voting with a 0.01 ETH price floor and 1,000-NFT supply floor, deterministic ties and no-vote fallback.
- Fixed 60/20/20 accounting, full unsold refunds, equal qualified affiliate sharing, separate division dust/no-qualifier reserve, capped operator withdrawals after reveal.
- Automatic sellout VRF request with permissionless retry only after a reverted request, no reroll, bounded permissionless finalization, current-holder claims and permanent metadata.
- Credits V8 compatibility and lifetime history, with committed V12 sponsorship locked until sale closure.
- Direct-chain `/vote`, `/collections` and `/operations`, plus public documentation. Once configured, `/mint` and primary collection/claim navigation use the new flow; historical results, NFTs and prize claims remain accessible.
- One-way finalized-state X observer and durable outbox, separate from all chain actions. Optional WebSocket block notifications plus HTTP polling in the browser.
- Offline catalog validation/upload calldata and an isolated local deployment script. Mainnet planning preserves all 22 seasons and 216 collection names, IDs, colors and order; saved plans are required for real preparation.

## Executed checks

| Check | Result |
| --- | --- |
| Full Hardhat contract suite | **424 passed**, including 16 V12 tests after the minimum-supply follow-up |
| V12 reader against deployed local contracts | Passed within the contract suite; rejects mismatched controller code |
| Web tests | **290 passed, 3 skipped** (293 total); skipped database-dependent checks were not represented as passed |
| Preparation/social unit tests | **6 passed**, including supply/price floors, proportional operator proceeds, complete 216-collection catalog preservation and network/order rejection |
| New V12 browser suite | **54 passed** across Chromium, Firefox and WebKit |
| Browser viewport coverage | 320, 390, 768, 1280 and 1440 px; no horizontal overflow; automated accessibility checks |
| Wallet browser coverage | Simulated explicit provider/account selection, ballot review and rejected signature; verifies no automatic retry |
| Resilience browser coverage | Failed deployment pin disables actions; fresh retry recovers; unconfigured deployment links to historical seasons |
| Production Web build | Passed |
| Contracts/Web/visual TypeScript checks | Passed |
| Social observer TypeScript check | Passed |
| Visual source checks | 10 tests plus JSX/dialog/CSS ownership/route inventory policy passed |
| Local deploy script | Passed against disposable Hardhat `hardhatMainnet` simulation, **chain ID 31337**, with mocked VRF and fictional collections |
| Whitespace diff check | Passed |

The browser cases use isolated deterministic RPC responses. They are not a real wallet transaction, real Chainlink callback, hosted deployment, independent audit or full historical screenshot-baseline run. Screenshots were captured in local ignored `test-results/`; desktop/mobile voting and operations captures were visually inspected. Existing contracts' regression tests passed; previously approved global screenshot baselines were not regenerated.

### Minimum supply and proportional operator allocation follow-up

The user fixed the minimum supply at 1,000 NFTs while retaining the elastic voted supply and 20% operator percentage. Solidity and offline preparation now reject supplies below 1,000 even at a higher mint price; supplies of 1,000, 1,001, 2,000 and 65,536 remain valid. Every live collection freezes its chosen supply. Test sellouts now perform actual paid mints of at least 1,000 NFTs across distinct recipients under the existing 20-primary-mint cap.

The added end-to-end local test votes for 2,000 NFTs at the unchanged 0.01 ETH price, completes the 20 ETH sellout and mock-VRF draw, rejects a withdrawal above 4 ETH, and withdraws exactly 4 ETH while preserving 12 ETH of prizes and 4 ETH of affiliate reserve. The 1,000-NFT case still pays 2 ETH ordinary operator proceeds, and unsold collections still protect full refunds. The ordinary 20% allocation logic was already proportional and remains unchanged.

The follow-up reran the full 424-test contract suite, 6 preparation/social tests, contract TypeScript checks, local deployment script, 10 visual source tests/policy and all 54 V12 browser cases after rebuilding their isolated fixture. Updated voting copy was visually inspected at 320 and 1440 px. New V12 ABI/source bundles were regenerated and checked; historical exports were preserved. Web's full production build and 290-test result above belong to the initial implementation, not a repeat of those checks during this follow-up. All follow-up execution remained local.

## EVM code size

All new contracts fit runtime (24,576 bytes) and initcode (49,152 bytes) limits. Exported source bundles preserve their actual compiler configuration and original V11 renderer dependency.

| Contract | Runtime bytes | Creation bytes before constructor arguments |
| --- | ---: | ---: |
| Round V12 | 22,090 | 25,768 |
| Round deployer V12 | 1,381 | 27,965 |
| Voting V12 | 8,831 | 9,066 |
| Season controller V12 | 9,446 | 35,165 |
| Winner Credits V8 | 13,035 | 14,029 |

## Launch work remains separate

Independent contract review, reviewed economic menus and operating budgets, preserved prior credit ancestry and retired old sponsorship destinations, public-chain deployment/source verification, canonical catalog upload/seal, public RPC/runtime pins, hosted-wallet acceptance, live Sepolia VRF/sellout/refund/affiliate/sponsorship rehearsal, and enabling the separate X service remain rollout work. There is no configured V12 Mainnet deployment from this implementation.
