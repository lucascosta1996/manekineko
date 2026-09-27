import { redirect } from "next/navigation";
import { getLaunchSession } from "../../lib/launch-auth";
import { LaunchConsole } from "../../components/launch/launch-console";
import { configuredLaunchChain } from "../../lib/chain-policy";

import { launchNetwork, launchDestination } from "../../lib/launch-navigation";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ chainId?: string }> }) {
  const chainId = launchNetwork((await searchParams).chainId, configuredLaunchChain() ?? "1");
  const session = await getLaunchSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(launchDestination("/launch", chainId))}`);
  return <LaunchConsole username={session.username} allowedChainId={configuredLaunchChain()} initialNetwork={chainId} />;
}
