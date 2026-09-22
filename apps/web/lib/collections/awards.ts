import { decodePermanentCombination } from '@manekineko/contract-abi/permanent-combinations';
import { decodeScrambledCombination } from '@manekineko/contract-abi/scrambled-rank';
export interface CollectionAward {
  rank: number; tokenId: number; score: string; amountWei: string; numbers: number[];
  combinationCode: string; combinationKey: string; currentHolder: string;
  claimed: boolean; winningHolder: string | null; recipient: string | null;
  determinedAt: string; paidAt: string | null; claimTransaction: string | null;
}
/** Derived indexer data is checked again before the public UI can offer a claim. */
export function validateAwards(awards: CollectionAward[], supply: number, revenue: string, prizeBps: number, secondPrizeBps: number | null | undefined, winnerCount?: number | null, algorithmVersion?: string): void {
  const count=winnerCount ?? 2;
  if (!Number.isInteger(count) || count<1 || count>10 || count>supply || awards.length!==count
    || new Set(awards.map(a=>a.tokenId)).size!==count || awards.some((a,i)=>a.rank!==i+1)
    || (winnerCount!=null && (secondPrizeBps!=null || prizeBps%count!==0))) throw new Error('Invalid ranked awards');
  for (const a of awards) {
    const identity = algorithmVersion === "unique-rank-v6" ? decodePermanentCombination(a.numbers, a.combinationKey) : null;
    const decoded = identity ? { combinationCode: identity.combinationCode, score: a.score } : decodeScrambledCombination(a.numbers, a.combinationKey);
    if (identity && identity.tokenId !== String(a.tokenId)) throw new Error('Invalid permanent award identity');
    const bps = winnerCount!=null ? prizeBps/count : a.rank === 1 ? prizeBps - secondPrizeBps! : secondPrizeBps!;
    if (!Number.isInteger(bps) || bps<=0) throw new Error('Invalid award proportion');
    if (!Number.isInteger(a.tokenId) || a.tokenId < 1 || a.tokenId > supply || decoded.combinationCode !== a.combinationCode
      || decoded.score !== a.score || a.score !== String(supply-a.rank+1) || BigInt(a.amountWei) !== BigInt(revenue)*BigInt(bps)/10000n
      || !/^0x[0-9a-f]{40}$/i.test(a.currentHolder) || /^0x0{40}$/i.test(a.currentHolder) || !Number.isFinite(Date.parse(a.determinedAt))
      || (a.claimed ? !a.winningHolder || !a.recipient || !/^0x[0-9a-f]{40}$/i.test(a.winningHolder) || !/^0x[0-9a-f]{40}$/i.test(a.recipient)
        || !a.paidAt || !Number.isFinite(Date.parse(a.paidAt)) || Date.parse(a.paidAt)<Date.parse(a.determinedAt) || !a.claimTransaction || !/^0x[0-9a-f]{64}$/i.test(a.claimTransaction)
        : a.winningHolder !== null || a.recipient !== null || a.paidAt !== null || a.claimTransaction !== null)) throw new Error('Invalid ranked award');
  }
}
export const AWARDS_SELECT = `COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'rank',a.rank,'tokenId',a.token_id,'score',a.score::text,'amountWei',a.amount_wei::text,'numbers',a.numbers,
  'combinationCode',a.combination_code::text,'combinationKey',a.combination_key,'currentHolder',a.current_holder,
  'claimed',a.claimed,'winningHolder',a.winning_holder,'recipient',a.recipient,'determinedAt',a.determined_at,
  'paidAt',a.paid_at,'claimTransaction',a.claim_transaction) ORDER BY a.rank)
  FROM manekineko_collection_awards a WHERE a.collection_id=c.id AND a.block_number=s.block_number AND a.block_hash=s.block_hash),'[]'::jsonb)`;
