import { configuredChainId } from "../chain-policy.ts";

/** Public collection data always comes from the database, including local development. */
export function collectionSource(env: Record<string, string | undefined> = process.env): "postgres" {
  configuredChainId(env);
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required to read real collection data.");
  return "postgres";
}
