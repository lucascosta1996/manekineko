import "server-only";
// Keep authentication failures and JSON response headers identical across the
// private launch API. AutomationError extends LaunchConfigurationError.
export { launchConfigurationFailure as launchAutomationFailure, launchConfigurationResponse as launchAutomationResponse } from "./launch-config-api.ts";

export const AUTOMATION_REQUEST_BYTES = 2_097_152;
