import type { SeasonSocialMessage } from "../../packages/contracts/src/season-social.ts";
import { renderSeasonSocialImage } from "./social-image.ts";
import { AmbiguousDelivery, XApiError, createXPost, getXMediaStatus, setXMediaAltText, uploadXMedia, type XCredentials } from "./social.ts";
import { ensure, RunnerStop, type RunStore } from "./store.ts";

type OutboxStore = Pick<RunStore, "action" | "putAction" | "updateAction" | "replacePendingAction" | "guard" | "event">;
export class MediaPending extends Error {}
export class SocialContentExpired extends MediaPending { constructor() { super("social_content_expired_refresh_required"); this.name = "SocialContentExpired"; } }
type DeliveryOptions = { beforePost?: () => Promise<void>; beforeReply?: () => Promise<void>; now?: () => number; fetch?: typeof globalThis.fetch };
/** X has no documented create-post idempotency key. A crash after sending is
 * an unresolved delivery, even when the request may have succeeded remotely. */
export async function deliverPost(store: OutboxStore, credentials: XCredentials, accountId: string, key: string, input: { text: string; replyToId?: string; image?: SeasonSocialMessage }, delivery: DeliveryOptions = {}) {
  const now = delivery.now ?? Date.now;
  const expired = (image: SeasonSocialMessage | null | undefined) => image?.validUntil != null && (!Number.isFinite(Date.parse(image.validUntil)) || now() >= Date.parse(image.validUntil));
  const fresh = (image: SeasonSocialMessage | null | undefined) => { if (expired(image)) throw new SocialContentExpired(); };
  let action = await store.action(key);
  if (!action) action = await store.putAction(key, "x-post", { accountId, text: input.text, replyToId: input.replyToId ?? null, image: input.image ?? null });
  ensure(action.payload.accountId === accountId, "post_account_binding_mismatch");
  if (action.status === "confirmed") return String(action.result.postId);
  if (action.status === "sending" || action.status === "uncertain") {
    await store.updateAction(key, "uncertain", action.result, "x_delivery_requires_reconciliation");
    throw new RunnerStop("x_delivery_requires_reconciliation");
  }
  ensure(["pending", "failed"].includes(action.status), "unexpected_social_action_status");
  if (action.result.nextAttemptAt && now() < action.result.nextAttemptAt) throw new MediaPending("x_retry_after_pending");
  // Refresh only a known-unsent image/copy. Never rewrite a confirmed intent or
  // an ambiguous write, even when its countdown is now old.
  if (input.image && (expired(action.payload.image) || input.text !== action.payload.text)) {
    fresh(input.image);
    ensure(input.image.event === action.payload.image?.event && input.image.season.id === action.payload.image?.season.id && (input.replyToId ?? null) === action.payload.replyToId, "post_refresh_identity_mismatch");
    action = await store.replacePendingAction(key, { accountId, text: input.text, replyToId: input.replyToId ?? null, image: input.image });
  }
  const payload = action.payload, result = { ...action.result }, options = { expectedAccountId: accountId, ...(delivery.fetch ? { fetch: delivery.fetch } : {}) };
  fresh(payload.image);
  if (payload.image) {
    if (!result.mediaId || (result.mediaExpiresAt && now() >= result.mediaExpiresAt)) {
      await store.guard();
      const rendered = await renderSeasonSocialImage(payload.image);
      const uploaded = await uploadXMedia(credentials, rendered.png, options);
      Object.assign(result, { mediaId: uploaded.id, imageHash: rendered.sha256, mediaReady: uploaded.processingState === "succeeded", altSet: false,
        mediaExpiresAt: uploaded.expiresAfterSecs ? now() + uploaded.expiresAfterSecs * 1000 : null });
      await store.updateAction(key, "pending", result);
    }
    if (!result.mediaReady) {
      const status = await getXMediaStatus(credentials, result.mediaId, options);
      if (status.processingState !== "succeeded") throw new MediaPending();
      result.mediaReady = true; await store.updateAction(key, "pending", result);
    }
    if (!result.altSet) {
      await store.guard(); await setXMediaAltText(credentials, result.mediaId, payload.image.alt, options);
      result.altSet = true; await store.updateAction(key, "pending", result);
    }
  }
  await store.guard();
  fresh(payload.image);
  await store.updateAction(key, "sending", result);
  let post: { id: string };
  try { post = await createXPost(credentials, { text: payload.text, ...(result.mediaId ? { mediaId: result.mediaId } : {}), ...(payload.replyToId ? { replyToId: payload.replyToId } : {}) }, { ...options, beforePost: async () => { await store.guard(); await delivery.beforePost?.(); fresh(payload.image); if (result.mediaExpiresAt && now() >= result.mediaExpiresAt) throw new MediaPending("media_expired_before_post"); } }); }
  catch (error) {
    if (error instanceof XApiError && error.retryAfterSeconds !== undefined) result.nextAttemptAt = now() + error.retryAfterSeconds * 1000;
    await store.updateAction(key, error instanceof AmbiguousDelivery ? "uncertain" : "failed", result, error instanceof AmbiguousDelivery ? "x_delivery_requires_reconciliation" : "x_request_rejected");
    throw error;
  }
  // A DB failure here deliberately leaves sending: subsequent workers reconcile.
  delete result.nextAttemptAt;
  result.postId = post.id; result.confirmedAt = new Date(now()).toISOString();
  await store.updateAction(key, "confirmed", result);
  await store.event("x_posted", `Published ${key}.`);
  return post.id;
}
export async function deliverMessage(store: OutboxStore, credentials: XCredentials, accountId: string, key: string, message: SeasonSocialMessage, options: DeliveryOptions = {}) {
  const postId = await deliverPost(store, credentials, accountId, `${key}:root`, { text: message.post, image: message }, options);
  for (let i = 0; i < message.replies.length; i++) await deliverPost(store, credentials, accountId, `${key}:${message.replyKeys[i]}`, { text: message.replies[i], replyToId: postId }, { ...options, beforePost: options.beforeReply });
  return postId;
}
