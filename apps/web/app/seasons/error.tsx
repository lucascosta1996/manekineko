"use client";
import Link from "next/link";
import { SiteShell } from "../../components/site-shell";
export default function SeasonsError({ reset }: { reset: () => void }) {
  return <SiteShell><section className="route-message"><p className="eyebrow">SEASONS UNAVAILABLE</p><h1>A brief pause.</h1><p>We couldn’t load the seasons. Please try again in a moment.</p><button type="button" className="primary-button" onClick={reset}>Try again ↻</button><Link href="/seasons" className="text-link">All seasons →</Link></section></SiteShell>;
}
