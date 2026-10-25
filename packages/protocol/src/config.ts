import { getAddress, isHexString } from 'ethers';
export type ProtocolConfig = {
  version?: 12 | 13 | 14;
  holderRewardsCodeHash?: string;
  genesisCodeHash?: string;
  chainId: number;
  controller: string;
  codeHash: string;
  rpcUrl: string;
  websocketUrl?: string;
};
/** Dedicated PUBLIC endpoint only: never reuse authenticated worker RPC configuration. */
export function protocolConfig(selectedChain?: number): ProtocolConfig | null {
  // V14 is a separate deployment. Partial pins fail closed; older deployments keep their versions.
  const v14 = selectedChain === 1 ? { controller: process.env.NEXT_PUBLIC_V14_MAINNET_CONTROLLER, codeHash: process.env.NEXT_PUBLIC_V14_MAINNET_CONTROLLER_CODE_HASH, holderRewardsCodeHash: process.env.NEXT_PUBLIC_V14_MAINNET_HOLDER_REWARDS_CODE_HASH, genesisCodeHash: process.env.NEXT_PUBLIC_V14_MAINNET_GENESIS_CODE_HASH, rpcUrl: process.env.NEXT_PUBLIC_V14_MAINNET_RPC_URL, websocketUrl: process.env.NEXT_PUBLIC_V14_MAINNET_WS_URL } : selectedChain === 11155111 ? { controller: process.env.NEXT_PUBLIC_V14_SEPOLIA_CONTROLLER, codeHash: process.env.NEXT_PUBLIC_V14_SEPOLIA_CONTROLLER_CODE_HASH, holderRewardsCodeHash: process.env.NEXT_PUBLIC_V14_SEPOLIA_HOLDER_REWARDS_CODE_HASH, genesisCodeHash: process.env.NEXT_PUBLIC_V14_SEPOLIA_GENESIS_CODE_HASH, rpcUrl: process.env.NEXT_PUBLIC_V14_SEPOLIA_RPC_URL, websocketUrl: process.env.NEXT_PUBLIC_V14_SEPOLIA_WS_URL } : null;
  if (v14 && Object.values(v14).some(Boolean)) return validateProtocolConfig({ ...v14, chainId: selectedChain, version: 14 });
  const genericV14 = { version: 14 as const, controller: process.env.NEXT_PUBLIC_V14_CONTROLLER, chainId: process.env.NEXT_PUBLIC_V14_CHAIN_ID, codeHash: process.env.NEXT_PUBLIC_V14_CONTROLLER_CODE_HASH, holderRewardsCodeHash: process.env.NEXT_PUBLIC_V14_HOLDER_REWARDS_CODE_HASH, genesisCodeHash: process.env.NEXT_PUBLIC_V14_GENESIS_CODE_HASH, rpcUrl: process.env.NEXT_PUBLIC_V14_RPC_URL, websocketUrl: process.env.NEXT_PUBLIC_V14_WS_URL };
  if (Object.entries(genericV14).some(([key, value]) => key !== 'version' && Boolean(value)) && (!selectedChain || !genericV14.chainId || Number(genericV14.chainId) === selectedChain)) return validateProtocolConfig({ ...genericV14, chainId: Number(genericV14.chainId) });
  // Explicit new pins select V13. Never reinterpret a V12 address as a V13 deployment.
  const v13 = selectedChain === 1 ? { controller: process.env.NEXT_PUBLIC_V13_MAINNET_CONTROLLER, codeHash: process.env.NEXT_PUBLIC_V13_MAINNET_CONTROLLER_CODE_HASH, holderRewardsCodeHash: process.env.NEXT_PUBLIC_V13_MAINNET_HOLDER_REWARDS_CODE_HASH, rpcUrl: process.env.NEXT_PUBLIC_V13_MAINNET_RPC_URL, websocketUrl: process.env.NEXT_PUBLIC_V13_MAINNET_WS_URL } : selectedChain === 11155111 ? { controller: process.env.NEXT_PUBLIC_V13_SEPOLIA_CONTROLLER, codeHash: process.env.NEXT_PUBLIC_V13_SEPOLIA_CONTROLLER_CODE_HASH, holderRewardsCodeHash: process.env.NEXT_PUBLIC_V13_SEPOLIA_HOLDER_REWARDS_CODE_HASH, rpcUrl: process.env.NEXT_PUBLIC_V13_SEPOLIA_RPC_URL, websocketUrl: process.env.NEXT_PUBLIC_V13_SEPOLIA_WS_URL } : null;
  if (v13 && Object.values(v13).some(Boolean)) return validateProtocolConfig({ ...v13, chainId: selectedChain, version: 13 });
  const genericV13 = { version: 13 as const, controller: process.env.NEXT_PUBLIC_V13_CONTROLLER, chainId: process.env.NEXT_PUBLIC_V13_CHAIN_ID, codeHash: process.env.NEXT_PUBLIC_V13_CONTROLLER_CODE_HASH, holderRewardsCodeHash: process.env.NEXT_PUBLIC_V13_HOLDER_REWARDS_CODE_HASH, rpcUrl: process.env.NEXT_PUBLIC_V13_RPC_URL, websocketUrl: process.env.NEXT_PUBLIC_V13_WS_URL };
  if (Object.entries(genericV13).some(([key, value]) => key !== 'version' && Boolean(value)) && (!selectedChain || !genericV13.chainId || Number(genericV13.chainId) === selectedChain)) return validateProtocolConfig({ ...genericV13, chainId: Number(genericV13.chainId) });
  const network = selectedChain === 1 ? { controller: process.env.NEXT_PUBLIC_V12_MAINNET_CONTROLLER, codeHash: process.env.NEXT_PUBLIC_V12_MAINNET_CONTROLLER_CODE_HASH, rpcUrl: process.env.NEXT_PUBLIC_V12_MAINNET_RPC_URL, websocketUrl: process.env.NEXT_PUBLIC_V12_MAINNET_WS_URL } : selectedChain === 11155111 ? { controller: process.env.NEXT_PUBLIC_V12_SEPOLIA_CONTROLLER, codeHash: process.env.NEXT_PUBLIC_V12_SEPOLIA_CONTROLLER_CODE_HASH, rpcUrl: process.env.NEXT_PUBLIC_V12_SEPOLIA_RPC_URL, websocketUrl: process.env.NEXT_PUBLIC_V12_SEPOLIA_WS_URL } : null;
  if (network && Object.values(network).some(Boolean)) return validateProtocolConfig({ ...network, chainId: selectedChain });
  if (selectedChain && Number(process.env.NEXT_PUBLIC_V12_CHAIN_ID) !== selectedChain) return null;
  const controller = process.env.NEXT_PUBLIC_V12_CONTROLLER;
  if (!controller) return null;
  const chainId = Number(process.env.NEXT_PUBLIC_V12_CHAIN_ID);
  const codeHash = process.env.NEXT_PUBLIC_V12_CONTROLLER_CODE_HASH ?? '';
  const rpcUrl = process.env.NEXT_PUBLIC_V12_RPC_URL ?? '';
  return validateProtocolConfig({ controller, chainId, codeHash, rpcUrl, websocketUrl: process.env.NEXT_PUBLIC_V12_WS_URL });
}
export function validateProtocolConfig(input: { version?: 12 | 13 | 14; holderRewardsCodeHash?: string; genesisCodeHash?: string; controller?: string; chainId?: number; codeHash?: string; rpcUrl?: string; websocketUrl?: string }): ProtocolConfig {
  const { controller, chainId, codeHash, rpcUrl, websocketUrl } = input;
  if (input.version !== undefined && input.version !== 12 && input.version !== 13 && input.version !== 14) throw new Error('Unsupported protocol version.');
  if ((input.version === 13 || input.version === 14) && !isHexString(input.holderRewardsCodeHash, 32)) throw new Error('A verified holder rewards runtime pin is required.');
  if (input.version === 14 && !isHexString(input.genesisCodeHash, 32)) throw new Error('A verified Genesis runtime pin is required.');
  if (!controller || !chainId || !rpcUrl || !codeHash || ![1, 11155111].includes(chainId) || !isHexString(codeHash, 32))
    throw new Error('Invalid deployment pins.');
  const url = new URL(rpcUrl);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('A public HTTPS RPC endpoint is required.');
  if (websocketUrl) {
    const ws = new URL(websocketUrl);
    if (ws.protocol !== 'wss:' || ws.username || ws.password)
      throw new Error('Invalid public WebSocket endpoint.');
  }
  return { chainId, controller: getAddress(controller), codeHash, rpcUrl, websocketUrl, ...((input.version === 13 || input.version === 14) ? { version: input.version, holderRewardsCodeHash: input.holderRewardsCodeHash } : {}), ...(input.version === 14 ? { genesisCodeHash: input.genesisCodeHash } : {}) };
}
