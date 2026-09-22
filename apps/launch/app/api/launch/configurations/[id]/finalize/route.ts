import { requireCurrentCollection } from "../../../../../../lib/current-launch";
import { database } from "../../../../../../lib/database";
import { assertLaunchOrigin, boundedLaunchJson, requireLaunchSession } from "../../../../../../lib/launch-auth";
import { launchConfigurationFailure, launchConfigurationResponse } from "../../../../../../lib/launch-config-api";
import { finalizeLaunchConfiguration, getLaunchConfiguration } from "../../../../../../lib/launch-config-store";
import { parseLaunchRequest } from "../../../../../../lib/launch-config-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertLaunchOrigin(request);
    const actor = await requireLaunchSession(request);
    const input = parseLaunchRequest(await boundedLaunchJson(request), ["revision"]);
    const id = (await context.params).id;
    const saved = await getLaunchConfiguration(database(), id);
    requireCurrentCollection(saved.payload);
    return launchConfigurationResponse({ configuration: await finalizeLaunchConfiguration(database(), actor, id, input.revision) });
  } catch (error) { return launchConfigurationFailure(error); }
}
