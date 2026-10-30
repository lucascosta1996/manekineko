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

Release `353b64e` is Ready on all five production aliases. Native Opera fixture checks at 390px and 1101px confirmed scrolling visibility, two simultaneous notices without overlap, independent dismissal and remount. Live Opera switched from Wallet 4 to the authorized secondary Wallet 0; the affiliate preflight passed, MetaMask showed Imported Account 5, and the user's claim paid 0.0004 ETH. The live page shows the claimed amount and bottom-left confirmation after scrolling. Its selector lists all four prepared collection names. Focused wallet tests: 35 passed. All three consuming app builds passed. The new automated scrolling, bounds, dismissal/remount and axe assertions remain subject to the running remote browser matrix; native fixture checks do not establish automated axe acceptance.

## Selection persistence follow-up

Navigating from the affiliate page to wallet activity revealed a separate defect: AppKit reconnect restored the extension's primary account and lost the secondary account chosen in Tincta. A tab-scoped preference now restores that explicit choice through AppKit only after comparing the connector, chain and entire ordered provider permission list. Account/network/disconnect events and explicit reconnect/switch actions clear the preference. Revoked permissions, a changed primary account, a stale asynchronous read and unavailable storage cannot authorize a signer. Existing identity invalidation and transaction checks remain in place. Sixteen focused wallet tests and the Web build passed; the complete Web suite passed 317 tests with three database skips. Native acceptance of this follow-up is pending deployment.

The `353b64e` GitHub Checks job passed, while all three visual jobs failed. Known stale assertions referenced the old numeric collection label, unformatted Genesis supply and an idle button name during loading. The notification axe test also left its clock paused. Those assertions are corrected; the eleven-route consistency case has a two-minute aggregate budget because CI reached its final route at the old one-minute cutoff. Screenshot differences and other remaining failures still require review; none is recorded as a passing gate.

## Native acceptance and visual CI follow-up · October 30

Release `f363d6c` is Ready on all five hosting projects, with their stable aliases matching the commit. Native Opera verifies the secondary-account selection across navigation and a full reload; changing the account directly in MetaMask clears that preference and updates Tincta. Wallet 0 shows its exact 0.0004 ETH affiliate payment and two Genesis NFTs. The six collection selectors show their onchain names. The gallery and wallet projection remain display evidence, separate from transaction authorization.

GitHub Checks `40939061430` passed. Visual run `40939061176` failed: Chromium had three screenshot mismatches; Firefox had two screenshot mismatches and four timing failures; WebKit had six screenshot mismatches and three timing failures. These are not passing gates. The reviewed component baselines from run `40930640127` now reflect the requested idle-button geometry, current footer copy, and the configured en-US native date input. WebKit's selected-option underline and four hero snapshots differed by only 3–5 raster pixels with unchanged layout; their actual images and diffs were reviewed. Eleven exact snapshots were updated, retaining the zero-different-pixel rule.

The mint-notification geometry/axe case now focuses its real link before resuming the clock, invoking the component's existing interaction pause instead of racing its eight-second dismissal. Separate tests still exercise expiry and deduplication. Hosted visual jobs use two concurrent browsers instead of three; the eleven-route audit and frame-by-frame animation case have explicit aggregate CPU budgets. Assertions, viewport coverage and the no-retry policy are unchanged. Source policy and visual TypeScript checks pass; the next remote matrix must be checked before claiming acceptance.

## Subsequent browser evidence · October 30

Visual run `40986581104` passed Chromium. WebKit passed all but its tooltip snapshot, whose underlying idle Save button still contained the historical check icon and reserved space. The actual image and 69-pixel diff were reviewed, and that final baseline is updated. Firefox had three failures: authenticated account navigation, the first dashboard contract read, and selecting the last item in a scrolling event popup. Their saved contexts show the account eventually loaded, the dashboard still loading, and the popup still open. The fixtures now retain login on a session GET, explicitly await return navigation, allow a bounded 30-second initial content read, and finish popup scrolling before its pointer sequence. No product claim or passing Firefox/WebKit gate follows from these edits; the next remote result remains required. The zero-pixel comparison, no-retry policy and responsive coverage are retained.
