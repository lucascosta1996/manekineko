import { requireLaunchPage } from '../../lib/launch-page-auth';
import { OperatorShell } from '../../components/operator-shell';
import { SocialPreview } from '../../components/social-preview';
import { socialPreviewCatalog } from '../../lib/social-preview-catalog';
export default async function Page({ searchParams }: { searchParams: Promise<{ chainId?: string }> }) {
  const chainId = (await searchParams).chainId === '1' ? 1 : 11155111;
  await requireLaunchPage(`/social?chainId=${chainId}`);
  const { catalog, fast } = socialPreviewCatalog(chainId);
  return <OperatorShell chainId={chainId} section="social"><SocialPreview key={chainId} catalog={catalog} fast={fast} /></OperatorShell>;
}
