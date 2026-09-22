const READ_METHODS = new Set(["eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_call"]);
const RETRYABLE_HTTP = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 2000;

/** Never expose a provider URL, response body, headers, or nested fetch error. */
export class RpcReadUnavailable extends Error {
  constructor() { super("Ethereum data is temporarily unavailable."); }
}
/** A canonical call reverted; distinct from provider downtime for transaction simulation. */
export class RpcReadReverted extends Error {
  readonly data: string;
  constructor(data: string) { super("The contract rejected this call."); this.data = data; }
}
type Job = { task: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (error: unknown) => void; signal: AbortSignal; abort: () => void };

/** Per-process pacing limits bursts; it cannot enforce an account quota across serverless instances. */
export function createRpcReadLimiter({ maxConcurrent = 4, minIntervalMs = 40 } = {}) {
  let active = 0, nextStart = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queue: Job[] = [];
  function pump() {
    if (timer || active >= maxConcurrent || queue.length === 0) return;
    const delay = nextStart - Date.now();
    if (delay > 0) { timer = setTimeout(() => { timer = undefined; pump(); }, delay); return; }
    const job = queue.shift()!;
    job.signal.removeEventListener("abort", job.abort);
    if (job.signal.aborted) { job.reject(new RpcReadUnavailable()); pump(); return; }
    active++; nextStart = Date.now() + minIntervalMs;
    Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => { active--; pump(); });
    pump();
  }
  return {
    run<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (signal.aborted) { reject(new RpcReadUnavailable()); return; }
        const job: Job = { task, resolve: value => resolve(value as T), reject, signal, abort: () => {
          const index = queue.indexOf(job);
          if (index >= 0) queue.splice(index, 1);
          reject(new RpcReadUnavailable());
          if (!queue.length && timer) { clearTimeout(timer); timer = undefined; }
        } };
        signal.addEventListener("abort", job.abort, { once: true });
        queue.push(job); pump();
      });
    },
  };
}
const endpointLimiters = new Map<string, ReturnType<typeof createRpcReadLimiter>>();

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new RpcReadUnavailable()); return; }
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); reject(new RpcReadUnavailable()); };
    signal.addEventListener("abort", abort, { once: true });
  });
}
function retryDelay(header: string | null, attempt: number, random: () => number): number {
  const backoff = 500 * 2 ** attempt + Math.floor(random() * 200);
  if (!header) return backoff;
  const seconds = /^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(seconds)) return backoff;
  // A provider requesting a longer cooldown is unavailable for this bounded request.
  // Fail rather than retry earlier than its Retry-After instruction.
  if (seconds > MAX_RETRY_DELAY_MS) throw new RpcReadUnavailable();
  return Math.max(backoff, seconds, 0);
}

export function createReadRpc(url: string, options: {
  fetch?: typeof fetch; timeoutMs?: number; sleep?: typeof sleep; random?: () => number;
  limiter?: ReturnType<typeof createRpcReadLimiter>; allowCallReverts?: boolean;
} = {}) {
  const fetcher = options.fetch ?? fetch;
  const pause = options.sleep ?? sleep;
  const random = options.random ?? Math.random;
  let limiter = options.limiter ?? endpointLimiters.get(url);
  if (!limiter) { limiter = createRpcReadLimiter(); endpointLimiters.set(url, limiter); }
  let requestId = 0;
  return async function rpc(method: string, params: unknown[]): Promise<any> {
    if (!READ_METHODS.has(method)) throw new RpcReadUnavailable();
    const id = ++requestId;
    // Exact method, params, block hash and ID are preserved on every attempt.
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const controller = new AbortController();
    const timeoutMs = Math.min(options.timeoutMs ?? 12_000, 12_000);
    const deadline = Date.now() + timeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const result = await limiter.run(async () => {
          if (controller.signal.aborted || Date.now() >= deadline) throw new RpcReadUnavailable();
          const response = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json" }, body,
            cache: "no-store", signal: controller.signal, redirect: "error" });
          if (!response.ok) {
            await response.body?.cancel();
            if (RETRYABLE_HTTP.has(response.status)) return { retry: true as const, header: response.headers.get("Retry-After") };
            throw new RpcReadUnavailable();
          }
          const payload = await response.json();
          if (payload?.jsonrpc !== "2.0" || payload.id !== id) throw new RpcReadUnavailable();
          if (payload.error?.code === 429) return { retry: true as const, header: response.headers.get("Retry-After") };
          if (options.allowCallReverts && method === "eth_call" && payload.error && /^0x[0-9a-f]{8,}$/i.test(payload.error.data ?? "")) throw new RpcReadReverted(payload.error.data);
          if (payload.error || payload.result === undefined || payload.result === null) throw new RpcReadUnavailable();
          return { retry: false as const, value: payload.result };
        }, controller.signal);
        if (controller.signal.aborted || Date.now() >= deadline) throw new RpcReadUnavailable();
        if (!result.retry) return result.value;
        if (attempt + 1 === MAX_ATTEMPTS) throw new RpcReadUnavailable();
        const delay = retryDelay(result.header, attempt, random);
        if (Date.now() + delay >= deadline) throw new RpcReadUnavailable();
        await pause(delay, controller.signal);
      }
      throw new RpcReadUnavailable();
    } catch (error) { if (options.allowCallReverts && error instanceof RpcReadReverted) throw error; throw new RpcReadUnavailable(); }
    finally { clearTimeout(timer); }
  };
}
