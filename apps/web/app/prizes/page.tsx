import { SiteShell } from "../../components/site-shell";
import { PrizeHub } from "../../components/prizes/prize-hub";
import { configuredChainId } from "../../lib/chain-policy";
export const dynamic="force-dynamic";
export const metadata={title:"Claim your prizes | Tincta"};
export default function PrizesPage(){return <SiteShell section="prizes" chainId={configuredChainId()}><PrizeHub/></SiteShell>;}
