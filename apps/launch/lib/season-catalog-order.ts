import { createHash } from "node:crypto";
import seasons from "../../../seasons.json" with { type: "json" };

/** Match the stable identities used by the seasons.json importer, including renamed drafts. */
export const catalogSeasonOrders: Readonly<Record<string, number>> = Object.freeze(Object.fromEntries(
  seasons.flatMap((season, index) => ["1", "11155111"].map(chainId => [
    `0x${createHash("sha256").update(`manekineko:seasons.json:chain:${chainId}:season:${season.season}`).digest("hex")}`,
    index + 1,
  ])),
));

export function catalogSeasonOrder(seasonId?: string): number | null {
  return seasonId ? catalogSeasonOrders[seasonId.toLowerCase()] ?? null : null;
}
