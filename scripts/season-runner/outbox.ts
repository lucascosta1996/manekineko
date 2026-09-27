import type { SeasonSocialMessage } from "../../packages/contracts/src/season-social.ts";
import { renderSeasonSocialImage } from "./social-image.ts";
import { AmbiguousDelivery, XApiError, createXPost, getXMediaStatus, setXMediaAltText, uploadXMedia, type XCredentials } from "./social.ts";
import { ensure, RunnerStop, type RunStore } from "./store.ts";

type OutboxStore = Pick<RunStore, "action" | "putAction" | "updateAction" | "replacePendingAction" | "guard" | "event">;
export class MediaPending extends Error {}
export class SocialContentExpired extends MediaPending { constructor() { super("social_content_expired_refresh_required"); this.name = "SocialContentExpired"; } }
type DeliveryOptions = { enqueueOnly?: boolean; observation?: { observedAt: string; blockNumber: number; blockHash: string; unpaidPrizes: number }; supplementalReplies?: boolean; beforePost?: () => Promise<void>; beforeReply?: () => Promise<void>; now?: () => number; fetch?: typeof globalThis.fetch };
/** X has no documented create-post idempotency key. A crash after sending is
 * an unresolved delivery, even when the request may have succeeded remotely. */
export async function deliverPost(store: OutboxStore, credentials: XCredentials, accountId: string, key: string, input: { text: string; replyToId?: string; image?: SeasonSocialMessage }, delivery: DeliveryOptions = {}) {
  const now = delivery.now ?? Date.now;
  const expired = (image: SeasonSocialMessage | null | undefined) => image?.validUntil != null && (!Number.isFinite(Date.parse(image.validUntil)) || now() >= Date.parse(image.validUntil));
  const fresh = (image: SeasonSocialMessage | null | undefined) => { if (expired(image)) throw new SocialContentExpired(); };
  let action = await store.action(key);
  if (!action) action = await store.putAction(key, "x-post", { accountId, text: input.text, replyToId: input.replyToId ?? null, image: input.image ?? null });
  ensure(action.payload.accountId === accountId, "post_account_binding_mismatch");
  if (delivery.observation && ["pending", "failed"].includes(action.status) && !action.result.observation) {
    const result = { ...action.result, observation: delivery.observation };
    await store.updateAction(key, action.status, result, action.last_error);
    action = { ...action, result };
  }
  if (delivery.enqueueOnly) return action.status === "confirmed" ? String(action.result.postId) : null;
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
  try { if (payload.image) {
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
  } } catch (error) {
    if (error instanceof XApiError) {
      result.diagnostics = { status: error.status ?? null, ...(error.diagnostics ?? { codes: [], problem: null }) };
      result.nextAction = "review_media_delivery_then_retry";
      result.nextAttemptAt = now() + (error.retryAfterSeconds ?? 300) * 1000;
      await store.updateAction(key, "failed", result, "x_media_request_rejected");
    }
    throw error;
  }
  await store.guard();
  fresh(payload.image);
  result.attempts = Number(result.attempts ?? 0) + 1;
  result.lastAttemptAt = new Date(now()).toISOString();
  await store.updateAction(key, "sending", result);
  let post: { id: string };
  try { post = await createXPost(credentials, { text: payload.text, ...(result.mediaId ? { mediaId: result.mediaId } : {}), ...(payload.replyToId ? { replyToId: payload.replyToId } : {}) }, { ...options, beforePost: async () => { await store.guard(); await delivery.beforePost?.(); fresh(payload.image); if (result.mediaExpiresAt && now() >= result.mediaExpiresAt) throw new MediaPending("media_expired_before_post"); } }); }
  catch (error) {
    if (error instanceof XApiError) result.diagnostics = { status: error.status ?? null, ...(error.diagnostics ?? { codes: [], problem: null }) };
    if (error instanceof XApiError) result.nextAttemptAt = now() + (error.retryAfterSeconds ?? 300) * 1000;
    result.nextAction = error instanceof AmbiguousDelivery ? "reconcile_exact_post" : error instanceof XApiError && error.status === 403 ? "review_account_permissions_and_recorded_provider_codes" : "retry_after_fresh_state_check";
    await store.updateAction(key, error instanceof AmbiguousDelivery ? "uncertain" : "failed", result, error instanceof AmbiguousDelivery ? "x_delivery_requires_reconciliation" : "x_request_rejected");
    throw error;
  }
  // A DB failure here deliberately leaves sending: subsequent workers reconcile.
  delete result.nextAttemptAt;
  delete result.nextAction;
  result.postId = post.id; result.confirmedAt = new Date(now()).toISOString();
  if (result.observation?.observedAt) result.observationToDeliveryMs = Math.max(0, now() - Date.parse(result.observation.observedAt));
  await store.updateAction(key, "confirmed", result);
  await store.event("x_posted", `Published ${key}.`);
  return post.id;
}
export async function deliverMessage(store: OutboxStore, credentials: XCredentials, accountId: string, key: string, message: SeasonSocialMessage, options: DeliveryOptions = {}) {
  const postId = await deliverPost(store, credentials, accountId, `${key}:root`, { text: message.post, image: message }, options);
  if (options.enqueueOnly) return postId;
  for (let i = 0; i < message.replies.length; i++) {
    const replyKey = `${key}:${message.replyKeys[i]}`;
    const existing = options.supplementalReplies ? await store.action(replyKey) : null;
    // A rejected or ambiguous supplemental reply requires explicit reconciliation.
    // Roots and required announcement threads retain their original gates.
    if (existing && ["failed", "uncertain", "sending"].includes(existing.status)) continue;
    try { await deliverPost(store, credentials, accountId, replyKey, { text: message.replies[i], replyToId: postId }, { ...options, beforePost: options.beforeReply }); }
    catch (error) {
      if (!options.supplementalReplies || !(error instanceof XApiError || error instanceof MediaPending || error instanceof RunnerStop && error.code === "x_delivery_requires_reconciliation")) throw error;
      await store.event("supplemental_reply_needs_review", `Review ${replyKey}; confirmed roots and canonical claims remain valid.`);
      break; // Avoid a burst of similar rejected replies in the same tick.
    }
  }
  return postId;
}
