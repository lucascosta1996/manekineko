# Connected wallet activity and gallery acceptance

Scope: Web `/wallet`, collection galleries, claimed summaries on Rewards/Affiliates; shared V16/V17 read adapters; confirmed indexer projection. Contract behavior, NFT identity and frozen rehearsal runtime are unchanged.

The gallery threw while building explorer links because a legacy 65,536 token limit rejected global IDs such as 262159. Links now validate canonical uint256 decimal IDs. Existing data and artwork were present.

The wallet page uses the shared wallet session and UI controls. It separates prize/affiliate/holder/execution payments from refunded principal; displays exact gross ETH and receipt links; and lists current NFTs with pagination. Payment attribution follows the actual recipient, not today's NFT owner. Scope is visibly limited to the current verified deployment. Account, network and deployment changes hide previous results immediately. Loading, syncing, unavailable, confirmed empty and delayed updates have separate states. No signer or automatic claim is introduced.

| Evidence | Result |
|---|---|
| Isolated PostgreSQL/indexer suite | 95 tests pass, no skips; exact amounts, ownership transfers/burns, pagination, recipient/source isolation, duplicate replay, canonical rollback, reset and leases |
| Web tests | 309 pass, 3 existing database-dependent skips |
| Launch tests | 197 pass, 6 existing database-dependent skips; five preparation tests pass |
| Builds/types | Web, Launch and indexer production builds pass; all five workspace typechecks pass |
| UI source/harness | Source contracts and visual harness typecheck pass; new isolated wallet fixtures cover receipts, loading, failure/retry, account changes, unavailable and confirmed empty states |
| Staging persistence | Migration 038 and restricted runtime grants verified; existing gallery row counts/content hashes unchanged |
| Live projection | Active V17 caught up to block 12020564; six Wallet 2 NFTs, three prize payments (0.0006 ETH), one affiliate payment (0.000133333333333333 ETH) |
| Hosted/native Opera | Pending publication in this source snapshot |
| Automated visual CI | New tests authored; not executed locally because the user requested Opera only. Remote result must be checked separately |
| Accessibility/resilience | Semantic controls and financial state guards reviewed; browser axe, keyboard, reduced-motion and full responsive acceptance remain unverified until executed |

The new fixture routes are confined to the isolated visual app; production has no synthetic wallet or fixture API. This record does not certify all visual gates or Mainnet readiness.
