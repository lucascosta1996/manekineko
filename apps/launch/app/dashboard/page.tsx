import { requireLaunchPage } from '../../lib/launch-page-auth';
import { ProtocolExperience } from '@manekineko/protocol/experience';
import { protocolConfig } from '@manekineko/protocol/config';
import { OperatorShell } from '../../components/operator-shell';
import mainnet from '../../catalog/mainnet.json';
import sepolia from '../../catalog/sepolia.json';
export default async function Page({ searchParams }: { searchParams: Promise<{ chainId?: string }> }) {
  const chainId = (await searchParams).chainId === '1' ? 1 : 11155111;
  await requireLaunchPage(`/dashboard?chainId=${chainId}`);
  return <OperatorShell chainId={chainId}><ProtocolExperience key={chainId} config={protocolConfig(chainId)} view="operations" catalog={chainId === 1 ? mainnet : sepolia} /></OperatorShell>;
}
