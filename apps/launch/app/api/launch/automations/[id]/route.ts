import { requireCurrentSeason } from "../../../../../lib/current-launch";
import { database } from "../../../../../lib/database";
import { assertLaunchOrigin, boundedLaunchJson, requireLaunchSession } from "../../../../../lib/launch-auth";
import { AUTOMATION_REQUEST_BYTES, launchAutomationFailure, launchAutomationResponse } from "../../../../../lib/launch-automation-api";
import { getLaunchAutomation, updateLaunchAutomation } from "../../../../../lib/launch-automation-store";
import { parseLaunchRequest } from "../../../../../lib/launch-config-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try { await requireLaunchSession(request); return launchAutomationResponse({ automation: await getLaunchAutomation(database(), (await context.params).id) }); }
  catch (error) { return launchAutomationFailure(error); }
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  try {
    assertLaunchOrigin(request);
    const actor = await requireLaunchSession(request);
    const input = parseLaunchRequest(await boundedLaunchJson(request, AUTOMATION_REQUEST_BYTES), ["plan", "revision"]);
    const saved = await getLaunchAutomation(database(), (await context.params).id);
    requireCurrentSeason(saved.plan);
    const next = requireCurrentSeason(input.plan);
    if (next.chainId !== saved.plan.chainId) return launchAutomationResponse({ error: "network_mismatch", message: "A saved season keeps its network. Create a separate season on the other network." }, 409);
    return launchAutomationResponse({ automation: await updateLaunchAutomation(database(), actor, (await context.params).id, { plan: input.plan, revision: input.revision }) });
  } catch (error) { return launchAutomationFailure(error); }
}
