import { redirect } from "next/navigation";
import { getLaunchSession } from "../../lib/launch-auth";
import { AutomationConsole } from "../../components/automations/automation-console";
import { configuredLaunchChain } from "../../lib/chain-policy";

export const dynamic = "force-dynamic";

export default async function SeasonsPage() {
  const session = await getLaunchSession();
  if (!session) redirect("/login?next=/seasons");
  return <AutomationConsole username={session.username} allowedChainId={configuredLaunchChain()} />;
}
