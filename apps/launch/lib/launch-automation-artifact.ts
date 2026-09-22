import { createHash } from "node:crypto";
import type { AutomationArtifact } from "./launch-automation.ts";
import { canonicalLaunchJson } from "./launch-config-artifact.ts";

/** Integrity only: this digest neither signs a transaction nor authorizes a worker to broadcast. */
export function automationArtifactHash(artifact: AutomationArtifact): string {
  return createHash("sha256").update(canonicalLaunchJson(artifact), "utf8").digest("hex");
}
