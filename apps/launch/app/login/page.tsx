import { OperatorShell } from '../../components/operator-shell';
import { LaunchLogin } from '../../components/launch/launch-login';
import { safeLaunchDestination } from '../../lib/launch-navigation';
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const destination = safeLaunchDestination((await searchParams).next);
  return <OperatorShell authenticated={false}><LaunchLogin destination={destination} /></OperatorShell>;
}
