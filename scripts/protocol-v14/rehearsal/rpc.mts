import { FetchRequest, JsonRpcProvider } from 'ethers';

/** Keep each independent RPC below its per-second allowance even when all 50
 * wallets read or reconcile together. Cloned fetch requests share this clock. */
export function rehearsalProvider(url: string) {
  const request = new FetchRequest(url);
  request.timeout = 20000;
  let nextRequest = 0;
  request.preflightFunc = async req => {
    const scheduled = Math.max(Date.now(), nextRequest);
    nextRequest = scheduled + 500;
    const delay = scheduled - Date.now();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    return req;
  };
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 10 });
}

/** A provider quota error is retryable; an actual contract revert is not. */
export function retryableRpcError(error: unknown) {
  const e = error as { code?: string; info?: { error?: { code?: number; message?: string } } };
  return ['NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT'].includes(String(e?.code)) ||
    (e?.info?.error?.code === -32007 && /request limit|rate limit/i.test(e.info.error.message ?? ''));
}
