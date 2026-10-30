import { requireLaunchPage } from '../../lib/launch-page-auth';
import { protocolConfig } from '@manekineko/protocol/config';
import { OperatorShell } from '../../components/operator-shell';
import { MainnetDeployment } from '../../components/deployment/mainnet-deployment';
export default async function Page() {
  await requireLaunchPage('/deploy?chainId=1');
  return <OperatorShell chainId={1} section="deploy"><MainnetDeployment configuredAddress={protocolConfig(1)?.controller} /></OperatorShell>;
}
