import { createHash } from "node:crypto";
import type { LaunchArtifact } from "./launch-config.ts";

/** Object keys are sorted; array ordering and exact decimal strings remain significant. */
export function canonicalLaunchJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalLaunchJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalLaunchJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  throw new Error("Launch artifacts must contain JSON values only.");
}

/** An integrity digest, not a digital signature or permission to deploy. */
export function launchArtifactHash(artifact: LaunchArtifact): string {
  return createHash("sha256").update(canonicalLaunchJson(artifact), "utf8").digest("hex");
}
