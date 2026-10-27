import 'server-only';
import { getAddress, isHexString, ZeroAddress } from 'ethers';
import { protocolConfig } from '../protocol/config';
import { database } from '../database';
import { queryDirectory, queryGallery, queryMintActivity } from './queries';
import type { MirrorPin } from './model';

function pins(): MirrorPin[] {
  // Explicit historical controller pins may supplement a site's current signing deployment.
  // This allowlist has no RPC URLs, and never grants the database signing authority.
  const entries = process.env.NFT_MIRROR_CONTROLLERS_JSON
    ? JSON.parse(process.env.NFT_MIRROR_CONTROLLERS_JSON)
    : [protocolConfig(1),protocolConfig(11155111)].filter(Boolean).map(c=>({...c,version:c!.version ?? 12}));
  if (!Array.isArray(entries) || entries.length>4) throw new Error('Invalid mirror pins.');
  const seen = new Set<string>();
  return entries.map(entry=>{
    if (!entry || ![1,11155111].includes(entry.chainId) || ![12,13,14,16].includes(entry.version) || !isHexString(entry.codeHash,32)) throw new Error('Invalid mirror pins.');
    if(entry.version===16&&entry.chainId!==11155111)throw new Error('Invalid mirror pins.');
    const controller = getAddress(entry.controller).toLowerCase(), key = `${entry.chainId}:${controller}`;
    if (controller === ZeroAddress || seen.has(key)) throw new Error('Invalid mirror pins.');
    seen.add(key);
    return {chainId:entry.chainId,controller,codeHash:entry.codeHash.toLowerCase(),version:entry.version};
  });
}
export async function getCollectionDirectory(page: number) {
  try { return await queryDirectory((sql,values)=>database().query(sql,values),pins(),page); }
  catch { throw new Error('The collection gallery is temporarily unavailable.'); }
}
export async function getMintActivity() {
  return queryMintActivity((sql,values)=>database().query(sql,values),pins());
}
export async function getCollectionGallery(chainId: number, address: string, page: number, collectionId?:number) {
  try { return await queryGallery((sql,values)=>database().query(sql,values),pins(),chainId,address,page,collectionId); }
  catch { throw new Error('The collection gallery is temporarily unavailable.'); }
}
