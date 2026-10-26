import type { DocPage } from "./model";
import { withDocVisuals } from "./visuals.ts";

// Current onchain experience. Historical contracts retain their immutable terms.
export const docPages: DocPage[] = withDocVisuals([
  {
    "slug": "overview",
    "title": "How rewards work",
    "description": "NFT collections, community voting and protected onchain rewards.",
    "group": "Start here",
    "minutes": 3,
    "sections": [
      {
        "id": "protocol",
        "title": "Collections governed by their contracts",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Tincta runs finite NFT collections in a published season order. Eligible NFT holders vote on the next collection’s mint price, supply, equal prize count and mint duration. Minting opens at the voting deadline without an operator activation."
          },
          {
            "type": "paragraph",
            "text": "The planned launch begins with Genesis: 1,000 free NFTs, up to two lifetime primary mints per wallet, and no mint deadline. The first season starts only after all 1,000 mint. Genesis holders alone can enroll as affiliates in the first collection; later collections and seasons also accept eligible paid NFTs. These revised rules await deployment. The connected Sepolia test retains its original terms."
          },
          {
            "type": "paragraph",
            "text": "Tincta seasons allocate 60% of mint revenue to winning NFTs, 20% to qualified affiliates, 10% to season holder rewards and 10% to the protocol treasury for infrastructure costs, future functionality and Tincta projects. These rules are planned for launch. Always review the terms of the selected collection before participating. These percentages cannot be voted away. Actual ETH allocations vary with the community-selected mint prices and supplies and the revenue received. All mint funds stay reserved until finalization. Unsold expiry or missing randomness at the fixed cutoff allows full mint-price refunds."
          },
          {
            "type": "paragraph",
            "text": "The protocol treasury funds infrastructure costs, future functionality and Tincta projects. Prize, earned affiliate and refund obligations remain protected. Holder funds are held separately in a season pool with no operator withdrawal."
          },
          {
            "type": "paragraph",
            "text": "The website reads contract state and helps you submit transactions from your wallet. Its availability and X announcements do not control opening, refunds or claims. Transactions still need a sender and gas; Chainlink provides verifiable randomness."
          },
          {
            "type": "paragraph",
            "text": "The main page shows the current collection and its available action. A planned catalog or an unconfigured deployment is not a live sale. Sepolia uses test ETH and independent test identities. Existing historical contracts keep their own immutable terms."
          }
        ]
      },
      {
        "id": "start",
        "title": "Choose your next step",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Open Participate to vote or mint in the current collection and follow the draw. Rewards shows all winning NFT holder addresses, prizes and refunds; choose an earlier collection there at any time. Affiliates handles enrollment, referral links and affiliate claims. Holders shows the season pool, progress and remaining first-come claim slots for each season. Connecting a wallet never submits a transaction."
          }
        ]
      }
    ]
  },
  {
    "slug": "holder-rewards",
    "title": "Season holder rewards",
    "description": "The 10% season pool, 5% NFT coverage and first-come claims.",
    "group": "The protocol",
    "minutes": 5,
    "sections": [
      { "id": "pool", "title": "Not a winner, but still a holder?", "blocks": [
        { "type": "paragraph", "text": "Tincta collections automatically send 10% of mint receipts to a separate season holder pool when a draw finalizes. This contract has no operator withdrawal. The 10% treasury allocation funds infrastructure costs, future functionality and Tincta projects. Season holder rewards are planned for launch. Check the selected collection’s terms and pool availability before participating." },
        { "type": "paragraph", "text": "The pool is locked until every collection in its sealed season has completed a successful draw or become refundable. Unpaid prizes and refunds do not delay the unlock. No calendar timer, website switch or operator approval releases the pool. Before completion, the page shows accumulated ETH, settled collections and provisional claim estimates. A season has at most ten collections. Preparing the next season is not required to unlock this one." }
      ]},
      { "id": "dynamic-amounts", "title": "Different seasons, different amounts", "blocks": [
        { "type": "paragraph", "text": "The allocation percentages and 5% coverage are fixed. Voting selects each collection’s price and supply; successful mints determine the actual revenue and eligible NFT count. Each season adds its successful collections’ 10% contributions into its own pool. Pending and refundable collections do not inflate the funded balance." },
        { "type": "paragraph", "text": "Claim slots equal 5% of the season’s eligible NFTs, rounded down. The ETH per claim equals the final pool divided by those slots, rounded down to whole wei. Estimates may change while collections are unsettled. Once the season ends, every successful claim receives the same final amount, even if individual NFTs had different mint prices. Claims reduce the remaining slots and available ETH; they do not change the amount paid to later claimants." },
        { "type": "table", "columns": ["Illustrative successful mints", "Result for that season"], "rows": [
          ["1,000 at 0.01 ETH + 2,000 at 0.02 ETH", "5 ETH pool · 150 claim slots · 5 ETH ÷ 150 per claim, rounded down to wei"],
          ["A separate season: 1,000 at 0.03 ETH", "3 ETH pool · 50 claim slots · 0.06 ETH per claim"]
        ] }
      ]},
      { "id": "claims", "title": "Equal rewards for the first 5%", "blocks": [
        { "type": "paragraph", "text": "Only NFTs from successfully drawn collections qualify, including winning NFTs. The first 5% of eligible NFTs to claim receive equal rewards. Claims are paid in onchain execution order until the fixed slots run out; a pending transaction reserves nothing. Eligible ownership does not guarantee a payment. There is no per-wallet claim limit." },
        { "type": "paragraph", "text": "Claim slots equal the total eligible NFT count multiplied by 5%, rounded down. Each payout equals the final funded pool divided by the slots, rounded down to whole wei. For 10,000 eligible NFTs and a 10 ETH pool, the first 500 NFT claims each receive 0.02 ETH. This is an example, not a fixed payout. Any rounding dust stays in the pool." },
        { "type": "paragraph", "text": "The current owner submits the claim, once per NFT. Transfers carry any unclaimed opportunity; they never reset a completed claim. Approved NFT operators cannot claim on an owner’s behalf. Unclaimed winning NFTs remain transfer-locked until their ticket prize is claimed. Holder rewards do not consume a winning-ticket prize, affiliate claim or lifetime sponsored-mint benefit." },
        { "type": "paragraph", "text": "There is no claim expiry. At /holders, select a prepared collection, enter an NFT token ID and connect its current owner. Review the exact amount, network, collection and recipient before signing. The website checks current ownership, used claims and remaining slots again after review; the contract enforces them at execution." }
      ]},
      { "id": "open-page", "title": "Follow your season", "blocks": [
        { "type": "links", "items": [{ "label": "Open holder rewards", "description": "Select a collection to view its season pool, settlement progress and claim availability.", "href": "/holders" }] }
      ]},
      { "id": "refunds", "title": "Failed collections keep full refunds", "blocks": [
        { "type": "paragraph", "text": "Unsold or randomness-timeout collections do not contribute funds or eligible NFTs to this pool. Their full mint receipts remain reserved for NFT refunds. If every collection is refundable, the season ends with no holder claims. Always check the selected collection’s immutable terms." }
      ]}
    ]
  },
  {
    "slug": "onchain-voting",
    "title": "Onchain seasons and voting",
    "description": "Choose the next collection’s economics with eligible NFTs.",
    "group": "The protocol",
    "minutes": 3,
    "sections": [
      {
        "id": "genesis",
        "title": "The free mint before the first season",
        "blocks": [
          { "type": "genesis-artwork", "caption": "The first vote. A minimal geometric identity generated and stored entirely onchain. Each NFT carries its own token number." },
          { "type": "paragraph", "text": "The planned launch introduces Tincta Genesis before any paid collection: 1,000 free NFTs, up to two lifetime primary mints per wallet, and no mint deadline. The mint price is 0 ETH; holders pay network gas. Transferring an NFT does not reset the sender’s mint limit. Genesis is a separate edition outside the paid season catalog, sharing the new protocol’s single NFT contract. Selling out requires at least 500 minting wallets, not necessarily 500 distinct people or current holders." },
          { "type": "paragraph", "text": "The first season cannot start until all 1,000 Genesis NFTs have minted. If Genesis never sells out, the first season never starts. The final mint opens the first ballot for its full voting duration; no elapsed-time fallback exists. Each Genesis NFT gives its current owner one vote in that ballot. An unused vote follows a transfer; a used vote never resets. Genesis votes expire after this first paid ballot, including unused votes; they do not renew at the start of another season." },
          { "type": "paragraph", "text": "Genesis holders can enroll as affiliates throughout all collections and seasons. The first collection requires a Genesis NFT; later collections accept Genesis or an eligible NFT from an earlier successfully revealed paid collection. Enrollment still requires an available position, and rewards require a qualifying paid referral and a successful draw. Genesis grants no prize, sponsored mint credit or season holder reward entitlement. Later voting still requires successfully revealed paid NFTs." },
          { "type": "paragraph", "text": "These revised launch terms await a new deployment. The current Sepolia test retains its earlier one-mint limit, fixed window and voting-only Genesis rights. Mainnet minting has not launched. Existing contracts keep their original rules; check the app’s configured network and contract before participating." }
        ]
      },
      {
        "id": "vote",
        "title": "One eligible NFT, one vote",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Genesis NFTs qualify only for the first paid ballot, using the current-owner, once-per-NFT rule above. Later voting power is the number of eligible paid NFTs you held immediately before voting opened. Only previously successful, revealed and fully backed official paid collections qualify. Transferring a paid NFT after that snapshot does not give its recipient another vote."
          },
          {
            "type": "paragraph",
            "text": "Each ballot offers published economic packages. The package with the most votes wins; ties choose the lowest numbered tied option. No votes choose the first published option. The reviewed menu is fixed for the sealed catalog."
          },
          {
            "type": "paragraph",
            "text": "For paid collections, mint price is at least 0.01 ETH. Supply is 1,000–65,536 NFTs and remains fixed once minting opens. Mint duration is 1–24 hours. Equal winning NFTs number 1–10, excluding 7 and 9 because the prize allocation must divide exactly."
          },
          {
            "type": "paragraph",
            "text": "For illustration, a successful collection of 1,000 NFTs at 0.01 ETH collects 10 ETH: 6 ETH for prizes, 2 ETH for affiliates, 1 ETH for season holders and 1 ETH for the treasury. The treasury allocation stays 10%, intended to fund infrastructure costs, future functionality and Tincta projects."
          },
          {
            "type": "paragraph",
            "text": "Paid votes use source groups of up to 16 collections. Each source balance can be consumed once per ballot. The planned single-contract launch does not automatically import NFTs from older deployments. Earlier releases retain their own voting-vault and historical eligibility rules."
          }
        ]
      },
      {
        "id": "opening",
        "title": "The deadline opens minting",
        "blocks": [
          {
            "type": "paragraph",
            "text": "At the exact voting deadline, voting closes and the winning terms become final. No additional signature is required to open minting. Nobody, including the operator, can pause, upgrade, postpone or change a live collection."
          }
        ]
      }
    ]
  },
  {
    "slug": "quickstart",
    "title": "Your first ticket",
    "description": "Connect, review the mint and follow your collection.",
    "group": "Start here",
    "minutes": 3,
    "sections": [
      {
        "id": "before",
        "title": "Before you mint",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Select Connect wallet in the header to open Reown AppKit. Choose an installed Ethereum wallet or connect a mobile wallet with WalletConnect. The header shows your connected address across Participate, Rewards, Affiliates, Holders and these docs. Open it to switch accounts, check the network or disconnect. Check the collection address, final price, supply and mint deadline. Keep enough ETH for the purchase and gas."
          }
        ]
      },
      {
        "id": "mint",
        "title": "Mint from the main page",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Select a prepared collection. Connect from the header and check that the displayed account is the one that should receive your NFTs. Choose the quantity and check any affiliate reference. Review the payment, then confirm the transaction in your wallet. Changing accounts or networks requires a fresh review; connecting or navigating between pages never submits a transaction."
          },
          {
            "type": "paragraph",
            "text": "Each recipient can receive at most 20 primary mints per paid collection across paid, referral and sponsored paths. A batch can contain at most 20 tickets. Transfers and refunds do not restore that allowance. The planned Genesis launch has a separate limit of two lifetime primary mints per wallet and no mint deadline; existing test contracts retain their original limits."
          },
          {
            "type": "paragraph",
            "text": "Wait for a confirmed receipt. If the outcome is uncertain, recover the original transaction by its hash rather than sending it again. Keep your token IDs from the transaction’s Transfer events for ticket-specific actions. Follow Holders after a successful draw to see the season pool and its progress. Claims open only after every collection settles, with slots for the first 5% of eligible NFTs. Owning a ticket does not reserve a slot."
          }
        ]
      }
    ]
  },
  {
    "slug": "seasons",
    "title": "Seasons and collections",
    "description": "Follow a collection from voting to settlement.",
    "group": "The protocol",
    "minutes": 3,
    "sections": [
      {
        "id": "progress",
        "title": "A published sequence",
        "blocks": [
          {
            "type": "paragraph",
            "text": "For the planned launch, Genesis must sell out before the first season starts. Its 1,000 free NFTs have no mint deadline and allow up to two lifetime primary mints per wallet. The final mint opens the first paid ballot for its full voting duration. If Genesis never sells out, no deadline or operator action can start the first season. Existing Sepolia test contracts retain their original timing."
          },
          {
            "type": "paragraph",
            "text": "Season names, collection names, order and geometric artwork are planned before the catalog is sealed. The next collection can be prepared after the previous draw is finalized with all liabilities funded, or refunds become available after unsold expiry or the randomness timeout. Old unpaid prizes and refunds remain reserved. Each successful draw also funds its season’s holder pool. The pool unlocks only when every planned collection in that season has drawn or become refundable; unpaid prizes and refunds do not delay it. The Holders page shows settled-collection progress before and after unlock."
          },
          {
            "type": "paragraph",
            "text": "Preparation funds randomness, sponsorship and a 0.01 ETH executor reward separately from mint receipts, then publishes the voting schedule. After verified randomness arrives, the operator can finalize the draw and prepare the next collection in one transaction. The protocol treasury allocation funds infrastructure costs, future functionality and Tincta projects. A scheduled opening happens at the voting deadline without another signature. The dashboard shows pending actions and the current collection’s timing."
          },
          {
            "type": "paragraph",
            "text": "The Sepolia planning catalog mirrors Mainnet’s 22 seasons and 216 collections, including order and colors, with different names and independent IDs. Testnet activity does not become Mainnet activity."
          }
        ]
      }
    ]
  },
  {
    "slug": "prizes",
    "title": "Claim your prize",
    "description": "Winning NFT holders claim equal ETH prizes directly.",
    "group": "Participate",
    "minutes": 3,
    "sections": [
      {
        "id": "draw",
        "title": "Sellout and the draw",
        "blocks": [
          {
            "type": "paragraph",
            "text": "The final mint attempts one Chainlink VRF request and fixes a deadline 72 hours after sellout. A reverted request may be retried before that cutoff; an accepted request cannot be replaced. Randomness must be recorded strictly before the cutoff. Once recorded, anyone can finalize the draw and collect the separately funded executor reward. Recorded results never expire, even if the operator is absent. If no randomness is recorded on time, full mint-price refunds become available instead."
          },
          {
            "type": "paragraph",
            "text": "60% of actual mint revenue is split equally among the voted number of winning NFTs. The prize amount depends on the selected price, supply and winner count; 1 ETH is an illustration, not a minimum or maximum. Winners are distinct tickets, not necessarily distinct wallets. Permanent artwork identifies your ticket; it never announces a score or winning status."
          }
        ]
      },
      {
        "id": "claim",
        "title": "Holder-only claims",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Open Rewards and select the collection. Its winning tickets list reads every current holder address, token ID, prize and claim status from the contract. Only the current holder can claim that ticket’s prize. Unclaimed winning tickets stay transfer-locked. Unpaid prizes remain reserved when later collections open. Holder rewards are separate: winning and non-winning NFTs from successful draws can claim from the season pool after season end, while the first-5% slots remain. Claiming one does not consume the other."
          }
        ]
      },
      {
        "id": "sponsored",
        "title": "One lifetime sponsored ticket",
        "blocks": [
          {
            "type": "paragraph",
            "text": "A settled prize can unlock one sponsored ticket in a later eligible collection. Each wallet can redeem at most one sponsored NFT for life, including prior registry history. Sponsorship pays the full mint price from a separate funded reserve; you pay gas. A refund does not restore the lifetime entitlement."
          }
        ]
      }
    ]
  },
  {
    "slug": "affiliates",
    "title": "Affiliate rewards",
    "description": "Enroll during voting and qualify through a paid referral.",
    "group": "Participate",
    "minutes": 3,
    "sections": [
      {
        "id": "enroll",
        "title": "Ten positions per collection",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Under the planned launch rules, the first paid collection requires a Genesis NFT. Every later collection, including new seasons, accepts Genesis or an eligible NFT from an earlier successfully revealed paid collection. Enrollment is open during voting, subject to one of ten available positions and one enrollment per wallet per collection. These revised rules await deployment; existing tests retain their original eligibility rules."
          },
          {
            "type": "paragraph",
            "text": "You must own the qualifying NFT when you enroll. Each NFT can qualify one wallet per target collection; transferring it cannot qualify another wallet for that same collection. It can qualify again in another collection or season. A Genesis vote does not consume affiliate eligibility. Enrollment and earned commissions remain with the enrolling wallet after an NFT transfer. No server-issued admission permit is required. Keep the referral link shown after enrollment."
          }
        ]
      },
      {
        "id": "qualify",
        "title": "One paid referral to qualify",
        "blocks": [
          {
            "type": "paragraph",
            "text": "At least one attributed paid referral qualifies an enrolled affiliate. Self-referrals are rejected. Sellout fixes equal shares of the 20% affiliate pool, claimable only after a successful draw, regardless of individual referral counts. The ETH pool follows actual mint revenue under the voted terms; it is not a fixed 2 ETH."
          },
          {
            "type": "paragraph",
            "text": "If three out of ten positions qualify, each receives one third of the pool, rounded down to whole wei. An unfilled or unqualified position does not keep a separate share. Division dust or a pool with zero qualifiers stays in a separately tracked unused reserve."
          },
          {
            "type": "paragraph",
            "text": "Claim your equal affiliate share from Affiliates after successful draw finalization; you do not need to wait for prize holders. Until then, the entire mint revenue stays reserved. Unsold expiry or a randomness timeout returns mint funds to holders and creates no affiliate payout, holder contribution or protocol treasury allocation from mint revenue."
          }
        ]
      }
    ]
  },
  {
    "slug": "refunds",
    "title": "Claim a refund",
    "description": "Full mint-price refunds with no claim deadline once the collection becomes refundable.",
    "group": "Participate",
    "minutes": 3,
    "sections": [
      {
        "id": "deadline",
        "title": "Refunds begin at the deadline and never expire",
        "blocks": [
          {
            "type": "paragraph",
            "text": "If the mint deadline is reached without sellout, the current NFT holder can claim the full mint price by burning that ticket. Once available, refunds never expire: there is no claim deadline, including after later collections or seasons begin. No operator cancellation or approval is required. The holder pays transaction gas."
          },
          {
            "type": "paragraph",
            "text": "Select the collection, enter your token ID and review the refund transaction. Each ticket can be refunded once. Burned tickets no longer exist, and refunds do not restore the cumulative mint allowance. A refundable collection contributes neither ETH nor eligible NFTs to the holder pool, even if its holders have not requested refunds. Its full mint receipts remain reserved for those refunds."
          },
          {
            "type": "paragraph",
            "text": "A sold-out collection becomes refundable if no verified randomness was recorded before 72 hours after sellout. A callback at or after the cutoff is ignored, even if no holder has requested a refund yet. Randomness recorded on time permanently commits the draw: delaying finalization never unlocks refunds. The cutoff cannot be extended by the operator or voting."
          }
        ]
      }
    ]
  },
  {
    "slug": "verification",
    "title": "Verify the contract",
    "description": "Check the network, addresses, state and transaction intent.",
    "group": "Reference",
    "minutes": 3,
    "sections": [
      {
        "id": "read",
        "title": "The contract is the source",
        "blocks": [
          {
            "type": "paragraph",
            "text": "The website verifies the configured controller’s network and runtime code before reading the official collection bindings. The website also verifies the separate holder pool’s code, controller binding and fixed allocation and coverage. Displayed state is read at one block. Failed or stale reads disable signing rather than showing unavailable balances as zero."
          },
          {
            "type": "paragraph",
            "text": "Before a signature, the wallet provider independently checks the controller and collection bindings and simulates the transaction. Review the destination, function, amount, network and account in your wallet. A confirmed receipt establishes execution; a website message alone does not."
          }
        ]
      },
      {
        "id": "useful-contract-reads",
        "title": "Useful contract reads",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Use collectionPlan and roundCount on the season controller for catalog progress; ballots and winningOption on voting for deadlines and results; maxSupply, mintPrice, totalMinted and mintDeadline on the collection for mint terms."
          },
          {
            "type": "paragraph",
            "text": "For settlement read phase, randomnessDeadline, randomnessReceived, executionReserve, executionRecipient, winningTokenIds, prizeClaimed, affiliateClaimable, refundsAvailable, operatorWithdrawable and protectedBalance. For permanent NFT identity read combination, tokenIdForCombination and tokenURI; score and scoreCombination require the finalized draw. Read holderRewards on the controller and collection to locate the pool. Its summary(seasonId) reports funded ETH, eligibleNfts, claimLimit, rewardPerNft, claims, paid, collections, settledCollections and unlocked. Check fundedCollection, claimed(collection, tokenId) and the NFT’s ownerOf before a holder claim. HOLDER_BPS is 1000 and COVERAGE_BPS is 500; neither fixes an ETH amount."
          }
        ]
      },
      {
        "id": "limits",
        "title": "Verification boundaries",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Source publication or a passing test suite is not an independent security audit. A configured site does not guarantee Chainlink availability. X is an independent event observer and can be delayed without affecting the protocol. Deployed contracts can also be read and called on their verified explorer pages."
          }
        ]
      }
    ]
  }
]);
