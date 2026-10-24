import type { DocPage } from "./model";

// Current onchain experience. Historical contracts retain their immutable terms.
export const docPages: DocPage[] = [
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
            "text": "New V13 seasons allocate 60% of mint revenue to winning NFTs, 20% to qualified affiliates, 8% to season holder rewards and 12% to the protocol treasury for infrastructure and upcoming projects. V13 is a new contract version pending deployment; existing V12 collections retain their 60/20/20 allocation and have no holder pool. These percentages cannot be voted away. Actual ETH allocations vary with the community-selected mint prices and supplies and the revenue received. All mint funds stay reserved until finalization. Unsold expiry or missing randomness at the fixed cutoff allows full mint-price refunds."
          },
          {
            "type": "paragraph",
            "text": "The protocol treasury is the public name for the contract’s ordinary operator allocation. After a successful draw, the fixed operator wallet can withdraw it. The team manages treasury spending; the collection contract does not restrict how withdrawn funds are used. Prize, earned affiliate and refund obligations remain protected. V13 holder funds are held separately in a season pool with no operator withdrawal."
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
            "text": "Open Participate to vote or mint in the current collection and follow the draw. Rewards shows all winning NFT holder addresses, prizes and refunds; choose an earlier collection there at any time. Affiliates handles enrollment, referral links and affiliate claims. Holders shows the season pool, progress and remaining first-come claim slots for V13 seasons. Connecting a wallet never submits a transaction."
          }
        ]
      }
    ]
  },
  {
    "slug": "holder-rewards",
    "title": "Season holder rewards",
    "description": "The 8% season pool, 5% NFT coverage and first-come claims in V13.",
    "group": "The protocol",
    "minutes": 5,
    "sections": [
      { "id": "pool", "title": "Not a winner, but still a holder?", "blocks": [
        { "type": "paragraph", "text": "New V13 collections automatically send 8% of mint receipts to a separate season holder pool when a draw finalizes. This contract has no operator withdrawal. The ordinary 12% treasury allocation remains withdrawable by the fixed operator for infrastructure and upcoming projects. V13 is pending deployment; existing collections are not upgraded and do not gain a new holder entitlement." },
        { "type": "paragraph", "text": "The pool is locked until every collection in its sealed season has completed a successful draw or become refundable. Unpaid prizes and refunds do not delay the unlock. No calendar timer, website switch or operator approval releases the pool. Before completion, the page shows accumulated ETH, settled collections and provisional claim estimates. A season has at most ten collections. Preparing the next season is not required to unlock this one." }
      ]},
      { "id": "dynamic-amounts", "title": "Different seasons, different amounts", "blocks": [
        { "type": "paragraph", "text": "The allocation percentages and 5% coverage are fixed. Voting selects each collection’s price and supply; successful mints determine the actual revenue and eligible NFT count. Each season adds its successful collections’ 8% contributions into its own pool. Pending and refundable collections do not inflate the funded balance." },
        { "type": "paragraph", "text": "Claim slots equal 5% of the season’s eligible NFTs, rounded down. The ETH per claim equals the final pool divided by those slots, rounded down to whole wei. Estimates may change while collections are unsettled. Once the season ends, every successful claim receives the same final amount, even if individual NFTs had different mint prices. Claims reduce the remaining slots and available ETH; they do not change the amount paid to later claimants." },
        { "type": "table", "columns": ["Illustrative successful mints", "Result for that season"], "rows": [
          ["1,000 at 0.01 ETH + 2,000 at 0.02 ETH", "4 ETH pool · 150 claim slots · 4 ETH ÷ 150 per claim, rounded down to wei"],
          ["A separate season: 1,000 at 0.03 ETH", "2.4 ETH pool · 50 claim slots · 0.048 ETH per claim"]
        ] }
      ]},
      { "id": "claims", "title": "Equal rewards for the first 5%", "blocks": [
        { "type": "paragraph", "text": "Only NFTs from successfully drawn collections qualify, including winning NFTs. The first 5% of eligible NFTs to claim receive equal rewards. Claims are paid in onchain execution order until the fixed slots run out; a pending transaction reserves nothing. Eligible ownership does not guarantee a payment. There is no per-wallet claim limit." },
        { "type": "paragraph", "text": "Claim slots equal the total eligible NFT count multiplied by 5%, rounded down. Each payout equals the final funded pool divided by the slots, rounded down to whole wei. For 10,000 eligible NFTs and an 8 ETH pool, the first 500 NFT claims each receive 0.016 ETH. This is an example, not a fixed payout. Any rounding dust stays in the pool." },
        { "type": "paragraph", "text": "The current owner submits the claim, once per NFT. Transfers carry any unclaimed opportunity; they never reset a completed claim. Approved NFT operators cannot claim on an owner’s behalf. Unclaimed winning NFTs remain transfer-locked until their ticket prize is claimed. Holder rewards do not consume a winning-ticket prize, affiliate claim or lifetime sponsored-mint benefit." },
        { "type": "paragraph", "text": "There is no claim expiry. At /holders, select a prepared collection, enter an NFT token ID and connect its current owner. Review the exact amount, network, collection and recipient before signing. The website checks current ownership, used claims and remaining slots again after review; the contract enforces them at execution." }
      ]},
      { "id": "open-page", "title": "Follow your season", "blocks": [
        { "type": "links", "items": [{ "label": "Open holder rewards", "description": "Select a collection to view its season pool, settlement progress and claim availability.", "href": "/holders" }] }
      ]},
      { "id": "refunds", "title": "Failed collections keep full refunds", "blocks": [
        { "type": "paragraph", "text": "Unsold or randomness-timeout collections do not contribute funds or eligible NFTs to this pool. Their full mint receipts remain reserved for NFT refunds. If every collection is refundable, the season ends with no holder claims. Already deployed versions keep their own immutable rules." }
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
        "id": "vote",
        "title": "One eligible NFT, one vote",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Voting power is the number of eligible NFTs you held immediately before voting opened. Only previously successful, revealed and fully backed official collections qualify. Transferring an NFT after that snapshot does not give its recipient another vote."
          },
          {
            "type": "paragraph",
            "text": "Each ballot offers published economic packages. The package with the most votes wins; ties choose the lowest numbered tied option. No votes choose the first published option. The reviewed menu is fixed for the sealed catalog."
          },
          {
            "type": "paragraph",
            "text": "Mint price is at least 0.01 ETH. Supply is 1,000–65,536 NFTs and remains fixed once minting opens. Mint duration is 1–24 hours. Equal winning NFTs number 1–10, excluding 7 and 9 because the prize allocation must divide exactly."
          },
          {
            "type": "paragraph",
            "text": "For illustration, a successful V13 collection of 1,000 NFTs at 0.01 ETH collects 10 ETH: 6 ETH for prizes, 2 ETH for affiliates, 0.8 ETH for season holders and 1.2 ETH for the treasury. The V13 treasury allocation stays 12%, intended to cover current infrastructure costs and fund upcoming Tincta projects. Existing V12 contracts keep their 20% treasury allocation. The fixed operator wallet withdraws and manages these funds; this purpose is not an onchain spending restriction."
          },
          {
            "type": "paragraph",
            "text": "Vote in source groups of up to 16 collections. Each source balance can be consumed once per ballot. Eligible historical NFTs need to be deposited into the voting vault before the snapshot because their original contracts lack ownership checkpoints. They can be withdrawn at any time."
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
            "text": "Select Connect wallet in the header to open Reown AppKit. Choose an installed Ethereum wallet or connect a mobile wallet with WalletConnect. The header shows your connected address and network across Participate, Rewards, Affiliates, Holders and these docs. Open it to manage or disconnect your wallet. Check Ethereum Mainnet or Sepolia, the collection address, final price, supply and mint deadline. Keep enough ETH for the purchase and gas."
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
            "text": "Each recipient can receive at most 20 primary mints per collection across paid, referral and sponsored paths. A batch can contain at most 20 tickets. Transfers and refunds do not restore that allowance."
          },
          {
            "type": "paragraph",
            "text": "Wait for a confirmed receipt. If the outcome is uncertain, recover the original transaction by its hash rather than sending it again. Keep your token IDs from the transaction’s Transfer events for ticket-specific actions. In V13, follow Holders after a successful draw to see the season pool and its progress. Claims open only after every collection settles, with slots for the first 5% of eligible NFTs. Owning a ticket does not reserve a slot."
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
            "text": "Season names, collection names, order and geometric artwork are planned before the catalog is sealed. The next collection can be prepared after the previous draw is finalized with all liabilities funded, or refunds become available after unsold expiry or the randomness timeout. Old unpaid prizes and refunds remain reserved. In V13, each successful draw also funds its season’s holder pool. The pool unlocks only when every planned collection in that season has drawn or become refundable; unpaid prizes and refunds do not delay it. The Holders page shows settled-collection progress before and after unlock."
          },
          {
            "type": "paragraph",
            "text": "Preparation funds randomness, sponsorship and a 0.01 ETH executor reward separately from mint receipts, then publishes the voting schedule. After verified randomness arrives, the operator can finalize the draw, withdraw the remaining protocol treasury allocation (12% in V13; 20% in V12) for infrastructure and future Tincta projects, and prepare the next collection in one transaction. A scheduled opening happens at the voting deadline without another signature. The dashboard shows pending actions and the current collection’s timing."
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
            "text": "Open Rewards and select the collection. Its winning tickets list reads every current holder address, token ID, prize and claim status from the contract. Only the current holder can claim that ticket’s prize. Unclaimed winning tickets stay transfer-locked. Unpaid prizes remain reserved when later collections open. V13 holder rewards are separate: winning and non-winning NFTs from successful draws can claim from the season pool after season end, while the first-5% slots remain. Claiming one does not consume the other."
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
            "text": "Affiliate enrollment is open during the collection’s voting window, subject to an available position and onchain eligibility. Ordinarily you must hold an eligible NFT from an earlier successful official collection. A fresh protocol’s explicitly configured first collection can allow the initial no-NFT enrollment exception."
          },
          {
            "type": "paragraph",
            "text": "Enrollment uses your wallet and an onchain eligibility source. No server-issued admission permit is required. Keep the referral link shown after enrollment."
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
            "text": "Claim your equal affiliate share from Affiliates after successful draw finalization; you do not need to wait for prize holders. Until then, the entire mint revenue stays reserved. Unsold expiry or a randomness timeout returns mint funds to holders and creates no affiliate payout, V13 holder contribution or protocol treasury allocation from mint revenue."
          }
        ]
      }
    ]
  },
  {
    "slug": "refunds",
    "title": "Refund an expired ticket",
    "description": "Full mint-price refunds for unsold collections or the fixed randomness timeout.",
    "group": "Participate",
    "minutes": 3,
    "sections": [
      {
        "id": "deadline",
        "title": "Refunds begin at the deadline",
        "blocks": [
          {
            "type": "paragraph",
            "text": "If the mint deadline is reached without sellout, the current NFT holder can claim the full mint price by burning that ticket. No operator cancellation or approval is required. The holder pays transaction gas."
          },
          {
            "type": "paragraph",
            "text": "Select the collection, enter your token ID and review the refund transaction. Each ticket can be refunded once. Burned tickets no longer exist, and refunds do not restore the cumulative mint allowance. A refundable collection contributes neither ETH nor eligible NFTs to the V13 holder pool, even if its holders have not requested refunds. Its full mint receipts remain reserved for those refunds."
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
            "text": "The website verifies the configured controller’s network and runtime code before reading the official collection bindings. V13 also verifies the separate holder pool’s code, controller binding and fixed allocation and coverage. Displayed state is read at one block. Failed or stale reads disable signing rather than showing unavailable balances as zero."
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
            "text": "For settlement read phase, randomnessDeadline, randomnessReceived, executionReserve, executionRecipient, winningTokenIds, prizeClaimed, affiliateClaimable, refundsAvailable, operatorWithdrawable and protectedBalance. For permanent NFT identity read combination, tokenIdForCombination and tokenURI; score and scoreCombination require the finalized draw. In V13, read holderRewards on the controller and collection to locate the pool. Its summary(seasonId) reports funded ETH, eligibleNfts, claimLimit, rewardPerNft, claims, paid, collections, settledCollections and unlocked. Check fundedCollection, claimed(collection, tokenId) and the NFT’s ownerOf before a holder claim. HOLDER_BPS is 800 and COVERAGE_BPS is 500; neither fixes an ETH amount."
          }
        ]
      },
      {
        "id": "limits",
        "title": "Verification boundaries",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Source publication or a passing test suite is not an independent security audit. A configured site does not guarantee Chainlink availability. X is an independent event observer and can be delayed without affecting the protocol. Historical contracts retain their actual version and can still be read and called on their verified explorer pages."
          }
        ]
      }
    ]
  }
];
