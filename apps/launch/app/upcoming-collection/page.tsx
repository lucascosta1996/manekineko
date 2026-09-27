import { redirect } from "next/navigation";
import { getLaunchSession } from "../../lib/launch-auth";
import { configuredLaunchChain } from "../../lib/chain-policy";
import { CollectionOperations } from "../../components/operations/collection-operations";
export const dynamic="force-dynamic";
export default async function Page(){const session=await getLaunchSession();if(!session)redirect("/login?next=/upcoming-collection");return <CollectionOperations username={session.username} view="upcoming" initialChainId={configuredLaunchChain()??"1"}/>;}
