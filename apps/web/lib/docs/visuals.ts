import type { DocBlock, DocPage, DocSection } from "./model";

const visuals: Record<string, Record<string, DocBlock[]>> = {
  overview: { protocol: [{
    type: "allocation", title: "Where successful mint revenue goes",
    items: [
      { label: "Winning NFTs", share: 60, text: "Equal prizes, claimed by each winning NFT’s current holder." },
      { label: "Qualified affiliates", share: 20, text: "Equal shares for enrolled affiliates with a paid referral." },
      { label: "Season holders", share: 10, text: "A separate pool, locked until the whole season settles." },
      { label: "Protocol treasury", share: 10, text: "For infrastructure costs, future functionality and Tincta projects." },
    ], caption: "Launch allocation with at least one qualifying affiliate. With none, the full 20% affiliate pool joins the operator treasury: 30% after a successful draw. Prizes remain 60% and holders 10%. Before finalization, mint receipts stay reserved; refundable collections return the full mint price.",
  }] },
  "onchain-voting": { vote: [{
    type: "flow", title: "From paid NFT ownership to final mint terms",
    steps: [
      { title: "Snapshot eligible ownership", text: "The contract uses the eligible NFTs held immediately before voting opens." },
      { title: "Vote for a published package", text: "Each eligible NFT adds one vote. A package includes price, supply, winner count and duration." },
      { title: "The voting deadline arrives", text: "The winning package becomes final and minting opens. No activation signature is needed." },
    ], caption: "Paid NFTs use ownership snapshots. Genesis uses one current-owner vote per NFT in the first ballot only. Fixed allocation percentages are outside the ballot.",
  }, {
    type: "formula", title: "Selecting the winning package", equations: ["j* = min { j : vⱼ = max(v₁, …, vₘ) }"],
    definitions: [{ symbol: "vⱼ", meaning: "Total eligible NFT votes for published option j." }, { symbol: "j*", meaning: "The winning option, using 1-based option order here." }],
    note: "The highest vote total wins. Ties choose the first tied option in published order. If every total is zero, the first published option wins.",
  }] },
  quickstart: { mint: [{
    type: "flow", title: "A mint, from review to receipt", steps: [
      { title: "Review", text: "Check the collection, quantity, exact ETH payment, recipient and any referral." },
      { title: "Confirm in your wallet", text: "The website checks the account and network again and simulates the transaction." },
      { title: "Wait for the receipt", text: "A successful receipt confirms the mint. Keep the token IDs from its Transfer events." },
    ], caption: "If the result is uncertain, recover the original transaction by its hash. Connecting a wallet never mints a ticket.",
  }] },
  seasons: { progress: [{
    type: "flow", title: "One collection’s path through a season", steps: [
      { title: "Prepare the collection", text: "Fund operating costs separately and publish the voting schedule." },
      { title: "Vote, then mint", text: "The voting deadline fixes the terms. The mint window follows those terms." },
    ], branches: [
      { title: "Sellout → randomness → draw", text: "Randomness recorded before the cutoff commits the draw. Finalization funds prizes, affiliates, holders and the treasury." },
      { title: "Unsold or no timely randomness → refunds", text: "Unsold expiry or the 72-hour randomness cutoff makes full mint-price refunds available." },
    ], caption: "Either finalized, fully backed draws or refund availability let the sequence advance. Old unpaid prizes and refunds stay reserved.",
  }] },
  prizes: { draw: [{
    type: "formula", title: "Equal prizes from the actual collection", equations: ["R = p × N", "Prize per winning NFT = (R × 60%) ÷ k", "Chance per NFT = k ÷ N"],
    definitions: [{ symbol: "p", meaning: "The final mint price, in wei." }, { symbol: "N", meaning: "The sold-out collection’s NFT supply." }, { symbol: "k", meaning: "The voted number of distinct winning NFTs." }, { symbol: "R", meaning: "Total mint revenue, including separately funded sponsored mints." }],
    note: "Example: 1,000 NFTs at 0.01 ETH with six winners gives six prizes of 1 ETH and a 0.6% chance per NFT under the draw’s VRF/Keccak assumption. Allowed terms make prizes divide exactly. Different winning NFTs may share one owner.",
  }] },
  affiliates: { qualify: [{
    type: "flow", title: "From enrollment to an affiliate claim", steps: [
      { title: "Enroll during voting", text: "Meet the contract’s eligibility rules and take an available affiliate position." },
      { title: "Bring one paid referral", text: "At least one attributed paid mint qualifies the position; self-referrals do not count." },
      { title: "Claim after the successful draw", text: "Sellout fixes equal shares; successful finalization makes them claimable." },
    ], caption: "More referrals do not increase a qualified affiliate’s share. Refundable collections create no affiliate payout.",
  }, {
    type: "formula", title: "The same share for every qualifier", equations: ["Affiliate pool = R × 20%", "Share = ⌊ Affiliate pool ÷ Q ⌋"],
    definitions: [{ symbol: "R", meaning: "The collection’s actual mint revenue, in wei." }, { symbol: "Q", meaning: "Number of qualified affiliates at sellout, from 1 to 10." }, { symbol: "⌊x⌋", meaning: "Round down to a whole wei." }],
    note: "With no qualifiers, no affiliate share is payable. Under the current launch rules, the entire 20% pool joins the operator’s 10% treasury after a successful draw, making 30% withdrawable. With qualifying affiliates, only division dust remains in the separate unused affiliate reserve.",
  }] },
  "holder-rewards": { "dynamic-amounts": [{
    type: "formula", title: "From season contributions to equal claims", equations: ["P = Σ (Rᵢ × 10%)", "E = Σ Nᵢ", "L = ⌊ E × 5% ⌋", "Reward per NFT = ⌊ P ÷ L ⌋"],
    definitions: [{ symbol: "Rᵢ, Nᵢ", meaning: "Mint revenue in wei and minted NFT count for each successfully drawn collection in this season." }, { symbol: "P, E", meaning: "The final funded pool and total eligible NFTs. Refundable collections add neither." }, { symbol: "L", meaning: "The fixed number of successful claim slots, counting NFTs rather than wallets." }, { symbol: "Σ, ⌊x⌋", meaning: "Add the successful collections; round down to an integer. ETH payouts round down to whole wei." }],
    note: "Only calculate a payout when L is greater than zero. An entirely refundable season has no claims. After unlock, claims reduce the remaining slots and ETH without changing the reward per NFT. Rounding dust stays in the pool.",
  }], claims: [{
    type: "flow", title: "The season holder claim path", steps: [
      { title: "Successful draws contribute", text: "Each successful collection adds 10% of mint revenue and its NFTs to the season’s pool accounting." },
      { title: "Every collection settles", text: "Each planned collection must finish its draw or become refundable. Outstanding prize or refund claims do not delay unlock." },
      { title: "The current owner claims", text: "The contract verifies an eligible NFT, unused claim and remaining slot before paying the equal amount." },
    ], caption: "First come means onchain execution order. Ownership, a website review or a pending transaction does not reserve a claim slot.",
  }] },
  refunds: { deadline: [{
    type: "flow", title: "Two routes to the same full mint-price refund", steps: [
      { title: "Check the collection outcome", text: "Refund eligibility follows the contract’s deadline and recorded randomness." },
    ], branches: [
      { title: "Mint deadline reached, still unsold", text: "Refunds become available. The current holder burns the NFT to receive its full original mint price." },
      { title: "Sold out, no randomness before the cutoff", text: "At 72 hours after sellout, refunds become available. Later randomness cannot revive the draw." },
    ], caption: "Randomness recorded strictly before the cutoff commits the draw permanently. Refunds exclude gas and any secondary-market price difference.",
  }] },
  verification: { read: [{
    type: "flow", title: "From verified state to a confirmed action", steps: [
      { title: "Read one verified block", text: "Check the network, deployed code and collection identity using the checks for that deployment." },
      { title: "Review and recheck", text: "Show exact transaction details, refresh wallet-dependent eligibility and simulate through the wallet provider." },
      { title: "Sign, submit, confirm", text: "Your wallet approves the transaction. Its confirmed receipt establishes execution." },
    ], caption: "A failed or stale read disables signing. The contract remains authoritative if ownership, remaining slots or other state changes before execution.",
  }] },
};

const drawAlgorithm: DocSection = {
  id: "draw-algorithm", title: "How the draw picks distinct tickets", blocks: [{
    type: "flow", title: "One recorded random word, one reproducible draw", steps: [
      { title: "Record verified randomness", text: "The fixed coordinator records one valid VRF word before the cutoff." },
      { title: "Derive a candidate", text: "Keccak combines the word, chain, collection, round, supply, domain and persistent counter." },
      { title: "Reject biased candidates", text: "Candidates below the acceptance threshold are skipped. Every caller follows the same counter sequence." },
      { title: "Select without replacement", text: "Decode the accepted index into an ordered set of distinct NFT numbers. The selected IDs receive the highest scores." },
    ], caption: "Finalization performs bounded work and can continue from the saved counter. This samples the winners; it does not randomly shuffle all losing NFTs.",
  }, {
    type: "formula", title: "An equal sample space for ordered winners", equations: ["M = N × (N − 1) × … × (N − k + 1)", "τ = 2²⁵⁶ mod M", "Accept c ≥ τ; then index = c mod M", "Winner score at rank r = N + 1 − r"],
    definitions: [{ symbol: "N, k", meaning: "The sold-out supply and the voted winner count." }, { symbol: "M", meaning: "Number of possible ordered selections of k distinct tickets." }, { symbol: "c, τ", meaning: "The 256-bit candidate and rejection threshold. Rejecting the short remainder removes modulo bias." }, { symbol: "r", meaning: "Winner position, starting at 1. Scores are distinct; all winners receive the same ETH prize." }],
    note: "Unbiased sampling relies on the VRF/Keccak assumption. Keccak expansion is deterministic, not new independent entropy. Losing tickets receive the remaining unique scores in token-ID order.",
  }],
};
const identity: DocSection = {
  id: "permanent-numbers", title: "Permanent numbers identify the NFT", blocks: [{
    type: "flow", title: "Ticket identity is separate from the draw", steps: [
      { title: "Start with the collection’s NFT number − 1", text: "Subtract one from the NFT’s number within its collection to get a distinct zero-based index." },
      { title: "Apply a reversible encoding", text: "Four Feistel rounds and the public collection key permute the 16-bit index into a unique code." },
      { title: "Display four numbers", text: "Split the code into four base-16 digits and add one to each. The numbers and artwork stay fixed after the draw." },
    ], caption: "The public key provides uniqueness, not secrecy or randomness. Buyers supply no numbers or seed. Read the finalized contract state for scores and winners.",
  }, {
    type: "formula", title: "Four numbers, 65,536 possible identities", equations: ["16⁴ = 65,536", "code = (A − 1) × 16³ + (B − 1) × 16² + (C − 1) × 16 + (D − 1)"],
    definitions: [{ symbol: "A, B, C, D", meaning: "The four permanent numbers, each from 1 to 16." }, { symbol: "code", meaning: "A value from 0 to 65,535. Decoding it with the collection key and adding one recovers the NFT’s number within that collection." }],
    note: "Only minted, unburned tokens are valid NFTs. A larger number or code does not improve the chance of winning.",
  }],
};

export function withDocVisuals(pages: DocPage[]): DocPage[] {
  return pages.map(page => ({ ...page,
    minutes: page.minutes + (page.slug === "prizes" || page.slug === "verification" ? 3 : 1),
    sections: [...page.sections.map(section => ({ ...section, blocks: [...section.blocks, ...(visuals[page.slug]?.[section.id] ?? [])] })),
      ...(page.slug === "prizes" ? [drawAlgorithm] : page.slug === "verification" ? [identity] : [])],
  }));
}
