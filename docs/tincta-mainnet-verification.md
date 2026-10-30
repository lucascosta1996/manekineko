# Tincta Rewards · production verification

30 October 2026. This record covers the new production source and manual Launch deployment flow. **No Mainnet deployment, funding, signature or X post was submitted.** The owner still decides when to deploy.

## Contract evidence

- `TinctaRewards` deployed runtime: **24,244 bytes**. `TinctaEngine`: **16,342 bytes**. Both are below the active 24,576-byte limit. Root creation code: **42,046 bytes**, below the 49,152-byte limit; constructor arguments add 96 bytes.
- Strict local Mainnet model: Osaka rules, chain ID 1, no unlimited-contract-size override. Root plus immutable helper creation used **9,065,588 gas**.
- Two independent Mainnet RPCs returned **9,138,499 gas** for the same read-only deployment estimate at block **26,304,305**. This is below the 16,777,216 transaction limit. A funded dummy sender was supplied only through simulation state overrides. No transaction was signed or broadcast.
- The coordinator runtime hash agreed at both RPCs: `0xbe4ae0321fb1c74c80eea0c14c9c7b28c69ce17df15222e27b1e934cc98f5f61`. The reviewed `s_config()` output hash is `0x4e3cdf6ad87f7267b1eb632a35a6c6f8dcfa7f473c106c1984b6d4a4c938cf93`. The creation/preparation UI requires that fee/limit configuration until explicitly re-reviewed.
- **28 production lifecycle and adapter tests passed**: fixed packages and deadlines; Genesis mint caps, transfers and sellout ballot; rejecting recipients and reentrancy; vote snapshots and reuse; primary mint caps and sponsorship; permanent artwork and production gallery identity; all prize-count packages; affiliates with and without qualifiers; full refunds, late randomness, bucket reserve protection and holder claims.
- **Complete catalog model passed** with the approved production prices, supply and deadlines: **216 collections, 22 seasons, 172 sellouts, 44 unsold refund collections, 1,376 prize claims, 150 affiliate claims, 8,600 holder claims, 132 refunds and one lifetime sponsored redemption**. Residual accounting reconciled after every collection; final holder dust was zero. See [the machine-readable report](../output/tincta-mainnet-model/local-catalog.json).
- These lifecycle runs use a mocked coordinator and controlled local time. They do not represent 216 live Mainnet collections or a new real oracle fulfillment.
- `scripts/tincta/export.mjs --check` enforces source/ABI/bytecode parity, root/helper size limits, immutable placement and absence of prototype branding from the production compiler-input graph. Historical artifacts remain unchanged.

The active limits are defined by [EIP-170](https://eips.ethereum.org/EIPS/eip-170), [EIP-3860](https://eips.ethereum.org/EIPS/eip-3860) and [EIP-7825](https://eips.ethereum.org/EIPS/eip-7825). This release does not rely on a future Mainnet code-size increase.

## Application and data evidence

- Eight deployment tests passed: exact sender/nonce/calldata/value; independent network checks; fee/balance/gas/nonce gates; expired or changed reviews; changed oracle fees blocking new spending without blocking receipt recovery; exact receipt recovery; root/helper/config verification; pending, reverted and reorganized receipts; catalog order and resumable setup.
- Three production social tests passed: Mainnet-only copy, correct Genesis/72-hour timeout semantics, and independent network-specific RPC configuration. Existing sender tests cover durable intent, restart, uncertain POST reconciliation, order, leases and retries. Production X is not enabled.
- Isolated PostgreSQL migration and NFT mirror suite: **9 tests passed**, including Mainnet gallery separation, historical restrictions and disabled-by-default social registration. No fixture data was inserted into a hosted database. Migration 040 was then applied to the pinned hosted database at 09:19 UTC; it registered zero Mainnet mirror or social sources.
- Web regression suite: **317 passed, 3 environment-dependent skips**. Launch suite before the last admission guard: **217 passed, 7 environment-dependent skips**, plus five script tests. Final full checks and hosted results are recorded below when terminal. All five workspace type checks also passed after the final guards.
- Shared visual source contracts: 12 tests passed; source policy and visual TypeScript checks passed. The production-component fixture build passed. Opera inspection covered the disconnected page, approved package table, funding explanation and installed-wallet discovery; no real wallet transaction was requested.
- The landing status defect was fixed and published first in `7e5f8b08d5bcaba768191e2bcd771f3678908f14`. All five hosted projects were Ready and live Opera showed **Refunds available — Beryl Current** linking to collection 6. The parser now retains the query string rather than rejecting a valid absolute link. Its general Checks workflow passed. Its visual run had two animation-test timeouts: the downloaded WebKit trace spent over 110 seconds advancing frames before its final assertion, and Firefox spent over 11 seconds resolving a locator inside a 10-second poll. The final release keeps every assertion and increases those bounded test budgets; that correction still requires a passing remote rerun.

## Verification still in progress

The final application release, remote browser scenarios and read-only fork workflow must be checked at their exact source commit before being marked passed. Local native fork attempts encountered HTTP 403/502 and a transport timeout before reaching the coordinator; those are not passing fork evidence. The isolated contract model and direct RPC estimates above succeeded independently.

## After manual deployment

The actual constructor receipt, explorer source publication, deployed runtime pins, public Mainnet projection, intended Mainnet X account and Genesis opening still require real deployment evidence. WalletConnect and third-party wallet capability depend on the selected provider; no universal smart-account creation support is claimed. No independent audit or defect-free guarantee is implied. The prior live rehearsal's underfunded randomness and missed deadlines remain failed observations, not retroactive passes.
