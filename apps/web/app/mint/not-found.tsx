import { configuredChainId } from "../../lib/chain-policy";
import Link from "next/link";
import { SiteShell } from "../../components/site-shell";
export default function NotFound() {
  return (
    <SiteShell chainId={configuredChainId()}>
      <div className="route-message">
        <p className="eyebrow">COLLECTION NOT FOUND</p>
        <h1>This ticket leads elsewhere.</h1>
        <p>
          We couldn’t find a collection with this ID. Explore the available
          collections to find your next ticket.
        </p>
        <Link className="primary-button" href="/seasons">
          Explore seasons <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </SiteShell>
  );
}
