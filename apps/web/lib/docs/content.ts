import type { DocPage } from "./model";

// Public explanations of V10 and version-specific historical behavior. A deployed collection's
// immutable terms remain authoritative, including for earlier contract versions.
export const docPages: DocPage[] = [
  {
    slug: "overview", title: "How rewards work", group: "Start here", minutes: 2,
    description: "Understand prize values, protected funds, and direct contract claims.",
    sections: [
      { id: "what-is-tincta", title: "ETH rewards. Governed by smart contracts.", blocks: [
        { type: "paragraph", text: "Tincta offers finite NFT draws with ETH prizes and affiliate rewards. In the current design, the smart contract holds prize funds and earned affiliate rewards, protects them from team withdrawals, and sends eligible claims directly to the chosen wallet. Winners are determined on-chain using verifiable randomness after sellout. No manual payout approval is needed." },
        { type: "paragraph", text: "The default format has six winning NFTs with equal prizes. The contract supports one to ten distinct winning NFTs, fixed in each collection’s terms. Collectors can also participate in its affiliate program, subject to enrollment and referral rules. Check the published mint price, supply, prizes and affiliate terms for each collection." },
        { type: "callout", title: "V10 rollout status", text: "V10 rollout is pending. Its contracts and application support are implemented locally; no live V10 deployment is recorded. These guides explain its new architecture alongside earlier versions. Existing V8/V9 collections keep their sealed-then-revealed artwork. Check the actual collection’s contract version before applying a guide." },
        { type: "callout", title: "A ticket is a chance, not a promised return", text: "Most tickets do not win. Holding an NFT does not automatically earn affiliate rewards, and resale value is not guaranteed. Check the network and collection terms before you mint." },
      ] },
      { id: "start-exploring", title: "Find your starting point", blocks: [
        { type: "links", items: [
          { label: "Your first ticket", description: "From choosing a collection to finding your NFT.", href: "/docs/quickstart" },
          { label: "Seasons & collections", description: "Find collections, prize values, and opening times.", href: "/docs/seasons" },
          { label: "Claim your prize", description: "Who wins, who can claim, and when.", href: "/docs/prizes" },
          { label: "Earn affiliate rewards", description: "Eligibility, referrals and shared rewards.", href: "/docs/affiliates" },
        ] },
      ] },
      { id: "read-the-right-rules", title: "Each collection keeps its own rules", blocks: [
        { type: "paragraph", text: "The six-prize default does not replace a collection’s frozen terms. Earlier collections may have one or two winners, different artwork, or different affiliate rules. Their deployed contracts and historical results do not change when a new format is introduced." },
        { type: "paragraph", text: "A feature described here is available only where the corresponding contracts and services have been deployed and configured. A Sepolia label means testnet activity, not an Ethereum Mainnet launch. Documentation is not evidence of an independent security audit." },
        { type: "links", items: [{ label: "Verify a collection", description: "Check its network, contract and published terms.", href: "/docs/verification" }] },
      ] },
    ],
  },
  {
    slug: "quickstart", title: "Your first ticket", group: "Start here", minutes: 3,
    description: "Choose a prize collection, mint a ticket, and follow its result.",
    sections: [
      { id: "before-you-start", title: "Before you start", blocks: [
        { type: "list", items: ["Use an Ethereum-compatible wallet you control.", "Check the network shown by the collection. Ethereum Mainnet and Ethereum Sepolia are different networks.", "Keep enough ETH on that network for the mint price and the network transaction fee.", "Read the collection’s supply, deadline, prize terms and contract details before confirming a purchase."] },
        { type: "callout", title: "Testing on Sepolia", text: "Sepolia uses test ETH. A Sepolia NFT or prize is a testnet asset and does not become a Mainnet asset automatically." },
      ] },
      { id: "mint-a-ticket", title: "Choose, connect, mint", blocks: [
        { type: "list", ordered: true, items: ["Open Seasons. The mint entry opens the current live season when one is available, with the active collection highlighted.", "Open the collection and connect your wallet. Check that the displayed account is the one that should receive your NFT.", "Choose your ticket quantity. If you arrived through an affiliate link, check the referral displayed before submitting.", "Review the total and confirm the mint transaction in your wallet. Wait for its on-chain confirmation.", "Open My Tickets to see your tickets. The website may need a little time to index the confirmed transaction."] },
      ] },
      { id: "after-minting", title: "What happens next", blocks: [
        { type: "paragraph", text: "A V10 NFT has its four permanent numbers and finished artwork from mint. Its score and any prize remain pending until the post-sellout draw is finalized, and are checked separately from the image. Historical V8/V9 tickets stay sealed until finalization reveals their numbers and score." },
        { type: "paragraph", text: "A winning NFT’s current holder can claim its award. If an unsold collection reaches its deadline, the current holder can instead claim the mint-price refund under that collection’s rules." },
        { type: "links", items: [
          { label: "Browse seasons", description: "See published collections and mint availability.", href: "/seasons" },
          { label: "View My Tickets", description: "Find your tickets and their current status.", href: "/my-nfts" },
          { label: "Understand the draw", description: "Learn how results are generated and checked.", href: "/docs/randomness" },
        ] },
      ] },
    ],
  },
  {
    slug: "seasons", title: "Seasons", group: "The protocol", minutes: 3,
    description: "Find prize collections and follow their opening schedule.",
    sections: [
      { id: "a-family-of-collections", title: "A series of prize collections", blocks: [
        { type: "paragraph", text: "A season groups up to ten prize collections. Each collection has its own ticket price, supply, prize values, affiliate terms and contract. Compare the published rewards and opening times before choosing where to participate." },
        { type: "paragraph", text: "A season is an organizing layer, not a single pooled draw. Each collection has its own finite supply, mint window, prize reserve, affiliate program and result. Owning a ticket in one collection does not enter you into every collection in that season." },
      ] },
      { id: "find-the-live-collection", title: "Find the live collection", blocks: [
        { type: "paragraph", text: "The Seasons page lists published collections. The mint entry takes you to the season containing the current open mint, with that collection highlighted. If nothing is live, it opens Seasons instead." },
        { type: "paragraph", text: "A live mint must have a deployed contract, an activated sale, remaining supply, a reached opening time and an unexpired deadline. A saved launch draft or a future opening is not an open sale." },
      ] },
      { id: "between-collections", title: "Between collections", blocks: [
        { type: "paragraph", text: "Seasons can be configured with a fixed interval between a collection’s sellout and the next collection’s scheduled opening. Announcement timing is a separate setting. Always use the published opening time; do not assume every season uses the same interval." },
        { type: "paragraph", text: "Sellout does not instantly reveal the winners. Results need the randomness response and draw finalization. In the current design, the next collection may proceed after the previous draw is finalized and outstanding liabilities are funded, without waiting for every winner to claim." },
        { type: "callout", title: "An announcement is not a draw result", text: "Sales statistics can be known at sellout while results are still pending. Only finalized on-chain results identify the winners. The launch planner’s schedule does not by itself mean automatic deployment or social posting is running." },
      ] },
      { id: "explore-more", title: "Explore more", blocks: [
        { type: "links", items: [{ label: "Collections", description: "See the lifecycle and terms of an individual draw.", href: "/docs/collections" }, { label: "Browse seasons", description: "Compare published collections and their rewards.", href: "/seasons" }] },
      ] },
    ],
  },
  {
    slug: "collections", title: "Collections", group: "The protocol", minutes: 4,
    description: "One collection. One set of terms. One finite draw.",
    sections: [
      { id: "what-belongs-to-a-collection", title: "What belongs to a collection", blocks: [
        { type: "paragraph", text: "Every collection has a separate smart contract that fixes its ticket price, supply, prize values, winner count, affiliate terms and sale deadline. These settings are bound at deployment in the current contract design." },
        { type: "paragraph", text: "The default format uses 1,000 tickets and six equal awards, but a collection’s actual configuration is what matters. The winner count can be one to ten, bounded by the supply. New seasons can use different settings. They cannot rewrite the terms of NFTs already minted under an older contract." },
      ] },
      { id: "collection-lifecycle", title: "The collection lifecycle", blocks: [
        { type: "table", columns: ["Stage", "What it means"], rows: [
          ["Before opening", "The collection is prepared and eligible affiliates can enroll during its enrollment window. Minting is not yet open."],
          ["Mint open", "The sale is activated, the opening has arrived, and tickets remain before the deadline. V10 numbers and artwork are fixed as each NFT is minted."],
          ["Sold out", "Every ticket has been minted. Sales close and the qualifying affiliate allocation is fixed."],
          ["Draw pending", "The collection requests randomness, receives the verified response, and finalizes the ranking."],
          ["Revealed / draw finalized", "Final scores and winning NFTs are public. V10 numbers and artwork stay unchanged. Each winner can claim independently."],
          ["Complete", "All configured prize awards have been claimed. The NFTs remain collectibles."],
          ["Refundable", "An unsold collection reached its deadline. Its remaining NFTs can be burned for the mint-price refund."],
        ] },
      ] },
      { id: "what-your-nft-contains", title: "What your NFT contains", blocks: [
        { type: "paragraph", text: "V10 artwork is a self-contained SVG generated on-chain. It combines a collection color with the season’s linework, collection and season names, ticket serial, four permanent numbers and combination code. The metadata and image stay unchanged through the draw, claims and transfers. Decorative geometry does not change a ticket’s odds." },
        { type: "paragraph", text: "Final score, award rank, prize and claim status are deliberately absent from V10 metadata and artwork. Read those changing facts from the contract. V8/V9 instead display sealed artwork until the draw is finalized, then add numbers, score and any winning label. Their winning label alone does not prove a prize remains unpaid." },
      ] },
      { id: "older-collections", title: "Earlier collections remain valid", blocks: [
        { type: "paragraph", text: "History may contain earlier Manekineko-named collections, different artwork and different award counts. These are historical contract facts, not display errors. Use the collection-specific terms when checking a prize, referral payment or claim." },
        { type: "links", items: [{ label: "Results", description: "Review completed collections and recorded results.", href: "/history" }, { label: "Claim your prize", description: "Understand the current equal-prize model.", href: "/docs/prizes" }] },
      ] },
    ],
  },
  {
    slug: "minting", title: "Minting a ticket", group: "Participate", minutes: 4,
    description: "What you pay, what you receive, and what your wallet confirms.",
    sections: [
      { id: "price-and-network-fees", title: "Price and network fees", blocks: [
        { type: "paragraph", text: "A mint buys an NFT at the collection’s published mint price. Your wallet also pays the Ethereum transaction fee, usually called gas. Gas is charged by the network and is separate from the amount allocated to prizes and affiliates." },
        { type: "paragraph", text: "V9 and V10 limit each recipient wallet to 20 primary mints in each collection, across all transactions. Paid, referral and sponsored mints to that wallet share this allowance. Transfers and refund burns do not restore it; secondary-market purchases are not counted. Earlier deployments keep their original limits. Each purchase requires the exact mint price multiplied by the quantity, subject to remaining supply and wallet allowance. A failed transaction does not mint a ticket, though a transaction included on-chain can still consume gas." },
      ] },
      { id: "numbers-at-mint", title: "Numbers at mint", blocks: [
        { type: "paragraph", text: "V10 assigns the next token ID and generates its four numbers entirely in Solidity. Buyers supply no numbers, seed or randomness in any mint function. The numbers are unique within the collection and permanent from mint; there is no per-mint VRF request or randomness waiting period." },
        { type: "paragraph", text: "The combinations are publicly predictable, so someone may prefer an upcoming ticket’s appearance. That does not reveal its final score or improve its chance of winning. Only the separate VRF draw after sellout determines the result. V8/V9 keep their original post-draw number generation." },
      ] },
      { id: "check-before-confirming", title: "Check before confirming", blocks: [
        { type: "list", items: ["The correct account and network are selected in your wallet.", "The collection contract matches the address linked by the collection page.", "The displayed quantity and mint price are correct.", "The sale is open and the mint deadline has not passed.", "If using an affiliate link, the intended referral is shown before you submit."] },
        { type: "paragraph", text: "A website connection gives the site permission to see the shared account. It is not a mint transaction. If you change accounts, check the address displayed in the app before signing or sending anything." },
      ] },
      { id: "referrals-and-sponsorship", title: "Referrals and sponsored tickets", blocks: [
        { type: "paragraph", text: "A referral mint costs the buyer the same published mint price. Attribution is recorded in the mint transaction using an enrolled affiliate’s position. Visiting a link alone does not record a referral, and a confirmed mint cannot be attributed retroactively." },
        { type: "paragraph", text: "An eligible winner reward can sponsor one ticket where that feature is configured and funded. The sponsorship reserve pays the full mint price into the collection; the winning wallet still pays transaction gas. A sponsored ticket uses normal supply and is not counted as an affiliate referral." },
      ] },
      { id: "after-confirmation", title: "After confirmation", blocks: [
        { type: "paragraph", text: "The confirmed contract transaction is the source of truth. The app indexes mint and transfer events, including transactions submitted directly through an explorer, so the visible ticket count and My Tickets list may update after confirmation rather than immediately." },
        { type: "links", items: [{ label: "My Tickets", description: "See your tickets, artwork and status.", href: "/docs/my-nfts" }, { label: "Redeem a sponsored ticket", description: "Read the one-time sponsored mint rules.", href: "/docs/winner-rewards" }] },
      ] },
    ],
  },
  {
    slug: "randomness", title: "How winners are selected", group: "The protocol", minutes: 5,
    description: "Permanent ticket numbers at mint. One verifiable draw after sellout.",
    sections: [
      { id: "one-draw-after-sellout", title: "One draw after sellout", blocks: [
        { type: "paragraph", text: "Tickets are minted before the result is known. After sellout closes the ticket set, the collection makes one Chainlink VRF request. Chainlink produces randomness with a cryptographic proof, which the configured coordinator verifies on-chain before delivering the result." },
        { type: "paragraph", text: "The contract accepts only its recorded request from its fixed coordinator. Its owner cannot replace the coordinator, choose a different random result or request a reroll after a successful request. Randomness funding is separate from ticket receipts." },
        { type: "callout", title: "What is on-chain?", text: "Ticket ownership, the result, scoring, SVG artwork and claims are on-chain. Chainlink VRF includes an off-chain randomness service with on-chain proof verification. The website and its indexer are also services; the entire system is not independent of off-chain infrastructure." },
      ] },
      { id: "distinct-winning-tickets", title: "Distinct winning tickets", blocks: [
        { type: "paragraph", text: "Finalization selects the configured one to ten winning token IDs without replacement, with six as the default. This guarantees the configured count of distinct winning NFTs once the draw completes. Rejection sampling avoids the bias of taking a random number modulo an arbitrary collection size. Each winning ticket receives a different top score, so there are no tied winning positions." },
        { type: "paragraph", text: "For six awards in a 1,000-ticket collection, each ticket has a 6-in-1,000 chance of any award. Six different NFTs win, but a wallet can hold more than one of them. Mint order, collection color and decorative linework do not improve a ticket’s chance." },
        { type: "paragraph", text: "All remaining tickets receive distinct lower scores in token order after the winners are removed. This is a random selection of winning tickets, not a complete random shuffle of every losing score." },
      ] },
      { id: "four-numbers-one-score", title: "Permanent numbers, later scores", blocks: [
        { type: "paragraph", text: "V10 generates a ticket’s four numbers in Solidity from its assigned token ID and a fixed collection key. The reversible mapping is one-to-one, so different NFTs in that collection have different ordered combinations. Each number is from 1 to 16; digits can repeat within a combination. Numbers can repeat across collections, so always include the network and collection address when identifying an NFT." },
        { type: "paragraph", text: "The mapping is public and predictable. It supplies ticket identity, not randomness or a final score. No buyer supplies numbers or a seed, and no VRF request runs at each mint or at deployment. One later VRF draw after sellout determines winners and scores independently of the permanent numbers." },
        { type: "paragraph", text: "After finalization, a 1,000-ticket collection with six awards gives the winners scores 1,000 through 995 and the other tickets unique scores 1 through 994. The four numbers remain unchanged. The contract can resolve the combination to its token and then read that token’s final score." },
        { type: "callout", title: "Earlier V8/V9 numbers have a different meaning", text: "V8/V9 derive their four numbers from the final score after the draw. They use a revealed collection key to decode that score. That historical encoding must not be used to interpret V10’s permanent token identities." },
      ] },
      { id: "when-results-are-pending", title: "When results are pending", blocks: [
        { type: "paragraph", text: "Sellout, randomness delivery and finalization are separate on-chain steps. A delay does not mean the collection has selected a different result. Requesting randomness and finishing the draw are permissionless contract actions, but they still need transactions and a functioning, sufficiently funded randomness service." },
        { type: "paragraph", text: "A sold-out current collection does not have a timeout refund or a reroll path if the randomness service is delayed. That dependency and contract risk remain relevant even though the result is verifiable." },
        { type: "links", items: [{ label: "Verify the result", description: "Which contract values and records to inspect.", href: "/docs/verification" }, { label: "Claim a prize", description: "What happens after finalization.", href: "/docs/prizes" }] },
      ] },
    ],
  },
  {
    slug: "prizes", title: "Claim your prize", group: "Participate", minutes: 4,
    description: "Check your prize value and claim directly from the contract.",
    sections: [
      { id: "six-equal-awards", title: "Six equal awards", blocks: [
        { type: "paragraph", text: "The default format reserves a collection’s configured prize amount for six equally paid winning NFTs. The six highest scores identify the six award positions. The first-ranked ticket and the sixth-ranked ticket receive the same amount in this format. A collection can instead configure one to ten equal awards, bounded by its supply; check its actual terms." },
        { type: "callout", title: "Check the published prize", text: "For example, a collection may offer six equal awards of 1 ETH each. The amount per winning NFT depends on that collection’s configuration. Check its published prize terms before minting; other collections may offer different amounts." },
        { type: "paragraph", text: "Six winning tickets does not mean six different people or wallets. If one wallet holds two winning NFTs, it can claim both awards. Earlier collections keep their original award count and split. V10’s permanent numbers do not change these prize or holder-claim rules." },
      ] },
      { id: "who-can-claim", title: "Only the winning holder can claim", blocks: [
        { type: "paragraph", text: "After the draw is finalized, the current holder of each winning NFT can claim its prize and choose the receiving address. The collection owner and an NFT-approved operator cannot claim that prize on the holder’s behalf. A successful claim can happen only once per award." },
        { type: "list", ordered: true, items: ["Connect the wallet that holds the winning NFT on the collection’s network.", "Open the collection, review its finalized award and confirm that it remains unclaimed.", "Submit the claim and pay the network fee.", "Wait for the transaction confirmation. A paid award remains a winning collectible, but has no second prize payment."] },
        { type: "paragraph", text: "Each award is independent. Another holder’s delayed claim or failed receiving address does not prevent your own valid claim. The current contract sets no prize-claim expiry." },
      ] },
      { id: "transfers-and-reserves", title: "How reward funds are protected", blocks: [
        { type: "paragraph", text: "At sellout, ticket transfers lock until the draw is revealed. After reveal, losing tickets can transfer again. Each winning NFT stays locked until its own prize is claimed, then becomes transferable as a collectible." },
        { type: "paragraph", text: "The contract protects unclaimed prizes and earned affiliate rewards from team withdrawals. Reward payouts go directly from the contract to the authorized receiving address when claimed, without passing through a team wallet. Separate operating funds and unallocated reserves follow their own withdrawal rules; they are not unpaid rewards." },
      ] },
      { id: "after-a-win", title: "After a win", blocks: [
        { type: "links", items: [{ label: "Redeem a sponsored ticket", description: "A qualifying winner may redeem one sponsored NFT for their wallet’s lifetime.", href: "/docs/winner-rewards" }, { label: "Results", description: "Review finalized results and payout status.", href: "/history" }] },
      ] },
    ],
  },
  {
    slug: "affiliates", title: "Earn affiliate rewards", group: "Participate", minutes: 6,
    description: "Refer paid mints, check your reward in ETH, and claim after sellout.",
    sections: [
      { id: "who-can-enroll", title: "Who can enroll", blocks: [
        { type: "paragraph", text: "Each collection has a limited set of affiliate positions. In the current program, an applicant must hold an NFT from an earlier eligible official collection on the same network. It does not need to be a winning NFT. The first collection in that network’s canonical eligibility registry is the bootstrap exception and can enroll without a prior NFT." },
        { type: "paragraph", text: "For current ranked-prize source collections, the earlier draw must have sold out, revealed and fully backed its outstanding liabilities. Every winner does not need to have claimed yet. Older supported sources must meet their own completion rules. Failed, refunded, unknown and current-collection NFTs do not qualify." },
        { type: "list", items: ["One position per wallet in each collection.", "One qualifying NFT can unlock only one position in that destination collection, even if it is transferred afterward.", "Keep ownership until enrollment confirms. Afterward, selling the NFT does not move or cancel your affiliate position or earned balance.", "The NFT’s current holder may use it again for a different future collection.", "Enrollment closes at the scheduled opening time, even if sale activation is delayed."] },
      ] },
      { id: "enroll-and-share", title: "Enroll, then share your link", blocks: [
        { type: "list", ordered: true, items: ["Open the collection’s Affiliate rewards page and connect the intended account.", "Choose an eligible NFT where required and complete wallet verification and the automated abuse checks.", "Review the offered position and collection terms, then submit the enrollment transaction before the window closes.", "Once enrolled, copy that position’s collection-specific referral URL and share it with potential buyers.", "Follow your attributed tickets and qualification progress on the affiliate page."] },
        { type: "paragraph", text: "Admission uses a signed permit bound to the applicant, collection, position, terms, eligibility NFT, nonce and expiry. The contract verifies the permit and the NFT requirement. Network and human-verification checks reduce abuse; they do not prove that every wallet belongs to a different person." },
      ] },
      { id: "what-counts-as-a-referral", title: "What counts as a referral", blocks: [
        { type: "paragraph", text: "A referral counts when a paid mint confirms with your enrolled affiliate position recorded in the transaction. Clicks, connected wallets and unsigned orders do not count. A direct mint without attribution cannot be assigned to you later." },
        { type: "paragraph", text: "The buyer pays the same mint price. The current contract rejects a referral when the enrolled affiliate is the transaction payer or the NFT recipient. Sponsored winner-reward mints do not count as referred sales." },
        { type: "paragraph", text: "A URL is a way to carry an affiliate ID to the mint page, not an entitlement to money by itself. Changing it cannot create an unregistered position or change the contract’s payout terms. Buyers should check the displayed referral before signing; sharing a link does not guarantee that a buyer keeps its attribution." },
      ] },
      { id: "how-the-pool-is-shared", title: "How the pool is shared", blocks: [
        { type: "paragraph", text: "Only enrolled affiliates who reach the collection’s published minimum number of paid referred tickets qualify. At sellout, all qualified affiliates receive an equal allocation, subject to a common payout cap. Empty positions and enrolled affiliates below the minimum receive nothing." },
        { type: "table", columns: ["Step", "Calculation"], rows: [
          ["Pool", "The collection’s configured affiliate allocation from primary mint receipts."],
          ["Uncapped equal share", "The pool divided by the number of qualified affiliates."],
          ["Common cap", "The collection’s ETH limit per qualifying referral multiplied by the fewest paid referrals among qualified affiliates."],
          ["Each qualified affiliate’s payout", "The smaller of the uncapped equal share and the common cap."],
        ] },
        { type: "paragraph", text: "If four affiliates qualify, each receives the same allocation. The common cap still applies, so qualification does not guarantee that the entire pool is distributed. Check the collection’s referral minimum and payout cap, then use your final claimable balance to see what you have earned." },
        { type: "paragraph", text: "The growth reserve is not an affiliate entitlement or automatically enforced future spending. After reveal, the owner can release it through a separate recorded withdrawal. Earlier collections may use proportional pools or individual referral rates instead of this qualified-equal model." },
      ] },
      { id: "withdraw-your-allocation", title: "Claim your affiliate rewards", blocks: [
        { type: "paragraph", text: "A final affiliate balance becomes claimable at sellout. The enrolled wallet can withdraw it to a chosen receiving address without waiting for the winners’ prize claims. The withdrawal needs a network fee. Estimates before sellout can change as receipts and the set of qualifiers change." },
        { type: "paragraph", text: "No referrals means no payout. Referrals below the minimum also mean no payout. If the collection expires unsold, no affiliate share vests and the NFT refund path applies instead. Refreshing balances only rereads information; it does not claim money or submit a transaction." },
        { type: "links", items: [{ label: "Browse collections by season", description: "Open an individual collection to see its affiliate terms.", href: "/seasons" }, { label: "Common questions", description: "Understand unavailable enrollment and delayed balances.", href: "/docs/faq" }] },
      ] },
    ],
  },
  {
    slug: "winner-rewards", title: "Redeem a sponsored ticket", group: "Participate", minutes: 3,
    description: "One sponsored future mint per winning wallet, for its lifetime.",
    sections: [
      { id: "one-time-benefit", title: "A one-time benefit", blocks: [
        { type: "paragraph", text: "Where the winner-reward registry is enabled, a qualifying wallet that has successfully claimed a prize may redeem one sponsored NFT in an eligible future collection. The limit is one redemption per wallet for its lifetime, not one per season, collection won, or winning ticket." },
        { type: "paragraph", text: "Winning again does not reset a spent reward. A wallet holding several winning NFTs can claim their separate prizes, but cannot turn those wins into multiple lifetime sponsored mints. The reward is tied to the winning holder recorded at prize settlement, not to a different address chosen to receive the ETH." },
      ] },
      { id: "where-it-can-be-used", title: "Where it can be used", blocks: [
        { type: "list", items: ["The win and source collection must be recognized by the configured reward registry.", "The destination must be a supported, registered future collection on that network.", "The destination mint must be open with supply remaining before its deadline.", "The destination must have enough sponsorship funds to cover one full mint price.", "Only the reward’s beneficiary can redeem it, and only if their lifetime redemption remains unused."] },
        { type: "paragraph", text: "A historical win or a future collection is not automatically supported. Registration, verified historical eligibility where needed, and sponsorship must be configured. A reward does not reserve a ticket or guarantee that a particular future collection will be funded." },
      ] },
      { id: "who-pays", title: "Who pays for the ticket", blocks: [
        { type: "paragraph", text: "The operator-sponsored reserve pays the ordinary mint price into the collection. The NFT counts toward its finite supply, and the same payment enters its prize, affiliate-pool and refund accounting. The beneficiary pays only the transaction gas for that redemption." },
        { type: "paragraph", text: "Sponsored mints carry no affiliate referral attribution. If the destination later expires unsold, the current NFT holder can claim its normal mint-price refund; the lifetime reward remains spent." },
        { type: "links", items: [{ label: "Claim your prize", description: "Complete your winning NFT’s prize claim first.", href: "/docs/prizes" }, { label: "My Tickets", description: "Find your tickets and wallet-specific status.", href: "/my-nfts" }] },
      ] },
    ],
  },
  {
    slug: "my-nfts", title: "Your tickets and prize status", group: "Participate", minutes: 3,
    description: "Find your tickets, check draw results, and verify prize claims.",
    sections: [
      { id: "your-wallet-collection", title: "Your wallet’s collection", blocks: [
        { type: "paragraph", text: "My Tickets brings together your indexed Tincta tickets and identifies their collection and status. Check the connected account if an expected NFT is missing. An NFT you minted and later transferred is not the same as an NFT you currently own; ownership determines current holder-only rights." },
        { type: "paragraph", text: "New mints and transfers can take time to appear while the indexer follows confirmed chain events. Check the transaction receipt and the contract’s ownerOf value when you need the authoritative current owner." },
      ] },
      { id: "reading-the-artwork", title: "Reading the artwork", blocks: [
        { type: "table", columns: ["On a V10 ticket", "Meaning"], rows: [
          ["Season and collection", "The collection whose contract governs this ticket and its rewards."],
          ["Token number", "That NFT’s identifier within its contract."],
          ["Four numbers", "The NFT’s permanent, unique identity within this collection, available from mint."],
          ["Combination code", "A compact encoding of those four ordered numbers."],
          ["No score or outcome label", "Final scores, prizes, claim and refund status are separate contract state; they are not part of the permanent image."],
        ] },
        { type: "paragraph", text: "V10 metadata and SVG keep the same numbers and artwork before and after the draw, claims and transfers. A numbered NFT can still be awaiting its result. Cancellation of an unsold collection does not add a refund label; a completed refund burns the token and makes its metadata unavailable." },
        { type: "paragraph", text: "The season motif and collection color are artwork. They do not add a score bonus or change prize eligibility. Historical V8/V9 NFTs retain their sealed/revealed artwork, including final scores and any award label. Always check current claim status separately." },
      ] },
      { id: "external-websites", title: "Viewing an NFT elsewhere", blocks: [
        { type: "paragraph", text: "The NFT detail page links to supported explorers or marketplaces for its network. The contract’s tokenURI contains the on-chain metadata and SVG, so the artwork does not require a hosted image file." },
        { type: "paragraph", text: "An explorer can obtain V10’s finished numbered artwork on its first successful metadata read. There is no post-draw image change to refresh, and the permanent metadata deliberately omits score, award rank, prize and status traits. Use contract reads to check those results." },
        { type: "paragraph", text: "External services still control their own indexing, caches and SVG support, so immediate display is not guaranteed. A historical V8/V9 NFT may show an old sealed image until that service refreshes it. A missing or stale image is not evidence that ownership or a finalized result has changed." },
        { type: "links", items: [{ label: "Open My Tickets", description: "View your tickets inside Tincta.", href: "/my-nfts" }, { label: "Verification", description: "Read metadata and ownership from the contract.", href: "/docs/verification" }] },
      ] },
    ],
  },
  {
    slug: "refunds", title: "Ticket refunds", group: "Participate", minutes: 3,
    description: "What happens when a collection does not sell out.",
    sections: [
      { id: "the-mint-deadline", title: "The mint deadline", blocks: [
        { type: "paragraph", text: "Each collection has an on-chain mint deadline. At that time, an unsold current-format collection stops accepting mints and becomes refundable. The current holder of each remaining ticket can recover the original mint price by burning that NFT." },
        { type: "paragraph", text: "This path does not draw winners or create an affiliate payout. Refunding does not require the owner to approve each holder’s request, and an eligible holder can trigger the refund state through their claim." },
      ] },
      { id: "claiming-a-refund", title: "Claiming a refund", blocks: [
        { type: "list", ordered: true, items: ["Connect the wallet that currently holds the ticket on the correct network.", "Confirm that the collection is refundable and that the NFT has not already been burned.", "Submit the holder-authorized refund for that token and a valid receiving address.", "Wait for confirmation. The contract burns the NFT and transfers one original mint price."] },
        { type: "paragraph", text: "The refund follows the current NFT holder, not necessarily the original buyer. It covers the original mint price only: it does not reimburse transaction gas or a different resale price paid on a marketplace. The refund transaction also requires gas." },
      ] },
      { id: "when-refunds-do-not-apply", title: "When refunds do not apply", blocks: [
        { type: "paragraph", text: "A sold-out current collection cannot be cancelled through the unsold-deadline refund path. A delayed randomness response, a nonwinning result or a change of mind does not unlock this refund. Sold-out funds remain subject to the collection’s draw and payout rules." },
        { type: "paragraph", text: "A sponsored NFT has the same unsold-collection refund right. Its current holder receives the mint-price refund, while the original winner’s lifetime sponsored reward stays used." },
        { type: "links", items: [{ label: "Collection lifecycle", description: "Understand the difference between pending results and refundable status.", href: "/docs/collections" }, { label: "Verify a collection", description: "Check its deadline and refundsAvailable value.", href: "/docs/verification" }] },
      ] },
    ],
  },
  {
    slug: "verification", title: "Verify the contract", group: "Reference", minutes: 5,
    description: "Use the contract, not a screenshot, as the source of truth.",
    sections: [
      { id: "network-and-contract", title: "Start with the network and address", blocks: [
        { type: "paragraph", text: "Open the contract details from the collection page and use its explorer link. Confirm the network and contract address before comparing balances, ownership or results. A token ID identifies an NFT only together with its contract and network." },
        { type: "paragraph", text: "Read CONTRACT_VERSION and ALGORITHM_VERSION before interpreting the numbers. V10 reports affiliate-v10 and unique-rank-v6; V9 reports affiliate-v9 and unique-rank-v5. The version on the deployed contract is authoritative. Older collections intentionally expose different interfaces and rules. Source verification on an explorer lets you inspect the deployed code; it is not the same as an independent security audit." },
      ] },
      { id: "useful-contract-reads", title: "Useful contract reads", blocks: [
        { type: "table", columns: ["What to check", "Contract read"], rows: [
          ["Contract and draw version", "CONTRACT_VERSION, ALGORITHM_VERSION"],
          ["Mint price, capacity and timing", "mintPrice, maxSupply, totalMinted, saleStartAt, mintDeadline, phase"],
          ["Your NFT’s owner", "ownerOf(tokenId)"],
          ["Artwork and traits", "tokenURI(tokenId); V10 has permanent numbers and no final-score or outcome traits"],
          ["V10 permanent numbers", "combination(tokenId), combinationKey()"],
          ["V10 token for a combination", "tokenIdForCombination(numbers)"],
          ["V10 final score after the draw", "score(tokenId) or scoreCombination(numbers)"],
          ["V8/V9 numbers and score after reveal", "combination(tokenId), scoreCombination(numbers)"],
          ["Randomness and reveal", "requestId, randomnessReceived, revealed"],
          ["An award’s token and amount", "awardCount, winningTokenIds(rank), prizeAmountForRank(rank)"],
          ["Whether an award was claimed", "prizeClaimed(rank), awardHolder(rank)"],
          ["An affiliate’s referrals and balance", "affiliateIdOf(wallet), affiliateReferredMints(id), affiliateClaimable(id)"],
          ["Refund eligibility", "refundsAvailable"],
        ] },
        { type: "paragraph", text: "For V10, combination(tokenId) returns the permanent numbers before finalization with result = 0 to mean the score is pending. Zero is not a losing score: settled scores start at one. The score and scoreCombination reads reject an unfinished draw with RevealNotAvailable. Check revealed before presenting a result, even when the NFT already displays numbers." },
        { type: "paragraph", text: "V10 resolves numbers back to an existing minted NFT before checking its score. A valid four-number shape alone is not proof that a ticket exists in that collection. Identity reads reject nonexistent or refunded-and-burned tokens. A metadata image alone cannot establish a final score, winning status or unpaid prize." },
        { type: "paragraph", text: "Reading a contract does not require a wallet signature or a gas payment. Sending a mint, enrollment, claim or refund is a separate write transaction. Do not approve a transaction just to view your numbers." },
      ] },
      { id: "website-and-indexer", title: "The website and the chain", blocks: [
        { type: "paragraph", text: "The app uses an indexed database to make collections, history, holdings and balances easier to browse. Confirmed transactions made outside Tincta, including through explorers, can also be indexed. Confirmations, provider delays and chain reorganizations can make the displayed state lag behind a transaction." },
        { type: "paragraph", text: "Refreshing asks for a newer view; it does not generate a result, enroll an affiliate or withdraw funds. If a displayed value disagrees with the canonical contract state, the contract is authoritative." },
      ] },
      { id: "trust-and-availability", title: "Trust and availability", blocks: [
        { type: "paragraph", text: "The contract enforces reward rules and sends valid claims without a team approval step. This does not mean every operation happens by itself: sale activation, randomness funding, the draw request and finalization still require transactions. The website and supporting services help execute or display those steps; they cannot rewrite a deployed collection’s fixed reward terms." },
        { type: "paragraph", text: "On-chain checks constrain claims and protect the configured reserves, but participation still involves contract risk, wallet security, Ethereum network availability and the randomness provider. Affiliate admission also depends on configured verification services and a signer. Official collection and reward registries have governance-controlled registration." },
        { type: "paragraph", text: "An interface, local test suite or source-verified contract is not proof of a completed Mainnet rollout or an audit. Use the collection’s actual deployed addresses and published release evidence rather than assuming that every feature in these guides is enabled everywhere." },
        { type: "links", items: [{ label: "How winners are selected", description: "Read what the draw guarantees and what it depends on.", href: "/docs/randomness" }, { label: "Frequently asked questions", description: "Resolve common status and wallet questions.", href: "/docs/faq" }] },
      ] },
    ],
  },
  {
    slug: "faq", title: "Frequently asked questions", group: "Reference", minutes: 4,
    description: "Clear answers to the things you are most likely to wonder.",
    sections: [
      { id: "tickets-and-winners", title: "Tickets and winners", blocks: [
        { type: "callout", title: "Do six winners mean six wallets?", text: "No. The current default selects six distinct NFTs. A wallet holding more than one of those NFTs can claim every award it owns." },
        { type: "callout", title: "Can I choose my numbers or predict a prize?", text: "V10 generates numbers in Solidity; the mint function accepts no numbers or seed from the buyer. Upcoming combinations are predictable, so you may prefer a ticket’s appearance, but that does not predict its score or improve its chance. The later VRF draw determines winners. Color and linework give no advantage." },
        { type: "callout", title: "My V10 NFT has numbers. Has the draw happened?", text: "Not necessarily. Its permanent numbers exist at mint. Final scores and prizes become available only after sellout, VRF fulfillment and draw finalization. Check the contract’s revealed state and score separately from the image." },
        { type: "callout", title: "Does every mint wait for VRF?", text: "No. V10 generates the numbered NFT during the mint transaction. There is one VRF request after the collection sells out, followed by draw finalization. Transaction confirmation and explorer indexing still take time." },
        { type: "callout", title: "Why is my V8/V9 ticket still sealed after sellout?", text: "V8/V9 keep their original sealed artwork until the randomness response and draw finalization complete. Afterward, an explorer may still hold a stale image until its cache refreshes. Compare its view with the contract’s tokenURI and revealed state. V10 has no sealed-to-revealed metadata transition." },
        { type: "callout", title: "Why does a collection show a different winner count?", text: "Six equal prizes is the default. The V10 design permits one to ten distinct winning NFTs, fixed before deployment and bounded by supply. Earlier collections retain their original award counts and terms." },
      ] },
      { id: "affiliates-and-balances", title: "Affiliates and balances", blocks: [
        { type: "callout", title: "Does enrolling guarantee a reward?", text: "No. You must meet the collection’s paid-referral minimum, and it must sell out. Qualified affiliates then receive the equal allocation allowed by the pool and common cap." },
        { type: "callout", title: "Why is enrollment unavailable or not configured?", text: "The enrollment service or required network configuration may be unavailable, or the collection may no longer accept enrollment. This is different from an on-chain reward balance being zero. Existing earned claims follow the contract’s rules independently." },
        { type: "callout", title: "What does Refresh balances do?", text: "It rereads the displayed enrollment, referral and reward information. It does not spend gas, submit a claim or change your account’s entitlement." },
        { type: "callout", title: "Can I enroll using an NFT from the same collection?", text: "Not under the current holder-gated program. Enrollment closes at the scheduled mint opening, and eligibility normally requires an NFT from an earlier qualifying official collection." },
      ] },
      { id: "wallets-and-artwork", title: "Wallets and artwork", blocks: [
        { type: "callout", title: "Why is my NFT missing from My Tickets?", text: "Check the network and connected account first, then confirm the mint receipt. The indexer may still be catching up. If you transferred the NFT, you may no longer be its current holder." },
        { type: "callout", title: "Why does an explorer show a placeholder or old image?", text: "External websites control their indexing, caches and SVG support. V10’s first successful metadata read contains the permanent numbers, but initial display can still lag. V8/V9 also need a cache refresh after reveal. Inspect the on-chain tokenURI to compare the artwork." },
        { type: "callout", title: "Why is a V10 winner’s score missing from its image?", text: "Scores, winning status and claims are deliberately excluded from V10 metadata so the artwork stays permanent. Read the score and award records from the contract after the draw. An unchanged image does not mean that a prize is missing." },
        { type: "callout", title: "Can the team withdraw my winning prize for me?", text: "The current contract requires the winning NFT holder to submit the claim. The owner cannot claim on your behalf or use an ordinary operator withdrawal to take a protected unclaimed prize." },
      ] },
      { id: "refunds-and-rewards", title: "Refunds and rewards", blocks: [
        { type: "callout", title: "Who holds the reward funds?", text: "In the current design, the collection contract holds and protects unclaimed prizes and earned affiliate rewards. The team cannot withdraw those protected balances. Separate operating funds and unused reserves are governed by different rules." },
        { type: "callout", title: "Are rewards sent automatically?", text: "You submit a claim from the eligible wallet. The contract checks your entitlement and sends ETH directly to the chosen receiving address. No manual payout approval is needed; a network fee applies." },
        { type: "callout", title: "Do I get a refund if my ticket does not win?", text: "No. The current refund path applies to collections that expire without selling out. It returns the original mint price to the current holder and burns the ticket; network fees are not refunded." },
        { type: "callout", title: "Does every win give me another free mint?", text: "No. Where rewards are enabled and funded, a qualifying wallet can redeem one sponsored future NFT for its lifetime. Further wins do not reset that limit, and redemption still requires gas." },
        { type: "links", items: [{ label: "Verify a contract", description: "Find the authoritative values behind the app.", href: "/docs/verification" }, { label: "Reward glossary", description: "Look up the terms used throughout these guides.", href: "/docs/glossary" }] },
      ] },
    ],
  },
  {
    slug: "glossary", title: "Reward glossary", group: "Reference", minutes: 3,
    description: "Understand ticket, reward, and claim terms in plain language.",
    sections: [
      { id: "collecting", title: "Collecting", blocks: [
        { type: "table", columns: ["Term", "Meaning"], rows: [
          ["Season", "A named group of up to ten collections with a shared visual identity."],
          ["Collection", "A finite set of NFTs governed by one collection contract and one set of draw terms."],
          ["Ticket / NFT", "An ERC-721 token that enters its collection’s draw. V10 carries permanent identity artwork, with its result stored separately on-chain."],
          ["Mint", "The transaction that creates a new NFT for its recipient."],
          ["Token ID", "The NFT’s identifier inside its collection contract."],
          ["Permanent combination", "V10’s four Solidity-generated numbers, fixed at mint and unique within the collection. They identify the token, not its final score."],
          ["Combination code", "The compact encoding of a ticket’s four ordered numbers. Its meaning depends on the contract version."],
          ["Current holder", "The address returned by the NFT contract’s ownerOf function."],
          ["Gas", "The network transaction fee, separate from the mint price or prize."],
        ] },
      ] },
      { id: "draw-and-payments", title: "Draw and payments", blocks: [
        { type: "table", columns: ["Term", "Meaning"], rows: [
          ["Sellout", "All tickets in the collection’s finite supply have been minted."],
          ["Sealed", "The pre-draw artwork used by historical V8/V9 tickets. V10 has numbered artwork from mint and no Sealed status in its metadata."],
          ["VRF", "A verifiable random function: randomness accompanied by a proof checked on-chain."],
          ["Finalization / reveal", "The on-chain step that determines winning ranks and final scores. V10’s permanent numbers and artwork do not change."],
          ["Score", "A unique position in the collection’s ranking. The highest configured positions receive awards."],
          ["Claim", "A transaction by an entitled wallet to receive a prize or earned affiliate balance."],
          ["Refund", "The original mint-price payment returned to an unsold expired collection’s ticket holder when the NFT is burned."],
          ["Sponsored mint", "A mint paid by a separate sponsor reserve; the beneficiary still pays gas."],
        ] },
      ] },
      { id: "affiliates-and-verification", title: "Affiliates and verification", blocks: [
        { type: "table", columns: ["Term", "Meaning"], rows: [
          ["Affiliate position", "A collection-specific enrolled wallet and referral ID."],
          ["Attributed referral", "A paid mint that records an enrolled affiliate ID on-chain."],
          ["Qualification minimum", "The paid referred-ticket threshold an affiliate must reach to share the current pool."],
          ["Common payout cap", "The shared maximum used to keep qualified affiliates’ final payments equal and within the configured referral-based limit."],
          ["Growth reserve", "The separately tracked affiliate budget left unallocated after qualification, caps and rounding."],
          ["Indexer", "A service that reads chain events and updates the website’s database."],
          ["Explorer", "An external website for viewing addresses, contract code, transactions and events."],
          ["tokenURI", "The contract function that returns an NFT’s metadata, including its on-chain SVG image."],
          ["Sepolia", "An Ethereum test network, separate from Ethereum Mainnet."],
        ] },
        { type: "links", items: [{ label: "Back to the overview", description: "Choose your next guide.", href: "/docs" }] },
      ] },
    ],
  },
];
