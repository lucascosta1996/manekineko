import { parseV8Config } from "@manekineko/contract-abi/v8-config";
/** V9 adds a non-configurable cumulative mint cap; historical V8 manifests keep their original meaning. */
export function parseV9Config(input: unknown, chainId: bigint, timestamp: bigint) {
  if (!input || typeof input !== "object" || (input as Record<string, unknown>).maxMintsPerWallet !== "20") throw new Error("V9 requires maxMintsPerWallet=20.");
  const { maxMintsPerWallet: _, ...terms } = input as Record<string, unknown>;
  return parseV8Config(terms, chainId, timestamp);
}
