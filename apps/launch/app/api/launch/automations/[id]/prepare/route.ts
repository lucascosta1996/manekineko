import { requireCurrentSeason } from "../../../../../../lib/current-launch";
import { database } from "../../../../../../lib/database";
import { assertLaunchOrigin, boundedLaunchJson, requireLaunchSession } from "../../../../../../lib/launch-auth";
import { launchAutomationFailure, launchAutomationResponse } from "../../../../../../lib/launch-automation-api";
import { prepareLaunchAutomation, getLaunchAutomation } from "../../../../../../lib/launch-automation-store";
import { parseLaunchRequest } from "../../../../../../lib/launch-config-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertLaunchOrigin(request);
    const actor = await requireLaunchSession(request);
    const input = parseLaunchRequest(await boundedLaunchJson(request), ["revision"]);
    const id = (await context.params).id;
    const saved = await getLaunchAutomation(database(), id);
    requireCurrentSeason(saved.plan);
    return launchAutomationResponse({ automation: await prepareLaunchAutomation(database(), actor, id, input.revision) });
  } catch (error) { return launchAutomationFailure(error); }
}
