import type { SeasonTiming, SeasonSocial } from "./season-timeline.ts";
import { LaunchConfigurationError, type LaunchPayload } from "./launch-config.ts";

export type AutomationStep = {
  id: string;
  label: string;
  payload: LaunchPayload;
  /** Fixed deadlines are authoritative; a worker derives duration from the pinned deployment block. */
  deadline: { mode: "duration" | "fixed"; at: string | null };
};

/** One named season with at most ten collections. Historical plans may have no season ID. */
export type AutomationPayload = {
  name: string;
  timing?: SeasonTiming;
  social?: SeasonSocial;
  seasonId?: string;
  chainId: "1" | "11155111";
  startAt: string | null;
  intervalSeconds: string;
  failurePolicy: "pause";
  steps: AutomationStep[];
};

export type AutomationArtifact = {
  schemaVersion: 1;
  kind: "launch-automation";
  contractVersion: "affiliate-v4" | "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
} & AutomationPayload;

export type AutomationPlan = {
  id: string;
  /** Display metadata from seasons.json, excluded from the immutable deployment payload. */
  seasonOrder?: number | null;
  plan: AutomationPayload;
  status: "draft" | "prepared";
  revision: number;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
  preparedAt: string | null;
  createdBy: string;
  updatedBy: string;
  preparedBy: string | null;
};

export type AutomationSummary = {
  id: string;
  /** Display classification only; historical payloads and hashes are unchanged. */
  currentModel?: boolean;
  seasonOrder?: number | null;
  name: string;
  chainId: AutomationPayload["chainId"];
  status: AutomationPlan["status"];
  revision: number;
  collectionCount: number;
  createdAt: string;
  updatedAt: string;
  preparedAt: string | null;
  contentHash: string | null;
};

export type AutomationValidation = { valid: boolean; issues: string[]; payload: AutomationPayload | null };

export class AutomationError extends LaunchConfigurationError {
  constructor(code: string, message: string, status = 400, issues?: string[]) {
    super(code, message, status, issues);
    this.name = "AutomationError";
  }
}

/** These observations must come from the future worker's confirmed chain index, not a browser request. */
export type AutomationPreviousObservation = {
  /** Required by V6 before a resolved factory can be reused. */
  contractVersion?: "affiliate-v4" | "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
  stepId: string;
  confirmed: boolean;
  soldOut: boolean;
  prizePaid: boolean;
  soldOutAt?: string | null;
  randomnessRevealed?: boolean;
  prizesReserved?: boolean;
  winnersAnnouncementConfirmed?: boolean;
  nextLaunchAnnouncementConfirmed?: boolean;
  outcome: "pending" | "completed" | "unsold" | "failed";
  completedAt: string | null;
  factoryAddress: string;
  chainId: string;
  deployerAddress: string;
  factoryOwnerAddress: string;
};

export type AutomationRuntimeContext = {
  stepId: string;
  /** Unsigned seconds from the block pinned for deployment preflight. */
  blockTimestamp: string;
  previous?: AutomationPreviousObservation;
};

export type AutomationStepDecision =
  | { status: "wait"; reason: string; earliestAt: string | null }
  | { status: "pause"; reason: string }
  | { status: "ready_for_preflight"; stepId: string; payload: LaunchPayload; mintDeadline: string; earliestAt: string | null };
