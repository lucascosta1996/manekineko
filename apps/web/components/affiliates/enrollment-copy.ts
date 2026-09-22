/** Public wording follows the deployed version; never infer the first-collection exception from roundId. */
export function affiliateEnrollmentCopy(version: string | undefined, policy?: "bootstrap" | "nft_holder") {
  if (version !== "affiliate-v6" && !["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(version ?? "")) return {
    summary: "This collection keeps its original enrollment terms. NFT holder eligibility applies to new collections using the updated rules.",
    join: "This earlier collection does not require an NFT to enroll. Connect your wallet and complete the automated checks while positions are available. Enrollment closes when minting opens.",
    teaser: "View this collection’s terms and the NFT holder rules for future programs.",
  };
  if (policy === "bootstrap") return {
    summary: "This is the first official collection on this network, so no earlier NFT is needed to enroll. Wallet verification and automated checks still apply.",
    join: "No earlier NFT is needed for this first official collection. Verify your wallet, pass the automated checks and confirm enrollment before minting opens. One position per wallet.",
    teaser: "First official collection: no earlier NFT needed. Check enrollment availability.",
  };
  return {
    summary: policy === "nft_holder"
      ? "Hold an NFT from an earlier eligible official collection to join. Connect the wallet that owns it, choose your NFT and verify your eligibility."
      : "After the first official collection, enrollment requires an NFT from an earlier eligible official collection. Connect your wallet to check eligibility.",
    join: "Choose an NFT you hold from an earlier eligible official collection, verify your wallet and pass the automated checks. Confirm enrollment before minting opens. Only the first official collection is exempt from the NFT requirement.",
    teaser: "NFT holders can qualify for enrollment. The first official collection is exempt.",
  };
}
