import { redirect } from "next/navigation";
import { launchNetwork, launchDestination } from "../lib/launch-navigation";
import { configuredLaunchChain } from "../lib/chain-policy";
export default async function LaunchHome({searchParams}:{searchParams:Promise<{chainId?:string}>}) { redirect(launchDestination("/dashboard", launchNetwork((await searchParams).chainId, configuredLaunchChain() ?? "1"))); }
