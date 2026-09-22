"use client";

import { MAX_ACTIVATION_LAG_SECONDS } from "../../lib/season-timeline";
import type { AutomationForm } from "./form-values";

function readableDelay(value: string): string | null {
  if (!/^(0|[1-9]\d{0,6})$/.test(value)) return null;
  const seconds = Number(value);
  if (seconds > 0 && seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  if (seconds > 0 && seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

export function SeasonTimingFields({ form, disabled, onChange }: { form: AutomationForm; disabled: boolean; onChange: (form: AutomationForm) => void }) {
  if (!form.timing) return null;
  const timing = form.timing;
  const launchDelay = readableDelay(timing.nextLaunchDelaySeconds);
  const announcementDelay = readableDelay(timing.nextAnnouncementDelaySeconds);
  return <section className="automation-plan-settings">
    <div className="automation-section-intro"><span className="launch-eyebrow">SEASON CADENCE</span><h2>Set the pace.</h2><p>The same fixed delays apply after each confirmed sellout. Save the launch schedule here. The V9/V10 worker uses these fixed times and the reviewed event image templates.</p></div>
    <div className="launch-fields automation-plan-fields">
      <label className="launch-field"><span>Next collection launch delay</span><div className="launch-input-unit"><input inputMode="numeric" value={timing.nextLaunchDelaySeconds} disabled={disabled} onChange={event => onChange({ ...form, timing: { ...timing, nextLaunchDelaySeconds: event.target.value } })}/><span>seconds</span></div><small>{launchDelay ? `${launchDelay} after the confirmed sellout.` : "Enter a delay in whole seconds."} The announced opening remains fixed.</small></label>
      <label className="launch-field"><span>Next collection announcement delay</span><div className="launch-input-unit"><input inputMode="numeric" value={timing.nextAnnouncementDelaySeconds} disabled={disabled} onChange={event => onChange({ ...form, timing: { ...timing, nextAnnouncementDelaySeconds: event.target.value } })}/><span>seconds</span></div><small>{announcementDelay ? `${announcementDelay} after the confirmed sellout.` : "Enter a delay in whole seconds."} The announcement must come before the next launch.</small></label>
      <div className="launch-context-note launch-field-wide"><strong>After a collection sells out</strong><p>Sellout statistics are prepared immediately. The next collection is announced {announcementDelay ? `after ${announcementDelay}` : "at the configured announcement time"}, with minting scheduled {launchDelay ? `${launchDelay} after sellout` : "at the configured launch time"}. Winners are announced after the verified draw.</p><p>An unsold or failed collection pauses the sequence for operator review. An incomplete draw or missed launch does not silently move the advertised opening.</p></div>
      <details className="launch-advanced launch-field-wide"><summary>Launch requirements <span>Fixed opening · pause on failure</span></summary><p>Deployment, funding, the preceding verified draw, protected prizes and affiliate enrollment must be ready before minting opens. Unclaimed prizes do not delay the next collection.</p><p>The planned activation allowance is {MAX_ACTIVATION_LAG_SECONDS.toString()} seconds for transaction inclusion after the fixed opening. Missing this window pauses the sequence for review. The published opening and enrollment deadline do not move. Blockchain inclusion cannot be guaranteed at an exact second.</p></details>
      {form.social && <div className="launch-context-note launch-field-wide"><label className="launch-checkbox"><input type="checkbox" checked={form.social.enabled} disabled={disabled} onChange={event => onChange({ ...form, social: { ...form.social!, enabled: event.target.checked } })}/><span>Enable automatic X posts and images for all eight season events</span></label><p>The execution panel previews the upcoming season, affiliate opening, enrollment, mint, sellout, verified winners, refunds and season totals. The worker uses confirmed protocol data and the approved Tincta layouts. Account credentials are configured separately for Mainnet and Sepolia.</p></div>}
    </div>
  </section>;
}
