"use client";

import Link from "next/link";
import { SiteShell } from "../../components/site-shell";

export default function HistoryError({ reset }: { reset: () => void }) {
  return <SiteShell section="history"><section className="route-message"><p className="eyebrow">COLLECTION HISTORY</p><h1>History is taking a moment.</h1><p>We couldn’t load the collection archive. Please try again.</p><button className="primary-button" type="button" onClick={reset}>Try again</button><Link className="text-link" href="/seasons">Explore seasons →</Link></section></SiteShell>;
}
