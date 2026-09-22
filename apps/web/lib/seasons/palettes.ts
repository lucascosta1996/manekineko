import { sha256, toUtf8Bytes } from "ethers";
import catalog from "../../../../seasons.json" with { type: "json" };
import type { SeasonPublic } from "./model.ts";

// Teasers contain color and order only, never unpublished names or launch terms.
export const seasonPalettes = catalog.map(({ season, collections }) => ({ ordinal: season, colors: collections }));
export type SeasonPalette = (typeof seasonPalettes)[number];
const identities = new Map([1, 11155111].flatMap(chain => seasonPalettes.map(palette => [
  sha256(toUtf8Bytes(`manekineko:seasons.json:chain:${chain}:season:${palette.ordinal}`)), palette,
] as const)));

export function paletteForSeason(season: SeasonPublic): SeasonPalette | null {
  const saved = identities.get(season.id.toLowerCase());
  if (saved) return saved;
  // Fictionally named test seasons have independent IDs but retain the catalog colors.
  const colors = season.collections.map(c => c.collectionColor?.toUpperCase());
  if (!colors.length || colors.some(color => !color)) return null;
  const matches = seasonPalettes.filter(palette => colors.every(color => palette.colors.includes(color!)));
  return matches.length === 1 ? matches[0] : null;
}

export function seasonColors(season: SeasonPublic): string[] {
  return paletteForSeason(season)?.colors ?? season.collections.flatMap(c => c.collectionColor ? [c.collectionColor] : []);
}

export function upcomingCollectionColors(season: SeasonPublic, limit = 2): { ordinal: number; color: string }[] {
  const palette = paletteForSeason(season);
  if (!palette) return [];
  const published = new Set(season.collections.map(c => c.collectionColor?.toUpperCase()));
  const lastPublished = Math.max(-1, ...palette.colors.map((color, index) => published.has(color) ? index : -1));
  return palette.colors.map((color, index) => ({ ordinal: index + 1, color }))
    .filter(item => item.ordinal > lastPublished + 1).slice(0, limit);
}

export function upcomingSeasonPalettes(seasons: readonly SeasonPublic[], limit = 2): SeasonPalette[] {
  const latest = Math.max(0, ...seasons.map(season => paletteForSeason(season)?.ordinal ?? 0));
  return seasonPalettes.filter(palette => palette.ordinal > latest).slice(0, limit);
}
