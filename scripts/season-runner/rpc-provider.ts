import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { FetchRequest, JsonRpcProvider } from "ethers";
import type { JsonRpcError, JsonRpcPayload, JsonRpcResult } from "ethers";

type RpcResponse = JsonRpcResult | JsonRpcError;
const READ_METHODS = new Set([
  "eth_chainId", "net_version", "eth_blockNumber", "eth_call", "eth_estimateGas", "eth_getCode", "eth_getBalance", "eth_getStorageAt", "eth_getProof",
  "eth_getTransactionCount", "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getLogs",
  "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_getBlockTransactionCountByHash", "eth_getBlockTransactionCountByNumber",
]);
const stopped = () => new Error("rpc_provider_destroyed");
function checkAbort(signal: AbortSignal) { if (signal.aborted) throw stopped(); }
type Waiting = { count: number; signal: AbortSignal; resolve: () => void; reject: (error: Error) => void; abort: () => void };

/** Counts individual JSON-RPC methods, including methods bundled in one HTTP request. */
export class RpcRequestLimiter {
  private readonly timestamps: number[] = [];
  private readonly waiting: Waiting[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(readonly limit = 20, readonly windowMs = 1000) {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) throw new Error("invalid_rpc_rate_policy");
  }
  acquire(count: number, signal: AbortSignal): Promise<void> {
    if (!Number.isSafeInteger(count) || count < 1 || count > this.limit) return Promise.reject(new Error("invalid_rpc_batch_size"));
    if (signal.aborted) return Promise.reject(stopped());
    return new Promise((resolve, reject) => {
      const item: Waiting = { count, signal, resolve, reject, abort: () => {
        const index = this.waiting.indexOf(item);
        if (index >= 0) this.waiting.splice(index, 1);
        signal.removeEventListener("abort", item.abort); reject(stopped()); this.drain();
      } };
      this.waiting.push(item); signal.addEventListener("abort", item.abort, { once: true }); this.drain();
    });
  }
  private drain() {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    const now = performance.now();
    while (this.timestamps.length && this.timestamps[0] <= now - this.windowMs) this.timestamps.shift();
    while (this.waiting.length) {
      const next = this.waiting[0];
      if (next.count + this.timestamps.length > this.limit) {
        this.timer = setTimeout(() => { this.timer = undefined; this.drain(); }, Math.max(1, Math.ceil(this.timestamps[0] + this.windowMs - now)));
        return;
      }
      this.waiting.shift(); next.signal.removeEventListener("abort", next.abort);
      for (let index = 0; index < next.count; index++) this.timestamps.push(now);
      next.resolve();
    }
  }
}
// Keeping recent timestamps across provider destruction prevents fast setup/adapter
// handoffs from resetting the endpoint budget. Keys contain no authenticated URLs.
const endpointLimits = new Map<string, RpcRequestLimiter>();
function endpointLimiter(url: string) {
  const key = createHash("sha256").update(new URL(url).href).digest("hex");
  let limiter = endpointLimits.get(key);
  if (!limiter) { limiter = new RpcRequestLimiter(); endpointLimits.set(key, limiter); }
  return limiter;
}
function wait(ms: number, signal: AbortSignal): Promise<void> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(stopped()); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export class RpcHttpRateLimitError extends Error {
  constructor(readonly retryAfterMs = 0) { super("rpc_http_rate_limited"); }
}
export function isRateLimitedRead(payload: JsonRpcPayload, response: RpcResponse): boolean {
  if (!READ_METHODS.has(payload.method) || !("error" in response)) return false;
  const { code, message = "" } = response.error;
  return code === 429 || [-32007, -32005].includes(code) && /rate.?limit|too many requests|\d+\s*\/second|requests? per second|reduce calls per second/i.test(message);
}

/** Dynamic network verification remains enabled; only rate-limited reads may retry. */
export class WorkerRpcProvider extends JsonRpcProvider {
  private readonly limiter: RpcRequestLimiter;
  private readonly abortController = new AbortController();
  private readonly active = new Set<FetchRequest>();
  protected readonly retryDelaysMs = [1000, 2000, 4000];
  constructor(url: string) {
    // Canonical before/after anchors must be new reads, including within one
    // event loop; ethers' default 250ms result cache would hide a changed block.
    super(url, undefined, { batchMaxCount: 10, batchStallTime: 10, cacheTimeout: -1 });
    this.limiter = endpointLimiter(url);
  }
  /** Mirrors installed ethers' HTTP transport, explicitly disabling its implicit
   * HTTP-429 retry so a transaction broadcast is never retried beneath its journal. */
  protected async sendOnce(payload: JsonRpcPayload[]): Promise<RpcResponse[]> {
    checkAbort(this.abortController.signal);
    const request = this._getConnection();
    request.body = JSON.stringify(payload.length === 1 ? payload[0] : payload);
    request.setHeader("content-type", "application/json");
    request.retryFunc = async () => false;
    request.setThrottleParams({ maxAttempts: 1 });
    request.timeout = 20000;
    this.active.add(request);
    try {
      const response = await request.send();
      checkAbort(this.abortController.signal);
      if (response.statusCode === 429) {
        const value = response.headers["retry-after"];
        // Retry-After values beyond 30s stop this bounded attempt for operator review.
        const delay = /^\d+$/.test(value ?? "") ? Number(value) * 1000 : 0;
        throw new RpcHttpRateLimitError(delay);
      }
      response.assertOk();
      const decoded: unknown = response.bodyJson;
      return (Array.isArray(decoded) ? decoded : [decoded]) as RpcResponse[];
    } finally { this.active.delete(request); }
  }
  override async _send(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<JsonRpcResult[]> {
    const original = Array.isArray(payload) ? payload : [payload];
    if (!original.length || original.length > 10) throw new Error("invalid_rpc_batch_size");
    let pending = original;
    const completed = new Map<number, RpcResponse>();
    for (let attempt = 0; ; attempt++) {
      checkAbort(this.abortController.signal);
      await this.limiter.acquire(pending.length, this.abortController.signal);
      checkAbort(this.abortController.signal);
      let responses: RpcResponse[];
      try { responses = await this.sendOnce(pending); }
      catch (error) {
        checkAbort(this.abortController.signal);
        if (!(error instanceof RpcHttpRateLimitError) || !pending.every(item => READ_METHODS.has(item.method))
          || attempt >= this.retryDelaysMs.length || error.retryAfterMs > 30000) throw error;
        await wait(Math.max(this.retryDelaysMs[attempt], error.retryAfterMs), this.abortController.signal);
        continue;
      }
      // Unknown, missing or duplicate IDs must preserve ethers' normal error handling;
      // never treat malformed responses as a reason to replay requests.
      if (responses.length !== pending.length || responses.some(response => !response || typeof response !== "object"
        || !pending.some(item => item.id === response.id)) || new Set(responses.map(item => item.id)).size !== pending.length) {
        return [...completed.values(), ...responses] as JsonRpcResult[];
      }
      const retry: JsonRpcPayload[] = [];
      for (const item of pending) {
        const response = responses.find(value => value.id === item.id)!;
        if (attempt < this.retryDelaysMs.length && isRateLimitedRead(item, response)) retry.push(item);
        else completed.set(item.id, response);
      }
      if (!retry.length) return original.map(item => completed.get(item.id)!) as JsonRpcResult[];
      await wait(this.retryDelaysMs[attempt], this.abortController.signal);
      pending = retry;
    }
  }
  override destroy(): void {
    this.abortController.abort();
    for (const request of this.active) { try { request.cancel(); } catch { /* A completed transport needs no cancellation. */ } }
    super.destroy();
  }
}
export const createWorkerRpcProvider = (url: string) => new WorkerRpcProvider(url);
