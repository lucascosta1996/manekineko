"use client";
import { Button } from "@manekineko/ui/button";

import { Icon } from "@manekineko/ui/icons";
import Link from "next/link";
import { SiteShell } from "../../components/site-shell";
export default function SeasonsError({ retry }: { retry: () => void }) {
  return <SiteShell><section className="route-message"><p className="eyebrow">SEASONS UNAVAILABLE</p><h1>A brief pause.</h1><p>We couldn’t load the seasons. Please try again in a moment.</p><Button variant="primary" type="button"  onClick={retry}>Try again <Icon name="refresh" /></Button><Link href="/seasons" className="ui-text-action ui-text-action-standalone">All seasons <Icon name="arrow" /></Link></section></SiteShell>;
}
