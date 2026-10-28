import { renderSeasonSocialSvg } from '@manekineko/contract-abi/season-social-image';
import { previewMessage } from '../../../scripts/protocol-v16/social-preview';
import type { Stage } from '../../../scripts/protocol-v16/social-content';
import mainnet from '../catalog/mainnet.json';
import sepolia from '../catalog/sepolia.json';
export async function socialPreviewResponse(request: Request) {
  const params = new URL(request.url).searchParams;
  const network = params.get('chainId') ?? '11155111';
  const id = Number(params.get('collection') ?? '0');
  const stage = params.get('stage') ?? 'genesis-open';
  if (!['1', '11155111'].includes(network) || !Number.isSafeInteger(id) || id < 0 || id > 216) return new Response('Invalid preview selection.', { status: 400 });
  let svg: string;
  try { svg = renderSeasonSocialSvg(previewMessage(network === '1' ? mainnet : sepolia, id, stage as Stage), { preview: true }); }
  catch { return new Response('Invalid preview selection.', { status: 400 }); }
  if (params.get('format') === 'png') {
    const { default: sharp } = await import('sharp');
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="tincta-${network}-${id}-${stage}.png"`, 'Cache-Control': 'no-store' } });
  }
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox", 'Cache-Control': 'no-store' } });
}
