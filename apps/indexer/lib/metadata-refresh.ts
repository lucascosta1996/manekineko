import { createHash } from 'node:crypto';
import { ensure, IndexerError, type RegisteredCollection } from './types.ts';

export function needsMetadataRefresh(version: string): boolean { return /^affiliate-v[5-9]$/.test(version); }

export const EXPLORER_ORIGIN = 'https://eth-sepolia.blockscout.com';
export type Metadata = Record<string, unknown> & { image: string; attributes: unknown[] };
export type MetadataJob = {
  collection: RegisteredCollection; tokenId: number; generation: string; owner: string;
  refreshAttempts: number; lastRefreshAt: number | null;
};
export type JobUpdate = { status: 'pending' | 'verifying' | 'verified' | 'blocked'; delaySeconds: number; error?: string; hash?: string };
export interface MetadataStore {
  finish(job: MetadataJob, update: JobUpdate): Promise<void>;
  reserveRefresh(job: MetadataJob, hash: string): Promise<'reserved' | 'cooldown' | 'blocked'>;
  stopProvider(error: string, delaySeconds: number, blocked: boolean): Promise<void>;
}
export type MetadataRead = { metadata: Metadata; assertCanonical: () => Promise<void> };
class ExplorerError extends Error {
  readonly code: string;
  readonly retryAfter: number;
  constructor(code: string, retryAfter = 3600) { super(code); this.code = code; this.retryAfter = retryAfter; }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export function metadataHash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function decodeMetadata(uri: unknown): Metadata {
  ensure(typeof uri === 'string' && uri.length <= 200000 && uri.startsWith('data:application/json;base64,'), 'invalid_metadata');
  const encoded = uri.slice('data:application/json;base64,'.length), bytes = Buffer.from(encoded, 'base64');
  ensure(bytes.toString('base64') === encoded, 'invalid_metadata');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  ensure(value && typeof value === 'object' && typeof value.image === 'string' && Array.isArray(value.attributes), 'invalid_metadata');
  ensure(value.attributes.some((trait: Record<string, unknown>) => trait.trait_type === 'Score')
    && !value.attributes.some((trait: Record<string, unknown>) => trait.trait_type === 'Status' && trait.value === 'Sealed'), 'metadata_not_revealed');
  return value;
}

async function request(url: string, method: 'GET' | 'PATCH', fetcher: typeof fetch): Promise<any> {
  try {
    const response = await fetcher(url, { method, redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (response.status === 429) {
      const header = response.headers.get('retry-after');
      const seconds = header && /^\d+$/.test(header) ? Number(header) : header ? (Date.parse(header) - Date.now()) / 1000 : 3600;
      throw new ExplorerError('explorer_rate_limited', Math.max(3600, Math.min(86400, Number.isFinite(seconds) ? Math.ceil(seconds) : 3600)));
    }
    if ([401,403].includes(response.status)) throw new ExplorerError('explorer_authorization_required');
    if (response.status === 404 && method === 'GET') return { metadata: null };
    if (!response.ok) throw new ExplorerError('explorer_unavailable');
    if (!response.headers.get('content-type')?.includes('application/json')) throw new ExplorerError('explorer_challenge_required');
    const text = await response.text();
    if (text.length > 1000000) throw new ExplorerError('explorer_invalid_response');
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ExplorerError) throw error;
    throw new ExplorerError('explorer_unavailable');
  }
}

/** One bounded attempt; delayed verification belongs to the durable queue, never a request-long sleep. */
export async function processMetadataJob(job: MetadataJob, dependencies: {
  store: MetadataStore; read: (job: MetadataJob) => Promise<MetadataRead>; fetch?: typeof fetch; now?: () => number;
}): Promise<JobUpdate> {
  const { store } = dependencies, now = dependencies.now ?? Date.now, fetcher = dependencies.fetch ?? fetch;
  if (!needsMetadataRefresh(job.collection.contractVersion)) {
    const update: JobUpdate = { status: 'blocked', delaySeconds: 86400, error: 'metadata_refresh_not_applicable' };
    await store.finish(job, update); return update;
  }
  let reserved = false;
  const finish = async (update: JobUpdate) => { await store.finish(job, update); return update; };
  try {
    ensure(job.collection.chainId === 11155111 && /^0x[0-9a-f]{40}$/.test(job.collection.address), 'unsupported_explorer');
    const { metadata, assertCanonical } = await dependencies.read(job), hash = metadataHash(metadata);
    const endpoint = `${EXPLORER_ORIGIN}/api/v2/tokens/${job.collection.address}/instances/${job.tokenId}`;
    const actual = (await request(endpoint, 'GET', fetcher)).metadata;
    await assertCanonical();
    if (actual && hash === metadataHash(actual)) return finish({ status: 'verified', delaySeconds: 0, hash });
    // An uncertain PATCH may have succeeded. Always GET first, then wait 15 minutes before another PATCH.
    if (job.lastRefreshAt !== null && now() - job.lastRefreshAt < 900000) {
      return finish({ status: 'verifying', delaySeconds: 120, error: 'explorer_refresh_pending', hash });
    }
    if (job.refreshAttempts >= 5) return finish({ status: 'blocked', delaySeconds: 3600, error: 'explorer_refresh_not_confirmed', hash });
    const reservation = await store.reserveRefresh(job, hash);
    if (reservation !== 'reserved') return finish({ status: reservation === 'blocked' ? 'blocked' : 'pending', delaySeconds: reservation === 'blocked' ? 3600 : 90,
      error: reservation === 'blocked' ? 'explorer_authorization_required' : undefined, hash });
    reserved = true;
    // Reservation persisted the attempt and quota before any external effect. A crash cannot duplicate it immediately.
    await assertCanonical();
    const response = await request(`${endpoint}/refetch-metadata`, 'PATCH', fetcher);
    ensure(response?.message === 'OK', 'explorer_refresh_unacknowledged');
    return finish({ status: 'verifying', delaySeconds: 120, hash });
  } catch (error) {
    // Never log dependency messages, request objects or authenticated RPC URLs.
    if (!(error instanceof ExplorerError)) {
      const code = error instanceof IndexerError ? error.code
        : ['CALL_EXCEPTION', 'BAD_DATA', 'SERVER_ERROR', 'NETWORK_ERROR', 'TIMEOUT', 'CANCELLED'].includes(String((error as { code?: unknown })?.code))
          ? String((error as { code: string }).code) : 'dependency_unavailable';
      const rpc = error as { info?: { error?: { code?: unknown; message?: unknown }; payload?: { params?: { data?: unknown }[] } } };
      const data = rpc?.info?.payload?.params?.[0]?.data;
      const message = String(rpc?.info?.error?.message ?? '').toLowerCase();
      console.warn('metadata_verification_failed', { collectionId: job.collection.id, tokenId: job.tokenId, code,
        rpcCode: typeof rpc?.info?.error?.code === 'number' ? rpc.info.error.code : undefined,
        selector: typeof data === 'string' && /^0x[0-9a-f]{8}/i.test(data) ? data.slice(0,10) : undefined,
        categories: ['revert','rate','limit','batch','header','block','timeout','gas','missing','not found'].filter(word => message.includes(word)),
      });
    }
    const code = error instanceof ExplorerError ? error.code : 'metadata_verification_unavailable';
    if (error instanceof ExplorerError && code === 'explorer_rate_limited') await store.stopProvider(code, error.retryAfter, false);
    const blocked = ['explorer_authorization_required','explorer_challenge_required'].includes(code);
    if (blocked) await store.stopProvider(code, 0, true);
    return finish({ status: blocked ? 'blocked' : reserved || job.lastRefreshAt !== null ? 'verifying' : 'pending',
      delaySeconds: blocked || code === 'explorer_rate_limited' ? 3600 : reserved ? 900 : 300, error: code });
  }
}
