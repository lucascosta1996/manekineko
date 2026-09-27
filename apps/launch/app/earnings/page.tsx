import { redirect } from "next/navigation";
import { getLaunchSession } from "../../lib/launch-auth";
import { configuredLaunchChain } from "../../lib/chain-policy";
import { CreatorEarnings } from "../../components/earnings/creator-earnings";

export const dynamic = "force-dynamic";
export default async function EarningsPage() {
  const session = await getLaunchSession();
  if (!session) redirect("/login?next=/earnings");
  return <CreatorEarnings username={session.username} initialChainId={configuredLaunchChain() ?? "1"} />;
}
