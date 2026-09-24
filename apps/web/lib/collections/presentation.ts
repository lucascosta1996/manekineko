import type { CollectionPublic } from "./model.ts";

/** Labels describe a verified contract snapshot, not an inferred winning outcome. */
export function collectionProgress(collection: Pick<CollectionPublic, "phase" | "contractVersion" | "saleStartAt">, now = Date.now()): { label: string; detail: string } {
  const ranked = (["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(collection.contractVersion ?? ""));
  if (collection.phase === "minting" && collection.saleStartAt && Date.parse(collection.saleStartAt) > now) {
    return { label: "Scheduled", detail: `Ticket sales open at ${collection.saleStartAt}. The contract enforces this fixed opening time.` };
  }
  switch (collection.phase) {
    case "pending_activation": return { label: "Awaiting activation", detail: "The contract is deployed. Ticket sales have not opened yet." };
    case "minting": return { label: "Mint open", detail: `Ticket sales are open. ${ranked ? "The winning tickets are" : "The winner is"} determined after sellout and the randomness reveal.` };
    case "awaiting_request": return { label: "Sold out", detail: "All tickets have been minted. The randomness request is next." };
    case "awaiting_randomness": return { label: "Draw pending", detail: "The collection is sold out and waiting for Chainlink VRF." };
    case "awaiting_reveal": return { label: "Results pending", detail: "The collection is sold out. The winning result has not been revealed yet." };
    case "awaiting_finalization":
    case "settling": return { label: "Finalizing result", detail: "Randomness is available. The contract result is being finalized." };
    case "awaiting_prize": return { label: ranked ? "Prizes ready to claim" : "Prize pending", detail: ranked ? "The winning tickets are finalized. Each unpaid prize remains reserved for its NFT holder to claim." : "The winning result is finalized. The prize has not been paid yet." };
    case "complete": return { label: ranked ? "Prizes paid" : "Prize paid", detail: ranked ? "The collection is complete and all prizes have been paid." : "The collection is complete and its prize has been paid." };
    case "refundable": return { label: "Refunds ready to claim", detail: "The collection ended without a prize. Eligible holders can claim their ticket refunds." };
    default: return { label: "State unavailable", detail: "The collection state is not available yet." };
  }
}
