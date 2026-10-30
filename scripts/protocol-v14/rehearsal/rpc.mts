import { FetchRequest, JsonRpcProvider, type JsonRpcPayload } from 'ethers';

const readMethods = new Set(['eth_chainId', 'net_version', 'eth_blockNumber',
  'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getTransactionCount', 'eth_getBalance',
  'eth_getCode', 'eth_getLogs', 'eth_call', 'eth_estimateGas', 'eth_feeHistory',
  'eth_gasPrice', 'eth_maxPriorityFeePerGas']);
const transportCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ENETDOWN',
  'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT']);

/** Retry a lost read response only. Never replay a submission or signing request. */
export async function retryReadTransport<T>(payload: JsonRpcPayload | JsonRpcPayload[], send: () => Promise<T>) {
  const canRetry = (Array.isArray(payload) ? payload : [payload]).every(p => readMethods.has(p.method));
  for (let attempt = 0; ; attempt++) {
    try { return await send(); }
    catch (error) {
      const e = error as {code?: string; cause?: {code?: string}};
      if (!canRetry || attempt >= 2 || !transportCodes.has(String(e?.code ?? e?.cause?.code))) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

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
  const provider = new JsonRpcProvider(request, undefined, { batchMaxCount: 10 });
  const send = provider._send.bind(provider);
  provider._send = payload => retryReadTransport(payload, () => send(payload));
  return provider;
}

/** A provider quota error is retryable; an actual contract revert is not. */
export function retryableRpcError(error: unknown) {
  const e = error as { code?: string; info?: { error?: { code?: number; message?: string } } };
  return ['NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT'].includes(String(e?.code)) ||
    (e?.info?.error?.code === -32007 && /request limit|rate limit/i.test(e.info.error.message ?? ''));
}
