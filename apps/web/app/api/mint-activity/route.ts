import { getMintActivity } from '../../../lib/nft-mirror/repository';
import { parseMintActivity } from '@manekineko/ui/mint-activity';

export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try { return Response.json({ events: parseMintActivity(await getMintActivity()) }, { headers }); }
  catch { return Response.json({ error: 'Mint activity unavailable.' }, { status: 503, headers }); }
}
