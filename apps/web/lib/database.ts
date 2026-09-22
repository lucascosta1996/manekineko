import "server-only";

import { Pool } from "pg";

const globalDatabase = globalThis as typeof globalThis & {
  manekinekoCollectionPool?: Pool;
};

/** Reuse the pool across development reloads and warm serverless requests. */
export function database(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  if (!globalDatabase.manekinekoCollectionPool) {
    const pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 10_000,
      application_name: "manekineko-web",
    });
    pool.on("error", () => console.error("An idle database connection failed."));
    globalDatabase.manekinekoCollectionPool = pool;
  }
  return globalDatabase.manekinekoCollectionPool;
}
