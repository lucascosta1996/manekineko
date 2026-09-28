import { LinkButton } from "@manekineko/ui/button";
import { LaunchBrand } from "../components/launch/brand";

export default function NotFound() {
  return <main className="launch-login-shell launch-error-shell">
    <div className="launch-login-brand"><a href="/dashboard" aria-label="Tincta home"><LaunchBrand decorative /></a><span className="launch-private-tag">Private workspace</span></div>
    <section className="launch-login-card launch-unavailable-card" aria-labelledby="not-found-title">
      <h1 id="not-found-title">Page not found.</h1>
      <p>This workspace page is unavailable. Open the dashboard to continue.</p>
      <div className="launch-unavailable-actions"><LinkButton href="/dashboard">Open dashboard</LinkButton><LinkButton variant="secondary" href="/login">Back to sign in</LinkButton></div>
    </section>
  </main>;
}
