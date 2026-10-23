import { getAddress, isHexString } from 'ethers';
export type ProtocolConfig = {
  chainId: number;
  controller: string;
  codeHash: string;
  rpcUrl: string;
  websocketUrl?: string;
};
/** Dedicated PUBLIC endpoint only: never reuse authenticated worker RPC configuration. */
export function protocolConfig(selectedChain?: number): ProtocolConfig | null {
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
export function validateProtocolConfig(input: { controller?: string; chainId?: number; codeHash?: string; rpcUrl?: string; websocketUrl?: string }): ProtocolConfig {
  const { controller, chainId, codeHash, rpcUrl, websocketUrl } = input;
  if (!controller || !chainId || !rpcUrl || !codeHash || ![1, 11155111].includes(chainId) || !isHexString(codeHash, 32))
    throw new Error('Invalid V12 deployment pins.');
  const url = new URL(rpcUrl);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('V12 requires a public HTTPS RPC endpoint.');
  if (websocketUrl) {
    const ws = new URL(websocketUrl);
    if (ws.protocol !== 'wss:' || ws.username || ws.password)
      throw new Error('Invalid public WebSocket endpoint.');
  }
  return { chainId, controller: getAddress(controller), codeHash, rpcUrl, websocketUrl };
}
