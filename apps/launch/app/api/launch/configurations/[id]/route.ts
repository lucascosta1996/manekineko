import { requireCurrentCollection } from "../../../../../lib/current-launch";
import { database } from "../../../../../lib/database";
import { assertLaunchOrigin, boundedLaunchJson, requireLaunchSession } from "../../../../../lib/launch-auth";
import { launchConfigurationFailure, launchConfigurationResponse } from "../../../../../lib/launch-config-api";
import { getLaunchConfiguration, updateLaunchConfiguration } from "../../../../../lib/launch-config-store";
import { parseLaunchRequest } from "../../../../../lib/launch-config-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try { await requireLaunchSession(request); return launchConfigurationResponse({ configuration: await getLaunchConfiguration(database(), (await context.params).id) }); }
  catch (error) { return launchConfigurationFailure(error); }
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  try {
    assertLaunchOrigin(request);
    const actor = await requireLaunchSession(request);
    const input = parseLaunchRequest(await boundedLaunchJson(request), ["label", "payload", "revision"]);
    const saved = await getLaunchConfiguration(database(), (await context.params).id);
    requireCurrentCollection(saved.payload);
    requireCurrentCollection(input.payload);
    return launchConfigurationResponse({ configuration: await updateLaunchConfiguration(database(), actor, (await context.params).id, { label: input.label, payload: input.payload, revision: input.revision }) });
  } catch (error) { return launchConfigurationFailure(error); }
}
