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
| Hosted/native Opera | Release `42832c2` Ready on all five projects with matching production aliases; Opera shows the 20-NFT Aster Beacon gallery and Wallet 2’s exact totals and six holdings. Two RPCs independently confirm all six current owners. Opera responsive previews at 390 and 1101 CSS pixels show full amounts and address without clipping; account-switch browser checks remain pending |
| Automated visual CI | New tests authored; not executed locally because the user requested Opera only. Remote result must be checked separately |
| Accessibility/resilience | Semantic controls and financial state guards reviewed; browser axe, keyboard, reduced-motion and full responsive acceptance remain unverified until executed |

The new fixture routes are confined to the isolated visual app; production has no synthetic wallet or fixture API. This record does not certify all visual gates or Mainnet readiness.

## Idle button alignment follow-up

The participant found that `busyLabel` reserved an empty leading icon even while idle, shifting button text. The shared content now renders an icon slot only for an actual icon or active spinner. Idle button labels are centered with symmetrical width reservation; inline text actions leave no phantom slot. Pending widths and duplicate-action guards are preserved. The existing component geometry test now also asserts centered idle text and absence of an empty icon slot. UI source/type checks and all five production builds pass; release `dc88b25` is Ready on all five production aliases. Native Opera verifies centered idle text at 390 and 1101 CSS pixels, and refresh returns successfully. The loading frame completed too quickly to capture in that live check; the automated geometry assertion is authored and typechecked, with remote CI still pending. The full contract suite also completed with 569 passing cases; this UI change does not alter contracts.

## Wallet switching, notification stack and collection labels

The SDK bridge now pins the selected authorized account and the provider's full ordered account list. Selecting a secondary authorized account no longer produces a permanent updating error. Account/chain/disconnect events still revoke old signers, and permissions are rechecked before signing. The header's inline error has been replaced by the shared dismissible bottom-left notice. A single portal viewport stacks wallet and transaction feedback without overlap. Collection selectors read all prepared collection names from the pinned onchain catalog.

Native Opera desktop fixture checks confirmed scrolling visibility, two simultaneous notices and independent dismissal. The regression suite adds 390px/1101px scrolling, bounds, dismissal/remount and accessibility assertions; these new browser assertions have not yet run remotely. Focused wallet tests: 35 passed. All three consuming app builds passed. Hosted wallet switching still requires verification after publication.
