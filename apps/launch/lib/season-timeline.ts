import { getAddress, ZeroAddress } from "ethers";
import { AutomationError, type AutomationPayload, type AutomationRuntimeContext, type AutomationStepDecision } from "./launch-automation.ts";
import { launchContractVersion } from "./launch-config.ts";
import { validateLaunchPayload } from "./launch-config-validation.ts";

export type SeasonTiming = {
  version: 1;
  anchor: "previous_sellout";
  nextLaunchDelaySeconds: string;
  nextAnnouncementDelaySeconds: string;
  winnerAnnouncement: "after_verified_draw";
  missedLaunchPolicy: "pause";
};
export type SeasonSocial = { enabled: boolean; channel: "x"; selloutTemplate: string; winnersTemplate: string; nextLaunchTemplate: string };
export const SEASON_TEMPLATE_FIELDS = ["seasonName", "collectionName", "soldOutAt", "minted", "mintRevenueEth", "winners", "nextCollectionName", "launchAt", "collectionUrl", "nextCollectionUrl"] as const;
export function defaultSeasonTiming(): SeasonTiming {
  return { version: 1, anchor: "previous_sellout", nextLaunchDelaySeconds: "3600", nextAnnouncementDelaySeconds: "1800", winnerAnnouncement: "after_verified_draw", missedLaunchPolicy: "pause" };
}
export function defaultSeasonSocial(): SeasonSocial {
  return { enabled: false, channel: "x", selloutTemplate: "{{seasonName}} / {{collectionName}} sold out: {{minted}} colors collected. The verified draw is next. {{collectionUrl}}", winnersTemplate: "{{seasonName}} / {{collectionName}}: verified winning tickets {{winners}}. {{collectionUrl}}", nextLaunchTemplate: "Next in {{seasonName}}: {{nextCollectionName}} launches at {{launchAt}}. {{nextCollectionUrl}}" };
}
const UINT = /^(0|[1-9]\d{0,15})$/;
const MAX_TIME = 253_402_300_799n;
function invalid(message: string): never { throw new AutomationError("invalid_season_timing", message); }
function object(input: unknown, fields: string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("Season settings must be an object.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !fields.includes(key)) || fields.some(key => !(key in value))) invalid("Season settings contain missing or unknown fields.");
  return value;
}
export function parseSeasonTiming(input: unknown): SeasonTiming {
  const value = object(input, ["version", "anchor", "nextLaunchDelaySeconds", "nextAnnouncementDelaySeconds", "winnerAnnouncement", "missedLaunchPolicy"]);
  if (value.version !== 1 || value.anchor !== "previous_sellout" || value.winnerAnnouncement !== "after_verified_draw" || value.missedLaunchPolicy !== "pause") invalid("Use a sellout-anchored schedule, verified winner announcements and pause on a missed launch.");
  for (const field of ["nextLaunchDelaySeconds", "nextAnnouncementDelaySeconds"]) if (typeof value[field] !== "string" || !UINT.test(value[field] as string) || BigInt(value[field] as string) > 2_592_000n) invalid("Season delays must be whole seconds between 0 and 2592000.");
  if (BigInt(value.nextLaunchDelaySeconds as string) === 0n || BigInt(value.nextAnnouncementDelaySeconds as string) >= BigInt(value.nextLaunchDelaySeconds as string)) invalid("The next collection announcement must precede its fixed launch.");
  return { ...value } as SeasonTiming;
}
export function parseSeasonSocial(input: unknown): SeasonSocial {
  const value = object(input, ["enabled", "channel", "selloutTemplate", "winnersTemplate", "nextLaunchTemplate"]);
  if (typeof value.enabled !== "boolean" || value.channel !== "x") invalid("Choose an explicit X announcement policy.");
  for (const field of ["selloutTemplate", "winnersTemplate", "nextLaunchTemplate"]) {
    const template = value[field];
    if (typeof template !== "string" || !template.trim() || template.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(template)) invalid("Announcement templates must contain 1–2000 characters without control characters.");
    const remaining = template.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, key: string) => { if (!(SEASON_TEMPLATE_FIELDS as readonly string[]).includes(key)) invalid(`Unknown announcement field: ${key}.`); return ""; });
    if (/[{}]/.test(remaining)) invalid("Use supported {{fieldName}} announcement placeholders.");
    if (field !== "winnersTemplate" && template.includes("{{winners}}")) invalid("Only the verified-draw announcement can include winners; other messages cannot include unverified winners.");
    if (field === "nextLaunchTemplate" && !template.includes("{{launchAt}}")) invalid("The next launch announcement must include its fixed launch time.");
  }
  return { ...value } as SeasonSocial;
}
function timestamp(value: string, label: string): bigint {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) invalid(`${label} must be a UTC timestamp with whole seconds.`);
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || new Date(time).toISOString().replace(".000Z", "Z") !== value || time < 0) invalid(`${label} is invalid.`);
  return BigInt(time / 1000);
}
function instant(value: bigint): string {
  if (value < 0n || value > MAX_TIME) invalid("The season schedule exceeds the supported date range.");
  return new Date(Number(value) * 1000).toISOString().replace(".000Z", "Z");
}
export function seasonTimeline(soldOutAt: string, settings: SeasonTiming) {
  const timing = parseSeasonTiming(settings), soldOut = timestamp(soldOutAt, "Sellout");
  return { soldOutAt: instant(soldOut), nextAnnouncementAt: instant(soldOut + BigInt(timing.nextAnnouncementDelaySeconds)), nextLaunchAt: instant(soldOut + BigInt(timing.nextLaunchDelaySeconds)) };
}
/** Produces review text only. A future adapter must also enforce X's weighted text and URL rules. */
export function renderSeasonAnnouncement(template: string, values: Partial<Record<typeof SEASON_TEMPLATE_FIELDS[number], string>>): string {
  const text = template.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, key: string) => {
    if (!(SEASON_TEMPLATE_FIELDS as readonly string[]).includes(key)) invalid(`Unknown announcement field: ${key}.`);
    const value = values[key as keyof typeof values];
    if (!value?.trim() || /[{}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid(`Missing or invalid announcement value: ${key}.`);
    return value;
  });
  if (/[{}]/.test(text) || [...text].length > 280) invalid("The rendered announcement must be complete and at most 280 characters before channel validation.");
  return text;
}

/** Prepared-plan resolver only: predeploy before the fixed sale start; it never signs or launches. */
export function resolveTimedAutomationStep(plan: AutomationPayload, context: AutomationRuntimeContext): AutomationStepDecision {
  try {
    if (!plan.timing || plan.intervalSeconds !== "0" || plan.failurePolicy !== "pause") invalid("Fixed timing requires a zero legacy interval and pause on failure.");
    const timing = parseSeasonTiming(plan.timing);
    if (plan.social) parseSeasonSocial(plan.social);
    if (!UINT.test(context.blockTimestamp) || BigInt(context.blockTimestamp) > MAX_TIME) invalid("A valid pinned block timestamp is required.");
    const now = BigInt(context.blockTimestamp);
    const index = plan.steps.findIndex(step => step.id === context.stepId.toLowerCase());
    if (index < 0) invalid("The collection is not part of this prepared season.");
    const version = launchContractVersion(plan.steps[0].payload);
    if (!["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(version) || plan.steps.some(step => launchContractVersion(step.payload) !== version || step.payload.contract.chainId !== plan.chainId)) invalid("Fixed season timing requires matching V7–V10 collections on the reviewed network.");
    const first = plan.steps[0].payload.operations;
    const seriesFields = ["factoryMode", "factoryAddress", "deployerAddress", "factoryOwnerAddress", "affiliateEligibilityAddress"] as const;
    if (plan.steps.some(step => seriesFields.some(field => step.payload.operations[field]?.toLowerCase() !== first[field]?.toLowerCase()))) invalid("The collection changed the reviewed factory or eligibility registry settings.");
    const step = plan.steps[index], result = structuredClone(step.payload);
    let launch: bigint;
    if (index === 0) {
      if (context.previous) invalid("The first collection cannot inherit an unrelated sellout.");
      if (!plan.startAt) invalid("Choose the first collection's fixed UTC launch time before preparing this season.");
      launch = timestamp(plan.startAt, "First launch");
    } else {
      const previous = context.previous;
      if (!previous || previous.stepId.toLowerCase() !== plan.steps[index - 1].id) return { status: "wait", reason: "Wait for the preceding collection's confirmed sellout.", earliestAt: null };
      if (previous.contractVersion !== version || previous.chainId !== plan.chainId || previous.deployerAddress.toLowerCase() !== first.deployerAddress.toLowerCase() || previous.factoryOwnerAddress.toLowerCase() !== first.factoryOwnerAddress.toLowerCase()) invalid("The confirmed predecessor factory version, ownership or network differs from the reviewed season.");
      if (previous.outcome === "unsold" || previous.outcome === "failed") invalid("The preceding collection failed or expired unsold. Operator review is required.");
      if (!previous.confirmed || !previous.soldOut) return { status: "wait", reason: "Wait for finalized sellout evidence from the preceding collection.", earliestAt: null };
      if (!previous.soldOutAt) invalid("The preceding collection needs a canonical sellout timestamp.");
      const soldOut = timestamp(previous.soldOutAt, "Previous sellout");
      if (soldOut > now) invalid("The sellout observation is newer than the pinned block.");
      launch = soldOut + BigInt(timing.nextLaunchDelaySeconds);
      if (now >= launch) invalid("The fixed launch time was missed. Pause for review; do not move the advertised time automatically.");
      if (!previous.randomnessRevealed || !previous.prizesReserved) return { status: "wait", reason: "Wait for the verified draw and fully reserved prizes before preparing the next collection.", earliestAt: null };
      let factory: string;
      try { factory = getAddress(previous.factoryAddress); if (factory === ZeroAddress) throw new Error(); } catch { invalid("A valid confirmed factory address is required."); }
      if (first.factoryMode === "existing" && factory.toLowerCase() !== first.factoryAddress.toLowerCase()) invalid("The confirmed factory differs from the reviewed existing factory.");
      result.operations.factoryMode = "existing";
      result.operations.factoryAddress = factory;
    }
    if (now >= launch) invalid("The fixed launch time was missed. Pause for review; do not move it automatically.");
    if (!UINT.test(result.operations.enrollmentWindowSeconds) || launch - now <= BigInt(result.operations.enrollmentWindowSeconds)) invalid("Insufficient time remains to deploy, confirm and complete affiliate enrollment before the fixed launch.");
    result.contract.saleStartAt = launch.toString();
    const duration = step.deadline.mode === "fixed" ? (step.deadline.at ? timestamp(step.deadline.at, "Mint deadline") - launch : -1n) : (UINT.test(result.contract.mintDurationSeconds) ? BigInt(result.contract.mintDurationSeconds) : -1n);
    if (duration < 3600n || duration > 31_536_000n) invalid("The mint deadline must be between 1 hour and 365 days after the fixed sale start.");
    result.contract.mintDurationSeconds = duration.toString();
    const validation = validateLaunchPayload(result, { requireSeasonAppearance: true, requireWinnerCredits: true, requireAffiliateEligibility: true });
    if (!validation.valid || !validation.payload) invalid(validation.issues.join(" "));
    return { status: "ready_for_preflight", stepId: step.id, payload: validation.payload, mintDeadline: (launch + duration).toString(), earliestAt: instant(now) };
  } catch (error) { return { status: "pause", reason: error instanceof Error ? error.message : "Invalid season timing." }; }
}

export const MAX_ACTIVATION_LAG_SECONDS = 60n;
export type SeasonActivationEvidence = { now: string; launchAt: string; deployedAndFunded: boolean; previousDrawVerified: boolean; prizesReserved: boolean; socialEnabled: boolean; winnersAnnouncementConfirmed: boolean; nextLaunchAnnouncementConfirmed: boolean; readinessConfirmedAt: string | null };
/** A future executor must not substitute late wall-clock time for the published block timestamp. */
export function seasonActivationDecision(evidence: SeasonActivationEvidence): { status: "wait" | "ready" | "pause"; reason: string } {
  const now = timestamp(evidence.now, "Now"), launch = timestamp(evidence.launchAt, "Launch");
  const ready = evidence.deployedAndFunded && evidence.previousDrawVerified && evidence.prizesReserved && (!evidence.socialEnabled || (evidence.winnersAnnouncementConfirmed && evidence.nextLaunchAnnouncementConfirmed));
  if (now < launch) return { status: "wait", reason: "The fixed launch time has not arrived." };
  if (now - launch > MAX_ACTIVATION_LAG_SECONDS) return { status: "pause", reason: "The fixed launch activation window was missed. Operator review is required." };
  if (!ready || !evidence.readinessConfirmedAt || timestamp(evidence.readinessConfirmedAt, "Readiness") > launch) return { status: "pause", reason: "The fixed launch was reached without verified preparation or required announcements. Review is required." };
  return { status: "ready", reason: "The fixed on-chain sale start has arrived and all launch prerequisites are confirmed." };
}
