import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { authenticateCron, authenticateQuickNode, IngressError, MAX_WEBHOOK_BODY_BYTES } from "../ingress/auth.ts";

const secret = "test-secret-is-not-a-production-security-token";
const now = 1_800_000_000_000;
const body = '{ "data": [{"message":"猫", "minted":999999}] }';

function webhook(options: { payload?: string; wire?: Buffer; timestamp?: string; nonce?: string; signature?: string; encoding?: string; headers?: Record<string, string> } = {}): Request {
  const payload = options.payload ?? body;
  const nonce = options.nonce ?? "nonce-01";
  const timestamp = options.timestamp ?? String(now / 1000);
  const signature = options.signature ?? createHmac("sha256", secret).update(nonce + timestamp + payload).digest("hex");
  const wire = options.wire ?? Buffer.from(payload);
  return new Request("https://indexer.example/api/indexer/quicknode", {
    method: "POST",
    headers: { "content-type": "application/json", "x-qn-nonce": nonce, "x-qn-timestamp": timestamp, "x-qn-signature": signature, ...(options.encoding ? { "content-encoding": options.encoding } : {}), ...options.headers },
    body: new Uint8Array(wire),
  });
}

function rejectsStatus(status: number) {
  return (error: unknown) => error instanceof IngressError && error.status === status;
}

test("cron accepts the bearer header only, never a query token", () => {
  assert.doesNotThrow(() => authenticateCron(new Request("https://indexer.example/api/indexer/run", { headers: { authorization: `Bearer ${secret}` } }), secret));
  assert.throws(() => authenticateCron(new Request(`https://indexer.example/api/indexer/run?secret=${secret}`), secret), rejectsStatus(401));
  assert.throws(() => authenticateCron(new Request("https://indexer.example", { headers: { authorization: `Bearer ${secret}extra` } }), secret), rejectsStatus(401));
});

test("cron fails closed when the secret is absent or too short", () => {
  for (const configured of [undefined, "", "weak"]) assert.throws(() => authenticateCron(new Request("https://indexer.example"), configured), rejectsStatus(503));
});

test("valid signature preserves exact Unicode payload and exposes no payload authority", async () => {
  const verified = await authenticateQuickNode(webhook(), secret, now);
  assert.match(verified.deliveryId, /^[0-9a-f]{64}$/);
  assert.match(verified.payloadHash, /^[0-9a-f]{64}$/);
  assert.equal(verified.signedAt.getTime(), now);
  assert.deepEqual(Object.keys(verified).sort(), ["deliveryId", "payloadHash", "signedAt"]);
});

test("gzip verifies the uncompressed string, not compressed wire bytes", async () => {
  assert.deepEqual(await authenticateQuickNode(webhook({ wire: gzipSync(body), encoding: "gzip" }), secret, now), await authenticateQuickNode(webhook(), secret, now));
  const signedCompressed = createHmac("sha256", secret).update("nonce-01" + String(now / 1000)).update(gzipSync(body)).digest("hex");
  await assert.rejects(authenticateQuickNode(webhook({ wire: gzipSync(body), encoding: "gzip", signature: signedCompressed }), secret, now), rejectsStatus(401));
});

test("forged signatures and modified whitespace are rejected", async () => {
  await assert.rejects(authenticateQuickNode(webhook({ signature: "a".repeat(64) }), secret, now), rejectsStatus(401));
  await assert.rejects(authenticateQuickNode(webhook({ wire: Buffer.from(JSON.stringify(JSON.parse(body))) }), secret, now), rejectsStatus(401));
});

test("malformed signature lengths and non-hex encodings fail before decoding", async () => {
  for (const signature of ["", "aa", "a".repeat(63), "a".repeat(66), "x".repeat(64), "0x" + "a".repeat(64)]) {
    await assert.rejects(authenticateQuickNode(webhook({ signature }), secret, now), rejectsStatus(401));
  }
});

test("missing authentication and unexpected nonce formats fail closed", async () => {
  for (const nonce of ["", "a,b", "a b", "a".repeat(257)]) await assert.rejects(authenticateQuickNode(webhook({ nonce }), secret, now), rejectsStatus(401));
  await assert.rejects(authenticateQuickNode(webhook(), undefined, now), rejectsStatus(503));
});

test("stale and far-future timestamps are rejected while slight clock skew is allowed", async () => {
  for (const timestamp of [String(now / 1000 - 301), String(now / 1000 + 31), String(now), "not-time", "1800000000.0"]) {
    await assert.rejects(authenticateQuickNode(webhook({ timestamp }), secret, now), rejectsStatus(401));
  }
  await authenticateQuickNode(webhook({ timestamp: String(now / 1000 + 30) }), secret, now);
  await authenticateQuickNode(webhook({ timestamp: String(now / 1000 - 300) }), secret, now);
});

test("bounded body does not rely on Content-Length", async () => {
  await assert.rejects(authenticateQuickNode(webhook({ payload: "a".repeat(MAX_WEBHOOK_BODY_BYTES + 1) }), secret, now), rejectsStatus(413));
  await assert.rejects(authenticateQuickNode(webhook({ headers: { "content-length": String(MAX_WEBHOOK_BODY_BYTES + 1) } }), secret, now), rejectsStatus(413));
});

test("gzip expansion and invalid compressed input are bounded", async () => {
  const huge = "a".repeat(MAX_WEBHOOK_BODY_BYTES + 1);
  await assert.rejects(authenticateQuickNode(webhook({ payload: huge, wire: gzipSync(huge), encoding: "gzip" }), secret, now), rejectsStatus(413));
  await assert.rejects(authenticateQuickNode(webhook({ encoding: "gzip" }), secret, now), rejectsStatus(400));
});

test("unsupported encodings and content types are rejected", async () => {
  await assert.rejects(authenticateQuickNode(webhook({ encoding: "br" }), secret, now), rejectsStatus(415));
  await assert.rejects(authenticateQuickNode(webhook({ headers: { "content-type": "text/plain" } }), secret, now), rejectsStatus(415));
});

test("invalid UTF-8 is rejected instead of silently replacing bytes", async () => {
  await assert.rejects(authenticateQuickNode(webhook({ wire: Buffer.from([0xc3, 0x28]) }), secret, now), rejectsStatus(400));
});

test("authenticated but invalid or scalar JSON does not trigger indexing", async () => {
  for (const payload of ["{", "null", "true", '"string"']) await assert.rejects(authenticateQuickNode(webhook({ payload }), secret, now), rejectsStatus(400));
});
