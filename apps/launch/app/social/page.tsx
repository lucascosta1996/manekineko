import { requireLaunchPage } from '../../lib/launch-page-auth';
import { OperatorShell } from '../../components/operator-shell';
import { SocialPreview } from '../../components/social-preview';
import mainnet from '../../catalog/mainnet.json';
import sepolia from '../../catalog/sepolia.json';
export default async function Page({ searchParams }: { searchParams: Promise<{ chainId?: string }> }) {
  const chainId = (await searchParams).chainId === '1' ? 1 : 11155111;
  await requireLaunchPage(`/social?chainId=${chainId}`);
  return <OperatorShell chainId={chainId} section="social"><SocialPreview key={chainId} catalog={chainId === 1 ? mainnet : sepolia} /></OperatorShell>;
}
