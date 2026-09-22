import { requireCurrentCollection } from "../../../../lib/current-launch";
import { database } from "../../../../lib/database";
import { assertLaunchOrigin, boundedLaunchJson, requireLaunchSession } from "../../../../lib/launch-auth";
import { launchConfigurationFailure, launchConfigurationResponse } from "../../../../lib/launch-config-api";
import { createLaunchConfiguration, listLaunchConfigurations } from "../../../../lib/launch-config-store";
import { parseLaunchRequest } from "../../../../lib/launch-config-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try { await requireLaunchSession(request); return launchConfigurationResponse({ configurations: await listLaunchConfigurations(database()) }); }
  catch (error) { return launchConfigurationFailure(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertLaunchOrigin(request);
    const actor = await requireLaunchSession(request);
    const input = parseLaunchRequest(await boundedLaunchJson(request), ["label", "payload"]);
    requireCurrentCollection(input.payload);
    return launchConfigurationResponse({ configuration: await createLaunchConfiguration(database(), actor, { label: input.label, payload: input.payload }) }, 201);
  } catch (error) { return launchConfigurationFailure(error); }
}
