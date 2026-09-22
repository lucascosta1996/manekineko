import assert from "node:assert/strict";
import test from "node:test";
import { createReadRpc, createRpcReadLimiter, RpcReadUnavailable } from "../lib/affiliates/rpc-read-transport.ts";

const secretUrl = "https://example.invalid/private-rpc-credential";
const blockHash = `0x${"1".repeat(64)}`;
const params = [{ to: `0x${"2".repeat(40)}`, data: "0x12345678" }, { blockHash, requireCanonical: true }];
const options = { limiter: createRpcReadLimiter({ minIntervalMs: 0 }), random: () => 0 };
const reply = (init: RequestInit | undefined, value: unknown = "0x1") => Response.json({ jsonrpc: "2.0", id: JSON.parse(String(init?.body)).id, result: value });

test("read RPC recovers from 429 and preserves the exact request ID, params and canonical block", async () => {
  const bodies: string[] = [], waits: number[] = [];
  const rpc = createReadRpc(secretUrl, { ...options, sleep: async ms => { waits.push(ms); }, fetch: async (_url, init) => {
    bodies.push(String(init?.body));
    return bodies.length === 1 ? new Response("private diagnostic", { status: 429, headers: { "Retry-After": "1" } }) : reply(init);
  } });
  assert.equal(await rpc("eth_call", params), "0x1");
  assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(JSON.parse(bodies[0]).params, params); assert.deepEqual(waits, [1000]);
});

test("transient gateway errors and explicit JSON-RPC 429 recover with bounded delayed attempts", async () => {
  for (const status of [502, 503, 504, "rpc429"] as const) {
    let calls = 0; const waits: number[] = [];
    const rpc = createReadRpc(secretUrl, { ...options, sleep: async ms => { waits.push(ms); }, fetch: async (_url, init) => {
      calls++;
      if (calls === 1) return status === "rpc429"
        ? Response.json({ jsonrpc: "2.0", id: JSON.parse(String(init?.body)).id, error: { code: 429, message: "rate limit" } })
        : new Response(null, { status });
      return reply(init, "0x");
    } });
    assert.equal(await rpc("eth_getCode", [params[0].to, params[1]]), "0x");
    assert.equal(calls, 2); assert.deepEqual(waits, [500]);
  }
});

test("persistent throttling stops after three attempts and never exposes provider diagnostics", async () => {
  let calls = 0; const waits: number[] = [];
  const rpc = createReadRpc(secretUrl, { ...options, sleep: async ms => { waits.push(ms); }, fetch: async () => {
    calls++; return new Response(secretUrl, { status: 429 });
  } });
  await assert.rejects(rpc("eth_chainId", []), error => {
    assert.ok(error instanceof RpcReadUnavailable);
    assert.equal(error.message, "Ethereum data is temporarily unavailable.");
    assert.equal(error.cause, undefined); assert.ok(!error.stack?.includes(secretUrl)); return true;
  });
  assert.equal(calls, 3); assert.deepEqual(waits, [500, 1000]);
});

test("authentication, RPC reverts, malformed responses and unclassified transport failures are not retried", async () => {
  const failures = [
    () => new Response(null, { status: 401 }), () => new Response(null, { status: 403 }), () => new Response(null, { status: 400 }),
    () => Response.json({ jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted" } }),
    () => Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "unclassified" } }),
    () => Response.json({ jsonrpc: "2.0", id: 2, result: "wrong response" }),
    () => Response.json({ jsonrpc: "2.0", id: 1, result: null }),
    () => new Response("invalid-json"), () => { throw new Error(secretUrl); },
  ];
  for (const response of failures) {
    let calls = 0;
    const rpc = createReadRpc(secretUrl, { ...options, sleep: async () => { assert.fail("must not retry"); }, fetch: async () => { calls++; return response(); } });
    await assert.rejects(rpc("eth_call", params), RpcReadUnavailable); assert.equal(calls, 1);
  }
});

test("a long provider cooldown or insufficient remaining deadline fails without premature retries", async () => {
  for (const [retryAfter, timeoutMs] of [["60", 12000], ["1", 20]] as const) {
    let calls = 0;
    const rpc = createReadRpc(secretUrl, { ...options, timeoutMs, sleep: async () => { assert.fail("must not retry before provider allows"); },
      fetch: async () => { calls++; return new Response(null, { status: 429, headers: { "Retry-After": retryAfter } }); } });
    await assert.rejects(rpc("eth_chainId", []), RpcReadUnavailable); assert.equal(calls, 1);
  }
});

test("the deadline spans retries instead of resetting for every attempt", async () => {
  let calls = 0, waits = 0;
  const rpc = createReadRpc(secretUrl, { ...options, timeoutMs: 550, sleep: async () => { waits++; },
    fetch: async () => { calls++; return new Response(null, { status: 429 }); } });
  await assert.rejects(rpc("eth_chainId", []), RpcReadUnavailable);
  assert.equal(calls, 2); assert.equal(waits, 1); // Next 1s backoff cannot fit the original 550ms budget.
});

test("bounded concurrency and pacing limit bursts without caching read results", async () => {
  const limiter = createRpcReadLimiter({ maxConcurrent: 2, minIntervalMs: 10 });
  let active = 0, maximum = 0; const starts: number[] = [];
  const rpc = createReadRpc(secretUrl, { limiter, fetch: async (_url, init) => {
    active++; maximum = Math.max(maximum, active); starts.push(Date.now());
    await new Promise(resolve => setTimeout(resolve, 25)); active--; return reply(init);
  } });
  await Promise.all(Array.from({ length: 6 }, () => rpc("eth_call", params)));
  assert.equal(starts.length, 6); assert.ok(maximum <= 2);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 9);
});

test("expired queued reads are removed and cannot run after their request deadline", async () => {
  const limiter = createRpcReadLimiter({ maxConcurrent: 1, minIntervalMs: 0 });
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    await new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error(secretUrl)), { once: true }));
    return reply(init);
  };
  const active = createReadRpc(secretUrl, { limiter, timeoutMs: 30, fetch: fetcher });
  const queued = createReadRpc(secretUrl, { limiter, timeoutMs: 10, fetch: fetcher });
  const results = await Promise.allSettled([active("eth_call", params), queued("eth_call", params)]);
  assert.equal(calls, 1); assert.ok(results.every(result => result.status === "rejected" && result.reason instanceof RpcReadUnavailable));
});

test("the retry transport refuses state-changing RPC methods before network access", async () => {
  const rpc = createReadRpc(secretUrl, { ...options, fetch: async () => { assert.fail("no network call allowed"); } });
  for (const method of ["eth_sendTransaction", "eth_sendRawTransaction", "personal_sign"]) await assert.rejects(rpc(method, []), RpcReadUnavailable);
});
