import Link from "next/link";
import { SiteShell } from "../../../../components/site-shell";

export default function NftNotFound() {
  return <SiteShell section="nfts"><section className="nft-empty"><p className="eyebrow">TICKET NOT FOUND</p><h1>We couldn’t find this NFT.</h1><p>Check the link. Newly minted tickets appear after their transactions are confirmed and indexed.</p><Link className="nft-button" href="/my-nfts">Back to My Tickets</Link></section></SiteShell>;
}
