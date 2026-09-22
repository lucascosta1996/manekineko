import type { WinnerCreditNetwork } from "../../lib/winner-credits/model";
import { nftLinks } from "../../lib/nfts/links";

/** Always visible even when the qualifying source win is outside the current history page. */
export function LifetimeRedemptions({ networks }: { networks: WinnerCreditNetwork[] }) {
  return <>{networks.filter((network) => network.lifetimeRedemption).map((network) => {
    const redemption = network.lifetimeRedemption!;
    const links = nftLinks(network.chainId, redemption.targetRound, redemption.tokenId);
    return <div className="winner-credit-notice" key={network.chainId}><p><strong>{network.chainId === 1 ? "Ethereum" : "Sepolia"}: lifetime reward used.</strong> This wallet has already received its one sponsored ticket. Winning again does not add another reward.</p><a href={links.openSea ?? links.blockscout ?? links.explorer} target="_blank" rel="noopener noreferrer">View sponsored ticket #{redemption.tokenId} ↗</a></div>;
  })}</>;
}
