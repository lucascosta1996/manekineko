import type { Pool } from "pg";
import {
  LAUNCH_IDLE_SECONDS, LAUNCH_SESSION_SECONDS, LaunchAuthError,
  launchRateDigest, launchSessionDigest, newLaunchSessionToken,
  normalizedLaunchUsername, verifyLaunchPassword,
} from "./launch-auth-policy.ts";

export type LaunchSession = { userId: string; username: string };

// Each quota is an atomic upsert. Global quota runs first to bound username/IP row creation.
export const LAUNCH_LOGIN_LIMIT_SQL = `
  INSERT INTO manekineko_launch_login_limits(scope, subject_hash, window_started_at, attempts)
  VALUES($1, $2, clock_timestamp(), 1)
  ON CONFLICT(scope, subject_hash) DO UPDATE SET
    attempts = CASE WHEN manekineko_launch_login_limits.window_started_at <= clock_timestamp() - ($4::integer * interval '1 second') THEN 1 ELSE manekineko_launch_login_limits.attempts + 1 END,
    window_started_at = CASE WHEN manekineko_launch_login_limits.window_started_at <= clock_timestamp() - ($4::integer * interval '1 second') THEN clock_timestamp() ELSE manekineko_launch_login_limits.window_started_at END
  WHERE manekineko_launch_login_limits.attempts < $3 OR manekineko_launch_login_limits.window_started_at <= clock_timestamp() - ($4::integer * interval '1 second')
  RETURNING attempts`;

export async function consumeLaunchLoginLimits(pool: Pool, username: string, network: string, env: Record<string, string | undefined> = process.env): Promise<void> {
  const limits = [
    { scope: "global", subject: "global", maximum: 30, seconds: 300 },
    { scope: "network", subject: `network:${network}`, maximum: 15, seconds: 900 },
    { scope: "account", subject: `account:${username}`, maximum: 8, seconds: 900 },
  ];
  for (const limit of limits) {
    const result = await pool.query(LAUNCH_LOGIN_LIMIT_SQL, [limit.scope, launchRateDigest(limit.subject, env), limit.maximum, limit.seconds]);
    if (!result.rowCount) throw new LaunchAuthError("too_many_attempts", "Too many login attempts. Please try again later.", 429, limit.seconds);
  }
  await pool.query("DELETE FROM manekineko_launch_login_limits WHERE window_started_at < now() - interval '1 day'");
}

const authRuntime = globalThis as typeof globalThis & { manekinekoLaunchPasswordWork?: boolean };

export async function authenticateLaunchUser(pool: Pool, input: Record<string, unknown>, network: string, previousToken?: string, env: Record<string, string | undefined> = process.env): Promise<{ user: LaunchSession; token: string }> {
  const username = normalizedLaunchUsername(input.username);
  const password = input.password;
  if (typeof password !== "string" || password.length < 1 || password.length > 128 || Buffer.byteLength(password, "utf8") > 512) {
    throw new LaunchAuthError("invalid_credentials", "The login or password is incorrect.", 401);
  }
  await consumeLaunchLoginLimits(pool, username, network, env);
  // Bound the memory used by scrypt on a warm Vercel instance; never build an unbounded queue.
  if (authRuntime.manekinekoLaunchPasswordWork) throw new LaunchAuthError("login_busy", "Another login is being checked. Please try again shortly.", 429, 2);
  authRuntime.manekinekoLaunchPasswordWork = true;
  let account: { id: string; username: string; password_hash: string; disabled_at: Date | null } | undefined;
  try {
    account = (await pool.query("SELECT id, username, password_hash, disabled_at FROM manekineko_launch_users WHERE username=$1", [username])).rows[0];
    const valid = await verifyLaunchPassword(password, account && !account.disabled_at ? account.password_hash : null);
    if (!valid || !account || account.disabled_at) throw new LaunchAuthError("invalid_credentials", "The login or password is incorrect.", 401);
  } finally { authRuntime.manekinekoLaunchPasswordWork = false; }

  const token = newLaunchSessionToken();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serializes with CLI password resets so a password verified immediately before a reset cannot issue a new session afterward.
    const current = (await client.query("SELECT password_hash, disabled_at FROM manekineko_launch_users WHERE id=$1 FOR UPDATE", [account.id])).rows[0];
    if (!current || current.disabled_at || current.password_hash !== account.password_hash) throw new LaunchAuthError("invalid_credentials", "The login or password is incorrect.", 401);
    if (previousToken) {
      const previousHash = launchSessionDigest(previousToken);
      if (previousHash) await client.query("DELETE FROM manekineko_launch_sessions WHERE token_hash=$1", [previousHash]);
    }
    await client.query("DELETE FROM manekineko_launch_sessions WHERE expires_at <= now() OR last_seen_at <= now() - ($1::integer * interval '1 second')", [LAUNCH_IDLE_SECONDS]);
    await client.query(`INSERT INTO manekineko_launch_sessions(token_hash, user_id, expires_at) VALUES($1, $2, now() + ($3::integer * interval '1 second'))`, [launchSessionDigest(token), account.id, LAUNCH_SESSION_SECONDS]);
    await client.query(`DELETE FROM manekineko_launch_sessions WHERE token_hash IN (SELECT token_hash FROM manekineko_launch_sessions WHERE user_id=$1 ORDER BY created_at DESC, token_hash DESC OFFSET 8)`, [account.id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return { user: { userId: account.id, username: account.username }, token };
}

export async function lookupLaunchSession(pool: Pool, token: string | undefined): Promise<LaunchSession | null> {
  if (!token) return null;
  const digest = launchSessionDigest(token);
  if (!digest) return null;
  const result = await pool.query(`
    UPDATE manekineko_launch_sessions s SET last_seen_at=now()
    FROM manekineko_launch_users u
    WHERE s.token_hash=$1 AND s.user_id=u.id AND u.disabled_at IS NULL
      AND s.expires_at > now() AND s.last_seen_at > now() - ($2::integer * interval '1 second')
    RETURNING u.id AS "userId", u.username`, [digest, LAUNCH_IDLE_SECONDS]);
  return result.rows[0] ?? null;
}

export async function revokeLaunchSession(pool: Pool, token: string | undefined): Promise<void> {
  const digest = token ? launchSessionDigest(token) : null;
  if (digest) await pool.query("DELETE FROM manekineko_launch_sessions WHERE token_hash=$1", [digest]);
}
