import { database } from "../../../../../../lib/database";
import { assertLaunchOrigin, boundedLaunchJson, requireLaunchSession } from "../../../../../../lib/launch-auth";
import { launchAutomationFailure, launchAutomationResponse } from "../../../../../../lib/launch-automation-api";
import { parseLaunchRequest } from "../../../../../../lib/launch-config-validation";
import { getSeasonRuntime, requestSeasonControl, requestSeasonStart } from "../../../../../../lib/season-runtime-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { await requireLaunchSession(request); return launchAutomationResponse(await getSeasonRuntime(database(), (await context.params).id)); }
  catch (error) { return launchAutomationFailure(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertLaunchOrigin(request); const actor = await requireLaunchSession(request);
    const input = parseLaunchRequest(await boundedLaunchJson(request), ["revision", "preparedHash", "profileRevision"]);
    return launchAutomationResponse({ run: await requestSeasonStart(database(), actor, (await context.params).id, input) }, 202);
  } catch (error) { return launchAutomationFailure(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertLaunchOrigin(request); const actor = await requireLaunchSession(request);
    const input = parseLaunchRequest(await boundedLaunchJson(request), ["revision", "action", "profileRevision"]);
    return launchAutomationResponse({ run: await requestSeasonControl(database(), actor, (await context.params).id, input) }, 202);
  } catch (error) { return launchAutomationFailure(error); }
}
