/** Shared, storage-independent social delivery helpers. No wallet authority. */
import { uploadXMedia, getXMediaStatus, XApiError, AmbiguousDelivery, type XCredentials, type XRequestOptions } from './x-transport.ts';
import type { SeasonSocialMessage } from './season-social.ts';
export const DEFAULT_SOCIAL_STAGES = ['prepared', 'voting', 'opening', 'soldout', 'draw-ready', 'draw-refunds', 'refunds', 'revealed', 'paid'] as const;
export type Observation = { key: string; text: string; block: number; blockHash: string; image?: SeasonSocialMessage };
export type Delivery = Observation & { status: 'pending' | 'intent' | 'sent' | 'uncertain'; postId?: string; mediaId?: string; mediaExpiresAt?: number; imageHash?: string; mediaProcessingState?: 'succeeded' | 'pending' | 'in_progress'; supersededMedia?: Array<{ id: string; expiresAt?: number }> };
/** Simple PNG uploads complete in the upload response. STATUS is for media
 * that actually reports asynchronous processing; it can reject simple images. */
export async function prepareDeliveryMedia(e: Delivery, rendered: { png: Uint8Array; sha256: string }, credentials: XCredentials, options: XRequestOptions, save: () => Promise<void>, transport = { upload: uploadXMedia, status: getXMediaStatus }): Promise<boolean> {
  if (e.status !== 'pending') throw new Error('Only pending media may be prepared.');
  if (!e.mediaId || !e.mediaExpiresAt || e.mediaExpiresAt <= Date.now() + 60_000 || e.imageHash !== rendered.sha256 || !e.mediaProcessingState) {
    const media = await transport.upload(credentials, rendered.png, options);
    if (e.mediaId) (e.supersededMedia ??= []).push({ id: e.mediaId, expiresAt: e.mediaExpiresAt });
    e.mediaId = media.id;
    e.mediaExpiresAt = Date.now() + media.expiresAfterSecs * 1000;
    e.mediaProcessingState = media.processingState;
    e.imageHash = rendered.sha256;
    await save();
  }
  if (e.mediaProcessingState !== 'succeeded') {
    const media = await transport.status(credentials, e.mediaId, options);
    if (media.id !== e.mediaId) throw new Error('X returned another media upload.');
    e.mediaProcessingState = media.processingState;
    await save();
  }
  return e.mediaProcessingState === 'succeeded';
}
export type Config = {
  version?: 12 | 13 | 14 | 16 | 17;
  holderRewardsCodeHash?: string;
  genesisCodeHash?: string;
  chainId: number;
  controller: string;
  controllerCodeHash: string;
  rpcUrl: string;
  appUrl: string;
  xAccountId: string;
  accountSource?: 'environment' | 'launch';
};
export function mergeObservations(existing: Delivery[], observations: Observation[], order: readonly string[] = DEFAULT_SOCIAL_STAGES): Delivery[] {
  const map = new Map(existing.map((e) => [e.key, e]));
  for (const e of observations) {
    const previous = map.get(e.key);
    // Only unsent work can adopt new branding/copy. Never mutate a delivery that may exist on X.
    if (!previous || previous.status === 'pending') {
      const same = previous?.text === e.text && JSON.stringify(previous?.image) === JSON.stringify(e.image);
      map.set(e.key, same ? { ...previous!, ...e } : { ...e, status: 'pending' });
    }
  }
  return [...map.values()].sort((a, b) => {
    const left = a.key.split(':'), right = b.key.split(':');
    return Number(left.at(-2)) - Number(right.at(-2)) || order.indexOf(left.at(-1)!) - order.indexOf(right.at(-1)!);
  });
}

export function assertPublishable(entries: Delivery[]) {
  if (entries.some(e => e.status === 'intent' || e.status === 'uncertain'))
    throw new Error('Reconcile unresolved delivery before publishing any later event.');
}
export function deliveryFailureStatus(error: unknown, writeStarted: boolean): 'pending' | 'uncertain' {
  // Explicit API rejection or a failed preflight proves no public post was accepted.
  // Network/5xx/malformed-success ambiguity and persistence failure after a send require reconciliation.
  return !writeStarted || (error instanceof XApiError && !(error instanceof AmbiguousDelivery)) ? 'pending' : 'uncertain';
}
