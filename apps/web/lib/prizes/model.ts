import type { ContractTarget } from "../affiliates/wallet.ts";
export type WalletPrize = {
  collectionId: string; collectionName: string; rank: number; tokenId: number; amountWei: string;
  currentHolder: string; claimed: boolean; paidHolder: string | null; recipient: string | null; transactionHash: string | null;
  paidAt: string | null; availableAt: string; observedAt: string; block: string; target: ContractTarget;
};
export function prizeRelationship(prize: Pick<WalletPrize,"currentHolder"|"claimed"|"paidHolder"|"recipient">,wallet:string) {
  const same=(a:string|null)=>a?.toLowerCase()===wallet.toLowerCase();
  return { available:!prize.claimed&&same(prize.currentHolder),payment:prize.claimed&&(same(prize.paidHolder)||same(prize.recipient)),paidCollectible:prize.claimed&&same(prize.currentHolder)&&!same(prize.paidHolder)&&!same(prize.recipient) };
}
export type WalletPrizes = {wallet:string;prizes:WalletPrize[];unavailable:{collectionId:string;name:string}[];nextCursor:string|null;checkedAt:string};
