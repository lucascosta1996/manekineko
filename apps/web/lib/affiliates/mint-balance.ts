import { formatEther } from "ethers";

export function checkMintBalance(balance: bigint, payment: bigint, chainId: number): void {
  const currency = chainId === 11155111 ? "Sepolia ETH" : "ETH";
  if (balance <= payment) throw new Error(`Insufficient ${currency}. This mint costs ${formatEther(payment)} ${currency} plus a network fee. Your wallet has ${formatEther(balance)} ${currency}. Add funds or switch wallets. No transaction was submitted.`);
}
