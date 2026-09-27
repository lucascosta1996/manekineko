import { redirect } from "next/navigation";
import { getLaunchSession } from "../../lib/launch-auth";
import { AutomationConsole } from "../../components/automations/automation-console";
import { configuredLaunchChain } from "../../lib/chain-policy";

import { launchNetwork, launchDestination } from "../../lib/launch-navigation";

export const dynamic = "force-dynamic";

export default async function SeasonsPage({ searchParams }: { searchParams: Promise<{ chainId?: string; automationId?: string }> }) {
  const query = await searchParams;
  const initialNetwork = launchNetwork(query.chainId, configuredLaunchChain() ?? "1");
  const initialAutomationId = /^[0-9a-f-]{36}$/i.test(query.automationId ?? "") ? query.automationId : undefined;
  const session = await getLaunchSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(launchDestination("/seasons", initialNetwork, initialAutomationId))}`);
  return <AutomationConsole username={session.username} allowedChainId={configuredLaunchChain()} initialNetwork={initialNetwork} initialAutomationId={initialAutomationId} />;
}
