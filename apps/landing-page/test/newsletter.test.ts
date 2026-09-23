import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { normalizeNewsletterEmail, registerNewsletter, type NewsletterRepository } from "../lib/newsletter";

const env = {
  NODE_ENV: "production", VERCEL: "1",
  NEWSLETTER_PUBLIC_ORIGIN: "https://tincta.example",
  NEWSLETTER_IP_HASH_SECRET: "test-only-newsletter-digest-secret-32-chars",
};

function request(body: unknown = { email: " Collector@Example.COM ", website: "" }, overrides: Record<string, string> = {}, url = "https://tincta.example/api/newsletter") {
  return new Request(url, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://tincta.example", "x-vercel-forwarded-for": "192.0.2.1", ...overrides },
    body: JSON.stringify(body),
  });
}

function repository(): NewsletterRepository & { emails: string[]; hashes: string[] } {
  const emails: string[] = [], hashes: string[] = [];
  return { emails, hashes, async consumeRateLimit(hash) { hashes.push(hash); return true; }, async save(email) { emails.push(email); } };
}

test("registration normalizes an email and saves only after durable admission", async () => {
  const store = repository();
  const response = await registerNewsletter(request(), store, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(store.emails, ["collector@example.com"]);
  assert.match(store.hashes[0]!, /^[a-f0-9]{64}$/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("email validation rejects malformed addresses without losing plus tags", () => {
  assert.equal(normalizeNewsletterEmail(" Color+Art@Example.com "), "color+art@example.com");
  for (const email of ["", "a@", "no-at.example", "a@@example.com", "a@-example.com", "a@example..com", "a..b@example.com", ".a@example.com", "a b@example.com", "a@example.com\nBcc:victim@example.com", `${"a".repeat(65)}@example.com`, null]) {
    assert.throws(() => normalizeNewsletterEmail(email));
  }
});

test("cross-origin requests and hidden bot fields cannot write subscribers", async () => {
  const store = repository();
  assert.equal((await registerNewsletter(request(undefined, { Origin: "https://attacker.example" }), store, env)).status, 403);
  assert.equal((await registerNewsletter(request(undefined, { "sec-fetch-site": "cross-site" }), store, env)).status, 403);
  assert.equal((await registerNewsletter(request({ email: "a@example.com", website: "bot.example" }), store, env)).status, 400);
  assert.deepEqual(store.emails, []);
  assert.deepEqual(store.hashes, []);
});

test("Next route requests bind the canonical URL and ignore alternate forwarded hosts", async () => {
  const store = repository();
  const canonical = new NextRequest(request());
  assert.equal((await registerNewsletter(canonical, store, env)).status, 200);
  const alias = new NextRequest(request(undefined, { "x-forwarded-host": "tincta.example", Host: "tincta.example" }, "https://preview.vercel.app/api/newsletter"));
  assert.equal((await registerNewsletter(alias, store, env)).status, 403);
  assert.equal(store.emails.length, 1);
});

test("JSON content type and actual streamed size are enforced", async () => {
  const store = repository();
  assert.equal((await registerNewsletter(request(undefined, { "Content-Type": "text/plain" }), store, env)).status, 415);
  const oversized = request({ email: "a@example.com", padding: "x".repeat(2_048) });
  assert.equal(oversized.headers.has("content-length"), false);
  assert.equal((await registerNewsletter(oversized, store, env)).status, 413);
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"email":"a@example.com","padding":"'));
    controller.enqueue(new Uint8Array(2_049));
    controller.close();
  } });
  const streamed = new Request("https://tincta.example/api/newsletter", {
    method: "POST", headers: { Origin: "https://tincta.example", "Content-Type": "application/json", "Content-Length": "2" },
    body: stream, duplex: "half",
  } as RequestInit);
  assert.equal((await registerNewsletter(streamed, store, env)).status, 413);
  const malformed = new Request("https://tincta.example/api/newsletter", { method: "POST", headers: { Origin: "https://tincta.example", "Content-Type": "application/json" }, body: "{" });
  assert.equal((await registerNewsletter(malformed, store, env)).status, 400);
  assert.deepEqual(store.emails, []);
});

test("durable quota refuses excess requests with a retry hint", async () => {
  const store = repository();
  store.consumeRateLimit = async () => false;
  const response = await registerNewsletter(request(), store, env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "600");
  assert.deepEqual(store.emails, []);
});

test("production requires configuration and a trusted network address", async () => {
  const store = repository();
  for (const config of [{ ...env, NEWSLETTER_PUBLIC_ORIGIN: "" }, { ...env, NEWSLETTER_IP_HASH_SECRET: "" }, { ...env, VERCEL: "" }]) {
    assert.equal((await registerNewsletter(request(), store, config)).status, 503);
  }
  assert.equal((await registerNewsletter(request(undefined, { "x-vercel-forwarded-for": "", "x-forwarded-for": "192.0.2.2" }), store, env)).status, 503);
  assert.equal((await registerNewsletter(request(undefined, { "x-vercel-forwarded-for": "192.0.2.1, 192.0.2.2" }), store, env)).status, 503);
  assert.deepEqual(store.emails, []);
});

test("equivalent IPv6 addresses share a quota and client XFF cannot choose it", async () => {
  const store = repository();
  await registerNewsletter(request(undefined, { "x-vercel-forwarded-for": "2001:db8::1", "x-forwarded-for": "192.0.2.3" }), store, env);
  await registerNewsletter(request(undefined, { "x-vercel-forwarded-for": "2001:0db8:0:0:0:0:0:1", "x-forwarded-for": "192.0.2.4" }), store, env);
  assert.equal(store.hashes.length, 2);
  assert.equal(store.hashes[0], store.hashes[1]);
});

test("storage failures never return success or expose email and provider errors", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const store = repository();
  store.save = async () => { throw new Error("secret postgres URL collector@example.com"); };
  const response = await registerNewsletter(request(), store, env);
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.doesNotMatch(body, /collector@example|postgres|secret|success/);
  assert.equal(log.mock.callCount(), 1);
  assert.doesNotMatch(String(log.mock.calls[0]!.arguments), /collector@example|postgres|secret/);
});

test("localhost works with an explicit secret and a shared development quota", async () => {
  const store = repository();
  const response = await registerNewsletter(request(undefined, { Origin: "http://localhost:3101" }, "http://localhost:3101/api/newsletter"), store, { NODE_ENV: "development", NEWSLETTER_IP_HASH_SECRET: env.NEWSLETTER_IP_HASH_SECRET });
  assert.equal(response.status, 200);
  assert.deepEqual(store.emails, ["collector@example.com"]);
});
