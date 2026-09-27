import { redirect } from "next/navigation";
import { getLaunchSession } from "../../lib/launch-auth";
import { configuredLaunchChain } from "../../lib/chain-policy";
import { launchNetwork, launchDestination } from "../../lib/launch-navigation";
import { LaunchDashboard } from "../../components/dashboard/launch-dashboard";
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
        launchDestination("/activity", chainId)
      )}`
    );
  return (
    <LaunchDashboard
      username={session.username}
      initialChainId={chainId}
      activity
    />
  );
}
