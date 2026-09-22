import assert from "node:assert/strict";
import { test } from "node:test";
import { createXPost, uploadXMedia, setXMediaAltText, verifyXAccount, verifyXPost, xOAuth1Authorization, AmbiguousDelivery, XApiError, type XRequestOptions } from "./social.ts";

const credentials = { apiKey: "consumer-key", apiKeySecret: "consumer-secret", accessToken: "access-token", accessTokenSecret: "token-secret" };
const account = { id: "12345", username: "tincta_test", name: "Test account" };
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const options = (fetch: XRequestOptions["fetch"]): XRequestOptions => ({ expectedAccountId: account.id, fetch, nonce: () => "nonce", now: () => 1_700_000_000_000 });

test("OAuth1 matches the published OAuth photo request signature vector", () => {
  const authorization = xOAuth1Authorization("GET", "http://photos.example.net/photos?file=vacation.jpg&size=original", { apiKey: "dpf43f3p2l4k3l03", apiKeySecret: "kd94hf93k423kf44", accessToken: "nnch734d00sl2jdk", accessTokenSecret: "pfkkdhi9sl3r4s00" }, { nonce: "kllo9940pd9333jh", timestamp: 1191242096 });
  assert.match(authorization, /oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"/);
  assert.doesNotMatch(authorization, /kd94hf93|pfkkdhi9/);
});
test("account verification returns current handle and refuses account mismatch before a write", async () => {
  let calls = 0;
  const fetch: typeof globalThis.fetch = async () => { calls++; return json({ data: account }); };
  assert.deepEqual(await verifyXAccount(credentials, options(fetch)), account);
  await assert.rejects(createXPost(credentials, { text: "A test" }, { ...options(fetch), expectedAccountId: "54321" }), /does not match/);
  assert.equal(calls, 2);
});
test("uploads PNG with v2 JSON body, sets alt separately, and threads using persisted IDs", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: typeof globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/users/me")) return json({ data: account });
    if (String(url).endsWith("/media/upload")) return json({ data: { id: "987", expires_after_secs: 86400 } });
    if (String(url).endsWith("/media/metadata")) return json({ data: { id: "987" } });
    return json({ data: { id: "765" } }, 201);
  };
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  assert.deepEqual(await uploadXMedia(credentials, png, options(fetch)), { id: "987", expiresAfterSecs: 86400, processingState: "succeeded", checkAfterSecs: 1 });
  await setXMediaAltText(credentials, "987", "Tincta test artwork", options(fetch));
  assert.deepEqual(await createXPost(credentials, { text: "Results", mediaId: "987", replyToId: "654" }, options(fetch)), { id: "765" });
  const writes = calls.filter(call => call.init.method === "POST");
  assert.equal(writes.length, 3);
  assert.deepEqual(JSON.parse(String(writes[0].init.body)), { media: Buffer.from(png).toString("base64"), media_category: "tweet_image" });
  assert.deepEqual(JSON.parse(String(writes[1].init.body)), { id: "987", metadata: { alt_text: { text: "Tincta test artwork" } } });
  assert.deepEqual(JSON.parse(String(writes[2].init.body)), { text: "Results", media: { media_ids: ["987"] }, reply: { in_reply_to_tweet_id: "654" } });
  assert.equal(writes[2].init.redirect, "error");
  assert.match((writes[2].init.headers as Record<string, string>).Authorization, /^OAuth /);
});
for (const failure of ["timeout", "server-error", "malformed-success", "missing-id", "partial-error", "oversized-response"] as const) {
  test(`indeterminate ${failure} never retries or exposes secrets`, async () => {
    let writes = 0;
    const fetch: typeof globalThis.fetch = async (url) => {
      if (String(url).endsWith("/users/me")) return json({ data: account });
      writes++;
      if (failure === "timeout") throw new Error("consumer-secret access-token token-secret");
      if (failure === "server-error") return json({ secret: "consumer-secret" }, 503);
      if (failure === "malformed-success") return new Response("consumer-secret", { status: 201 });
      if (failure === "missing-id") return json({ data: {} }, 201);
      if (failure === "partial-error") return json({ data: { id: "765" }, errors: [{ detail: "consumer-secret" }] }, 201);
      return json({ data: { id: "765" }, oversized: "x".repeat(70_000) }, 201);
    };
    await assert.rejects(createXPost(credentials, { text: "Once only" }, options(fetch)), error => {
      assert.ok(error instanceof AmbiguousDelivery);
      assert.doesNotMatch(String(error), /consumer-secret|access-token|token-secret/);
      return true;
    });
    assert.equal(writes, 1);
  });
}
test("explicit rate rejection carries retry delay without marking an unknown delivery", async () => {
  const fetch: typeof globalThis.fetch = async url => String(url).endsWith("/users/me") ? json({ data: account }) : json({ detail: "token-secret" }, 429, { "retry-after": "120" });
  await assert.rejects(createXPost(credentials, { text: "Once only" }, options(fetch)), error => {
    assert.ok(error instanceof XApiError && !(error instanceof AmbiguousDelivery));
    assert.equal(error.status, 429); assert.equal(error.retryAfterSeconds, 120); assert.doesNotMatch(error.message, /token-secret/); return true;
  });
});
test("invalid and oversized inputs are rejected before contacting X", async () => {
  let calls = 0;
  const fetch: typeof globalThis.fetch = async () => { calls++; return json({ data: account }); };
  await assert.rejects(createXPost(credentials, { text: "猫".repeat(141) }, options(fetch)), /weighted limit/);
  await assert.rejects(uploadXMedia(credentials, new Uint8Array(9), options(fetch)), /PNG/);
  await assert.rejects(setXMediaAltText(credentials, "987", "a".repeat(1001), options(fetch)), /alternative text/);
  assert.equal(calls, 0);
});
test("reconciliation expands original links, removes only its media suffix, and checks reply/author/media", async () => {
  const expected = { text: "Results:\nhttps://tincta.xyz/collections/cinder", mediaId: "987", replyToId: "654" };
  const candidate = { id: "765", author_id: account.id, conversation_id: "654", text: "Results:\nhttps://t.co/link https://t.co/image", referenced_posts: [{ type: "replied_to", id: "654" }], attachments: { media_keys: ["3_987"] }, entities: { urls: [{ url: "https://t.co/link", expanded_url: "https://tincta.xyz/collections/cinder" }, { url: "https://t.co/image", expanded_url: "https://x.com/tincta_test/status/765/photo/1", media_key: "3_987" }] } };
  let writes = 0;
  const forCandidate = (value: unknown): typeof globalThis.fetch => async (url, init) => { if (init?.method !== "GET") writes++; return json({ data: String(url).endsWith("/users/me") ? account : value }); };
  assert.deepEqual(await verifyXPost(credentials, "765", expected, options(forCandidate(candidate))), { id: "765", authorId: account.id });
  for (const change of [{ author_id: "999" }, { text: "different" }, { referenced_posts: [] }, { attachments: { media_keys: ["3_988"] } }]) {
    await assert.rejects(verifyXPost(credentials, "765", expected, options(forCandidate({ ...candidate, ...change }))), /does not match/);
  }
  assert.equal(writes, 0);
});
