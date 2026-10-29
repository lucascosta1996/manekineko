/** Offline scenarios: the catalog supplies identity; lifecycle data is illustrative. */
type Catalog = { chainId: number; seasons: { seasonId: string; name: string; collections: { name: string; color: string }[] }[] };
import { message, COPY, GENESIS_STAGES, COLLECTION_STAGES, SEASON_STAGES, type Stage } from './v17-social-content.ts';
export { COPY, GENESIS_STAGES, COLLECTION_STAGES, SEASON_STAGES };
export function rehearsalPreviewCatalog<T extends Catalog>(catalog: T): T {
  if (catalog.chainId !== 11155111) throw new Error('Fast previews are Sepolia only.');
  return { ...catalog, seasons: catalog.seasons.slice(0, 2).map(season => ({ ...season, collections: season.collections.slice(0, 3) })) };
}
export function previewMessage(source: Catalog, id: number, stage: Stage) {
  const catalog = rehearsalPreviewCatalog(source);
  const entries = catalog.seasons.flatMap((season, seasonIndex) => season.collections.map((collection, collectionIndex) => ({ season, seasonIndex, collection, collectionIndex })));
  const selected = entries[Math.max(1, id) - 1];
  const stages: readonly string[] = id === 0 ? GENESIS_STAGES : [...COLLECTION_STAGES, ...SEASON_STAGES];
  if (!selected || !stages.includes(stage)) throw new Error('Invalid preview selection.');
  const { season, seasonIndex, collection, collectionIndex } = selected;
  const target = stage === 'season-open' ? entries.findIndex(e => e.season === season) + 1 : stage === 'season-complete' ? entries.findIndex(e => e.season === season) + season.collections.length : id;
  return message({ stage, id: target, chainId: 11155111, appUrl: 'https://app.tincta.xyz/', timestamp: 1793145600,
    season: { id: season.seasonId, number: seasonIndex + 1, name: season.name, colors: season.collections.map(c => c.color) },
    collection: { id: `preview:${id}`, number: collectionIndex + 1, name: collection.name, color: collection.color, supply: 0, mintPriceEth: '0', winnerCount: 0, prizePerWinnerEth: '0' },
  });
}
