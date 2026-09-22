"use client";
import { assertWallet, verifiedRound, type ContractTarget, type WalletSession } from '../affiliates/wallet.ts';
import type { CollectionAward } from '../collections/awards.ts';
export async function prepareRankedPrizeClaim(session: WalletSession, target: ContractTarget, award: Pick<CollectionAward,'rank'|'tokenId'|'amountWei'>) {
  if(!["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(target.contractVersion ?? "") || !Number.isInteger(award.rank) || award.rank<1 || award.rank>((target.contractVersion === "affiliate-v8" || target.contractVersion === "affiliate-v9" || target.contractVersion === "affiliate-v10") ? target.winnerCount ?? 0 : 2) || !target.runtimeCodeHash) throw new Error('This ranked prize is not verified.');
  const contract = await verifiedRound(session,target);
  const [token,paid,amount]=await Promise.all([contract.winningTokenIds(award.rank),contract.prizeClaimed(award.rank),contract.prizeAmountForRank(award.rank)]);
  if(token!==BigInt(award.tokenId)||amount!==BigInt(award.amountWei))throw new Error('The prize changed. Refresh this page before continuing.');
  if(paid)throw new Error('This prize has already been claimed.');
  if(String(await contract.ownerOf(token)).toLowerCase()!==session.address.toLowerCase())throw new Error(`Connect the current holder of ticket #${award.tokenId} to claim this prize.`);
  await contract.claimPrizeForRank.staticCall(award.rank,session.address);
  await assertWallet(session);
  return { ...await contract.claimPrizeForRank.populateTransaction(award.rank,session.address), value:0n };
}
