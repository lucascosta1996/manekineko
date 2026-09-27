import { redirect } from "next/navigation";
import { getLaunchSession } from "../../lib/launch-auth";
import { configuredLaunchChain } from "../../lib/chain-policy";
import { CollectionOperations } from "../../components/operations/collection-operations";
import { launchNetwork, launchDestination } from "../../lib/launch-navigation";

export const dynamic="force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ chainId?: string }> }) {
  const chainId = launchNetwork((await searchParams).chainId, configuredLaunchChain() ?? "1");
  const session = await getLaunchSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(launchDestination("/active-collection", chainId))}`);
  return <CollectionOperations username={session.username} view="active" initialChainId={chainId} />;
}
