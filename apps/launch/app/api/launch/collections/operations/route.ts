import { requireLaunchSession } from "../../../../../lib/launch-auth";
import { requireSeasonPlanningChain } from "../../../../../lib/chain-policy";
import { loadCollectionOperations } from "../../../../../lib/collection-operations-store";
import { launchConfigurationFailure,launchConfigurationResponse } from "../../../../../lib/launch-config-api";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:Request){try{await requireLaunchSession(request);const chainId=new URL(request.url).searchParams.get("chainId")??"1";requireSeasonPlanningChain(chainId);return launchConfigurationResponse(await loadCollectionOperations(chainId));}catch(e){return launchConfigurationFailure(e);}}
