import { parseV9Config } from "@manekineko/contract-abi/v9-config";

/** V10 changes combination identity and metadata, preserving V9's frozen economic terms. */
export function parseV10Config(input: unknown, chainId: bigint, timestamp: bigint) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || (input as Record<string, unknown>).algorithmVersion !== "unique-rank-v6") {
    throw new Error("V10 requires algorithmVersion=unique-rank-v6.");
  }
  const raw = input as Record<string, unknown>;
  // Neither the operator nor a mint caller supplies ticket numbers or a presentation seed.
  for (const field of ["combinationKey", "combinationSeed", "numbers", "combinations", "seed"]) {
    if (field in raw) throw new Error(`V10 derives permanent combinations in Solidity; ${field} is not configurable.`);
  }
  return parseV9Config({ ...raw, algorithmVersion: "unique-rank-v5" }, chainId, timestamp);
}
