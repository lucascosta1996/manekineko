import { parseMintActivity } from '@manekineko/ui/mint-activity';

export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_WEB_URL || 'https://app.tincta.xyz');
    if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Invalid public origin');
    const response = await fetch(new URL('/api/mint-activity', origin), { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Unavailable');
    return Response.json({ events: parseMintActivity(await response.json()) }, { headers });
  } catch { return Response.json({ error: 'Mint activity unavailable.' }, { status: 503, headers }); }
}
