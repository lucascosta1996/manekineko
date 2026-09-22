"use client";

import { LaunchBrand } from "../components/launch/brand";

export default function LaunchError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="launch-login-shell launch-error-shell">
    <div className="launch-login-brand"><LaunchBrand /><span className="launch-private-tag">Private workspace</span></div>
    <section className="launch-login-card launch-unavailable-card" aria-labelledby="launch-unavailable-title">
      <span className="launch-eyebrow">LAUNCH WORKSPACE</span>
      <h1 id="launch-unavailable-title">We couldn’t open the workspace.</h1>
      <p>The launch workspace is temporarily unavailable. Please try again in a moment.</p>
      <div className="launch-unavailable-actions">
        <button className="launch-button launch-button-primary" onClick={retry}>Try again <span aria-hidden="true">↗</span></button>
        <a className="launch-button launch-button-secondary" href="/login">Back to sign in</a>
      </div>
    </section>
  </main>;
}
