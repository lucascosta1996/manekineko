import { requireCurrentSeason } from "../../../../lib/current-launch";
import { database } from "../../../../lib/database";
import { assertLaunchOrigin, boundedLaunchJson, requireLaunchSession } from "../../../../lib/launch-auth";
import { AUTOMATION_REQUEST_BYTES, launchAutomationFailure, launchAutomationResponse } from "../../../../lib/launch-automation-api";
import { createLaunchAutomation, listLaunchAutomations } from "../../../../lib/launch-automation-store";
import { parseLaunchRequest } from "../../../../lib/launch-config-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try { await requireLaunchSession(request); return launchAutomationResponse(await listLaunchAutomations(database(), new URL(request.url).searchParams.get("cursor"), new URL(request.url).searchParams.get("chainId") ?? undefined)); }
  catch (error) { return launchAutomationFailure(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertLaunchOrigin(request);
    const actor = await requireLaunchSession(request);
    const input = parseLaunchRequest(await boundedLaunchJson(request, AUTOMATION_REQUEST_BYTES), ["plan"]);
    requireCurrentSeason(input.plan);
    return launchAutomationResponse({ automation: await createLaunchAutomation(database(), actor, { plan: input.plan }) }, 201);
  } catch (error) { return launchAutomationFailure(error); }
}
