import pg from 'pg';
import { getRuntimeProfile, getRuntimeWorkerProfile } from '../../apps/launch/lib/season-runtime-store.ts';
import type { RuntimeProfile } from '../../apps/launch/lib/season-runtime.ts';
import type { Config } from '../protocol-v12/social.ts';

export function assertAccountRevision(saved: RuntimeProfile, current: RuntimeProfile | null, publishing: boolean) {
  if (!current || current.chainId !== saved.chainId || current.revision !== saved.revision || current.expectedAccountId !== saved.expectedAccountId || current.publicBaseUrl !== saved.publicBaseUrl || (publishing && !current.enabled)) throw new Error('Launch X settings changed or posting is disabled. Restart the sender after reviewing the account and its outbox.');
}
/** Explicit opt-in: legacy private-file workers retain their original credentials. */
export async function loadLaunchSocialAccount(config: Config, mode: string, env = process.env) {
  if (config.accountSource === undefined || config.accountSource === 'environment') return undefined;
  if (config.accountSource !== 'launch' || (config.version !== 16 && config.version !== 17) || config.chainId !== 11155111 || env.MANEKINEKO_CHAIN_ID !== String(config.chainId) || !env.DATABASE_URL) throw new Error('The Launch account source requires the dedicated V16/V17 Sepolia environment.');
  const query = async <T>(read: (pool: pg.Pool) => Promise<T>) => {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 10000, application_name: `tincta-v${config.version}-social-account` });
    try { return await read(pool); } finally { await pool.end(); }
  };
  const { profile, credentials } = await query(pool => getRuntimeWorkerProfile(pool, '11155111', env));
  const publishing = mode === '--publish';
  assertAccountRevision(profile, profile, publishing);
  return {
    config: { ...config, xAccountId: profile.expectedAccountId, appUrl: profile.publicBaseUrl }, credentials,
    assertCurrent: async () => assertAccountRevision(profile, await query(pool => getRuntimeProfile(pool, '11155111')), publishing),
  };
}

/** A watch process keeps one reviewed configuration/account for its lifetime. */
export function fixedLaunchSocialAccountSource(load = loadLaunchSocialAccount) {
  let binding: string | undefined;
  let saved: Awaited<ReturnType<typeof loadLaunchSocialAccount>>;
  return async (config: Config, mode: string) => {
    const current = JSON.stringify([config, mode]);
    if (binding !== undefined) {
      if (current !== binding) throw new Error('Social configuration changed. Restart the sender after review.');
      await saved?.assertCurrent();
      return saved;
    }
    saved = await load(config, mode); binding = current; return saved;
  };
}
