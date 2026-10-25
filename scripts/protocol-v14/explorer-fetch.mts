import { fetch as proxyFetch, ProxyAgent } from 'undici';
/** Optional HTTP(S) proxy for explorer API access; never expose its URL or key. */
export function explorerTransport() {
  const proxy = process.env.V14_EXPLORER_PROXY_URL;
  if (!proxy) return { fetcher: fetch, close: async () => {} };
  const url = new URL(proxy);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid explorer proxy protocol.');
  const dispatcher = new ProxyAgent(proxy);
  return { fetcher: ((url: any, options: any) => proxyFetch(url, { ...options, dispatcher })) as unknown as typeof fetch, close: () => dispatcher.close() };
}
