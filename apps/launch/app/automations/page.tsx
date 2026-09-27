import { redirect } from "next/navigation";
import { configuredLaunchChain } from "../../lib/chain-policy";
import { launchDestination, launchNetwork } from "../../lib/launch-navigation";

/** Preserve network and supported season context for saved legacy links. */
export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ chainId?: string; automationId?: string }>;
}) {
  const query = await searchParams;
  redirect(
    launchDestination(
      "/seasons",
      launchNetwork(query.chainId, configuredLaunchChain() ?? "1"),
      query.automationId
    )
  );
}
