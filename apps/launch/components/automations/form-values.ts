import { defaultSeasonTiming, defaultSeasonSocial, type SeasonTiming, type SeasonSocial } from "../../lib/season-timeline.ts";
import { MAX_SEASON_COLLECTIONS, DEFAULT_COLLECTION_COLOR } from "@manekineko/contract-abi/season-appearance";
import type { AutomationPayload, AutomationPlan, AutomationStep } from "../../lib/launch-automation.ts";
import type { LaunchConfiguration } from "../../lib/launch-config.ts";
import { defaultLaunchForm, formFromConfiguration, payloadFromForm, useEqualPrizeModel, usePermanentNumbers, usesQualifiedAffiliateModel, type DurationUnit, type LaunchForm } from "../launch/form-values.ts";

export type StepForm = { id: string; form: LaunchForm; deadlineMode: "duration" | "fixed"; deadlineInput: string };
export type AutomationForm = { timing?: SeasonTiming; social?: SeasonSocial; seasonId?: string; name: string; chainId: "1" | "11155111"; startInput: string; interval: string; intervalUnit: DurationUnit; steps: StepForm[] };

export function dateInputToUtc(value: string, label: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) throw new Error(`${label} needs a valid date and time.`);
  const date = new Date(`${value}Z`);
  if (!Number.isFinite(date.getTime()) || utcToDateInput(date.toISOString()).slice(0, value.length) !== value) throw new Error(`${label} is not a valid UTC date and time.`);
  return date.toISOString().replace(/\.000Z$/, "Z");
}

export function utcToDateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("The saved date is invalid.");
  const part = (n: number) => String(n).padStart(2, "0");
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${part(date.getUTCMonth() + 1)}-${part(date.getUTCDate())}T${part(date.getUTCHours())}:${part(date.getUTCMinutes())}:${part(date.getUTCSeconds())}`;
}

/** Keep generated copy names valid without splitting a multibyte character. */
function copyName(value: string, suffix: string, maximumBytes: number): string {
  const encoder = new TextEncoder();
  const budget = maximumBytes - encoder.encode(suffix).length;
  let name = "", bytes = 0;
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (bytes + size > budget) break;
    name += character; bytes += size;
  }
  return `${name.trimEnd()}${suffix}`;
}

export function cloneStep(step: StepForm, id: string, number: number): StepForm {
  const label = `Collection ${String(number).padStart(2, "0")}`;
  const name = !step.form.name || /^Collection \d+$/.test(step.form.name) ? label : copyName(step.form.name, ` — copy ${number}`, 80);
  return { ...step, id, form: { ...step.form, label, name, rates: [...step.form.rates] } };
}

/** Historical V4/V5 templates retain their contract version and never acquire V6-only fields. */
export function cloneAutomationForm(form: AutomationForm, createId: () => string, createSeasonIdentity: () => string): AutomationForm {
  const modern = form.steps.length > 0 && form.steps.every(item => !!item.form.algorithmVersion);
  const name = copyName(form.name, " — copy", modern ? 64 : 100);
  const seasonId = modern ? createSeasonIdentity() : undefined;
  const next: AutomationForm = { ...form, name, steps: form.steps.map(item => ({ ...item, id: createId(), form: { ...item.form, rates: [...item.form.rates] } })) };
  if (seasonId === undefined) delete next.seasonId;
  else {
    next.seasonId = seasonId;
    next.steps = next.steps.map(item => ({ ...item, form: { ...item.form, seasonId, seasonName: name, collectionColor: item.form.collectionColor ?? DEFAULT_COLLECTION_COLOR } }));
  }
  return next;
}

export function defaultAutomationForm(ids: string[], chainId: "1" | "11155111" = "1", seasonId = ""): AutomationForm {
  return { seasonId, timing: defaultSeasonTiming(), social: defaultSeasonSocial(), name: "New season", chainId, startInput: "", interval: "0", intervalUnit: "hours", steps: ids.map((id, index) => ({ id, deadlineMode: "duration", deadlineInput: "", form: { ...defaultLaunchForm(chainId), seasonId, seasonName: "New season", name: `Collection ${String(index + 1).padStart(2, "0")}`, label: `Collection ${String(index + 1).padStart(2, "0")}` } })) };
}

export function resizeSteps(steps: StepForm[], countValue: string, createId: () => string): StepForm[] {
  if (!/^[1-9]\d{0,2}$/.test(countValue) || Number(countValue) > MAX_SEASON_COLLECTIONS) throw new Error("Choose between 1 and 10 collections.");
  const count = Number(countValue);
  if (!steps.length) throw new Error("A season needs a first collection.");
  if (count <= steps.length) return steps.slice(0, count);
  return [...steps, ...Array.from({ length: count - steps.length }, (_, index) => cloneStep(steps.at(-1)!, createId(), steps.length + index + 1))];
}

function formForStep(step: AutomationStep): LaunchForm {
  return formFromConfiguration({ label: step.label, payload: step.payload } as LaunchConfiguration);
}

export function formFromAutomation(record: AutomationPlan): AutomationForm {
  const p = record.plan;
  const gap = secondsToGap(p.intervalSeconds);
  return { ...(p.timing ? { timing: { ...p.timing } } : {}), ...(p.social ? { social: { ...p.social } } : {}), ...(p.seasonId !== undefined ? { seasonId: p.seasonId } : {}), name: p.name, chainId: p.chainId, startInput: utcToDateInput(p.startAt), interval: gap.value, intervalUnit: gap.unit, steps: p.steps.map((step) => ({ id: step.id, form: formForStep(step), deadlineMode: step.deadline.mode, deadlineInput: utcToDateInput(step.deadline.at) })) };
}

function secondsToGap(value: string): { value: string; unit: DurationUnit } {
  // Drafts imported through the API can contain unfinished values; keep them editable.
  if (!/^(0|[1-9]\d*)$/.test(value)) return { value, unit: "seconds" };
  const seconds = BigInt(value);
  if (seconds > 0n && seconds % 86400n === 0n) return { value: (seconds / 86400n).toString(), unit: "days" };
  if (seconds % 3600n === 0n) return { value: (seconds / 3600n).toString(), unit: "hours" };
  return { value, unit: "seconds" };
}

export function intervalSeconds(value: string, unit: DurationUnit = "hours"): string {
  if (!/^(0|[1-9]\d*)$/.test(value.trim())) throw new Error(`The pause between collections must be a whole number of ${unit}.`);
  return (BigInt(value.trim()) * (unit === "days" ? 86400n : unit === "hours" ? 3600n : 1n)).toString();
}

function fixedDeadlineFallback(form: LaunchForm): LaunchForm {
  const value = form.duration.trim();
  const multiplier = form.durationUnit === "days" ? 86400n : form.durationUnit === "hours" ? 3600n : 1n;
  const seconds = /^\d{1,16}$/.test(value) ? BigInt(value) * multiplier : 0n;
  if (seconds >= 3600n && seconds <= 31_536_000n) return form;
  // The selected absolute date is authoritative. A hidden, unfinished duration must not block its draft.
  return { ...form, duration: "30", durationUnit: "days" };
}

export function payloadFromAutomationForm(form: AutomationForm): AutomationPayload {
  if (!form.steps.length || form.steps.length > MAX_SEASON_COLLECTIONS) throw new Error("Choose between 1 and 10 collections.");
  const first = form.steps[0].form;
  return {
    ...(form.timing ? { timing: form.timing } : {}), ...(form.social ? { social: form.social } : {}), ...(form.seasonId !== undefined ? { seasonId: form.seasonId } : {}), name: form.name, chainId: form.chainId, startAt: dateInputToUtc(form.startInput, "Earliest start"), intervalSeconds: intervalSeconds(form.interval, form.intervalUnit), failurePolicy: "pause",
    steps: form.steps.map((step, index) => {
      try {
        const terms = step.deadlineMode === "fixed" ? fixedDeadlineFallback(step.form) : step.form;
        const normalized = { ...terms, ...(form.seasonId !== undefined ? { seasonId: form.seasonId, seasonName: form.name } : {}), chainId: form.chainId, factoryMode: first.factoryMode, factoryAddress: first.factoryAddress, deployerAddress: first.deployerAddress, factoryOwnerAddress: first.factoryOwnerAddress, affiliateEligibilityAddress: first.affiliateEligibilityAddress };
        return { id: step.id, label: step.form.label, payload: payloadFromForm(normalized), deadline: { mode: step.deadlineMode, at: step.deadlineMode === "fixed" ? dateInputToUtc(step.deadlineInput, "Deadline") : null } };
      } catch (cause) {
        throw new Error(`Collection ${index + 1} (${step.form.label || "untitled"}): ${cause instanceof Error ? cause.message : "Check this collection’s settings."}`);
      }
    }),
  };
}

/** Copy launch terms while preserving the collection's identity, color and sequence authority. */
export function applyTemplate(step: StepForm, template: LaunchConfiguration): StepForm {
  const copied = formFromConfiguration(template);
  // A template cannot change the factory version of one entry in a sequence.
  if ((copied.affiliatePoolPercent == null) !== (step.form.affiliatePoolPercent == null)) {
    copied.affiliatePoolPercent = step.form.affiliatePoolPercent;
    copied.rates = [...step.form.rates];
  }
  if (step.form.algorithmVersion) {
    copied.winnerCreditsAddress ??= step.form.winnerCreditsAddress;
    copied.winnerCreditSponsorshipEth ??= step.form.winnerCreditSponsorshipEth;
  } else {
    delete copied.winnerCreditsAddress;
    delete copied.winnerCreditSponsorshipEth;
  }
  if (usesQualifiedAffiliateModel(step.form)) {
    if (copied.algorithmVersion !== step.form.algorithmVersion || copied.maxMintsPerWallet !== step.form.maxMintsPerWallet) { copied.winnerCreditsAddress = step.form.winnerCreditsAddress; copied.winnerCreditSponsorshipEth = step.form.winnerCreditSponsorshipEth; }
    copied.minAffiliateReferrals ??= step.form.minAffiliateReferrals; copied.affiliatePayoutCapPercent ??= step.form.affiliatePayoutCapPercent; copied.saleStartAt = "0";
    if (["unique-rank-v5", "unique-rank-v6"].includes(step.form.algorithmVersion ?? "")) { copied.maxMintsPerWallet = step.form.maxMintsPerWallet; copied.winnerCount ??= step.form.winnerCount; delete copied.secondPrizePercent; }
    else { delete copied.maxMintsPerWallet; copied.secondPrizePercent ??= step.form.secondPrizePercent; delete copied.winnerCount; }
  } else { delete copied.winnerCount; delete copied.secondPrizePercent; delete copied.minAffiliateReferrals; delete copied.affiliatePayoutCapPercent; delete copied.saleStartAt; }
  return { ...step, form: { ...copied, name: step.form.seasonId ? step.form.name : copied.name, seasonId: step.form.seasonId, seasonName: step.form.seasonName, collectionColor: step.form.collectionColor, affiliateEligibilityAddress: step.form.affiliateEligibilityAddress, algorithmVersion: step.form.algorithmVersion, factoryMode: step.form.factoryMode, factoryAddress: step.form.factoryAddress, label: step.form.label } };
}

export function upgradeSeasonDraft(form: AutomationForm, createSeasonIdentity: () => string): AutomationForm {
  const seasonId = form.seasonId ?? createSeasonIdentity();
  return { ...form, seasonId, timing: form.timing ?? defaultSeasonTiming(), social: form.social ?? defaultSeasonSocial(), interval: "0", intervalUnit: "seconds", steps: form.steps.map(step => ({ ...step, form: { ...(["unique-rank-v5", "unique-rank-v6"].includes(step.form.algorithmVersion ?? "") ? usePermanentNumbers(step.form) : useEqualPrizeModel(step.form)), seasonId, seasonName: form.name } })) };
}
