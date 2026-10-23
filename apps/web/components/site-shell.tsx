import { RewardsBrand } from "@manekineko/ui/rewards-brand";
import { PublicFooter } from "@manekineko/ui/footer";
import { publicLinks } from "@manekineko/ui/links";
import Link from "next/link";
import type { ReactNode } from "react";
import { TinctaWordmark } from "./tincta-logo";
import { SiteNavigation, type SiteSection } from "./site-navigation";

export function SiteShell({ children, section = "home", chainId = null, className = "", protocolEnabled = Boolean(process.env.NEXT_PUBLIC_V12_CONTROLLER) }: { children: ReactNode; section?: SiteSection; chainId?: number | null; className?: string; protocolEnabled?: boolean }) {
  return (
    <div className={`mint-shell ${className}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="mint-header">
        <Link
          className="brand"
          href="/"
          aria-label="Tincta Rewards home"
        >
          <RewardsBrand decorative><TinctaWordmark className="tincta-wordmark" title="" /></RewardsBrand>
        </Link>
        <SiteNavigation section={section} protocolEnabled={protocolEnabled} />
        {section !== "docs" && <span className="environment-badge">
          <span aria-hidden="true" />
          {chainId === 11155111 ? "Sepolia testnet" : chainId === 1 ? "Ethereum Mainnet" : "Project preview"}
        </span>}
      </header>
      <main id="main">{children}</main>
      <PublicFooter brand={<RewardsBrand><TinctaWordmark title="" className="ui-footer-wordmark" /></RewardsBrand>} links={{ ...publicLinks({ website: process.env.NEXT_PUBLIC_LANDING_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:3101" : undefined), app: process.env.NEXT_PUBLIC_WEB_URL ?? process.env.AFFILIATE_PUBLIC_ORIGIN ?? (process.env.NODE_ENV === "development" ? "http://localhost:3100" : undefined), contact: process.env.NEXT_PUBLIC_CONTACT_URL, telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL, social: process.env.NEXT_PUBLIC_X_URL }), app: "/", docs: "/docs" }} />
    </div>
  );
}
