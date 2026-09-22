import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import type { CycleResult } from "../lib/types.ts";
import type { DeliveryStore } from "../ingress/deliveries.ts";
import { handleMetadata, handleQuickNode, handleRun, handleStatus } from "../ingress/handlers.ts";

const secret = "test-secret-is-not-a-production-security-token";
const now = 1_800_000_000_000;
const env = { CRON_SECRET: secret, QUICKNODE_WEBHOOK_SECRET: secret };
const good: CycleResult = { ok: true, chainId: 11155111, confirmedBlock: 123, results: [{ collectionId: "registered-id", status: "updated" }], elapsedMs: 20 };
function request(payload = '{"data":{"contract":"attacker-address","minted":100000}}') {
  const nonce = "provider-nonce", timestamp = String(now / 1000);
  return new Request("https://indexer.example/api/indexer/quicknode", { method: "POST", headers: { "content-type": "application/json", "x-qn-nonce": nonce, "x-qn-timestamp": timestamp, "x-qn-signature": createHmac("sha256", secret).update(nonce + timestamp + payload).digest("hex") }, body: payload });
}
function deliveries(overrides: Partial<DeliveryStore> = {}): DeliveryStore {
  return { claim: async () => ({ state: "claimed", token: "lease" }), complete: async () => true, release: async () => {}, ...overrides };
}

test("unauthorized cron or status calls never initialize chain/database work", async () => {
  let calls = 0;
  const run = async () => { calls++; return good; };
  const status = async () => { calls++; return {}; };
  assert.equal((await handleRun(new Request("https://indexer.example"), { env, run })).status, 401);
  assert.equal((await handleStatus(new Request("https://indexer.example"), { env, status })).status, 401);
  assert.equal((await handleMetadata(new Request("https://indexer.example"), { env, run })).status, 401);
  assert.equal(calls, 0);
});

test('metadata cron reports explorer failures independently from successful chain indexing', async () => {
  const request = () => new Request('https://indexer.example/api/indexer/metadata',{ headers: { authorization: `Bearer ${secret}` } });
  assert.equal((await handleMetadata(request(),{ env,run: async () => ({ ok: false,results: [{ status: 'blocked' }] }) })).status,503);
  assert.equal((await handleMetadata(request(),{ env,run: async () => ({ ok: true,results: [{ status: 'verifying' }] }) })).status,200);
  assert.equal((await handleRun(request(),{ env,run: async () => good })).status,200);
});

test("cron returns success only after a complete persisted cycle", async () => {
  const authorized = () => new Request("https://indexer.example", { headers: { authorization: `Bearer ${secret}` } });
  assert.equal((await handleRun(authorized(), { env, run: async () => good })).status, 200);
  for (const status of ["leased", "behind", "failed"] as const) {
    const result = await handleRun(authorized(), { env, run: async () => ({ ...good, results: [{ collectionId: "id", status }] }) });
    assert.equal(result.status, 503);
    assert.equal(result.headers.get("retry-after"), "30");
  }
});

test("dependency failures never leak RPC URLs, database credentials or stack traces", async () => {
  const response = await handleRun(new Request("https://indexer.example", { headers: { authorization: `Bearer ${secret}` } }), { env, run: async () => { throw new Error("postgres://user:private@host and https://rpc/private-token"); } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "indexer_temporarily_unavailable" });
});

test("valid webhook is only a wake-up hint and completion follows the persisted cycle", async () => {
  const calls: string[] = [];
  const response = await handleQuickNode(request(), { env, now: () => now, deliveries: () => deliveries({ claim: async value => { assert.deepEqual(Object.keys(value).sort(), ["deliveryId", "payloadHash", "signedAt"]); calls.push("claim"); return { state: "claimed", token: "lease" }; }, complete: async () => { calls.push("complete"); return true; } }), run: async (...args) => { assert.equal(args.length, 0); calls.push("cycle"); return good; } });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["claim", "cycle", "complete"]);
  assert.deepEqual(await response.json(), { ok: true, duplicate: false, confirmedBlock: 123 });
});

test("completed signed replay is acknowledged without running indexing again", async () => {
  let calls = 0;
  const response = await handleQuickNode(request(), { env, now: () => now, deliveries: () => deliveries({ claim: async () => ({ state: "completed" }) }), run: async () => { calls++; return good; } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, duplicate: true });
  assert.equal(calls, 0);
});

test("concurrent nonce lease and reused nonce with changed payload do not run indexing", async () => {
  let calls = 0;
  for (const [state, expectedStatus] of [["busy", 503], ["conflict", 409]] as const) {
    const response = await handleQuickNode(request(), { env, now: () => now, deliveries: () => deliveries({ claim: async () => ({ state }) }), run: async () => { calls++; return good; } });
    assert.equal(response.status, expectedStatus);
  }
  assert.equal(calls, 0);
});

test("failed or incomplete indexing releases the delivery for retry without marking it complete", async () => {
  for (const run of [async () => { throw new Error("private RPC error"); }, async () => ({ ...good, ok: false }), async () => ({ ...good, results: [{ collectionId: "id", status: "behind" as const }] })]) {
    let released = 0, completed = 0;
    const response = await handleQuickNode(request(), { env, now: () => now, deliveries: () => deliveries({ release: async () => { released++; }, complete: async () => { completed++; return true; } }), run });
    assert.equal(response.status, 503);
    assert.equal(released, 1);
    assert.equal(completed, 0);
  }
});

test("database completion failure or expired delivery lease is retryable", async () => {
  for (const complete of [async () => { throw new Error("DB down"); }, async () => false]) {
    let released = 0;
    const response = await handleQuickNode(request(), { env, now: () => now, deliveries: () => deliveries({ complete, release: async () => { released++; } }), run: async () => good });
    assert.equal(response.status, 503);
    assert.equal(released, 1);
  }
});

test("invalid authentication never opens a pool or invokes the indexer", async () => {
  let calls = 0;
  const forged = request(); forged.headers.set("x-qn-signature", "0".repeat(64));
  assert.equal((await handleQuickNode(forged, { env, now: () => now, deliveries: () => { calls++; return deliveries(); }, run: async () => { calls++; return good; } })).status, 401);
  assert.equal(calls, 0);
});
