# Sepolia mock seasons

Sepolia rehearsals mirror saved Mainnet collection terms while using independent fictional identities. In Launch, choose **Sepolia testnet → Create Sepolia mock seasons**. This copies missing current Mainnet plans into persisted Sepolia drafts. Repeating the action preserves every existing copy, including manual edits and prepared plans. Later Mainnet edits do not rewrite a rehearsal.

Copied terms include collection counts/order, exact colors, supply, price, version, prizes, mint caps, affiliate economics, duration/enrollment settings, sponsorship amounts and season cadence. New random names, symbols, season IDs and collection UUIDs replace public identities. Source plans and finalized historical configurations remain unchanged.

Configure Sepolia wallets, registry/factory addresses and dates separately. The import clears owner/deployer/enrollment authority, old VRF pins, fixed calendar instants, operator notes and custom promotional text. Duration versus fixed-deadline mode is preserved; a cleared fixed deadline must be set before preparation. Canonical social templates replace custom Mainnet copy, retaining the season's posting toggle. No account credentials are copied.

**Twitter / X configuration** belongs to the selected network, independently of season selection. Each network has its own handle, numeric account ID, public website, publishing switch and four encrypted OAuth credentials. The account ID and website must differ from the other configured network. Existing worker/pause, revision and announced-account binding rules still apply. New account forms start with publishing disabled. Saving a profile does not start a worker or send a post.

Sepolia social posts, alt text and image headers use neutral “Color study” branding; image footers omit the production domain. Actual post URLs use the selected network profile. Unsaved Sepolia previews use a neutral illustrative URL. Mainnet branding is unchanged. Shared colors, artwork style, contract source, funding, wallets or websites can still connect public activity: these changes provide separate test identities, not anonymity.

## Persistence and operation

Migration `027_sepolia_mock_seasons.sql` adds private source UUID/revision/order columns to saved automations. One unique source link per copied season plus a transaction lock makes concurrent requests and retries idempotent. The provenance cannot be edited, stays outside exported plans and public API responses, and retains catalog ordering in Launch previews and worker announcements. User-authenticated writes use existing Launch permissions and origin checks.

The staging helper defaults to read-only preview:

```sh
node --import tsx scripts/create-sepolia-mock-seasons.mjs
node --import tsx scripts/create-sepolia-mock-seasons.mjs --apply
```

It verifies the pinned staging database, requires one unambiguous active operator, backs up private plans/finalized records, permits only migration 027 as a pending prerequisite and verifies existing records afterward. It copies actual saved plans; it never inserts fixture collections, runs, transactions or X posts. With multiple operators, use the authenticated console instead.

## Verified 2026-09-22

- Staging: migration 027 applied; 22 Mainnet plans / 216 collections preserved; 22 independent Sepolia drafts / 216 collections created. All pre-existing plans and finalized snapshots compared unchanged. A subsequent preview reported zero missing copies. X profiles remained absent and no worker was started.
- Local: 189 Launch tests plus four preparation tests passed with all database opt-ins enabled; 75 worker tests passed, including mock-season numbering. Tests cover the full 22/216 catalog, preserved economics, removal of source identities/authority, isolated encrypted profiles, concurrency, idempotency, manual edits and existing historical behavior. Launch/worker typechecks and the Launch production build passed.
- Browser: authenticated isolated Launch preview verified empty-network X settings, separate network labels, all credential fields and a successful persisted mock creation. No real credentials were entered or X request made. This was a local preview, not hosted UI verification.
- Hosted authenticated reads confirmed 22 Mainnet seasons and 22 Sepolia seasons / 216 collections with distinct names. The Sepolia runtime reports encryption ready, no X profile and no started season.
- The updated Launch and worker source have not been deployed by this task. Live account authentication/posting, wallet transactions, registry deployment and the V10 rehearsal remain separate operations.
