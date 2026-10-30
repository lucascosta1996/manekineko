import { FetchRequest, JsonRpcProvider, type Provider } from 'ethers';
import { observeV17At } from '../../../packages/protocol/src/social-v17.ts';
import type { Observation } from '../../../packages/contracts/src/social-delivery.ts';
import { SenderError, type SenderConfig } from './social-sender-store.ts';

export type Anchor = { number: number; hash: string; timestamp: number };
export function senderProviders(env: NodeJS.ProcessEnv = process.env): [JsonRpcProvider, JsonRpcProvider] {
  const urls = [env.SOCIAL_RPC_PRIMARY,env.SOCIAL_RPC_SECONDARY].map(raw=>{
    if (!raw) throw new SenderError('rpc_configuration');
    const u = new URL(raw);
    if (u.protocol!=='https:' || u.username || u.password || u.hash) throw new SenderError('rpc_configuration');
    return u;
  });
  if (urls[0].hostname===urls[1].hostname) throw new SenderError('independent_rpcs_required');
  return urls.map(u=>{const req=new FetchRequest(u.href);req.timeout=10_000;
    return new JsonRpcProvider(req,undefined,{batchMaxCount:20,cacheTimeout:-1});}) as [JsonRpcProvider,JsonRpcProvider];
}
export async function confirmedAnchor(providers: readonly Provider[], now = Date.now()): Promise<Anchor> {
  const chains = await Promise.all(providers.map(p=>p.getNetwork()));
  if (chains.length!==2 || chains.some(n=>n.chainId!==11155111n)) throw new SenderError('network_mismatch');
  const heads = await Promise.all(providers.map(p=>p.getBlock('latest')));
  if (heads.some(b=>!b?.hash || Math.abs(now/1000-b.timestamp)>120)) throw new SenderError('rpc_stale');
  const number = Math.min(...heads.map(b=>b!.number))-2;
  if (number<0) throw new SenderError('rpc_stale');
  const blocks = await Promise.all(providers.map(p=>p.getBlock(number)));
  if (!blocks[0]?.hash || blocks.some(b=>b?.hash!==blocks[0]!.hash) || Math.abs(now/1000-blocks[0].timestamp)>180) throw new SenderError('rpc_disagreement');
  return {number,hash:blocks[0].hash,timestamp:blocks[0].timestamp};
}
export async function assertCanonical(providers: readonly Provider[], anchor: {block:number;blockHash:string}) {
  const blocks=await Promise.all(providers.map(p=>p.getBlock(anchor.block)));
  if (blocks.some(b=>b?.hash!==anchor.blockHash)) throw new SenderError('chain_reorganized');
}
export async function observeSender(config: SenderConfig, providers: readonly Provider[]): Promise<Observation[]> {
  if (config.version!==17 || config.chainId!==11155111) throw new SenderError('unsupported_deployment');
  const anchor=await confirmedAnchor(providers);
  // Both RPCs must independently return the same verified projection, not only headers.
  const results=await Promise.all(providers.map(p=>observeV17At({...config,rpcUrl:''},p,anchor)));
  if (JSON.stringify(results[0])!==JSON.stringify(results[1])) throw new SenderError('rpc_disagreement');
  await assertCanonical(providers,{block:anchor.number,blockHash:anchor.hash});
  return results[0];
}
