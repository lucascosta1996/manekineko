import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { FetchRequest } from "ethers";
import type { JsonRpcError, JsonRpcPayload, JsonRpcResult } from "ethers";
import { RpcHttpRateLimitError, RpcRequestLimiter, WorkerRpcProvider } from "./rpc-provider.ts";

type Response = JsonRpcResult | JsonRpcError;
const request = (id: number, method = "eth_getCode"): JsonRpcPayload => ({ jsonrpc: "2.0", id, method, params: [] });
const limited = (id: number): JsonRpcError => ({ id, error: { code: -32007, message: "50/second request limit reached - reduce calls per second" } });
let endpointSequence = 0;
class FakeProvider extends WorkerRpcProvider {
  protected override readonly retryDelaysMs = [1, 2, 4];
  readonly calls: { at: number; payload: JsonRpcPayload[] }[] = [];
  handler: (payload: JsonRpcPayload[], attempt: number) => Promise<Response[]> = async payload => payload.map(item => ({ id: item.id, result: "0x" }));
  constructor(url = `https://rpc.example/${++endpointSequence}`) { super(url); }
  protected override async sendOnce(payload: JsonRpcPayload[]) { this.calls.push({ at: performance.now(), payload }); return this.handler(payload, this.calls.length); }
}
function allMethods(calls: FakeProvider["calls"]) { return calls.flatMap(call => call.payload.map(item => ({ ...item, at: call.at }))); }

test("rolling limiter counts every method in concurrent batches and never exceeds its window", async () => {
  const limiter = new RpcRequestLimiter(3, 40), controller = new AbortController(), starts: number[] = [];
  await Promise.all(Array.from({ length: 9 }, async () => { await limiter.acquire(1, controller.signal); starts.push(performance.now()); }));
  for (let index = 3; index < starts.length; index++) assert(starts[index] - starts[index - 3] >= 38, "Only three calls may enter each rolling window");
  await assert.rejects(limiter.acquire(4, controller.signal), /invalid_rpc_batch_size/);
});
test("providers sharing a URL share the twenty-method budget; separate URLs have independent budgets", async () => {
  const url = `https://rpc.example/shared-${++endpointSequence}`, a = new FakeProvider(url), b = new FakeProvider(url), other = new FakeProvider();
  try {
    const batch = (start: number) => Array.from({ length: 10 }, (_, index) => request(start + index));
    await Promise.all([a._send(batch(1)), b._send(batch(11)), a._send(batch(21)), other._send(batch(31))]);
    const combined = allMethods([...a.calls, ...b.calls].sort((left, right) => left.at - right.at));
    assert.equal(combined.length, 30); assert(combined[20].at - combined[0].at >= 990);
    assert(other.calls[0].at - combined[0].at < 500);
  } finally { a.destroy(); b.destroy(); other.destroy(); }
});
test("destroying and recreating a provider does not reset its recent endpoint budget", async () => {
  const url = `https://rpc.example/recreated-${++endpointSequence}`, first = new FakeProvider(url);
  await first._send(Array.from({ length: 10 }, (_, id) => request(id)));
  await first._send(Array.from({ length: 10 }, (_, id) => request(id + 10)));
  const before = first.calls[0].at; first.destroy();
  const second = new FakeProvider(url);
  try { await second._send(request(21)); assert(second.calls[0].at - before >= 990); } finally { second.destroy(); }
});
test("partial rate-limited batches retry only failed allowlisted reads and preserve prior results", async () => {
  const provider = new FakeProvider();
  provider.handler = async (_payload, attempt) => attempt === 1 ? [{ id: 1, result: "ready" }, limited(2), limited(3)] : [{ id: 2, result: "retried-read" }];
  try {
    const result = await provider._send([request(1), request(2, "eth_chainId"), request(3, "eth_sendRawTransaction")]);
    assert.deepEqual(provider.calls.map(call => call.payload.map(item => item.id)), [[1, 2, 3], [2]]);
    assert.deepEqual(result, [{ id: 1, result: "ready" }, { id: 2, result: "retried-read" }, limited(3)]);
  } finally { provider.destroy(); }
});
test("read rate-limit retries stop after three retries while non-rate-limit failures never retry", async () => {
  const provider = new FakeProvider(); provider.handler = async payload => payload.map(item => limited(item.id));
  try { assert.deepEqual(await provider._send(request(1)), [limited(1)]); assert.equal(provider.calls.length, 4); } finally { provider.destroy(); }
  for (const failure of [{ code: -32000, message: "execution reverted" }, { code: -32007, message: "invalid request" }]) {
    const other = new FakeProvider(); other.handler = async () => [{ id: 2, error: failure }];
    try { await other._send(request(2)); assert.equal(other.calls.length, 1); } finally { other.destroy(); }
  }
  const transport = new FakeProvider(); transport.handler = async () => { throw new Error("socket_closed"); };
  try { await assert.rejects(transport._send(request(3)), /socket_closed/); assert.equal(transport.calls.length, 1); } finally { transport.destroy(); }
});
test("HTTP429 reads may retry, but broadcasts, mixed batches, unknown methods and long Retry-After never do", async () => {
  const read = new FakeProvider(); read.handler = async (payload, attempt) => { if (attempt === 1) throw new RpcHttpRateLimitError(); return [{ id: payload[0].id, result: "0x" }]; };
  try { await read._send(request(1)); assert.equal(read.calls.length, 2); } finally { read.destroy(); }
  for (const payload of [request(2, "eth_sendRawTransaction"), [request(3), request(4, "eth_sendRawTransaction")], request(5, "custom_method")]) {
    const provider = new FakeProvider(); provider.handler = async () => { throw new RpcHttpRateLimitError(); };
    try { await assert.rejects(provider._send(payload), /rpc_http_rate_limited/); assert.equal(provider.calls.length, 1); } finally { provider.destroy(); }
  }
  const long = new FakeProvider(); long.handler = async () => { throw new RpcHttpRateLimitError(31000); };
  try { await assert.rejects(long._send(request(6)), /rpc_http_rate_limited/); assert.equal(long.calls.length, 1); } finally { long.destroy(); }
});
test("underlying ethers FetchRequest automatic HTTP429 retry is disabled even for broadcasts", async () => {
  let calls = 0;
  class Http429Provider extends WorkerRpcProvider {
    override _getConnection() {
      const connection = new FetchRequest("https://rpc.example/fixture");
      connection.getUrlFunc = async () => { calls++; return { statusCode: 429, statusMessage: "Too Many Requests", headers: {}, body: new Uint8Array() }; };
      return connection;
    }
  }
  const provider = new Http429Provider(`https://rpc.example/http-${++endpointSequence}`);
  try { await assert.rejects(provider._send(request(1, "eth_sendRawTransaction")), /rpc_http_rate_limited/); assert.equal(calls, 1); } finally { provider.destroy(); }
});
test("an actual HTTP429 response reaches the bounded read retry and can recover", async () => {
  let calls = 0;
  class RecoveringHttpProvider extends WorkerRpcProvider {
    protected override readonly retryDelaysMs = [1];
    override _getConnection() {
      const connection = new FetchRequest("https://rpc.example/recovering");
      connection.getUrlFunc = async transport => {
        calls++;
        if (calls === 1) return { statusCode: 429, statusMessage: "Too Many Requests", headers: {}, body: new Uint8Array() };
        const payload = JSON.parse(Buffer.from(transport.body!).toString("utf8"));
        return { statusCode: 200, statusMessage: "OK", headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: "0xaa36a7" })) };
      };
      return connection;
    }
  }
  const provider = new RecoveringHttpProvider(`https://rpc.example/http-read-${++endpointSequence}`);
  try { assert.deepEqual(await provider._send(request(1, "eth_chainId")), [{ jsonrpc: "2.0", id: 1, result: "0xaa36a7" }]); assert.equal(calls, 2); } finally { provider.destroy(); }
});
test("network discovery remains dynamic and detects a changed chain", async () => {
  const provider = new FakeProvider(); let chain = "0xaa36a7";
  provider.handler = async payload => payload.map(item => ({ id: item.id, result: chain }));
  try {
    assert.equal((await provider.getNetwork()).chainId, 11155111n);
    chain = "0x1"; await assert.rejects(provider.getNetwork(), /network changed/);
    assert(provider.calls.length >= 2);
  } finally { provider.destroy(); }
});
test("consecutive reads of the same canonical anchor always reach the transport", async () => {
  const provider = new FakeProvider(); let blockReads = 0;
  provider.handler = async payload => payload.map(item => {
    if (item.method === "eth_chainId") return { id: item.id, result: "0xaa36a7" };
    assert.equal(item.method, "eth_getBlockByNumber");
    return { id: item.id, result: { number: "0x7b", timestamp: "0x64", hash: `0x${(++blockReads === 1 ? "ab" : "cd").repeat(32)}`,
      parentHash: `0x${"ef".repeat(32)}`, nonce: "0x0000000000000000", difficulty: "0x0", gasLimit: "0x100000", gasUsed: "0x0",
      miner: `0x${"11".repeat(20)}`, extraData: "0x", transactions: [], baseFeePerGas: "0x1" } };
  });
  try {
    const before = await provider.getBlock(123), after = await provider.getBlock(123);
    assert.equal(blockReads, 2); assert.notEqual(before!.hash, after!.hash);
  } finally { provider.destroy(); }
});
test("malformed and missing batch responses are returned without replaying any method", async () => {
  for (const responses of [[], [{ id: 99, result: "unknown" }], [{ id: 1, result: "duplicate" }, { id: 1, result: "duplicate" }]]) {
    const provider = new FakeProvider(); provider.handler = async () => responses;
    try { assert.deepEqual(await provider._send(request(1)), responses); assert.equal(provider.calls.length, 1); } finally { provider.destroy(); }
  }
});
test("destroy cancels queued limiter requests and retry backoff without blocking another provider", async () => {
  const url = `https://rpc.example/destroy-${++endpointSequence}`, a = new FakeProvider(url), b = new FakeProvider(url);
  try {
    await a._send(Array.from({ length: 10 }, (_, id) => request(id)));
    await a._send(Array.from({ length: 10 }, (_, id) => request(id + 10)));
    const pending = a._send(request(25)); const rejected = assert.rejects(pending, /rpc_provider_destroyed/); a.destroy(); await rejected;
    assert.equal(a.calls.length, 2); await b._send(request(26)); assert.equal(b.calls.length, 1);
  } finally { a.destroy(); b.destroy(); }
  class BackoffProvider extends FakeProvider { protected override readonly retryDelaysMs = [10000]; }
  const backoff = new BackoffProvider(); backoff.handler = async () => [limited(1)];
  const pending = backoff._send(request(1)), rejected = assert.rejects(pending, /rpc_provider_destroyed/);
  await new Promise(resolve => setTimeout(resolve, 5)); backoff.destroy(); await rejected; assert.equal(backoff.calls.length, 1);
});
test("destroy cancels an active HTTP request instead of waiting for the transport timeout", async () => {
  let started!: () => void; const didStart = new Promise<void>(resolve => { started = resolve; });
  class PendingProvider extends WorkerRpcProvider {
    override _getConnection() {
      const connection = new FetchRequest("https://rpc.example/pending");
      connection.getUrlFunc = async (_request, signal) => new Promise((_resolve, reject) => { signal!.addListener(() => reject(new Error("transport_cancelled"))); started(); });
      return connection;
    }
  }
  const provider = new PendingProvider(`https://rpc.example/active-${++endpointSequence}`);
  const pending = provider._send(request(1)), rejected = assert.rejects(pending, /rpc_provider_destroyed/);
  await didStart; provider.destroy(); await rejected;
});
