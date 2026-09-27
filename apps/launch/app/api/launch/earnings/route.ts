import { requireLaunchSession } from "../../../../lib/launch-auth";
import { launchConfigurationFailure, launchConfigurationResponse } from "../../../../lib/launch-config-api";
import { requireSeasonPlanningChain } from "../../../../lib/chain-policy";
import { loadCreatorEarnings } from "../../../../lib/creator-earnings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  try {
    await requireLaunchSession(request);
    const chainId = new URL(request.url).searchParams.get("chainId") ?? "1";
    requireSeasonPlanningChain(chainId);
    return launchConfigurationResponse(await loadCreatorEarnings(chainId));
  } catch (error) { return launchConfigurationFailure(error); }
}
