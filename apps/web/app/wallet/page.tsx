import {SiteShell} from '../../components/site-shell';
import {WalletProfile} from '../../components/wallet-profile';
import {protocolConfig} from '../../lib/protocol/config';
import './wallet.css';
export const metadata={title:'Your wallet · Tincta'};
export default function Page(){const config=protocolConfig();const supported=config?.version===16||config?.version===17;return <SiteShell section="wallet" chainId={config?.chainId}><WalletProfile chainId={supported?config!.chainId:null} contract={supported?config!.controller:null}/></SiteShell>;}
