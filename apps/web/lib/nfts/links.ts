export interface NftLinks { openSea: string | null; blockscout: string | null; explorer: string }

/** OpenSea retired its testnets: https://support.opensea.io/en/articles/11833955-farewell-testnets */
export function nftLinks(chainId: number, contract: string, tokenId: string): NftLinks {
  if (!/^0x[0-9a-f]{40}$/i.test(contract) || /^0x0{40}$/i.test(contract)
    || !/^[1-9][0-9]{0,4}$/.test(tokenId) || Number(tokenId) > 65536) {
    throw new Error("Invalid NFT identifier.");
  }
  const address = contract.toLowerCase();
  if (chainId === 1) return {
    openSea: `https://opensea.io/assets/ethereum/${address}/${tokenId}`,
    blockscout: null,
    explorer: `https://etherscan.io/token/${address}?a=${tokenId}`,
  };
  if (chainId === 11155111) return {
    openSea: null,
    blockscout: `https://eth-sepolia.blockscout.com/token/${address}/instance/${tokenId}`,
    explorer: `https://sepolia.etherscan.io/token/${address}?a=${tokenId}`,
  };
  throw new Error("Unsupported NFT network.");
}
