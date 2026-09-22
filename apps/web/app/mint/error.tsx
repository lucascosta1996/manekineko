"use client";
import Link from "next/link";
import { SiteShell } from "../../components/site-shell";
export default function MintError({ reset }: { reset: () => void }) {
  return (
    <SiteShell>
      <div className="route-message">
        <p className="eyebrow">COLLECTION UNAVAILABLE</p>
        <h1>A brief pause.</h1>
        <p>
          We couldn’t load the collection’s settings. Please try again in a
          moment.
        </p>
        <button className="primary-button" onClick={reset}>
          Try again <span aria-hidden="true">↻</span>
        </button>
        <Link className="text-link" href="/seasons">
          Back to seasons
        </Link>
      </div>
    </SiteShell>
  );
}
