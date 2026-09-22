import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { SiteNavigation, type SiteSection } from "./site-navigation";

export function SiteShell({ children, section = "seasons", chainId = null, className = "" }: { children: ReactNode; section?: SiteSection; chainId?: number | null; className?: string }) {
  return (
    <div className={`mint-shell ${className}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="mint-header">
        <Link
          className="brand"
          href="/mint"
          aria-label="Tincta home"
        >
          <span>Tincta</span>
        </Link>
        <SiteNavigation section={section} />
        {section === "docs" ? <Link href="/mint" className="docs-open-app">Open app <span aria-hidden="true">↗</span></Link> : <span className="environment-badge">
          <span aria-hidden="true" />
          {chainId === 11155111 ? "Sepolia testnet" : chainId === 1 ? "Ethereum Mainnet" : "Project preview"}
        </span>}
      </header>
      <main id="main">{children}</main>
      <footer className="mint-footer">
        <Link href="/mint">
          <BrandMark />
          <span>Tincta<span className="footer-tagline">Earn prizes by adding color to your wallet.</span></span>
        </Link>
        <span>Color, collected. Entirely on-chain.</span>
      </footer>
    </div>
  );
}
