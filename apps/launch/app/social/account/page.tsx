import { requireLaunchPage } from '../../../lib/launch-page-auth';
import { OperatorShell } from '../../../components/operator-shell';
import { SocialAccount } from '../../../components/social-account';
export default async function Page({ searchParams }: { searchParams: Promise<{ chainId?: string }> }) {
  const chainId = (await searchParams).chainId === '1' ? 1 : 11155111;
  await requireLaunchPage(`/social/account?chainId=${chainId}`);
  return <OperatorShell chainId={chainId} section="social/account"><SocialAccount key={chainId} chainId={chainId} /></OperatorShell>;
}
