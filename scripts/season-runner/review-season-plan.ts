import { randomBytes, randomUUID } from "node:crypto";
import type { AutomationPayload, AutomationPlan } from "../../apps/launch/lib/launch-automation.ts";
import { parseAutomationDraft } from "../../apps/launch/lib/launch-automation-validation.ts";
import { parseSepoliaScenario, type AffiliateCohort, type SepoliaScenario } from "./sepolia-scenarios.ts";
import { ensure } from "./store.ts";
import { REVIEW_REUSE_POLICY } from "./review-fund-reuse.ts";

export type ReviewStage = { number: 1 | 2 | 3; automationId?: string; plan: AutomationPayload; scenario: SepoliaScenario };
export type ReviewSeason = { schemaVersion: 1 | 2; kind: "sepolia-three-run-review"; chainId: 11155111; fundReuse?: typeof REVIEW_REUSE_POLICY; mintOpeningDelaySeconds?: 1800; stages: ReviewStage[] };

/** Evaluate only after the previous stage's recovery and the funding checks.
 * Existing prepared openings, and older manifests without this policy, retain their schedule. */
export function reviewPreparationStartAt(review: Pick<ReviewSeason,"mintOpeningDelaySeconds">, status: AutomationPlan["status"], now = new Date()) {
  if (status !== "draft" || review.mintOpeningDelaySeconds === undefined) return undefined;
  ensure(review.mintOpeningDelaySeconds === 1800, "invalid_review_opening_delay");
  return new Date(Math.ceil(now.getTime()/1000 + review.mintOpeningDelaySeconds)*1000).toISOString().replace(".000Z","Z");
}

/** One season identity, with three independent execution artifacts for the refund boundary. */
export function reviewSeasonPlan(source: AutomationPayload, roles: { affiliate: string; buyer: string; cohort: AffiliateCohort }, caps: { maxTotalSpendWei: string; maxFeePerGasWei: string }): ReviewSeason {
  ensure(source.chainId === "11155111" && source.steps[0]?.payload.contract.algorithmVersion === "unique-rank-v6", "review_requires_sepolia_v10_source");
  const stages: ReviewStage[] = [];
  const seasonId = `0x${randomBytes(32).toString("hex")}`;
  for (const number of [1, 2, 3] as const) {
    const plan = structuredClone(source), step = structuredClone(source.steps[(number - 1) % source.steps.length]);
    const name = ["Ruby Signal", "Coral Pause", "Amber Relay"][number - 1];
    plan.name = "Prism Review"; plan.seasonId = seasonId;
    plan.startAt = null; step.id = randomUUID(); step.label = name; step.deadline = {mode:"duration",at:null};
    Object.assign(step.payload.contract, {name, symbol:`PRISM${number}`,seasonId:plan.seasonId,seasonName:plan.name,saleStartAt:"0",mintDurationSeconds:number === 2 ? "1800" : "86400",maxAffiliateSlots:"10",minAffiliateReferrals:"1"});
    delete step.payload.contract.sepoliaRehearsal;
    if (number === 2) {
      step.payload.contract.sepoliaRehearsal = "refund-3-30m";
      // Isolate the unsold terminal round; preserve the canonical factory for stage three.
      step.payload.operations.factoryMode = "new"; step.payload.operations.factoryAddress = "";
    }
    step.payload.operations.enrollmentWindowSeconds = "900";
    step.payload.operations.notes = `Three-run Sepolia review, step ${number}/3. ${number === 2 ? "Dedicated refund factory and hosted trust setup required before preparation." : "Manual affiliate/buyer/winner actions are reserved."} Settled proceeds may be reused only between runs under the review manifest policy.`;
    plan.steps = [step];
    const common = {chainId:11155111,collectionId:step.id,...caps};
    const scenario = parseSepoliaScenario(number === 2
      ? {kind:"refund-3-30m",...common,mintTarget:3,durationSeconds:1800,expectedOutcome:"unsold/refundable"}
      : {kind:"manual-affiliate-sellout",...common,affiliateWallet:roles.affiliate,buyerWallet:roles.buyer,manualMintsPerWallet:20,manualMintPlan:"one-referral-then-gifts",
        ...(number === 3 ? {affiliateCohort:roles.cohort} : {}),expectedOutcome:"manual-prize-and-commission-claimed"});
    stages.push({number,plan:parseAutomationDraft(plan,{editable:true}),scenario});
  }
  return {schemaVersion:2,kind:"sepolia-three-run-review",chainId:11155111,fundReuse:REVIEW_REUSE_POLICY,mintOpeningDelaySeconds:1800,stages};
}

export function parseReviewSeason(input: unknown): ReviewSeason {
  const value = input as ReviewSeason;
  ensure([1,2].includes(value?.schemaVersion) && value.kind === "sepolia-three-run-review" && value.chainId === 11155111 && value.stages?.length === 3, "invalid_three_run_review");
  ensure(value.fundReuse===undefined||value.fundReuse===REVIEW_REUSE_POLICY,"invalid_review_fund_reuse_policy");
  ensure(value.mintOpeningDelaySeconds===undefined||value.mintOpeningDelaySeconds===1800,"invalid_review_opening_delay");
  const ids = new Set<string>(), seasons = new Set<string>();
  for (const [index, stage] of value.stages.entries()) {
    ensure(stage.number === index + 1 && stage.plan.chainId === "11155111" && stage.plan.steps.length === 1, "review_stage_order_mismatch");
    const step = stage.plan.steps[0], scenario = parseSepoliaScenario(stage.scenario);
    if(value.mintOpeningDelaySeconds!==undefined)ensure(step.payload.operations.enrollmentWindowSeconds==="900","review_short_opening_requires_15_minute_enrollment");
    ensure(step.id === scenario.collectionId && step.payload.contract.algorithmVersion === "unique-rank-v6", "review_scenario_binding_mismatch");
    ensure(index === 1 ? scenario.kind === "refund-3-30m" && step.payload.contract.sepoliaRehearsal === "refund-3-30m" && step.payload.contract.mintDurationSeconds === "1800"
      : scenario.kind === "manual-affiliate-sellout" && step.payload.contract.mintDurationSeconds === "86400" && !step.payload.contract.sepoliaRehearsal, "review_outcome_mismatch");
    if (index === 2) ensure(scenario.kind === "manual-affiliate-sellout" && scenario.affiliateCohort, "review_requires_half_success_cohort");
    ids.add(step.id); seasons.add(stage.plan.seasonId!);
  }
  ensure(ids.size === 3 && seasons.size === (value.schemaVersion === 2 ? 1 : 3), "review_season_identity_mismatch");
  if(value.schemaVersion === 2)ensure(value.stages.every(s=>s.plan.name === value.stages[0].plan.name && s.plan.steps[0].payload.contract.seasonId === s.plan.seasonId && s.plan.steps[0].payload.contract.seasonName === s.plan.name), "review_season_identity_mismatch");
  return value;
}
