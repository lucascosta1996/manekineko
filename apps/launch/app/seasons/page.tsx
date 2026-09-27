import { redirect } from "next/navigation";
import { getLaunchSession } from "../../lib/launch-auth";
import { AutomationConsole } from "../../components/automations/automation-console";
import { configuredLaunchChain } from "../../lib/chain-policy";

export const dynamic = "force-dynamic";

export default async function SeasonsPage({ searchParams }: { searchParams: Promise<{ chainId?: string; automationId?: string }> }) {
  const query = await searchParams;
  const initialNetwork = query.chainId === "11155111" ? "11155111" : "1";
  const initialAutomationId = /^[0-9a-f-]{36}$/i.test(query.automationId ?? "") ? query.automationId : undefined;
  const session = await getLaunchSession();
  if (!session) redirect("/login?next=/seasons");
  return <AutomationConsole username={session.username} allowedChainId={configuredLaunchChain()} initialNetwork={initialNetwork} initialAutomationId={initialAutomationId} />;
}
