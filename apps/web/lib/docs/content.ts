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
            "text": "Each successfully finalized collection allocates 60% of mint revenue to winning NFTs, 20% to qualified affiliates and 20% to the operator. These percentages cannot be voted away. All mint funds stay reserved until finalization. Unsold expiry or missing randomness at the fixed cutoff allows full mint-price refunds."
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
            "text": "Open Participate to vote or mint in the current collection and follow the draw. Rewards shows all winning NFT holder addresses, prizes and refunds; choose an earlier collection there at any time. Affiliates handles enrollment, referral links and affiliate claims. Connecting a wallet never submits a transaction."
          }
        ]
      }
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
            "text": "A sold-out collection of 1,000 NFTs at 0.01 ETH collects 10 ETH and allocates 2 ETH to the operator. A collection of 2,000 at the same price collects 20 ETH and allocates 4 ETH. The operator percentage stays 20%, before execution costs."
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
            "text": "Use an Ethereum-compatible wallet you control. Check Ethereum Mainnet or Sepolia, the collection address, final price, supply and mint deadline. Keep enough ETH for the purchase and gas."
          }
        ]
      },
      {
        "id": "mint",
        "title": "Mint from the main page",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Select a prepared collection. Connect your wallet and explicitly select the account that should receive your NFTs. Choose the quantity and check any affiliate reference. Review the payment, then confirm the transaction in your wallet."
          },
          {
            "type": "paragraph",
            "text": "Each recipient can receive at most 20 primary mints per collection across paid, referral and sponsored paths. A batch can contain at most 20 tickets. Transfers and refunds do not restore that allowance."
          },
          {
            "type": "paragraph",
            "text": "Wait for a confirmed receipt. If the outcome is uncertain, recover the original transaction by its hash rather than sending it again. Keep your token IDs from the transaction’s Transfer events for ticket-specific actions."
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
            "text": "Season names, collection names, order and geometric artwork are planned before the catalog is sealed. The next collection can be prepared after the previous draw is finalized with all liabilities funded, or refunds become available after unsold expiry or the randomness timeout. Old unpaid prizes and refunds remain reserved."
          },
          {
            "type": "paragraph",
            "text": "Preparation funds randomness, sponsorship and a 0.01 ETH executor reward separately from mint receipts, then publishes the voting schedule. After verified randomness arrives, the operator can finalize the draw, withdraw the remaining 20% and prepare the next collection in one transaction. A scheduled opening happens at the voting deadline without another signature. The dashboard shows pending actions and the current collection’s timing."
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
            "text": "60% of mint revenue is split equally among the configured winning NFTs. Winners are distinct tickets, not necessarily distinct wallets. Permanent artwork identifies your ticket; it never announces a score or winning status."
          }
        ]
      },
      {
        "id": "claim",
        "title": "Holder-only claims",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Open Rewards and select the collection. Its winning tickets list reads every current holder address, token ID, prize and claim status from the contract. Only the current holder can claim that ticket’s prize. Unclaimed winning tickets stay transfer-locked. Unpaid prizes remain reserved when later collections open."
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
            "text": "At least one attributed paid referral qualifies an enrolled affiliate. Self-referrals are rejected. At sellout, all qualified affiliates divide the entire 20% affiliate pool equally, regardless of their individual referral counts."
          },
          {
            "type": "paragraph",
            "text": "If three out of ten positions qualify, each receives one third of the pool, rounded down to whole wei. An unfilled or unqualified position does not keep a separate share. Division dust or a pool with zero qualifiers stays in a separately tracked unused reserve."
          },
          {
            "type": "paragraph",
            "text": "Claim your equal affiliate share from Affiliates after successful draw finalization; you do not need to wait for prize holders. Until then, the entire mint revenue stays reserved. Unsold expiry or a randomness timeout returns mint funds to holders and creates no affiliate or operator mint proceeds."
          }
        ]
      }
    ]
  },
  {
    "slug": "refunds",
    "title": "Refund an expired ticket",
    "description": "Get the full mint price back when a collection does not sell out.",
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
            "text": "Select the collection, enter your token ID and review the refund transaction. Each ticket can be refunded once. Burned tickets no longer exist, and refunds do not restore the cumulative mint allowance."
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
            "text": "The website verifies the configured controller’s network and runtime code before reading the official collection bindings. Displayed state is read at one block. Failed or stale reads disable signing rather than showing unavailable balances as zero."
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
            "text": "For settlement read phase, randomnessDeadline, randomnessReceived, executionReserve, executionRecipient, winningTokenIds, prizeClaimed, affiliateClaimable, refundsAvailable, operatorWithdrawable and protectedBalance. For permanent NFT identity read combination, tokenIdForCombination and tokenURI; score and scoreCombination require the finalized draw."
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
