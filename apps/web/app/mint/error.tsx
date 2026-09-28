"use client";
import { Button } from "@manekineko/ui/button";

import { Icon } from "@manekineko/ui/icons";
import Link from "next/link";
import { SiteShell } from "../../components/site-shell";
export default function MintError({ retry }: { retry: () => void }) {
  return (
    <SiteShell>
      <div className="route-message">
        <p className="eyebrow">COLLECTION UNAVAILABLE</p>
        <h1>A brief pause.</h1>
        <p>
          We couldn’t load the collection’s settings. Please try again in a
          moment.
        </p>
        <Button variant="primary"  onClick={retry}>
          Try again <span aria-hidden="true"><Icon name="refresh" /></span>
        </Button>
        <Link className="ui-text-action ui-text-action-standalone" href="/seasons">
          Back to seasons
        </Link>
      </div>
    </SiteShell>
  );
}
