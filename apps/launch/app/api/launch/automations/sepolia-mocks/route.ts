import { database } from "../../../../../lib/database";
import { assertLaunchOrigin, boundedLaunchJson, requireLaunchSession } from "../../../../../lib/launch-auth";
import { launchAutomationFailure, launchAutomationResponse } from "../../../../../lib/launch-automation-api";
import { parseLaunchRequest } from "../../../../../lib/launch-config-validation";
import { createSepoliaMockSeasons } from "../../../../../lib/sepolia-mock-seasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  try {
    assertLaunchOrigin(request);
    const actor = await requireLaunchSession(request);
    parseLaunchRequest(await boundedLaunchJson(request, 1024), []);
    return launchAutomationResponse(await createSepoliaMockSeasons(database(), actor));
  } catch (error) { return launchAutomationFailure(error); }
}
