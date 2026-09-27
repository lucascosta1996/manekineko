# Airy Garden V10: first-collection investigation and recovery handoff

## Request and scope

Continue work in `/Users/admin/Documents/workspace/manekineko` (public brand Tincta). The user ran the two-collection Sepolia season and reported that posting about collection two failed. They requested investigation and this plan/handoff only. This investigation did not resume a worker, post to X, change credentials, deploy anything, or send chain transactions. Do not treat this document as authorization to do those actions. The user has additional notes from the first collection that have not yet been supplied; obtain them before finalizing the implementation scope.

Read `AGENTS.md`, `docs/architecture.md`, `docs/permanent-combinations-v10.md`, `docs/season-automation.md`, and applicable app instructions. Existing architecture/deployment statements about “no V10 rehearsal” are now stale; preserve dated history and add verified results when updating them. The working tree contains many pre-existing changes (59 status entries at investigation); do not reset, overwrite, or publish all of them incidentally.

## Main finding

**The actual failed action is the first individual winner reply for collection ONE, Lunar Stone—not an announcement for collection two.** The worker completed the winner-thread root and results-link reply, then X returned HTTP 403. That exception paused the entire runner before it progressed to Satin Echo. No action belonging to Satin Echo appears in the retrieved runtime outbox.

The exact X rejection reason is **unknown**: `scripts/season-runner/social.ts` cancels unsuccessful response bodies and exposes only HTTP status/retry timing. Do not claim this was insufficient credits, invalid credentials, duplicate content, or a policy restriction without more evidence. Credentials had worked for 16 confirmed posts in this run, including the two immediately preceding the failure. The earlier 402/401 setup failures are separate incidents.

## Identifiers and evidence

- Network: Ethereum Sepolia, chain ID `11155111`; protocol `affiliate-v10`, `unique-rank-v6`.
- Active two-collection automation: `79b44791-5787-4a26-90db-86a06a286a3b`, prepared revision 3.
- Run: `257c7ab9-9e56-4daf-b5db-917a05d15d1c`.
- Season ID: `0xd532e78151b2f58444b3a87563ee0edd3514b173d51cb7dea444e7ea287f1dfc`.
- Lunar Stone: collection ID `369e50fc-47f3-496f-938d-53e5ea0f9d02`; contract `0xaeCf42388f3Df8A92279d68065920745B73Ad728`.
- Satin Echo: collection ID `2a7d8825-da7d-42e6-92b4-f15a34d78e27`.
- X account: `@luckyOne9619`; public origin: `https://app.tincta.xyz`.
- Old ten-collection automation `5296e2a2-8450-4a73-9ed8-22b55f3448fa`, run `971a0f25-992c-4bde-ba50-c9afb9fe329d`: superseded, paused audit history. Do not resume it or rewrite its frozen artifact.

Local evidence (keep private, do not commit private files):

- `.private/season-runner/257c7ab9-9e56-4daf-b5db-917a05d15d1c.log` — timestamped runner diagnostics.
- `.private/season-handoff-evidence.json` — selected database events, action statuses/text, and public projection captured during this investigation.
- `.private/season-handoff-chain.json` — read-only chain snapshot.
- `.private/inspect-season-handoff.mts`, `.private/season-handoff-chain.mts` — inspection helpers; use read-only invocation only.
- `.private/season-runner/sepolia-wallets.enc` — encrypted reusable 50-wallet vault. Preserve it.
- `.private/v10-setup-2026-09-25/run-airy-garden.mjs` — user’s run command wrapper, targeting the two-collection automation.
- `.env.staging.local`, `.env.staging.wallets.local`, `.private/v10-setup-2026-09-25/worker.env` — private configuration references; never print their contents.

The restricted Launch database role cannot select action payloads. The configured worker role was used for read-only evidence queries. Do not broaden grants to bypass this intentional boundary.

## Verified timeline and state

All timestamps below are UTC. São Paulo is UTC−3, so the failure was September 26 at 21:55:42 local time.

| Event | UTC time / evidence |
|---|---|
| Season announcement confirmed | September 26, 22:24:19 |
| Lunar Stone live announcement | September 26, 23:10:58 |
| Canonical sellout time | September 27, 00:38:24 (`soldOutAt=1790469504`) |
| Sold-out thread root confirmed | 00:39:16 |
| Randomness request submitted | 00:39:47 |
| Draw finalization submitted | 00:54:23 |
| Draw finalization action confirmed in DB | 00:55:03 |
| Winner-thread root confirmed | 00:55:37 |
| Winner results-link reply confirmed | 00:55:39 |
| First individual winner reply rejected / run paused | 00:55:42 |

At inspection: run status `paused`, desired state `paused`, no worker lease. Outbox: 108 chain-transaction actions marked confirmed; 16 X actions confirmed; one X action failed. Database confirmation counts do not substitute for independent receipt reconciliation.

Read-only chain verification at September 27, 01:34:48 UTC, block **11790081**, hash `0x2bb8913aec5b3423ace81e29abff4d98804cba43b4c2eedc0182594bc5b037e5`:

- `totalSupply=1000`, `soldOut=true`.
- `randomnessRequested=true`, `randomnessReceived=true`, `revealed=true`.
- `awardCount=6`, `claimedAwardCount=0`, `prizePaidAmount=0`.
- `readyForNextRound=true`.

This confirms sellout and draw, **not completion of claims, recycling, NFT metadata validation, indexer reconciliation, or the full season**.

Confirmed winner root: https://x.com/luckyOne9619/status/2104012045137895565

Confirmed results reply: https://x.com/luckyOne9619/status/2104012056181588393

These links derive from saved successful API responses; their current public rendering was not independently inspected during this investigation.

Failed action key:
`369e50fc-47f3-496f-938d-53e5ea0f9d02:winners-revealed:winner:1`

Status `failed`, no post ID, no media attachment; reply parent `2104012045137895565`. Exact intended text:

```text
Award #1 · NFT #208 · 1.0 ETH
Holder at block 11789883: 0xb084c84a95d6Db66f34b2FD6527221dE94A3dCaE

Verified NFT:
https://app.tincta.xyz/nfts/369e50fc-47f3-496f-938d-53e5ea0f9d02/208
```

## Schedule recovery is now required

Frozen cadence: second announcement at previous sellout +30 minutes, opening +60 minutes, with 15 minutes of enrollment. This yields:

- Satin Echo announcement: September 27, **01:08:24 UTC**.
- Enrollment opening: **01:23:24 UTC**.
- Mint opening: **01:38:24 UTC**.

At chain inspection the enrollment window was already missed; by the next task the mint opening may also be past. Recheck current time and saved state. **Do not simply Resume.** `resolveTimedAutomationStep` rejects insufficient deployment/enrollment lead and missed openings. A fix to the X rejection alone will not restore the original schedule.

Do not edit frozen dates/hashes, delete runtime actions, replace signed transaction journals, or create a duplicate season with the same identity now that it has been deployed and publicly announced. Recovery requires an explicit reviewed design: preserve the deployed first collection, factory/registry lineage, claims, and immutable original artifact; determine whether an audited continuation override or a new correctly linked continuation is supported. Clearly distinguish original scheduled times from any operator-approved new times in UI and announcements.

## Prioritized next work

### 1. Diagnose the X rejection without causing duplicate posts

- Recheck saved action and live account state; confirm the root/reply still exist and inspect X account notices, app permissions, billing and any API diagnostics available to the user.
- Add bounded, sanitized error diagnostics in `scripts/season-runner/social.ts`: method/endpoint identifier, HTTP status, allowlisted API error code/type and safe reason classification. Never dump raw response bodies, authorization headers, token values, signed requests, or arbitrary upstream text into logs.
- Persist the failed action key and safe diagnostic information in the outbox/run log and surface actionable guidance in Launch.
- Preserve ambiguous-delivery handling: network errors/timeouts/5xx after a post attempt must require reconciliation; no blind retries. Do not replay the already confirmed root/results reply.
- Obtain permission before any diagnostic POST; it is public, billable, and may publish successfully. A read-only authentication check alone does not establish posting permission.

### 2. Review social failure coupling and safe continuation

- `outbox.ts:deliverMessage` posts each reply sequentially and throws on the first failure.
- `runner.ts` calls `message('winners-revealed', ...)` before progressing to the next collection and before the normal end-of-tick save/public projection and rehearsal claim queue.
- This explains both the stalled next collection and stale public projection: the saved public payload still said `sold_out`, observed at 00:53:00 UTC, although the live contract is revealed.
- Design whether supplemental winner/payment replies can be deferred independently from required launch announcements. Preserve required announcement and activation gates; do not silently weaken them.
- Ensure bounded social retries cannot starve fixed opening preparation, accurate public observations, or authorized prize settlement. Keep canonical X payload identity and deduplication intact.
- Implement an explicit operator-reviewed recovery path for missed schedules before resuming this run. Show pending social work and exact failed message in Launch.

### 3. Audit and settle Lunar Stone

- Reconcile canonical deployment, funding, 50 managed recipients ×20 primary mints, VRF request/fulfillment, draw finalization, six winning NFTs, holder identities, scores and prize liabilities.
- Audit all 1,000 token identities/metadata for uniqueness and on-chain correspondence; verify metadata/artwork remains draw-independent. Report sampling separately if exhaustive verification cannot be completed.
- Compare chain, indexer database, public collection/NFT/results pages and social statements. Refresh stale projections through supported code, not invented state.
- Verify why no prize claims have run; the control flow suggests the X failure blocked the rehearsal queue, but inspect journal/claim eligibility before execution.
- Review operator/donor/managed-wallet balances, prize claims, treasury recycling and remaining VRF/sponsorship reserves before funding collection two. The 250 ETH limit is cumulative transaction value plus gas, not required balance or actual net cost.
- Preserve winner-sponsored-credit eligibility and lifetime redemption rules; unpaid prizes are not forfeited by a paused worker.

### 4. Fix operator UX exposed during setup

- Clarify OAuth 1.0 fields: API Key/Consumer Key and its paired API Key Secret/Consumer Secret; explicitly distinguish OAuth 2.0 Client Secret and tokens.
- Explain that the current save requires all four credentials, or implement secure pairwise rotation retaining the other pair server-side. Never return stored secrets to the browser.
- Provide a saved revision/timestamp and read-only identity check with an explicit “publishing not tested” boundary.
- Verify `LAUNCH_PUBLIC_ORIGIN` against the custom domain. During earlier checks `launch.app.tincta.xyz` login failed while `manekineko-staging-launch.vercel.app` worked; diagnose before changing configuration. Do not relax origin validation.
- The two-collection replacement now sorts first in Launch, but the old ten-collection prepared version remains visible. Consider a clear superseded-history label and safe prevention of accidental resume, preserving its audit history.

## Acceptance criteria and handoff boundaries

- Regression tests cover winner root/results success followed by one failed winner reply, restart deduplication, sanitized 401/402/403/429 diagnostics, ambiguous post reconciliation, and missed next enrollment/opening windows.
- Tests cover accurate public state when a supplemental social message fails and independent authorized claim progress if that design is adopted.
- No already confirmed post, mint, claim or deployment is duplicated; original frozen artifacts and transaction journals remain intact.
- Run local tests against an isolated local database; never seed staging. Separate source/tests, hosted UI, DB persistence, chain verification and live X evidence in the final report.
- Collect the user's additional first-collection notes. Do not invent their content or declare the season fully verified.
- Deliver a concrete recovery proposal and tested implementation before asking for execution approval. The user has historically preferred to run the season command themselves.

No fixes were implemented in this investigation. Only read-only diagnostics and this handoff were created.
