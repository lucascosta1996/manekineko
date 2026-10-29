import { protocolConfig } from '@manekineko/protocol/config';
import { rehearsalPreviewCatalog } from '@manekineko/contract-abi/v17-social-preview';
import mainnet from '../catalog/mainnet.json';
import sepolia from '../catalog/sepolia.json';

export function socialPreviewCatalog(chainId: 1 | 11155111) {
  const fast = chainId === 11155111 && protocolConfig(chainId)?.version === 17;
  const catalog = chainId === 1 ? mainnet : sepolia;
  return { fast, catalog: fast ? rehearsalPreviewCatalog(catalog) : catalog };
}
