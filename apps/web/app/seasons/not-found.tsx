import { buttonClassName } from "@manekineko/ui/button-styles";
import { Icon } from "@manekineko/ui/icons";
import Link from "next/link";
import { SiteShell } from "../../components/site-shell";
export default function SeasonNotFound() {
  return <SiteShell><section className="route-message"><p className="eyebrow">SEASON NOT FOUND</p><h1>This season is not available.</h1><p>Browse published seasons to find an edition. Unpublished launch plans are not available here.</p><Link href="/seasons" className={buttonClassName({ variant: "primary" })}>Explore seasons <Icon name="arrow" /></Link></section></SiteShell>;
}
