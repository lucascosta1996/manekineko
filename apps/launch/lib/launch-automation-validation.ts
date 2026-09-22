import { parseSeasonTiming, parseSeasonSocial, resolveTimedAutomationStep } from "./season-timeline.ts";
import { launchContractVersion } from "./launch-config.ts";
import { requireLaunchChain, requireSeasonPlanningChain } from "./chain-policy.ts";
import { getAddress, ZeroAddress } from "ethers";
import { MAX_SEASON_COLLECTIONS } from "@manekineko/contract-abi/season-appearance";
import { AutomationError, type AutomationPayload, type AutomationRuntimeContext, type AutomationStepDecision, type AutomationValidation } from "./launch-automation.ts";
import { parseLaunchDraft, parseLaunchLabel, parseLaunchRequest, validateLaunchPayload, type LaunchValidationOptions } from "./launch-config-validation.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INTERVAL = 2_592_000n;
const MAX_DURATION = 31_536_000n;
const MIN_DURATION = 3600n;
const SERIES_FIELDS = ["factoryMode", "factoryAddress", "deployerAddress", "factoryOwnerAddress"] as const;
/** Leaves room below PostgreSQL's JSONB document limit for spacing and normalized network fields. */
export const AUTOMATION_PLAN_MAX_BYTES = 190_000;

function iso(value: unknown, field: string, nullable = true): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) throw new AutomationError("invalid_automation", `${field} must be a UTC date with whole seconds.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().replace(".000Z", "Z") !== value) throw new AutomationError("invalid_automation", `${field} must be a valid UTC date.`);
  return value;
}

function seconds(value: string): bigint { return BigInt(new Date(value).getTime() / 1000); }
function instant(value: bigint): string { return new Date(Number(value) * 1000).toISOString().replace(".000Z", "Z"); }
function nonnegativeInteger(value: unknown): value is string { return typeof value === "string" && /^(0|[1-9]\d{0,15})$/.test(value); }

/** Allows incomplete contract drafts while rejecting unknown fields, oversized plans and ambiguous date formats. */
export function parseAutomationDraft(input: unknown): AutomationPayload {
  try {
    const raw = parseLaunchRequest(input, ["name", "seasonId", "chainId", "startAt", "intervalSeconds", "failurePolicy", "steps", "timing", "social"]);
    const name = parseLaunchLabel(raw.name);
    if (raw.seasonId !== undefined && (typeof raw.seasonId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(raw.seasonId) || /^0x0{64}$/.test(raw.seasonId))) throw new AutomationError("invalid_automation", "Season ID must be a nonzero 32-byte hex value.");
    if (raw.seasonId !== undefined && (new TextEncoder().encode(name).length > 64 || /[\u0000-\u001f\u007f]/.test(name))) throw new AutomationError("invalid_automation", "Season name must contain 1–64 UTF-8 bytes without control characters.");
    if (raw.chainId !== "1" && raw.chainId !== "11155111") throw new AutomationError("invalid_automation", "Choose Ethereum Mainnet or Sepolia for the series.");
    requireSeasonPlanningChain(raw.chainId);
    if (raw.failurePolicy !== "pause") throw new AutomationError("invalid_automation", "Automation must pause on failure or an unsold collection.");
    if (typeof raw.intervalSeconds !== "string" || raw.intervalSeconds.length > 16 || raw.intervalSeconds.includes("\u0000")) throw new AutomationError("invalid_automation", "The interval must be text of at most 16 characters.");
    if (!Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > MAX_SEASON_COLLECTIONS) throw new AutomationError("invalid_automation", `Include between 1 and ${MAX_SEASON_COLLECTIONS} collections in a season.`);
    const ids = new Set<string>();
    const steps = raw.steps.map((value, index) => {
      const step = parseLaunchRequest(value, ["id", "label", "payload", "deadline"]);
      if (typeof step.id !== "string" || !UUID.test(step.id) || ids.has(step.id.toLowerCase())) throw new AutomationError("invalid_automation", "Each collection must have its own unique UUID.");
      ids.add(step.id.toLowerCase());
      const deadline = parseLaunchRequest(step.deadline, ["mode", "at"]);
      if (deadline.mode !== "duration" && deadline.mode !== "fixed") throw new AutomationError("invalid_automation", `Collection ${index + 1}: choose a duration or fixed deadline.`);
      if (deadline.mode === "duration" && deadline.at !== null) throw new AutomationError("invalid_automation", `Collection ${index + 1}: a duration deadline must not also contain a date.`);
      return { id: step.id.toLowerCase(), label: parseLaunchLabel(step.label), payload: parseLaunchDraft(step.payload, { seasonPlanning: true }), deadline: { mode: deadline.mode, at: iso(deadline.at, `Collection ${index + 1} deadline`) } };
    });
    const plan = { name, ...(raw.timing === undefined ? {} : { timing: parseSeasonTiming(raw.timing) }), ...(raw.social === undefined ? {} : { social: parseSeasonSocial(raw.social) }), ...(raw.seasonId === undefined ? {} : { seasonId: (raw.seasonId as string).toLowerCase() }), chainId: raw.chainId, startAt: iso(raw.startAt, "Earliest start"), intervalSeconds: raw.intervalSeconds, failurePolicy: "pause", steps } as AutomationPayload;
    if (plan.steps.some(step => step.payload.contract.chainId !== plan.chainId)) throw new AutomationError("invalid_automation", "Every collection must use its season’s network.");
    if (plan.timing && (plan.intervalSeconds !== "0" || plan.steps.some(step => !["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(launchContractVersion(step.payload))))) throw new AutomationError("invalid_automation", "Fixed sellout timing requires V7–V10 collections and a zero legacy interval.");
    if (plan.social && !plan.timing) throw new AutomationError("invalid_automation", "Social planning requires a fixed season timing policy.");
    if (plan.steps.some(step => step.payload.contract.seasonId !== undefined || step.payload.contract.seasonName !== undefined) && !plan.seasonId) throw new AutomationError("invalid_automation", "The season needs an ID shared by all its collections.");
    if (plan.seasonId && plan.steps.some(step => step.payload.contract.seasonId?.toLowerCase() !== plan.seasonId || step.payload.contract.seasonName !== plan.name)) throw new AutomationError("invalid_automation", "Every collection must use this season’s ID and name.");
    if (new TextEncoder().encode(JSON.stringify(plan)).byteLength > AUTOMATION_PLAN_MAX_BYTES) throw new AutomationError("automation_too_large", "This automation is too large. Shorten collection notes or split it into smaller plans.", 413);
    return plan;
  } catch (error) {
    if (error instanceof AutomationError) throw error;
    throw new AutomationError("invalid_automation", error instanceof Error ? error.message : "Invalid automation draft.");
  }
}

/** Shared by the dashboard and future workers. No RPC, transaction signing or background execution happens here. */
export function validateAutomationPayload(input: unknown, now = new Date(), options: LaunchValidationOptions = {}): AutomationValidation {
  let payload: AutomationPayload;
  try { payload = parseAutomationDraft(input); requireLaunchChain(payload.chainId); }
  catch (error) { return { valid: false, issues: [error instanceof Error ? error.message : "Invalid automation draft."], payload: null }; }
  const issues: string[] = [];
  if (options.requireSeasonAppearance && payload.steps.some(step => step.payload.contract.algorithmVersion !== undefined) && !payload.seasonId) issues.push("Choose a season identity and name before preparing new collections.");
  if (!Number.isFinite(now.getTime())) return { valid: false, issues: ["A valid validation clock is required."], payload: null };
  const current = BigInt(Math.floor(now.getTime() / 1000));
  if (payload.timing) {
    const enrollment = payload.steps[0].payload.operations.enrollmentWindowSeconds;
    if (!payload.startAt || seconds(payload.startAt) <= current) issues.push("Set a future first collection mint opening before preparing a timed season.");
    else if (nonnegativeInteger(enrollment) && seconds(payload.startAt) - current <= BigInt(enrollment)) issues.push("The first mint opening must leave time for the full enrollment window and confirmed deployment.");
  }
  let earliest = payload.startAt ? seconds(payload.startAt) : current;
  if (earliest < current) earliest = current;
  const validInterval = nonnegativeInteger(payload.intervalSeconds) && BigInt(payload.intervalSeconds) <= MAX_INTERVAL;
  if (!validInterval) issues.push("The interval must be a whole number of seconds from 0 to 2592000 (30 days).");
  const interval = validInterval ? BigInt(payload.intervalSeconds) : 0n;
  const first = payload.steps[0].payload.operations;
  const normalizedSteps = payload.steps.map((step, index) => {
    const prefix = `Collection ${index + 1} (${step.label}): `;
    if (step.payload.contract.chainId !== payload.chainId) issues.push(`${prefix}the collection network must match the series network.`);
    if (index > 0 && SERIES_FIELDS.some(field => step.payload.operations[field].toLowerCase() !== first[field].toLowerCase())) issues.push(`${prefix}inherit the first collection's factory, deployer and factory owner. Later collections reuse the same resolved factory.`);
    if (index > 0 && step.payload.operations.affiliateEligibilityAddress?.toLowerCase() !== first.affiliateEligibilityAddress?.toLowerCase()) issues.push(`${prefix}inherit the first collection's canonical affiliate eligibility registry. A new factory does not reopen unrestricted enrollment.`);
    if (launchContractVersion(step.payload) !== launchContractVersion(payload.steps[0].payload)) issues.push(`${prefix}all collections must use the same contract version as their factory.`);
    const effective = structuredClone(step.payload);
    if (step.deadline.mode === "fixed") {
      if (!step.deadline.at) issues.push(`${prefix}set a fixed deadline.`);
      else {
        const duration = seconds(step.deadline.at) - earliest;
        if (duration < MIN_DURATION || duration > MAX_DURATION) issues.push(`${prefix}the fixed deadline must leave between 1 hour and 365 days from its earliest possible deployment.`);
        else effective.contract.mintDurationSeconds = duration.toString();
        if (!nonnegativeInteger(step.payload.contract.mintDurationSeconds) || BigInt(step.payload.contract.mintDurationSeconds) < MIN_DURATION || BigInt(step.payload.contract.mintDurationSeconds) > MAX_DURATION) issues.push(`${prefix}the saved duration must remain between 1 hour and 365 days; the fixed date overrides it at execution.`);
      }
    }
    if (payload.timing) {
      if (step.payload.contract.saleStartAt !== "0") issues.push(`${prefix}the season worker resolves saleStartAt from the fixed timeline; save zero in the template.`);
      if (index > 0 && nonnegativeInteger(step.payload.operations.enrollmentWindowSeconds) && BigInt(step.payload.operations.enrollmentWindowSeconds) >= BigInt(payload.timing.nextLaunchDelaySeconds)) issues.push(`${prefix}enrollment must fit before the fixed next launch, leaving time for deployment and confirmation.`);
    }
    const result = validateLaunchPayload(effective, { ...options, resolveSeasonStartAt: !!payload.timing });
    issues.push(...result.issues.map(issue => `${prefix}${issue}`));
    const normalized = result.payload ? { ...step, payload: { ...result.payload, contract: { ...result.payload.contract, mintDurationSeconds: step.payload.contract.mintDurationSeconds } } } : step;
    // This is only a lower bound. Sellout and confirmed prize delivery can delay every later collection.
    const enrollment = nonnegativeInteger(step.payload.operations.enrollmentWindowSeconds) ? BigInt(step.payload.operations.enrollmentWindowSeconds) : 0n;
    earliest += payload.timing ? BigInt(payload.timing.nextLaunchDelaySeconds) : enrollment + interval;
    return normalized;
  });
  if (issues.length) return { valid: false, issues, payload: null };
  return { valid: true, issues: [], payload: { ...payload, steps: normalizedSteps } };
}

export function requireValidAutomationPayload(input: unknown, now = new Date(), options: LaunchValidationOptions = {}): AutomationPayload {
  const validation = validateAutomationPayload(input, now, options);
  if (!validation.valid || !validation.payload) throw new AutomationError("invalid_automation", "Resolve the automation checks before preparing this plan.", 422, validation.issues);
  return validation.payload;
}

/** Pure preflight planning only. Callers must load a prepared artifact and supply trusted, finalized chain observations. */
export function resolveAutomationStep(input: AutomationPayload, context: AutomationRuntimeContext): AutomationStepDecision {
  let plan: AutomationPayload;
  try { plan = parseAutomationDraft(input); }
  catch (error) { return { status: "pause", reason: error instanceof Error ? error.message : "Invalid automation plan." }; }
  if (plan.timing) return resolveTimedAutomationStep(plan, context);
  if (!nonnegativeInteger(context.blockTimestamp) || BigInt(context.blockTimestamp) > 253_402_300_799n) return { status: "pause", reason: "A valid pinned block timestamp is required." };
  if (!nonnegativeInteger(plan.intervalSeconds) || BigInt(plan.intervalSeconds) > MAX_INTERVAL) return { status: "pause", reason: "The automation interval is invalid." };
  const index = plan.steps.findIndex(step => step.id === context.stepId.toLowerCase());
  if (index === -1) return { status: "pause", reason: "The collection is not part of this prepared plan." };
  const step = plan.steps[index];
  const now = BigInt(context.blockTimestamp);
  let earliest = plan.startAt ? seconds(plan.startAt) : 0n;
  const result = structuredClone(step.payload);
  if (result.contract.chainId !== plan.chainId) return { status: "pause", reason: "The collection network does not match its series." };
  // Expired work cannot become executable by waiting for a predecessor that has not completed.
  if (step.deadline.mode === "fixed") {
    if (!step.deadline.at) return { status: "pause", reason: "The fixed deadline is missing." };
    const remaining = seconds(step.deadline.at) - (earliest > now ? earliest : now);
    if (remaining < MIN_DURATION) return { status: "pause", reason: "The fixed deadline no longer leaves a valid deployment window. It will not be extended automatically." };
    if (nonnegativeInteger(result.operations.enrollmentWindowSeconds) && remaining <= BigInt(result.operations.enrollmentWindowSeconds)) return { status: "pause", reason: "The fixed deadline no longer leaves time for enrollment and minting." };
  }
  if (plan.steps.some(item => launchContractVersion(item.payload) !== launchContractVersion(plan.steps[0].payload))) return { status: "pause", reason: "A factory sequence cannot mix contract versions." };
  const first = plan.steps[0].payload.operations;
  if (plan.steps.some(item => item.payload.operations.affiliateEligibilityAddress?.toLowerCase() !== first.affiliateEligibilityAddress?.toLowerCase())) return { status: "pause", reason: "The collection changed the reviewed canonical affiliate eligibility registry." };
  if (index > 0) {
    if (SERIES_FIELDS.some(field => result.operations[field].toLowerCase() !== first[field].toLowerCase())) return { status: "pause", reason: "The collection changed the reviewed factory series settings." };
    const previous = context.previous;
    if (!previous || previous.stepId.toLowerCase() !== plan.steps[index - 1].id) return { status: "wait", reason: "Wait for the preceding collection's confirmed completion.", earliestAt: earliest ? instant(earliest) : null };
    const version = launchContractVersion(step.payload);
    if ((version === "affiliate-v6" || previous.contractVersion !== undefined) && previous.contractVersion !== version) return { status: "pause", reason: "The confirmed factory contract version differs from the reviewed collection. V6 cannot reuse a V5 factory." };
    if (previous.outcome === "failed" || previous.outcome === "unsold") return { status: "pause", reason: "The preceding collection failed or reached its deadline unsold. Operator review is required." };
    if (!previous.confirmed || !previous.soldOut || !previous.prizePaid || previous.outcome !== "completed") return { status: "wait", reason: "The preceding collection must sell out and its prize payment must be confirmed.", earliestAt: null };
    let completed: string | null;
    try { completed = iso(previous.completedAt, "Previous completion", false); }
    catch { return { status: "pause", reason: "A valid confirmed completion time is required." }; }
    if (!completed || seconds(completed) > now) return { status: "pause", reason: "The previous completion is newer than the pinned block." };
    if (previous.chainId !== plan.chainId || previous.deployerAddress.toLowerCase() !== first.deployerAddress.toLowerCase() || previous.factoryOwnerAddress.toLowerCase() !== first.factoryOwnerAddress.toLowerCase()) return { status: "pause", reason: "The confirmed factory ownership or network differs from the reviewed series." };
    let factory: string;
    try { factory = getAddress(previous.factoryAddress); if (factory === ZeroAddress) throw new Error("Zero factory"); }
    catch { return { status: "pause", reason: "A valid confirmed factory address is required." }; }
    if (first.factoryMode === "existing" && factory.toLowerCase() !== first.factoryAddress.toLowerCase()) return { status: "pause", reason: "The confirmed factory differs from the reviewed existing factory." };
    result.operations.factoryMode = "existing";
    result.operations.factoryAddress = factory;
    const afterPrevious = seconds(completed) + BigInt(plan.intervalSeconds);
    if (afterPrevious > earliest) earliest = afterPrevious;
  } else if (context.previous) return { status: "pause", reason: "The first collection must not inherit an unrelated completion observation." };
  if (step.deadline.mode === "fixed") {
    if (!step.deadline.at) return { status: "pause", reason: "The fixed deadline is missing." };
    const effectiveStart = earliest > now ? earliest : now;
    const remaining = seconds(step.deadline.at) - effectiveStart;
    if (remaining < MIN_DURATION || remaining > MAX_DURATION) return { status: "pause", reason: "The fixed deadline no longer leaves a valid deployment window. It will not be extended automatically." };
    if (nonnegativeInteger(result.operations.enrollmentWindowSeconds) && remaining <= BigInt(result.operations.enrollmentWindowSeconds)) return { status: "pause", reason: "The fixed deadline no longer leaves time for enrollment and minting." };
    result.contract.mintDurationSeconds = (seconds(step.deadline.at) - now).toString();
  }
  if (now < earliest) return { status: "wait", reason: "The earliest start or interval has not been reached.", earliestAt: instant(earliest) };
  const validation = validateLaunchPayload(result, { requireSeasonAppearance: true });
  if (!validation.valid || !validation.payload) return { status: "pause", reason: validation.issues.join(" ") };
  return { status: "ready_for_preflight", stepId: step.id, payload: validation.payload, mintDeadline: (now + BigInt(validation.payload.contract.mintDurationSeconds)).toString(), earliestAt: earliest ? instant(earliest) : null };
}
