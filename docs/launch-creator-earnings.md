# Launch creator earnings and sponsored budget

Implemented and deployed to the existing Launch staging project on 2026-09-26. This release does not fund sponsorship, edit saved hosted drafts, or move ETH.

## Sponsored mint standard

New collection/season forms and explicit funding setup start with **2 ETH**. The form persists the value as `winnerCreditSponsorshipWei` through the existing revisioned configuration/season workflow. Saved amounts and finalized exports retain their exact values; editable funding sections offer **Use standard 2 ETH budget** for deliberate updates.

At 0.01 ETH per ticket, 2 ETH covers up to 200 sponsored NFTs, subject to remaining supply. Saving the budget does not fund the registry. Credit eligibility, lifetime-use checks, recipient mint caps, open sales, remaining tickets and actual registry funding still govern redemption. A finite budget cannot promise unlimited availability.

## Creator earnings

Authenticated `/earnings` and `GET /api/launch/earnings?chainId=1|11155111` provide read-only discovery across registered deployed collections, including deployments hidden from public catalog views. Drafts and unregistered addresses are excluded. Networks have independent totals.

The server validates the RPC chain ID, reads a recent block (maximum age five minutes), and pins calls to its canonical hash with EIP-1898. It verifies the recorded contract version and round ID, reads the current `owner()`, `withdrawableBalance()`, `totalMintRevenue()`, and the version-specific growth reserve, then rechecks the canonical block. Supported versions are affiliate V3–V10; unsupported historical versions remain visible without fabricated balances. This is informational discovery of catalog-registered contracts, not a fresh deployment bytecode audit.

Creator proceeds are the contract's current ordinary withdrawal allowance, which can include surplus funds. Gross mint revenue is not creator profit. Growth reserve is shown separately, and only counted as available after reveal. Prize, affiliate and refund liabilities remain governed by the deployed contract. Sponsorship-registry balances and unused VRF funding are excluded. No historical withdrawal total is inferred from the current balance.

The page identifies the holding contract and current owner, links to the explorer, supports name/season/address filtering and an available-ETH filter, and shows the snapshot block/time. Failed reads stay visible and are excluded from explicitly partial totals. Read work is bounded; incomplete collections remain unavailable. No signer, wallet connection, private-key field, transaction submission, or new persistence table is introduced.

## Runtime setup

Configure server-only read RPC endpoints in the Launch deployment:

- `LAUNCH_EARNINGS_RPC_URL_1` for Ethereum Mainnet.
- `LAUNCH_EARNINGS_RPC_URL_11155111` for Sepolia.

The provider must support canonical block-hash parameters for `eth_call` and `eth_getCode`. RPC credentials never go to the browser. A missing endpoint produces an explicit unavailable state, not a zero balance. Mainnet reads require their own endpoint even in a Sepolia-restricted planning environment; this does not enable Mainnet preparation or transactions.

The Launch runtime database role needs `SELECT` on `public.manekineko_collections` and `public.manekineko_deployments` in addition to its existing login/configuration grants. The staging provisioning script now includes these read grants; no write grants are added. Existing hosted roles need this small access update before the page can discover deployments. No schema migration is needed. Apply destination-specific runtime configuration/grants only as part of an authorized release.

## Local verification

- Launch regression suite: 198 passed, 2 runtime-specific tests skipped; production build and typecheck passed.
- Canonical hash pinning, chain/version/round mismatch, stale blocks, reorganization, failure redaction, partial totals, exact wei arithmetic, current owner, and unrevealed growth reserve handling.
- Disposable PostgreSQL provisioning suite: 31 passed, including catalog reads and rejected Launch catalog updates/deployment deletion.
- Authenticated local browser checks verified the 2 ETH/200-credit default, login return to earnings, partial totals, search, available-funds filtering, separate network totals, and a 390px mobile layout with no horizontal overflow or browser errors. Anonymous API access returned 401 with no-store caching. Browser data and RPC were fictional; these checks do not establish hosted balances, wallet collection, or live provider compatibility.

## Hosted release verification — 2026-09-26

Deployment `dpl_4r5SMEALuoeMmSq1pTozkyeDB2dJ` reached `READY`. The stable `manekineko-staging-launch.vercel.app` and `launch.app.tincta.xyz` aliases point to this deployment. This isolated Launch release used the preceding hosted source plus the sponsored budget and earnings changes; unrelated local protocol/worker work was not published.

The existing staging database identity was verified before granting Launch `SELECT` on the two catalog tables. Runtime reads succeeded and catalog/deployment writes remain unavailable. `LAUNCH_EARNINGS_RPC_URL_11155111` was saved as an encrypted production-target variable on this staging project. No wallet private key was introduced. Mainnet has no registered deployments here and its read endpoint was not configured.

Authenticated checks on the stable staging URL verified login 200, earnings page 200, earnings API 200, and canonical live reads for the one registered Sepolia collection at block **11788342**. Responses use private/no-store caching. Mainnet returned its separate empty catalog, the collection page rendered the 2 ETH standard, existing X labels remained intact, anonymous earnings access returned 401, and logout returned 200.

The isolated upload passed Launch typechecking and 171 tests (six database/runtime tests skipped); prior disposable-database checks are recorded above. The 413-file upload manifest contained no private environment paths or matches for the configured secret values. Private release evidence is retained under `.private/earnings-release/`; it must not be committed. Git was not committed or pushed for this isolated deployment.

## 2026-09-27 source follow-up

The second notes implementation adds explicit availability status and canonical block hash, runtime-presence/hash observation, bounded ordinary withdrawal history, URL-preserved network selection, and automatic read-only refresh. A failed history query does not hide independently verified current funds. Current and historical withdrawals remain separate. Operations reuse the same chain-pinned endpoint for fresh lifecycle observations. See [the U5/U6 implementation report](handoffs/bots-run-notes-2-launch-implementation.md) for interfaces, hosted reproduction and validation boundaries. These follow-up source changes have not been deployed.
