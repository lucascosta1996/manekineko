"use client";
import { Button } from "@manekineko/ui/button";

import { Icon } from "@manekineko/ui/icons";

import Link from "next/link";
import { SiteShell } from "../../components/site-shell";

export default function HistoryError({ retry }: { retry: () => void }) {
  return <SiteShell section="history"><section className="route-message"><p className="eyebrow">COLLECTION HISTORY</p><h1>History is taking a moment.</h1><p>We couldn’t load the collection archive. Please try again.</p><Button variant="primary"  type="button" onClick={retry}>Try again</Button><Link className="ui-text-action ui-text-action-standalone" href="/seasons">Explore seasons <Icon name="arrow" /></Link></section></SiteShell>;
}
