import { createHash } from 'node:crypto';
import { getAddress, isHexString, ZeroAddress } from 'ethers';

export interface MirrorConfig {
  chainId: number; controller: string; codeHash: string; version: 12 | 13 | 14;
  rpcUrl: string; fromBlock: number; confirmations: number; blockRange: number;
}
export function readMirrorConfigs(env: Record<string, string | undefined> = process.env): MirrorConfig[] {
  if (!env.NFT_MIRROR_SOURCES_JSON) return [];
  try {
    const entries = JSON.parse(env.NFT_MIRROR_SOURCES_JSON);
    if (!Array.isArray(entries) || !entries.length || entries.length > 4) throw new Error();
    const seen = new Set<string>();
    return entries.map(entry => {
      if (!entry || ![1,11155111].includes(entry.chainId) || ![12,13,14].includes(entry.version)
        || !isHexString(entry.codeHash,32) || !Number.isSafeInteger(entry.fromBlock) || entry.fromBlock < 0) throw new Error();
      const controller = getAddress(entry.controller).toLowerCase();
      const key = `${entry.chainId}:${controller}`;
      if (controller === ZeroAddress || seen.has(key)) throw new Error();
      seen.add(key);
      const url = new URL(entry.rpcUrl);
      if (url.protocol !== 'https:' || url.hash) throw new Error();
      const confirmations = entry.confirmations ?? (entry.chainId === 1 ? 12 : 2);
      const blockRange = entry.blockRange ?? 2000;
      if (!Number.isInteger(confirmations) || confirmations < (entry.chainId === 1 ? 12 : 2) || confirmations > 256
        || !Number.isInteger(blockRange) || blockRange < 1 || blockRange > 2000) throw new Error();
      return {chainId:entry.chainId,controller,codeHash:entry.codeHash.toLowerCase(),version:entry.version,
        rpcUrl:entry.rpcUrl,fromBlock:entry.fromBlock,confirmations,blockRange};
    });
  } catch { throw new Error('invalid_nft_mirror_configuration'); }
}
export function fingerprint(config: MirrorConfig): string {
  // Credentials/endpoint rotation do not invalidate a correctly mirrored chain.
  return createHash('sha256').update(JSON.stringify([config.chainId,config.controller,config.codeHash,config.version,config.fromBlock,config.confirmations])).digest('hex');
}
