import { Interface } from "ethers";
import type { TransactionJournal } from "../affiliates/wallet.ts";

const claims = new Interface(["function claimPrizeForRank(uint256 rank,address recipient)", "function claimPrize(address recipient)"]);
export const prizeOperationKey = (collectionId: string, rank: number) => `${collectionId}:${rank}`;

/** Recovery remains attached to the original prize, even if another card is selected. */
export function prizeJournalRank(record: TransactionJournal): number {
  const decoded = claims.parseTransaction({ data: record.data });
  if (record.action !== "prize" || !decoded || record.valueWei !== "0" || String(decoded.args.recipient).toLowerCase() !== record.wallet.toLowerCase()) throw new Error("The saved prize intent is invalid. Check its original wallet activity before continuing.");
  const rank = decoded.name === "claimPrize" ? 1 : Number(decoded.args.rank);
  if (!Number.isSafeInteger(rank) || rank < 1 || rank > 10) throw new Error("The saved prize rank is invalid.");
  return rank;
}
