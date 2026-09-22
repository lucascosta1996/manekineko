import type { CycleResult } from "../lib/types.ts";
import { authenticateCron, authenticateQuickNode, IngressError } from "./auth.ts";
import type { DeliveryStore } from "./deliveries.ts";

interface IngressEnvironment { CRON_SECRET?: string; QUICKNODE_WEBHOOK_SECRET?: string }
interface Dependencies {
  run: () => Promise<CycleResult>;
  env?: IngressEnvironment;
}

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(status === 503 ? { "Retry-After": "30" } : {}) },
  });
}

function failure(error: unknown): Response {
  // RPC URLs, database errors and provider response bodies can contain credentials.
  return error instanceof IngressError
    ? response({ ok: false, error: error.code }, error.status)
    : response({ ok: false, error: "indexer_temporarily_unavailable" }, 503);
}

function completedCycle(result: CycleResult): boolean {
  return result.ok && result.results.every(({ status }) => status === "updated" || status === "caught_up");
}

export async function handleRun(request: Request, dependencies: Dependencies): Promise<Response> {
  try {
    authenticateCron(request, (dependencies.env ?? process.env).CRON_SECRET);
    const result = await dependencies.run();
    return response(result, completedCycle(result) ? 200 : 503);
  } catch (error) {
    return failure(error);
  }
}

export async function handleStatus(request: Request, dependencies: { status: () => Promise<unknown>; env?: IngressEnvironment }): Promise<Response> {
  try {
    authenticateCron(request, (dependencies.env ?? process.env).CRON_SECRET);
    return response(await dependencies.status());
  } catch (error) {
    return failure(error);
  }
}

export async function handleMetadata(request: Request, dependencies: { run: () => Promise<{ ok: boolean }>; env?: IngressEnvironment }): Promise<Response> {
  try {
    authenticateCron(request, (dependencies.env ?? process.env).CRON_SECRET);
    const result = await dependencies.run();
    return response(result, result.ok ? 200 : 503);
  } catch (error) { return failure(error); }
}

export async function handleQuickNode(
  request: Request,
  dependencies: Dependencies & { deliveries: () => DeliveryStore; now?: () => number },
): Promise<Response> {
  let claimed: { deliveryId: string; token: string; store: DeliveryStore } | undefined;
  try {
    const delivery = await authenticateQuickNode(request, (dependencies.env ?? process.env).QUICKNODE_WEBHOOK_SECRET, dependencies.now?.());
    const store = dependencies.deliveries();
    const claim = await store.claim(delivery);
    if (claim.state === "completed") return response({ ok: true, duplicate: true });
    if (claim.state === "conflict") throw new IngressError(409, "webhook_nonce_conflict");
    if (claim.state === "busy") throw new IngressError(503, "webhook_in_progress");
    claimed = { deliveryId: delivery.deliveryId, token: claim.token, store };
    // The verified payload is deliberately absent from this call. The cycle reads
    // registered deployments, canonical logs and state from the configured chain.
    const result = await dependencies.run();
    if (!completedCycle(result)) throw new IngressError(503, "indexer_catching_up");
    if (!await store.complete(delivery.deliveryId, claim.token)) throw new IngressError(503, "webhook_lease_expired");
    return response({ ok: true, duplicate: false, confirmedBlock: result.confirmedBlock });
  } catch (error) {
    if (claimed) {
      // If the database is unavailable the lease expires, so retry remains safe.
      await claimed.store.release(claimed.deliveryId, claimed.token).catch(() => undefined);
    }
    return failure(error);
  }
}
