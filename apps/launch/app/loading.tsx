import { LaunchBrand } from "../components/launch/brand";

export default function Loading() {
  return <main className="launch-login-shell launch-error-shell" aria-busy="true">
    <div className="launch-login-brand"><LaunchBrand /><span className="launch-private-tag">Private workspace</span></div>
    <section className="launch-login-card launch-unavailable-card">
      <h1>Opening workspace…</h1>
      <p role="status">Loading the current workspace. Your saved configuration will appear when ready.</p>
    </section>
  </main>;
}
