import { redirect } from "next/navigation";
import { getLaunchSession } from "../../lib/launch-auth";
import { LaunchConsole } from "../../components/launch/launch-console";
import { configuredLaunchChain } from "../../lib/chain-policy";

export const dynamic = "force-dynamic";

export default async function LaunchPage() {
  const session = await getLaunchSession();
  if (!session) redirect("/login?next=/launch");
  return <LaunchConsole username={session.username} allowedChainId={configuredLaunchChain()} />;
}
