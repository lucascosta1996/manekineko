import { database } from "../../../../../../lib/database";
import { assertLaunchOrigin, boundedLaunchJson, requireLaunchSession } from "../../../../../../lib/launch-auth";
import { launchAutomationFailure, launchAutomationResponse } from "../../../../../../lib/launch-automation-api";
import { parseLaunchRequest } from "../../../../../../lib/launch-config-validation";
import { requireSeasonPlanningChain } from "../../../../../../lib/chain-policy";
import { runtimeEncryptionConfigured } from "../../../../../../lib/season-runtime-crypto";
import { getRuntimeProfile, saveRuntimeProfile } from "../../../../../../lib/season-runtime-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ chainId: string }> }): Promise<Response> {
  try {
    await requireLaunchSession(request); const { chainId } = await context.params; requireSeasonPlanningChain(chainId);
    return launchAutomationResponse({ profile: await getRuntimeProfile(database(), chainId), encryptionConfigured: runtimeEncryptionConfigured() });
  } catch (error) { return launchAutomationFailure(error); }
}
export async function PUT(request: Request, context: { params: Promise<{ chainId: string }> }): Promise<Response> {
  try {
    assertLaunchOrigin(request); const actor = await requireLaunchSession(request);
    const { chainId } = await context.params; requireSeasonPlanningChain(chainId);
    const input = parseLaunchRequest(await boundedLaunchJson(request, 16000), ["revision", "enabled", "handle", "expectedAccountId", "publicBaseUrl", "credentials"]);
    return launchAutomationResponse({ profile: await saveRuntimeProfile(database(), actor, chainId, input) });
  } catch (error) { return launchAutomationFailure(error); }
}
