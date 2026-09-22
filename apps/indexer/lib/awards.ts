import { decodePermanentCombination } from '@manekineko/contract-abi/permanent-combinations';
import { decodeScrambledCombination } from '@manekineko/contract-abi/scrambled-rank';
import { ensure, type AwardSnapshot, type RegisteredCollection } from './types.ts';

export type AwardEvent = { arguments: Record<string, string>; transaction_hash: string; block_timestamp: Date | string };
export function awardCount(c: RegisteredCollection): number { return (c.contractVersion === "affiliate-v8" || c.contractVersion === "affiliate-v9" || c.contractVersion === "affiliate-v10") ? c.winnerCount! : c.contractVersion === 'affiliate-v7' ? 2 : 1; }
export function awardBps(c: RegisteredCollection, rank: number): number { return (c.contractVersion === "affiliate-v8" || c.contractVersion === "affiliate-v9" || c.contractVersion === "affiliate-v10") ? c.prizeBps / c.winnerCount! : rank === 1 ? c.prizeBps - c.secondPrizeBps! : c.secondPrizeBps!; }
/** Verify exact events and independently decode each rank before publishing any prize claim. */
export function verifyAward(c: RegisteredCollection, award: AwardSnapshot, determined: AwardEvent[], claimed: AwardEvent[]) {
  const decoded = c.contractVersion === 'affiliate-v10'
    ? { ...decodePermanentCombination(award.numbers, award.key), score: award.score }
    : decodeScrambledCombination(award.numbers, award.key);
  ensure(c.contractVersion !== 'affiliate-v10' || 'tokenId' in decoded && Number(decoded.tokenId) === award.tokenId, 'winner_accounting_mismatch');
  const bps = awardBps(c,award.rank), count = awardCount(c);
  ensure(['affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10'].includes(c.contractVersion) && Number.isInteger(count) && count>=1 && count<=10
    && Number.isInteger(bps) && bps>0 && Number.isInteger(award.rank) && award.rank>=1 && award.rank<=count
    && award.tokenId >= 1 && award.tokenId <= c.maxSupply && award.score === String(c.maxSupply - award.rank + 1)
    && decoded.score === award.score && decoded.combinationCode === award.code
    && BigInt(award.amountWei) === BigInt(c.maxSupply) * BigInt(c.mintPrice) * BigInt(bps) / 10000n, 'winner_accounting_mismatch');
  ensure(determined.length === 1, 'award_event_missing');
  const result = determined[0], d = result.arguments;
  ensure(Number(d.rank) === award.rank && Number(d.tokenId) === award.tokenId && d.score === award.score && d.amount === award.amountWei, 'award_event_mismatch');
  ensure(claimed.length === (award.claimed ? 1 : 0), 'award_claim_event_mismatch');
  const claim = claimed[0] ?? null;
  if (claim) {
    const a = claim.arguments;
    ensure(Number(a.rank) === award.rank && Number(a.tokenId) === award.tokenId && a.amount === award.amountWei
      && a.holder.toLowerCase() === award.winningHolder && /^0x[0-9a-f]{40}$/i.test(a.recipient) && !/^0x0{40}$/i.test(a.recipient)
      && new Date(claim.block_timestamp).getTime() / 1000 === award.paidAt, 'award_claim_event_mismatch');
  }
  return { result, claim };
}
