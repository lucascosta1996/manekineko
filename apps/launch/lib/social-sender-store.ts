import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Delivery, Config } from '../../../packages/contracts/src/social-delivery.ts';

export type SenderConfig = Pick<Config, 'chainId'|'controller'|'controllerCodeHash'|'appUrl'|'xAccountId'> & { version: 17 };
export type SenderEntry = Delivery & { queuedAt?: number; intentAt?: number; sentAt?: number; finalized?: boolean };
export type Sender = { id: string; config: SenderConfig; entries: SenderEntry[]; lease_token: string; failures: number };
export class SenderError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code=code; }
}
/** A killed invocation leaves a time-limited lease and durable intent, never a permanent lock. */
export async function claimSender(db: Pool): Promise<Sender | undefined> {
  const token = randomUUID();
  await db.query('UPDATE manekineko_social_senders SET checked_at=now() WHERE enabled');
  const { rows } = await db.query(`UPDATE manekineko_social_senders SET lease_token=$1,
    lease_until=now()+interval '180 seconds', updated_at=now()
    WHERE id=(SELECT id FROM manekineko_social_senders WHERE enabled AND next_attempt_at<=now()
      AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id,config,entries,lease_token,failures`, [token]);
  return rows[0];
}
export async function saveSender(db: Pool, s: Sender) {
  const { rowCount } = await db.query(`UPDATE manekineko_social_senders SET entries=$3, updated_at=now()
    WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND enabled`, [s.id,s.lease_token,JSON.stringify(s.entries)]);
  if (rowCount !== 1) throw new SenderError('lease_lost');
}
export async function assertSenderLease(db: Pool, s: Sender) {
  const { rowCount } = await db.query(`SELECT id FROM manekineko_social_senders
    WHERE id=$1 AND lease_token=$2 AND lease_until>now()+interval '30 seconds' AND enabled AND config=$3::jsonb`,
  [s.id,s.lease_token,JSON.stringify(s.config)]);
  if (rowCount !== 1) throw new SenderError('lease_lost');
}
export async function finishSender(db: Pool, s: Sender, result: { error?: string; retrySeconds?: number; observed: boolean; delivered: boolean }) {
  // A stale invocation must never release a successor's lease or overwrite its journal.
  await db.query(`UPDATE manekineko_social_senders SET lease_token=NULL,lease_until=NULL,
    next_attempt_at=now()+($3::integer*interval '1 second'), last_error=$4,
    failures=CASE WHEN $4::text IS NULL THEN 0 ELSE failures+1 END,
    observed_at=CASE WHEN $5 THEN now() ELSE observed_at END,
    delivered_at=CASE WHEN $6 THEN now() ELSE delivered_at END, updated_at=now()
    WHERE id=$1 AND lease_token=$2`, [s.id,s.lease_token,result.retrySeconds ?? 0,result.error ?? null,result.observed,result.delivered]);
}
export async function senderHealth(db: Pool, now = Date.now()) {
  const { rows } = await db.query(`SELECT id,enabled,checked_at,observed_at,delivered_at,next_attempt_at,last_error,failures,
    jsonb_array_length(entries) AS total,
    (SELECT count(*)::integer FROM jsonb_array_elements(entries) e WHERE e->>'status'='sent') AS sent,
    (SELECT count(*)::integer FROM jsonb_array_elements(entries) e WHERE e->>'status'='pending') AS pending,
    (SELECT count(*)::integer FROM jsonb_array_elements(entries) e WHERE e->>'status' IN ('intent','uncertain')) AS uncertain,
    (SELECT min((e->>'queuedAt')::bigint) FROM jsonb_array_elements(entries) e WHERE e->>'status'!='sent') AS oldest
    FROM manekineko_social_senders ORDER BY id`);
  const sources = rows.map(r => ({ ...r, oldest: undefined,
    stale: r.enabled && (!r.observed_at || now - new Date(r.observed_at).getTime() > 180_000),
    oldestPendingSeconds: r.oldest ? Math.max(0,Math.floor((now-Number(r.oldest))/1000)) : 0 }));
  return { healthy: sources.length > 0 && sources.filter(r=>r.enabled).length > 0 && sources.every(r=>!r.enabled || (!r.stale && !r.last_error && !r.uncertain && r.oldestPendingSeconds<180)), sources };
}
