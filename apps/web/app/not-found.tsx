import { buttonClassName } from "@manekineko/ui/button-styles";
import Link from "next/link";
import { SiteShell } from "../components/site-shell";

export default function NotFound() {
  return <SiteShell><section className="route-message"><p className="eyebrow">PAGE NOT FOUND</p><h1>This page isn’t here.</h1><p>Check the address or return to the current collection.</p><Link href="/" className={buttonClassName()}>Back to participate</Link></section></SiteShell>;
}
