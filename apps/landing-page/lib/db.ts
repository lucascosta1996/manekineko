import "server-only";
import { Pool } from "pg";
import { NEWSLETTER_INSERT_SQL, NEWSLETTER_RATE_LIMIT, NEWSLETTER_RATE_SQL, type NewsletterRepository } from "./newsletter";

const globalDatabase = globalThis as typeof globalThis & {
  tinctaNewsletterPool?: Pool;
  tinctaNewsletterConnectionString?: string;
};

function database(): Pool {
  const connectionString = process.env.NEWSLETTER_DATABASE_URL;
  if (!connectionString) throw new Error("Newsletter storage is not configured.");
  if (globalDatabase.tinctaNewsletterPool && globalDatabase.tinctaNewsletterConnectionString !== connectionString) {
    void globalDatabase.tinctaNewsletterPool.end().catch(() => {});
    globalDatabase.tinctaNewsletterPool = undefined;
  }
  if (!globalDatabase.tinctaNewsletterPool) {
    const pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 10_000,
      application_name: "tincta-landing-newsletter",
    });
    pool.on("error", () => console.error("An idle newsletter database connection failed."));
    globalDatabase.tinctaNewsletterPool = pool;
    globalDatabase.tinctaNewsletterConnectionString = connectionString;
  }
  return globalDatabase.tinctaNewsletterPool;
}

export const newsletterRepository: NewsletterRepository = {
  async consumeRateLimit(subjectHash) {
    const pool = database();
    // One row per network; expire old HMACs without retaining raw IP addresses.
    await pool.query("DELETE FROM manekineko_newsletter_rate_limits WHERE window_started_at < now() - interval '1 day'");
    const result = await pool.query(NEWSLETTER_RATE_SQL, [subjectHash, NEWSLETTER_RATE_LIMIT]);
    return result.rowCount === 1;
  },
  async save(email) {
    await database().query(NEWSLETTER_INSERT_SQL, [email]);
  },
};
