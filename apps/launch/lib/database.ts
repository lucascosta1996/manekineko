import "server-only";

import { Pool } from "pg";

const globalDatabase = globalThis as typeof globalThis & {
  manekinekoLaunchPool?: Pool;
};

/** Reuse the pool across development reloads and warm serverless requests. */
export function database(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  if (!globalDatabase.manekinekoLaunchPool) {
    const pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 10_000,
      application_name: "manekineko-launch",
    });
    pool.on("error", () => console.error("An idle database connection failed."));
    globalDatabase.manekinekoLaunchPool = pool;
  }
  return globalDatabase.manekinekoLaunchPool;
}
