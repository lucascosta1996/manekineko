import { LaunchConfigurationError, type LaunchPayload } from "./launch-config.ts";
import { parseLaunchDraft } from "./launch-config-validation.ts";
import { parseAutomationDraft } from "./launch-automation-validation.ts";
import type { AutomationPayload } from "./launch-automation.ts";

/** Historical snapshots remain readable; the operator console creates V10; V8/V9 drafts retain their version until an explicit upgrade. */
export function isCurrentCollection(payload: LaunchPayload): boolean {
  return ["unique-rank-v5", "unique-rank-v6"].includes(payload.contract.algorithmVersion ?? "");
}

export function isCurrentSeason(plan: AutomationPayload): boolean {
  return !!plan.seasonId && !!plan.timing && plan.steps.length > 0 && plan.steps.every(step => isCurrentCollection(step.payload));
}

export function requireCurrentCollection(input: unknown, options: { seasonPlanning?: boolean } = {}): LaunchPayload {
  const payload = parseLaunchDraft(input, options);
  if (!isCurrentCollection(payload)) throw new LaunchConfigurationError("historical_configuration", "Historical collection settings are read-only. Create a new Tincta collection using the current equal-prize model.", 409);
  if (payload.contract.maxMintsPerWallet !== "20") throw new LaunchConfigurationError("wallet_limit_required", "Upgrade this draft to V10 with the fixed 20-mint wallet limit before saving or finalizing.", 409);
  if (payload.contract.affiliateRatesBps.length) throw new LaunchConfigurationError("obsolete_setting", "Per-position commission rates are no longer supported. Configure the qualified affiliate pool instead.");
  return payload;
}

export function requireCurrentSeason(input: unknown): AutomationPayload {
  const plan = parseAutomationDraft(input);
  if (!isCurrentSeason(plan)) throw new LaunchConfigurationError("historical_configuration", "Historical season settings are read-only. Create a new Tincta season with fixed launch timing and equal prizes.", 409);
  plan.steps.forEach(step => requireCurrentCollection(step.payload, { seasonPlanning: true }));
  return plan;
}
