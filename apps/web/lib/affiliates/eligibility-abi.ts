export const AFFILIATE_ELIGIBILITY_ABI = [
  "function ELIGIBILITY_VERSION() view returns(string)",
  "function collections(address) view returns(address factory,uint256 roundId,uint256 sequence,bytes32 codeHash,bool sourceOnly)",
  "function approvedFactoryCodeHash(address) view returns(bytes32)",
  "function usedToken(address target,address sourceCollection,uint256 sourceTokenId) view returns(bool)",
  "function eligibilityStatus(address target,address applicant,address sourceCollection,uint256 sourceTokenId) view returns(uint8)",
];
export function eligibilityReason(status: number): string | null {
  switch (status) {
    case 0: return null;
    case 1: return "This collection is not registered for affiliate enrollment.";
    case 2: return "Choose an NFT from an earlier official collection. This collection and later collections do not qualify.";
    case 3: return "This wallet no longer owns this NFT, or the NFT does not exist.";
    case 4: return "This NFT has already qualified an affiliate position in this collection.";
    case 5: return "Affiliate enrollment is closed for this collection.";
    case 6: return "The source collection must be completed and its winner’s prize paid.";
    default: throw new Error("Unrecognized affiliate eligibility result.");
  }
}
