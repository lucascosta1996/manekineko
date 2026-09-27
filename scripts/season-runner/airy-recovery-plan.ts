import { createHash } from "node:crypto";
import { getAddress } from "ethers";
import { canonicalLaunchJson } from "../../apps/launch/lib/launch-config-artifact.ts";
import { parseV10Config } from "../../packages/contracts/src/v10-config.ts";
import type { AutomationArtifact } from "../../apps/launch/lib/launch-automation.ts";
import type { SeasonState } from "./runner.ts";
import type { ChainSnapshot } from "./chain.ts";
import { ensure } from "./store.ts";

export const AIRY_RECOVERY = {
  chainId: 11155111, runId: "257c7ab9-9e56-4daf-b5db-917a05d15d1c", automationId: "79b44791-5787-4a26-90db-86a06a286a3b",
  firstId: "369e50fc-47f3-496f-938d-53e5ea0f9d02", nextId: "2a7d8825-da7d-42e6-92b4-f15a34d78e27",
  round: "0xaeCf42388f3Df8A92279d68065920745B73Ad728",
} as const;
export const recoveryDigest = (value: unknown) => createHash("sha256").update(canonicalLaunchJson(value)).digest("hex");
const iso = (seconds: number) => new Date(seconds * 1000).toISOString().replace(".000Z", "Z");
export type AiryRecoveryPlan = {
  version: 1; kind: "airy-garden-continuation"; chainId: 11155111; runId: string; automationId: string;
  preparedHash: string; stateHash: string; actionsHash: string; profileRevision: number; runRevision: number;
  createdAt: string; expiresAt: string; evidence: { block: number; hash: string; soldOutAt: string; factory: string; round: string };
  collectionId: string; original: { announcementAt: string; enrollmentAt: string; saleStartAt: string; durationSeconds: string };
  replacement: { announcementAt: string; enrollmentAt: string; saleStartAt: string; durationSeconds: "86400" };
};
export type AppliedAiryRecovery = { plan: AiryRecoveryPlan; hash: string; appliedAt: string };

export function assertAiryArtifact(runId: string, artifact: AutomationArtifact, state: SeasonState) {
  ensure(runId === AIRY_RECOVERY.runId && artifact.chainId === "11155111" && artifact.contractVersion === "affiliate-v10", "recovery_requires_exact_airy_sepolia_run");
  ensure(artifact.steps.length === 2 && artifact.steps[0].id === AIRY_RECOVERY.firstId && artifact.steps[1].id === AIRY_RECOVERY.nextId, "recovery_artifact_identity_mismatch");
  const first = state.collections?.[AIRY_RECOVERY.firstId];
  ensure(first?.deployment && getAddress(first.deployment.round) === getAddress(AIRY_RECOVERY.round) && state.factory?.factory === first.deployment.factory, "recovery_predecessor_identity_mismatch");
  ensure(state.binding && state.journal && state.announcedAt && state.firstThreadComplete && !state.completed, "recovery_requires_existing_announced_run");
}
export function assertRecoveryPredecessor(snapshot: ChainSnapshot) {
  ensure(snapshot.chainId === 11155111 && getAddress(snapshot.round) === getAddress(AIRY_RECOVERY.round) && snapshot.soldOut && snapshot.revealed && snapshot.readyForNextRound && !snapshot.refundsAvailable && snapshot.totalMinted === snapshot.maxSupply && snapshot.maxSupply === "1000", "recovery_predecessor_not_ready");
}
export function createAiryRecoveryPlan(input: {
  artifact: AutomationArtifact; state: SeasonState; preparedHash: string; actionsHash: string;
  profileRevision: number; runRevision: number; snapshot: ChainSnapshot; now: number; startAt: string;
}): AiryRecoveryPlan {
  assertAiryArtifact(AIRY_RECOVERY.runId, input.artifact, input.state); assertRecoveryPredecessor(input.snapshot);
  ensure(!input.state.airyRecovery && !input.state.collections?.[AIRY_RECOVERY.nextId]?.deployment && !input.state.journal?.collections[AIRY_RECOVERY.nextId], "recovery_next_collection_already_started");
  const start = Date.parse(input.startAt) / 1000, enrollment = Number(input.artifact.steps[1].payload.operations.enrollmentWindowSeconds);
  ensure(Number.isSafeInteger(start) && iso(start) === input.startAt && start >= input.now + enrollment + 3600 && start <= input.now + 7 * 86400, "recovery_opening_requires_full_enrollment_plus_one_hour_within_seven_days");
  const soldOut = Number(input.snapshot.soldOutAt), originalStart = soldOut + Number(input.artifact.timing!.nextLaunchDelaySeconds);
  ensure(originalStart < input.now, "recovery_only_for_missed_opening");
  const plan: AiryRecoveryPlan = {
    version: 1, kind: "airy-garden-continuation", chainId: 11155111, runId: AIRY_RECOVERY.runId, automationId: AIRY_RECOVERY.automationId,
    preparedHash: input.preparedHash, stateHash: recoveryDigest(input.state), actionsHash: input.actionsHash, profileRevision: input.profileRevision, runRevision: input.runRevision,
    createdAt: iso(input.now), expiresAt: iso(input.now + 900), evidence: { block: input.snapshot.blockNumber, hash: input.snapshot.blockHash, soldOutAt: input.snapshot.soldOutAt, factory: input.state.factory!.factory, round: AIRY_RECOVERY.round },
    collectionId: AIRY_RECOVERY.nextId, original: { announcementAt: iso(soldOut + Number(input.artifact.timing!.nextAnnouncementDelaySeconds)), enrollmentAt: iso(originalStart - enrollment), saleStartAt: iso(originalStart), durationSeconds: input.artifact.steps[1].payload.contract.mintDurationSeconds },
    replacement: { announcementAt: iso(input.now), enrollmentAt: iso(start - enrollment), saleStartAt: iso(start), durationSeconds: "86400" },
  };
  recoveryPayload(input.artifact, plan);
  return plan;
}
/** Only the undeployed opening and duration are overridden. All identity, financial, registry and factory terms are derived from the original artifact. */
export function recoveryPayload(artifact: AutomationArtifact, plan: AiryRecoveryPlan) {
  ensure(plan.version === 1 && plan.kind === "airy-garden-continuation" && plan.chainId === 11155111 && plan.runId === AIRY_RECOVERY.runId && plan.automationId === AIRY_RECOVERY.automationId && plan.collectionId === AIRY_RECOVERY.nextId && plan.evidence.round === AIRY_RECOVERY.round, "invalid_recovery_plan_identity");
  ensure(plan.replacement.durationSeconds === "86400" && Number.isFinite(Date.parse(plan.replacement.saleStartAt)) && Date.parse(plan.replacement.enrollmentAt) === Date.parse(plan.replacement.saleStartAt) - Number(artifact.steps[1].payload.operations.enrollmentWindowSeconds) * 1000 && Date.parse(plan.replacement.announcementAt) < Date.parse(plan.replacement.enrollmentAt), "invalid_recovery_schedule");
  const payload = structuredClone(artifact.steps[1].payload);
  payload.contract.saleStartAt = String(Date.parse(plan.replacement.saleStartAt) / 1000);
  payload.contract.mintDurationSeconds = plan.replacement.durationSeconds;
  payload.operations.factoryMode = "existing"; payload.operations.factoryAddress = getAddress(plan.evidence.factory);
  parseV10Config(payload.contract, 11155111n, BigInt(Math.floor(Date.parse(plan.createdAt) / 1000)));
  return payload;
}
export function assertAppliedRecovery(artifact: AutomationArtifact, state: SeasonState, preparedHash: string) {
  const recovery = state.airyRecovery; if (!recovery) return;
  assertAiryArtifact(AIRY_RECOVERY.runId, artifact, { ...state, completed: false });
  ensure(recovery.hash === recoveryDigest(recovery.plan) && recovery.plan.preparedHash === preparedHash && recovery.plan.evidence.factory === state.factory?.factory, "saved_recovery_plan_changed");
  const first = state.collections![AIRY_RECOVERY.firstId], next = state.collections![AIRY_RECOVERY.nextId];
  ensure(first.snapshot?.soldOutAt === recovery.plan.evidence.soldOutAt, "recovery_predecessor_sellout_changed");
  ensure(next && recoveryDigest(next.payload) === recoveryDigest(recoveryPayload(artifact, recovery.plan)) && next.enrollmentAt === recovery.plan.replacement.enrollmentAt && next.announcementAt === recovery.plan.replacement.announcementAt, "recovery_runtime_terms_changed");
}
