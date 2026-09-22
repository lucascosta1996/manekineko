import { redirect } from "next/navigation";
import { getLaunchSession } from "../../lib/launch-auth";
import { LaunchLogin } from "../../components/launch/launch-login";
import { safeLaunchDestination } from "../../lib/launch-navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const destination = safeLaunchDestination((await searchParams).next);
  const session = await getLaunchSession();
  if (session) redirect(destination);
  return <LaunchLogin destination={destination} />;
}
