import source from '@manekineko/contract-abi/tincta-rewards-source' with { type: 'json' };
import { requireLaunchPage } from '../../../../lib/launch-page-auth';
export async function GET() {
  await requireLaunchPage('/deploy?chainId=1');
  return Response.json(source, { headers: { 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="tincta-rewards-source.json"' } });
}
