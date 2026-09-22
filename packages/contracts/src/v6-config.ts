import { parseV5Config } from "@manekineko/contract-abi/v5-config";
import { normalizeSeasonAppearance } from "@manekineko/contract-abi/season-appearance";

/** V6 binds a collection to its immutable season artwork; pool and launch terms retain V5 validation. */
export function parseV6Config(input: unknown, chainId: bigint, timestamp: bigint) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || (input as Record<string, unknown>).algorithmVersion !== "unique-rank-v3") {
    throw new Error("V6 requires algorithmVersion=unique-rank-v3.");
  }
  const { algorithmVersion: _, ...terms } = input as Record<string, unknown>;
  const appearance = normalizeSeasonAppearance(terms);
  const parsed = parseV5Config(terms, chainId, timestamp);
  if (/[\u0000-\u001f\u007f\ufffe\uffff]/.test(parsed.config.name)
    || new TextDecoder().decode(new TextEncoder().encode(parsed.config.name)) !== parsed.config.name) {
    throw new Error("Collection name must be valid UTF-8 without control characters.");
  }
  return { ...parsed, config: { ...parsed.config, ...appearance } };
}
