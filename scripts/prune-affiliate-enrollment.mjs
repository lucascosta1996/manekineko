import pg from "pg";

// Invoke from a trusted scheduled job. No raw IPs, signatures or signer secrets are printed.
// Prune proofs/counters expired more than 24 hours ago; each run has bounded work and lock contention.
if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10_000,statement_timeout:15_000,application_name:"manekineko-affiliate-retention"});
try {
  await client.connect();await client.query("BEGIN");
  const challenges=await client.query(`WITH expired AS (
    SELECT id FROM manekineko_affiliate_challenges WHERE expires_at < now()-interval '24 hours'
    ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED
  ) DELETE FROM manekineko_affiliate_challenges c USING expired e WHERE c.id=e.id`);
  const counters=await client.query(`WITH expired AS (
    SELECT collection_id,scope,subject_hash,window_start FROM manekineko_affiliate_rate_limits
    WHERE window_start < now()-interval '24 hours' ORDER BY window_start LIMIT 1000 FOR UPDATE SKIP LOCKED
  ) DELETE FROM manekineko_affiliate_rate_limits c USING expired e WHERE c.collection_id=e.collection_id AND c.scope=e.scope AND c.subject_hash=e.subject_hash AND c.window_start=e.window_start`);
  await client.query("COMMIT");
  console.log(JSON.stringify({expiredChallengesRemoved:challenges.rowCount,expiredCountersRemoved:counters.rowCount,batchLimit:1000}));
} catch {
  await client.query("ROLLBACK").catch(()=>{});console.error("Affiliate retention cleanup failed; no credentials were logged.");process.exitCode=1;
} finally {await client.end();}
