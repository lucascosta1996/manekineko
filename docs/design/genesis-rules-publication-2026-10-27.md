# Genesis launch rules across the public sites

Date: 2026-10-27. Scope: the parent Tincta landing page, Rewards landing and FAQ, public app home and affiliates, and public documentation.

## Published rule set

- Genesis has 1,000 free NFTs and permits two lifetime primary mints per wallet. Gas remains payable; transfers do not restore the mint allowance.
- Genesis has no mint deadline. The first season waits for all 1,000 NFTs to mint. If it never sells out, the first season never starts. The final mint opens the first ballot for its full voting duration.
- The first collection requires Genesis for affiliate enrollment. Every later collection and season accepts Genesis or an eligible NFT from an earlier successfully revealed paid collection.
- Affiliate enrollment still requires an available position, with ten positions and one enrollment per wallet per collection. Each NFT can qualify once per target collection. A paid referral and successful draw remain necessary for rewards.
- Genesis voting applies only to the first paid ballot. Genesis itself has no prize, sponsored mint or season holder reward entitlement.
- With no qualifying affiliates, the planned launch assigns the whole 20% affiliate pool to the operator treasury after a successful draw, alongside its usual 10%. With any qualifier, treasury remains 10%; earned affiliate claims remain protected, and only division dust uses the separate unused reserve. Refundable collections allocate nothing to either bucket.
- Selling out requires at least 500 minting wallets; this is not proof of 500 distinct people or current holders.

## Deployment boundary

These are planned V16 launch rules, pending a new contract deployment and runtime integration. Existing Sepolia contracts keep their original limits, timing and eligibility. Public explanations label this distinction, and connected test panels continue to display and enforce their actual terms. This website release changes no contract pins, transaction builders, signing guards, databases, workers or seasons.

The public docs update the overview, Genesis voting guide, paid mint limits, season sequence and affiliate guide. Landing links to the Genesis guide instead of presenting the existing Sepolia test as the revised launch. The app shares one Genesis rules section between home and affiliates, using existing layout and control tokens.

## Local acceptance

- Web, Landing and Launch production builds and TypeScript checks passed. Visual harness typecheck, all 11 source-policy tests and the source-policy scan passed; all 55 generated brand artifacts matched.
- Web: 300 passed, three database-dependent checks skipped. Landing: 24 passed, two database-dependent checks skipped. Launch: 195 passed across its app and preparation suites, six database-dependent checks skipped. No remote database fixtures were seeded.
- Genesis copy and historical V14 browser suites: 90 unique cases passed across Chromium, Firefox and WebKit, with 24 intentional secondary-engine viewport skips. The initial run passed 89 cases and encountered one WebKit wallet-provider fixture access-control error; the isolated unchanged case passed on rerun.
- Landing first-paint, empty/error/retry, stale and deadline suites: all 24 cases passed, including strict phone/desktop screenshots in all three engines. Six desktop baselines reflect the expanded Genesis explanation.
- Touch-control consistency at 390px passed in all three engines across the eleven public/operator routes, including accessibility and overflow checks.
- Inspected rendered Genesis sections at phone and desktop sizes. Checks cover 320–1440px, enlarged text, keyboard navigation, accessible headings/regions, no horizontal overflow, guide navigation and unchanged disconnected/expired historical mint guards.

These results cover local source and isolated browser fixtures. Hosted deployment status and live-domain inspection are separate release checks. A full historical contract rehearsal is not claimed by this UI acceptance record.

## Follow-up: two utilities and the treasury exception

The Genesis heading now leads with “One NFT. Two utilities.” Its first sentence explains first-collection voting and affiliate enrollment across all collections and seasons. The referral explanation explicitly names real ETH and the affiliate URL, while retaining enrollment, a paid mint, sellout and successful-draw conditions. The parent page, app, voting guide and affiliate guide use the same meaning. Treasury FAQs, allocation captions and the 10 ETH example document the zero-qualifier exception: 3 ETH operator treasury, 6 ETH prizes and 1 ETH holders.

The V16 implementation and metadata were updated locally, with 25 focused contract tests passing, including the ten-collection reserve-conservation rehearsal. Cases cover no enrollment, enrolled affiliates with zero referrals, exact cumulative 30% withdrawal, blocked duplicate withdrawals, qualified commissions and division dust, and unsold/randomness-timeout refunds. Those contract changes are not activated by this website release. Historical contracts, adapters and pins remain unchanged.

Web, Landing, Launch and contract builds/typechecks passed; V16-only ABI/source parity passed. Web tests passed 300 with three database skips after an unchanged pacing assertion passed on rerun. Landing passed 24 with two database skips. Visual source tests, source policy, harness typecheck and all 55 brand artifacts passed. Public docs retain plain launch language rather than internal version identifiers. Historical V14 browser assertions were updated only for the revised FAQ wording.

The final browser rerun passed 42 cases with 24 intentional secondary-engine viewport skips: revised Genesis/app/docs copy, corrected historical FAQ expectations, phone touch controls across eleven routes and six strict desktop screenshot comparisons. Another 57 unchanged V14 cases and 18 landing asynchronous/deadline cases passed earlier in this follow-up, for 117 distinct passing cases across the final runs. The six changed desktop baselines were inspected; differences are confined to the revised Genesis heading/prose at the bottom of the viewport. Header, hero, artwork and controls retain their geometry. Rendered phone/desktop Genesis sections and the app explanation were inspected directly.

The earlier broad local run subsequently ended with 516 passing tests and six timeout failures; this follow-up does not claim a complete monorepo pass. The previous website commit's hosted `validate` check succeeded and its separate visual job was cancelled. Current release CI must be checked independently.
