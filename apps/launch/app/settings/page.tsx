import { redirect } from "next/navigation";
import { getLaunchSession } from "../../lib/launch-auth";
import { configuredLaunchChain } from "../../lib/chain-policy";
import { launchNetwork, launchDestination } from "../../lib/launch-navigation";
import { NetworkSettings } from "../../components/dashboard/network-settings";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ chainId?: string }>;
}) {
  const chainId = launchNetwork(
    (await searchParams).chainId,
    configuredLaunchChain() ?? "1"
  );
  const session = await getLaunchSession();
  if (!session)
    redirect(
      `/login?next=${encodeURIComponent(
        launchDestination("/settings", chainId)
      )}`
    );
  return (
    <NetworkSettings
      username={session.username}
      initialChainId={chainId}
      allowedChainId={configuredLaunchChain()}
    />
  );
}
