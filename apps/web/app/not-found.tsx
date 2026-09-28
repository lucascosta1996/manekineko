import { buttonClassName } from "@manekineko/ui/button-styles";
import Link from "next/link";
import { SiteShell } from "../components/site-shell";

export default function NotFound() {
  return <SiteShell><section className="route-message"><p className="eyebrow">PAGE NOT FOUND</p><h1>This page isn’t here.</h1><p>Check the address or explore the seasons.</p><Link href="/seasons" className={buttonClassName()}>Explore seasons</Link></section></SiteShell>;
}
