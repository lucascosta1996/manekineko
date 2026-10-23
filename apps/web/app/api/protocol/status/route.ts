import { JsonRpcProvider } from 'ethers';
import { protocolConfig } from '@manekineko/protocol/config';
import { readProtocol } from '@manekineko/protocol/chain';
import { readCatalog, phaseLabel } from '@manekineko/protocol/progress';
export const dynamic = 'force-dynamic';
let cached: { url: string; provider: JsonRpcProvider } | undefined;
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const config = protocolConfig();
    if (!config) return Response.json({ collection: null }, { headers });
    if (cached?.url !== config.rpcUrl) { cached?.provider.destroy(); cached = { url: config.rpcUrl, provider: new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: 0 }) }; }
    const state = await readProtocol(cached.provider, config), r = state.round;
    if (!r) return Response.json({ collection: null }, { headers });
    const catalog = await readCatalog(cached.provider, config, state);
    const season = catalog.seasons.find(s => s.name === r.season);
    const at = new Date(state.timestamp * 1000).toISOString();
    return Response.json({ collection: {
      name: r.name, href: `/collections?collection=${r.id}`,
      status: ['scheduled','live','processing','processing','processing','claimable','paid','refundable'][r.phase],
      label: phaseLabel[r.phase], target: r.phase === 0 ? new Date(Number(r.start) * 1000).toISOString() : r.phase === 1 ? new Date(Number(r.deadline) * 1000).toISOString() : null,
      updatedAt: at, serverNow: new Date().toISOString(), chainTimestamp: at, stale: false,
      remainingSupply: Number(r.supply - r.minted), unpaidPrizes: [5,6].includes(r.phase) ? r.awards.filter(a => !a.claimed).length : null,
      completedCollections: null, totalCollections: season?.collections.length ?? null, seasonColors: season?.collections.map(c => c.color) ?? [],
    } }, { headers });
  } catch { return Response.json({ error: 'Verified collection status is temporarily unavailable.' }, { status: 503, headers }); }
}
