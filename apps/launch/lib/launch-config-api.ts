import "server-only";
import { LaunchConfigurationError } from "./launch-config.ts";
import { launchAuthResponse } from "./launch-auth.ts";

export function launchConfigurationResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export function launchConfigurationFailure(error: unknown): Response {
  if (error instanceof LaunchConfigurationError) return launchConfigurationResponse({ error: error.code, message: error.message, ...(error.issues ? { issues: error.issues } : {}) }, error.status);
  return launchAuthResponse(error);
}
