# Collection history

`/history` is the Web app's archive. It displays completed and fully refunded collections, winning holders at payout, winning tickets and combinations, exact scores, and aggregate statistics. A separate prize receiving address appears when a V2 holder selected another destination. Users can search by collection, ticket, holder or receiving wallet, filter outcomes, sort, paginate, and expand a collection's details. The History link is in the shared navigation.

## Real database snapshots

Both the server-rendered page and `GET /api/history` use PostgreSQL. Public history excludes every `is_mock=true` archive. There is no JSON, browser-storage or in-memory fallback. The API is read-only and uncached; unavailable database access returns a generic 503, and the page offers a retry state.

The page displays deployed collections without a recorded terminal outcome in a separate **in progress** section. These require a real deployment and verified chain snapshot, exactly as the Collections section does. A pending-activation collection can therefore appear immediately after registration without a fabricated winner or prize. The [hosted History page](https://manekineko-staging-web.vercel.app/history) has been checked with one real in-progress Sepolia collection and zero completed/refunded outcomes. Completed history stays empty until an actual terminal outcome occurs.

Statistics include real active and archived collections and their indexed minted ticket counts/revenue, without counting a collection twice when it moves into the archive. Winner count and prize totals include only recorded completed outcomes. Refund totals represent completed archived refunds. Networks and currencies are aggregated separately.

The two original undeployed collection records and eight illustrative archive rounds remain test fixtures only. Runtime repositories ignore them. The [scoped cleanup command](live-collection-sync.md) removed their explicitly known records from the former local database; the published staging catalog contains only the real deployed collection. Never use `db:seed` or `db:setup` on the shared staging database. Use `db:migrate` for schema changes and a separate local PostgreSQL database for fixture suites.

The local Docker service remains available at `127.0.0.1:54329` for disposable tests. Its checked-in credentials are for development only. `npm run db:stop` stops it without deleting data. The active local web configuration now points to the same restricted staging database as the hosted web app; the former local environment was backed up privately before switching.

Use `COLLECTION_SYNC_TEST_ENV=/path/to/local-postgres.env node --experimental-strip-types scripts/verify-staging-collection-database.mjs` for the registration/history integration regression. It accepts localhost only and creates, migrates, seeds and drops a randomly named test schema. No fixture is imported into the live staging catalog.

## Schema and API contract

`manekineko_collection_history` stores immutable collection identifiers, series/network references, terms, minted supply, dates, outcome and explicit mock provenance. `manekineko_history_winners` stores the winning ticket, four numbers, combination code, exact score, NFT holder at payout, actual receiving address, amount and date. These records are an archive projection, separate from `manekineko_deployments` and `manekineko_collection_state`.

Database constraints and runtime validation enforce each collection version's encoding, score formula and payout terms. Completed rows require full supply, a valid winning token and the archived prize share of primary receipts paid as a prize. Legacy and V3 records retain exactly 50%; V4 and V5 records carry their immutable `prize_bps` alongside `contract_version`; V5 additionally stores its `affiliate_pool_bps`. Refunded rows require complete refunds and have no winner. Deferred constraints allow archive and winner changes to commit together. Monetary values and large contract identifiers are serialized as decimal strings. Totals use `BigInt`, and amounts from different chains/currencies are not added together. Unique winners counts distinct winning holder addresses; ticket totals include refunded rounds.

Migration `004_versioned_randomness.sql` preserves every existing sample as `algorithmVersion: "feistel-v1"` and `randomnessProvider: "future-blockhash"`. These fields cannot change after insertion. The winner table carries the matching version through a composite foreign key, preventing a V2 tuple from being interpreted with V1 arithmetic. The original V1 byte encoding and tie-breaking scores are unchanged.

New V2 archives explicitly use `unique-rank-v2` / `chainlink-vrf-v2.5`, Ethereum Mainnet or Sepolia, and ETH with 18 decimals. Their four numbers lie in `1..16`; `combinationCode` is the base-16 encoding and `score = combinationCode + 1`. A completed V2 winner must score exactly the collection supply. A sold-out V2 collection cannot be recorded as refunded. The expanded result panel displays the appropriate formula and names the collection's rules. No V2 archive, mock prize or deployment is seeded by this change.

The integration suite checks version immutability, provider and network restrictions, mismatched winner versions, exact highest ranks, valid zero-valued VRF words, contradictory request states, and unchanged V1 seeds, alongside the existing concurrency and payment constraints. Fixtures are rolled back and do not appear as live collections or history.

Migration `005_winning_holder.sql` stores `winning_holder` separately from `prize_recipient`. V1 paid directly to the NFT holder, so its rows are backfilled from the existing recipient without changing timestamps; a constraint keeps both V1 addresses equal. V2 requires an explicit nonzero winning holder from the `PrizeDelivered` event. There is no V2 fallback from recipient to holder. The migration fails closed if V2 archive rows already exist without holder provenance. A backend must retain and write both event addresses; two holders claiming to the same recipient still count as two winners, and one holder choosing different recipients counts as one.

`GET /api/history` returns `{ collections, inProgress, stats, source: "postgres", isMock: false }`. Archive rows and live collection snapshots are read in one repeatable-read, read-only database transaction so a concurrent archive write cannot double-count or temporarily omit a collection. Search and pagination currently operate on that returned snapshot, which is suitable for this small archive. Add database pagination and aggregate queries within a consistent snapshot when the archive becomes large.

## Publication and ongoing synchronization

Set the Web project's server-only `DATABASE_URL` to a managed PostgreSQL connection. Apply migrations explicitly with a privileged deployment credential. Run seeds only in isolated fixture databases. Public repositories exclude their sample rows. The Web runtime needs SELECT access to the archive, winner, series and network tables; it has no public write API. Keep the production credential out of `NEXT_PUBLIC_` variables. The local Docker service is not deployed to Vercel.

The [staging sync command](live-collection-sync.md) now registers the actual deployed collection and updates its confirmed state. On subsequent explicit runs, it writes the archive and winner together after verifying `PrizeDelivered`, retaining the actual winning holder separately from the recipient. It records full refunds only after all minted tickets were repaid. Deployment journals, canonical block hashes and transaction receipts preserve provenance.

A continuously running indexer is not yet installed. Database displays change after explicit synchronization, not automatically after every blockchain transaction. Scheduling, monitoring, backfill and reorg rollback remain separate production tasks. The page never signs, deploys, mints or pays a prize.
