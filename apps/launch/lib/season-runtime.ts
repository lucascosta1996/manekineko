import { AutomationError, type AutomationArtifact } from "./launch-automation.ts";
import { launchContractVersion } from "./launch-config.ts";
import { socialPublicUrl } from "@manekineko/contract-abi/season-social";

export type RuntimeChainId = "1" | "11155111";
export type RuntimeStatus = "queued" | "running" | "paused" | "failed" | "completed";
export type RuntimeCredentials = { apiKey: string; apiKeySecret: string; accessToken: string; accessTokenSecret: string };
export type RuntimeProfile = { chainId: RuntimeChainId; revision: number; enabled: boolean; handle: string; expectedAccountId: string; publicBaseUrl: string; credentialsConfigured: boolean; updatedAt: string };
export type RuntimeRun = { id: string; automationId: string; automationRevision: number; preparedHash: string; chainId: RuntimeChainId; profileRevision: number; status: RuntimeStatus; desiredState: "running" | "paused"; revision: number; lastError: string | null; heartbeatAt: string | null; createdAt: string; updatedAt: string };
export type RuntimeEvent = { id: string; event: string; message: string; createdAt: string };
export type RuntimeAction = { id: string; actionKey: string; kind: string; status: string; txHash: string | null; postId: string | null; lastError: string | null; createdAt: string; updatedAt: string };
export type RuntimeSnapshot = { run: RuntimeRun | null; profile: RuntimeProfile | null; events: RuntimeEvent[]; actions: RuntimeAction[]; encryptionConfigured: boolean };

export function runtimeRevision(value: unknown, allowZero = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < (allowZero ? 0 : 1)) throw new AutomationError("invalid_revision", "Reload the season before continuing.");
  return value as number;
}
export function runtimeId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new AutomationError("invalid_id", "Season runtime not found.", 404);
  return value;
}
export function runtimeProfileInput(input: Record<string, unknown>) {
  const revision = runtimeRevision(input.revision, true);
  if (typeof input.enabled !== "boolean" || typeof input.handle !== "string" || !/^@?[A-Za-z0-9_]{1,15}$/.test(input.handle)) throw new AutomationError("invalid_profile", "Enter an X account handle and an explicit posting setting.");
  if (typeof input.expectedAccountId !== "string" || !/^[0-9]{1,30}$/.test(input.expectedAccountId)) throw new AutomationError("invalid_profile", "Enter the numeric X account ID. The worker verifies it before posting.");
  let base: URL;
  try { base = new URL(String(input.publicBaseUrl)); } catch { throw new AutomationError("invalid_profile", "Enter the public website origin for this network."); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/" || base.href.length > 500) throw new AutomationError("invalid_profile", "The public website must be an HTTPS origin, without credentials, path or query.");
  try { socialPublicUrl(base.origin); } catch { throw new AutomationError("invalid_profile", "Use a public HTTPS website. Private, test and placeholder domains cannot be used in published posts."); }
  let credentials: RuntimeCredentials | null = null;
  if (input.credentials !== undefined) {
    if (!input.credentials || typeof input.credentials !== "object" || Array.isArray(input.credentials)) throw new AutomationError("invalid_credentials", "Provide all four X OAuth credentials, or leave all of them blank to keep the saved credentials.");
    const values = input.credentials as Record<string, unknown>, keys = ["apiKey", "apiKeySecret", "accessToken", "accessTokenSecret"] as const;
    if (Object.keys(values).length !== 4 || keys.some(key => typeof values[key] !== "string" || !(values[key] as string).trim() || (values[key] as string).length > 2000 || /\s/.test(values[key] as string))) throw new AutomationError("invalid_credentials", "Provide all four X OAuth credentials without spaces.");
    credentials = Object.fromEntries(keys.map(key => [key, values[key]])) as RuntimeCredentials;
  }
  return { revision, enabled: input.enabled, handle: input.handle.replace(/^@/, ""), expectedAccountId: input.expectedAccountId, publicBaseUrl: base.origin, credentials };
}

export function assertRuntimeArtifact(artifact: AutomationArtifact, now = new Date(), checkStart = true): void {
  if (!["affiliate-v9", "affiliate-v10"].includes(artifact.contractVersion) || !artifact.seasonId || !artifact.timing || !artifact.steps.length || artifact.steps.some(step => launchContractVersion(step.payload) !== artifact.contractVersion || step.payload.contract.maxMintsPerWallet !== "20" || step.payload.contract.chainId !== artifact.chainId)) throw new AutomationError("runtime_version", "Season execution requires a prepared V9 or V10 season with consistent network and timing.", 422);
  if (checkStart && (!artifact.startAt || Date.parse(artifact.startAt) <= now.getTime())) throw new AutomationError("runtime_start", "The prepared first mint opening is already past. Prepare a fresh season with enough deployment and enrollment time.", 422);
  if (artifact.social?.enabled !== true) throw new AutomationError("runtime_social", "Enable X announcements in the season before preparing it for execution.", 422);
}
