import { database } from "../../../../../../lib/database";
import { assertLaunchOrigin, boundedLaunchJson, requireLaunchSession } from "../../../../../../lib/launch-auth";
import { launchAutomationFailure, launchAutomationResponse } from "../../../../../../lib/launch-automation-api";
import { validateLaunchAutomation } from "../../../../../../lib/launch-automation-store";
import { parseLaunchRequest } from "../../../../../../lib/launch-config-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertLaunchOrigin(request);
    await requireLaunchSession(request);
    const input = parseLaunchRequest(await boundedLaunchJson(request), ["revision"]);
    return launchAutomationResponse({ validation: await validateLaunchAutomation(database(), (await context.params).id, input.revision) });
  } catch (error) { return launchAutomationFailure(error); }
}
