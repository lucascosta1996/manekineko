import { LaunchSignOut } from './launch-sign-out';
import { FooterBrand } from '@manekineko/ui/footer';
import Link from 'next/link';
import { LaunchBrand } from './launch/brand';
export function OperatorShell({ children, chainId = 11155111, section = 'dashboard', authenticated = true }: { children: React.ReactNode; chainId?: number; authenticated?: boolean; section?: 'deploy' | 'dashboard' | 'social' | 'social/account' }) {
  return <div className="operator-shell"><a className="operator-skip" href="#main">Skip to content</a>
    <header className="operator-header"><Link href={authenticated ? "/dashboard" : "/login"} aria-label="Tincta Rewards home"><LaunchBrand decorative /></Link>
      {authenticated && <div className="operator-navigation"><nav aria-label="Operator navigation"><Link href="/deploy?chainId=1" aria-current={section === 'deploy' ? 'page' : undefined}>Deploy</Link><Link href={`/dashboard?chainId=${chainId}`} aria-current={section === 'dashboard' ? 'page' : undefined}>Dashboard</Link><Link href={`/social?chainId=${chainId}`} aria-current={section === 'social' ? 'page' : undefined}>X previews</Link><Link href={`/social/account?chainId=${chainId}`} aria-current={section === 'social/account' ? 'page' : undefined}>X account</Link></nav><nav aria-label="Network"><Link href={`/${section}?chainId=1`} aria-current={chainId === 1 ? 'page' : undefined}>Ethereum Mainnet</Link><Link href={`/${section === 'deploy' ? 'dashboard' : section}?chainId=11155111`} aria-current={chainId === 11155111 ? 'page' : undefined}>Sepolia testnet</Link></nav><LaunchSignOut /></div>}
    </header><main id="main">{children}</main><footer className="operator-footer"><FooterBrand /><span>Operator workspace</span><span>Contract actions require your wallet.</span></footer></div>;
}
