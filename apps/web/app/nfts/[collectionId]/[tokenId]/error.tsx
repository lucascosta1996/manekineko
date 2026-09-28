"use client";
import { Button } from "@manekineko/ui/button";


import { SiteShell } from "../../../../components/site-shell";

export default function NftError({ retry }: { retry: () => void }) {
  return <SiteShell section="nfts"><section className="nft-empty" role="alert"><h1>This ticket is temporarily unavailable.</h1><p>Its blockchain record could not be loaded. Please try again.</p><Button variant="primary" type="button"  onClick={retry}>Try again</Button></section></SiteShell>;
}
