import Link from 'next/link';
import { LaunchBrand } from './launch/brand';
export function OperatorShell({ children, chainId = 11155111 }: { children: React.ReactNode; chainId?: number }) {
  return <div className="operator-shell"><a className="operator-skip" href="#main">Skip to content</a>
    <header className="operator-header"><Link href="/dashboard" aria-label="Tincta Rewards home"><LaunchBrand decorative /></Link>
      <nav aria-label="Network"><Link href="/dashboard?chainId=1" aria-current={chainId === 1 ? 'page' : undefined}>Ethereum Mainnet</Link><Link href="/dashboard?chainId=11155111" aria-current={chainId === 11155111 ? 'page' : undefined}>Sepolia testnet</Link></nav>
    </header><main id="main">{children}</main><footer className="operator-footer"><span>Tincta · Operator workspace</span><span>All approvals happen in your wallet.</span></footer></div>;
}
