import { createHmac, randomBytes } from "node:crypto";
import { assertSocialText } from "../../packages/contracts/src/season-social.ts";

export type XCredentials = { apiKey: string; apiKeySecret: string; accessToken: string; accessTokenSecret: string };
export type XAccount = { id: string; username: string; name: string };
export type XRequestOptions = {
  expectedAccountId: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** Injectable only for deterministic OAuth tests. Defaults are cryptographic. */
  nonce?: () => string;
  now?: () => number;
  /** Revalidate mutable protocol state after account verification, immediately
   * before the public POST. A failed guard never reaches the write request. */
  beforePost?: () => Promise<void>;
};
export type XMedia = { id: string; expiresAfterSecs: number; processingState: "succeeded" | "pending" | "in_progress"; checkAfterSecs: number };

/** Public errors intentionally exclude response bodies, headers, credentials,
 * request URLs with query parameters, and underlying network exception text. */
export class XApiError extends Error {
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;
  constructor(message: string, status?: number, retryAfterSeconds?: number) {
    super(message); this.name = "XApiError"; this.status = status; this.retryAfterSeconds = retryAfterSeconds;
  }
}
/** A post may already exist. Persist this state and reconcile in X before any
 * retry; X create-post has no documented idempotency key for this workflow. */
export class AmbiguousDelivery extends XApiError {
  constructor(message = "X post delivery is uncertain; reconcile the account before retrying", status?: number) {
    super(message, status); this.name = "AmbiguousDelivery";
  }
}
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
function validateCredentials(credentials: XCredentials) {
  for (const key of ["apiKey", "apiKeySecret", "accessToken", "accessTokenSecret"] as const) {
    const value = credentials[key];
    if (typeof value !== "string" || !value || value.length > 5000 || /\s|[\u0000-\u001f\u007f]/.test(value)) throw new XApiError(`Missing or invalid X credential: ${key}`);
  }
}
function id(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value)) throw new XApiError("Invalid X identifier");
  return value;
}

/** OAuth 1.0a HMAC-SHA1. JSON and multipart bodies are excluded from the OAuth
 * parameter normalization, as required by RFC 5849. URL query pairs are signed. */
export function xOAuth1Authorization(method: string, endpoint: string, credentials: XCredentials, options: { nonce: string; timestamp: number }): string {
  validateCredentials(credentials);
  const url = new URL(endpoint);
  if (!options.nonce || !Number.isSafeInteger(options.timestamp) || options.timestamp < 0) throw new XApiError("Invalid OAuth signing parameters");
  const oauth: Record<string, string> = { oauth_consumer_key: credentials.apiKey, oauth_nonce: options.nonce, oauth_signature_method: "HMAC-SHA1", oauth_timestamp: String(options.timestamp), oauth_token: credentials.accessToken, oauth_version: "1.0" };
  const pairs = [...url.searchParams.entries(), ...Object.entries(oauth)].map(([key, value]) => [encode(key), encode(value)]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
  const normalized = pairs.map(pair => pair.join("=")).join("&");
  const base = [method.toUpperCase(), `${url.protocol}//${url.host}${url.pathname}`, normalized].map(encode).join("&");
  oauth.oauth_signature = createHmac("sha1", `${encode(credentials.apiKeySecret)}&${encode(credentials.accessTokenSecret)}`).update(base).digest("base64");
  return `OAuth ${Object.entries(oauth).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(", ")}`;
}

async function limitedJson(response: Response): Promise<Record<string, any>> {
  const maximum = 64 * 1024;
  if (Number(response.headers.get("content-length")) > maximum || !response.body) throw new Error("Invalid response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > maximum) { await reader.cancel(); throw new Error("Response exceeds limit"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid response");
  return parsed as Record<string, any>;
}
async function request(credentials: XCredentials, method: "GET" | "POST", path: string, body: unknown, options: XRequestOptions): Promise<Record<string, any>> {
  const endpoint = `https://api.x.com${path}`;
  const publicPost = method === "POST" && path === "/2/tweets";
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new XApiError("Invalid X request timeout");
  const authorization = xOAuth1Authorization(method, endpoint, credentials, { nonce: options.nonce?.() ?? randomBytes(24).toString("hex"), timestamp: Math.floor((options.now?.() ?? Date.now()) / 1000) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs); timer.unref?.();
  try {
    const response = await (options.fetch ?? globalThis.fetch)(endpoint, {
      method, redirect: "error", signal: controller.signal,
      headers: { Authorization: authorization, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (publicPost && (response.status >= 500 || response.status === 408)) throw new AmbiguousDelivery(undefined, response.status);
      const retryAfter = response.headers.get("retry-after");
      const seconds = retryAfter && /^\d{1,8}$/.test(retryAfter) ? Number(retryAfter) : undefined;
      throw new XApiError(`X API request rejected (HTTP ${response.status})`, response.status, seconds);
    }
    const result = await limitedJson(response);
    // HTTP success with partial API errors is not evidence that a post failed.
    if (Array.isArray(result.errors) && result.errors.length) {
      if (publicPost) throw new AmbiguousDelivery();
      throw new XApiError("X API returned an incomplete result");
    }
    return result;
  } catch (error) {
    if (error instanceof XApiError) throw error;
    if (publicPost) throw new AmbiguousDelivery();
    throw new XApiError("X API request failed or returned an invalid response");
  } finally { clearTimeout(timer); }
}

export async function verifyXAccount(credentials: XCredentials, options: XRequestOptions): Promise<XAccount> {
  const expected = id(options.expectedAccountId);
  const response = await request(credentials, "GET", "/2/users/me", undefined, options);
  const account = response.data;
  if (!account || id(account.id) !== expected) throw new XApiError("The authenticated X account does not match the configured account ID");
  if (typeof account.username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(account.username) || typeof account.name !== "string" || account.name.length > 200) throw new XApiError("X returned invalid account details");
  return { id: account.id, username: account.username, name: account.name };
}
function mediaResult(response: Record<string, any>, requireExpiry = false): XMedia {
  const data = response.data;
  if (!data) throw new XApiError("X did not return a media upload result");
  const mediaId = id(data.id);
  const state = data.processing_info?.state ?? "succeeded";
  if (!["succeeded", "pending", "in_progress"].includes(state)) throw new XApiError("X media processing failed");
  const expiry = Number(data.expires_after_secs ?? 0), check = Number(data.processing_info?.check_after_secs ?? 1);
  if (!Number.isSafeInteger(expiry) || expiry < 0 || !Number.isSafeInteger(check) || check < 0) throw new XApiError("X returned invalid media processing metadata");
  if (requireExpiry && expiry < 1) throw new XApiError("X did not provide a usable media expiry");
  return { id: mediaId, expiresAfterSecs: expiry, processingState: state, checkAfterSecs: check };
}

/** Persist the returned media ID immediately. Alt text is a separate durable
 * stage; this function never publishes a post and never retries itself. */
export async function uploadXMedia(credentials: XCredentials, png: Uint8Array, options: XRequestOptions): Promise<XMedia> {
  if (!(png instanceof Uint8Array) || png.byteLength < 8 || png.byteLength > 5 * 1024 * 1024 || !Buffer.from(png.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new XApiError("Upload requires a PNG no larger than 5 MiB");
  await verifyXAccount(credentials, options);
  return mediaResult(await request(credentials, "POST", "/2/media/upload", { media: Buffer.from(png).toString("base64"), media_category: "tweet_image" }, options), true);
}
export async function getXMediaStatus(credentials: XCredentials, mediaId: string, options: XRequestOptions): Promise<XMedia> {
  return mediaResult(await request(credentials, "GET", `/2/media/upload?media_id=${id(mediaId)}&command=STATUS`, undefined, options));
}
export async function setXMediaAltText(credentials: XCredentials, mediaId: string, alt: string, options: XRequestOptions): Promise<void> {
  id(mediaId);
  if (typeof alt !== "string" || !alt.trim() || [...alt].length > 1000 || /[\u0000-\u001f\u007f]/.test(alt)) throw new XApiError("Invalid media alternative text");
  await verifyXAccount(credentials, options);
  const result = await request(credentials, "POST", "/2/media/metadata", { id: mediaId, metadata: { alt_text: { text: alt } } }, options);
  if (result.data?.id !== mediaId) throw new XApiError("X did not confirm media alternative text");
}
export async function createXPost(credentials: XCredentials, post: { text: string; mediaId?: string; replyToId?: string }, options: XRequestOptions): Promise<{ id: string }> {
  const text = assertSocialText(post.text);
  if (post.mediaId) id(post.mediaId); if (post.replyToId) id(post.replyToId);
  await verifyXAccount(credentials, options);
  await options.beforePost?.();
  const response = await request(credentials, "POST", "/2/tweets", {
    text,
    ...(post.mediaId ? { media: { media_ids: [post.mediaId] } } : {}),
    ...(post.replyToId ? { reply: { in_reply_to_tweet_id: post.replyToId } } : {}),
  }, options);
  try { return { id: id(response.data?.id) }; } catch { throw new AmbiguousDelivery(); }
}

/** Read-only reconciliation of a candidate supplied by an operator. Matching
 * text alone is insufficient: author, reply parent and exact media must agree. */
export async function verifyXPost(credentials: XCredentials, postId: string, expected: { text: string; mediaId?: string; replyToId?: string }, options: XRequestOptions): Promise<{ id: string; authorId: string }> {
  id(postId); assertSocialText(expected.text);
  if (expected.mediaId) id(expected.mediaId); if (expected.replyToId) id(expected.replyToId);
  await verifyXAccount(credentials, options);
  let result: Record<string, any>;
  let legacyLookup = false;
  try {
    // The current OpenAPI names fields/references "post" while retaining the
    // /tweets route. Compatibility with older API deployments is read-only.
    result = await request(credentials, "GET", `/2/tweets/${postId}?post.fields=attachments,entities,conversation_id&expansions=author_id,referenced_posts,attachments.media_keys`, undefined, options);
  } catch (error) {
    if (!(error instanceof XApiError) || error.status !== 400) throw error;
    legacyLookup = true; result = {};
  }
  if (legacyLookup || !result.data?.author_id || !result.data?.conversation_id || expected.replyToId && !result.data?.referenced_posts && !result.data?.referenced_tweets) result = await request(credentials, "GET", `/2/tweets/${postId}?tweet.fields=author_id,attachments,entities,referenced_tweets,conversation_id&expansions=attachments.media_keys`, undefined, options);
  const post = result.data;
  const fail = () => { throw new XApiError("The candidate X post does not match the recorded delivery intent"); };
  if (!post || post.id !== postId || post.author_id !== options.expectedAccountId || typeof post.text !== "string") fail();
  const references = post.referenced_posts ?? post.referenced_tweets ?? [];
  if (!Array.isArray(references) || (expected.replyToId ? references.length !== 1 || references[0].type !== "replied_to" || references[0].id !== expected.replyToId : references.length !== 0)) fail();
  if (!expected.replyToId && post.conversation_id !== postId) fail();
  const mediaKeys = post.attachments?.media_keys ?? [];
  if (!Array.isArray(mediaKeys) || (post.attachments?.poll_ids?.length ?? 0) > 0) fail();
  if (expected.mediaId ? mediaKeys.length !== 1 || !new RegExp(`^\\d+_${expected.mediaId}$`).test(mediaKeys[0]) : mediaKeys.length !== 0) fail();
  let actual: string = post.text;
  const urls = post.entities?.urls ?? [];
  if (!Array.isArray(urls)) fail();
  for (const entity of urls) {
    if (typeof entity.url !== "string" || typeof entity.expanded_url !== "string") fail();
    // X may append its own t.co media link; remove only a verified attachment
    // suffix, never an arbitrary URL elsewhere in the user's original text.
    const mediaSuffix = expected.mediaId && actual.endsWith(` ${entity.url}`) && (entity.media_key === mediaKeys[0] || new RegExp(`^https://(?:www\\.)?(?:x|twitter)\\.com/[^/]+/status/${postId}/photo/\\d+$`).test(entity.expanded_url));
    if (mediaSuffix) actual = actual.slice(0, -(entity.url.length + 1));
    else actual = actual.split(entity.url).join(entity.expanded_url);
  }
  if (actual.normalize("NFC") !== expected.text.normalize("NFC")) fail();
  return { id: postId, authorId: post.author_id };
}
