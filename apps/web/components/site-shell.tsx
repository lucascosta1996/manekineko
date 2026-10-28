import { RewardsBrand } from "@manekineko/ui/rewards-brand";
import { PublicFooter } from "@manekineko/ui/footer";
import { publicLinks, publicXProfiles } from "@manekineko/ui/links";
import Link from "next/link";
import type { ReactNode } from "react";
import { TinctaMark } from "./tincta-logo";
import { SiteNavigation, type SiteSection } from "./site-navigation";
import { HeaderWallet } from "./header-wallet";

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
          <RewardsBrand decorative variant="glyph"><TinctaMark title="" /></RewardsBrand>
        </Link>
        <SiteNavigation section={section} protocolEnabled={protocolEnabled} />
        <HeaderWallet chainId={chainId} />
      </header>
      <main id="main">{children}</main>
      <PublicFooter links={{ ...publicLinks({ website: process.env.NEXT_PUBLIC_LANDING_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:3101" : undefined), app: process.env.NEXT_PUBLIC_WEB_URL ?? process.env.AFFILIATE_PUBLIC_ORIGIN ?? (process.env.NODE_ENV === "development" ? "http://localhost:3100" : undefined), contact: process.env.NEXT_PUBLIC_CONTACT_URL, telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL, social: publicXProfiles.rewards }), app: "/", docs: "/docs" }} />
    </div>
  );
}
