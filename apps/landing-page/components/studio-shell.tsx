import { FooterBrand } from "@manekineko/ui/footer";
import { Icon } from "@manekineko/ui/icons";
import { publicLinks, publicXProfiles } from "@manekineko/ui/links";
import { TinctaMark, TinctaWordmark } from "./tincta-logo";
import { LandingNavigation } from "./landing-navigation";

export function StudioHeader({ whitepaper = false }: { whitepaper?: boolean }) {
  return (
    <header className="studio-header landing-header">
      <a className="studio-brand" href="/" aria-label="Tincta home"><TinctaMark className="studio-mark" title="" /><TinctaWordmark className="studio-wordmark" title="" /></a>
      <LandingNavigation links={[
        { label: "Research", href: "/#research" },
        { label: "Projects", href: "/#projects" },
        { label: "Whitepaper", href: "/whitepaper", current: whitepaper },
        { label: "Upcoming", href: "/#upcoming" },
      ]} action={{ label: "Join the launch list", href: "/#launch-list" }} />
    </header>
  );
}

export function StudioFooter() {
  const links = publicLinks({ contact: process.env.NEXT_PUBLIC_CONTACT_URL, social: publicXProfiles.tincta });
  return (
    <footer className="studio-footer">
      <div><FooterBrand /><p className="studio-footer-description">Research and publishing<br />for immutable onchain systems.</p></div>
      <nav aria-label="Explore Tincta">
        <strong className="ui-footer-heading">Explore</strong>
        <a className="ui-footer-link" href="/#research">Our research</a>
        <a className="ui-footer-link" href="/whitepaper">Whitepaper</a>
        <a className="ui-footer-link" href="/rewards">Tincta Rewards<Icon name="arrow" size="footer" /></a>
        <a className="ui-footer-link" href="/#upcoming">Upcoming projects</a>
        <a className="ui-footer-link" href="/#launch-list">Join the launch list</a>
      </nav>
      <nav aria-label="Tincta information">
        <strong className="ui-footer-heading">Tincta</strong>
        <a className="ui-footer-link" href="#top">Back to top<Icon name="up" size="footer" /></a>
        {links.contact && <a className="ui-footer-link" href={links.contact}>Contact<Icon name="diagonal" size="footer" /></a>}
        {links.social && <a className="ui-footer-link" href={links.social}>X<Icon name="diagonal" size="footer" /></a>}
      </nav>
      <div className="studio-footer-legal"><span>© {new Date().getFullYear()} Tincta</span><span>Defined 100% onchain. Shaped by participation.</span></div>
    </footer>
  );
}
