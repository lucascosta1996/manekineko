import { launchContractVersion } from "./launch-config.ts";
import type { LaunchArtifact } from "./launch-config.ts";
import { canonicalLaunchJson, launchArtifactHash } from "./launch-config-artifact.ts";
import { requireValidLaunchPayload } from "./launch-config-validation.ts";

/** The expected digest must come from the trusted finalized record, not the file being checked. */
export function verifyLaunchExport(input: unknown, expectedHash: string): LaunchArtifact {
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) throw new Error("Provide the complete expected hash from the finalized configuration.");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A finalized launch export is required.");
  const raw = input as Record<string, unknown>;
  const keys = ["schemaVersion", "contractVersion", "contract", "operations", "contentHash"];
  if (Object.keys(raw).length !== keys.length || Object.keys(raw).some(key => !keys.includes(key)) || raw.schemaVersion !== 1 || !["affiliate-v4", "affiliate-v5", "affiliate-v6", "affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(String(raw.contractVersion))) {
    throw new Error("Unsupported launch export schema or fields.");
  }
  const payload = requireValidLaunchPayload({ contract: raw.contract, operations: raw.operations });
  const artifact: LaunchArtifact = { schemaVersion: 1, contractVersion: launchContractVersion(payload), ...payload };
  if (raw.contractVersion !== artifact.contractVersion) throw new Error("Contract version does not match the financial model.");
  // Finalized exports already contain normalized addresses and the reviewed VRF values.
  if (canonicalLaunchJson({ contract: raw.contract, operations: raw.operations }) !== canonicalLaunchJson(payload)) {
    throw new Error("The file is not a normalized finalized configuration.");
  }
  if (raw.contentHash !== expectedHash || launchArtifactHash(artifact) !== expectedHash) {
    throw new Error("The export differs from the expected finalized configuration. Preparation stopped.");
  }
  return artifact;
}
