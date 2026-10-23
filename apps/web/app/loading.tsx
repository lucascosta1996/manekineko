import { SiteShell } from "../components/site-shell";

export default function Loading() {
  return <SiteShell><section className="route-message" aria-busy="true"><p className="eyebrow">TINCTA</p><h1>Opening Tincta Rewards.</h1><p role="status">Preparing your collection view…</p><div className="ui-skeleton" aria-hidden="true" style={{ width: "min(100%, 28rem)", minHeight: "8rem" }} /></section></SiteShell>;
}
