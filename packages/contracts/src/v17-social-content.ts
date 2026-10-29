/** Pure V17 templates shared by the finalized-chain observer and Launch previews. */
import { assertSocialText, socialPublicUrl, type SeasonSocialMessage, type SeasonSocialIdentity, type SeasonSocialCollection } from './season-social.ts';
export const TEMPLATE_VERSION = 'v17-fast-genesis-1';
export const GENESIS_STAGES = ['genesis-open', 'genesis-soldout'] as const;
export const COLLECTION_STAGES = ['prepared', 'voting', 'opening', 'soldout', 'draw-ready', 'draw-refunds', 'refunds', 'revealed', 'paid'] as const;
export const SEASON_STAGES = ['season-open', 'season-complete'] as const;
export const STAGES = [...GENESIS_STAGES, 'season-open', ...COLLECTION_STAGES, 'season-complete'] as const;
export type Stage = typeof STAGES[number];
export const COPY: Record<Stage, { label: string; headline: string[]; text: string; detail: string }> = {
  'genesis-open': { label: 'GENESIS FREE MINT', headline: ['It starts', 'with Genesis.'], text: 'Free mint opened: 20 NFTs, two per wallet; gas applies. The first collection starts with voting as soon as Genesis sells out. Paid minting follows the ballot.', detail: '20 free NFTs · Two lifetime mints per wallet · Network gas applies' },
  'genesis-soldout': { label: 'GENESIS SOLD OUT', headline: ['Genesis', 'sold out.'], text: 'All 20 free NFTs minted. The first collection started with voting as soon as Genesis sold out. Paid minting opens after the ballot.', detail: 'The final Genesis mint opens the first collection’s full ballot.' },
  'season-open': { label: 'SEASON STARTED', headline: ['A new season', 'started.'], text: 'The first collection’s ballot opened. Paid minting follows voting; check the current collection status.', detail: 'Community voting selects the collection’s complete minting terms.' },
  prepared: { label: 'COLLECTION PREPARED', headline: ['Collection', 'prepared.'], text: 'Prepared onchain. Voting and affiliate enrollment follow the fixed schedule.', detail: 'Published identity and immutable ballot options.' },
  voting: { label: 'VOTING OPENED', headline: ['Voting', 'opened.'], text: 'NFT-holder voting opened. Paid minting follows the ballot under the winning terms.', detail: 'One vote per eligible NFT. The full package wins together.' },
  opening: { label: 'MINTING OPENED', headline: ['Minting', 'opened.'], text: 'Paid minting opened under the final onchain terms. Check current availability below.', detail: '60% prizes · 20% qualified affiliates · 10% holders · 10% treasury*' },
  soldout: { label: 'COLLECTION SOLD OUT', headline: ['Collection', 'sold out.'], text: 'Sold out. This records the sellout milestone; check the current draw or refund status below.', detail: 'The randomness cutoff was fixed at sellout: 15 minutes.' },
  'draw-ready': { label: 'RANDOMNESS RECORDED', headline: ['Randomness', 'recorded.'], text: 'Randomness was recorded. Anyone can finalize the draw. Recorded results cannot expire into refunds.', detail: 'Finalization determines the winning NFTs.' },
  'draw-refunds': { label: 'RANDOMNESS TIMEOUT', headline: ['Refunds', 'available.'], text: 'No randomness was recorded within 15 minutes of sellout. NFT holders can claim full mint-price refunds.', detail: 'Refund eligibility never expires. No reward allocations.' },
  refunds: { label: 'MINT DEADLINE REACHED', headline: ['Refunds', 'available.'], text: 'The mint deadline passed without sellout. NFT holders can claim full mint-price refunds.', detail: 'Refund eligibility never expires. No reward allocations.' },
  revealed: { label: 'RESULTS FINALIZED', headline: ['Results', 'finalized.'], text: 'Results finalized. Winning NFT holders and qualified affiliates can claim their allocated rewards.', detail: 'Winning NFTs share 60% equally; qualifying affiliates share 20% equally.' },
  paid: { label: 'PRIZES CLAIMED', headline: ['Prizes', 'claimed.'], text: 'All winning NFT prizes have been claimed. Affiliate and season holder claims have their own status.', detail: 'Prize claims are confirmed onchain.' },
  'season-complete': { label: 'SEASON COMPLETE', headline: ['Season', 'complete.'], text: 'Every collection has finalized or reached a refund outcome. Check prizes, refunds and the season holder pool for remaining claims.', detail: 'Season completion does not mean every reward has been claimed.' },
};
export function message(input: { stage: Stage; chainId: 1 | 11155111; id: number; season: SeasonSocialIdentity; collection?: SeasonSocialCollection; appUrl: string; timestamp: number }): SeasonSocialMessage {
  if (input.chainId !== 11155111) throw new Error('Accelerated V17 social content is Sepolia-only.');
  const c = COPY[input.stage];
  if (!c) throw new Error('Unsupported V17 social stage.');
  const genesis = GENESIS_STAGES.includes(input.stage as typeof GENESIS_STAGES[number]);
  const seasonEvent = SEASON_STAGES.includes(input.stage as typeof SEASON_STAGES[number]);
  const name = genesis ? 'Tincta Genesis' : seasonEvent ? input.season.name : input.collection!.name;
  const link = new URL(input.appUrl); link.pathname = '/'; link.search = ''; link.hash = '';
  if (!genesis) link.searchParams.set('collection', String(input.id));
  const footer = input.stage === 'opening' ? '*No qualifying affiliates: their 20% joins the treasury. Prizes and holders stay unchanged.' : 'View current status on Tincta Rewards.';
  const post = assertSocialText(`Tincta Rewards${input.chainId === 11155111 ? ' · Sepolia testnet' : ''}\n${name}\n${c.text}\n${socialPublicUrl(link.href)}`);
  return {
    event: input.stage === 'season-open' ? 'upcoming-season' : input.stage === 'season-complete' ? 'season-complete' : 'collection-live',
    ...(genesis ? { kind: 'genesis' as const, genesisSupply: 20 as const } : {}), chainId: input.chainId, season: input.season, collection: input.collection,
    generatedAt: new Date(input.timestamp * 1000).toISOString(), validUntil: null,
    post, replies: [], replyKeys: [], metrics: [], header: c.label,
    headline: c.headline, detail: c.detail,
    footer,
    alt: `${input.chainId === 11155111 ? 'Sepolia testnet; test ETH. ' : ''}${name}. ${c.label}. ${c.text} ${c.detail} ${footer}`,
  };
}
export type RoundObservation = { voteStart: bigint; saleStart: bigint; deadline: bigint; soldOutAt: bigint; entropyAt: bigint; finalizedAt: bigint; prizesClaimed: bigint; winners: bigint };
export function collectionStages(r: RoundObservation, now: bigint): (typeof COLLECTION_STAGES[number])[] {
  // Sealing reserves collection 1, but zero timestamps are not a ballot or sale.
  if (r.voteStart === 0n || r.saleStart === 0n) return [];
  const sold = r.soldOutAt > 0n;
  const ready = {
    prepared: true, voting: now >= r.voteStart, opening: now >= r.saleStart, soldout: sold,
    'draw-ready': r.entropyAt > 0n,
    'draw-refunds': sold && r.entropyAt === 0n && now >= r.soldOutAt + 900n,
    refunds: !sold && r.deadline > 0n && now >= r.deadline,
    revealed: r.finalizedAt > 0n, paid: r.finalizedAt > 0n && r.winners > 0n && r.prizesClaimed >= r.winners,
  };
  return COLLECTION_STAGES.filter(stage => ready[stage]);
}
export function genesisStages(sealed: boolean, start: bigint, soldOutAt: bigint, now: bigint): (typeof GENESIS_STAGES[number])[] {
  if (!sealed || start === 0n || now < start) return [];
  return soldOutAt > 0n && now >= soldOutAt ? [...GENESIS_STAGES] : ['genesis-open'];
}
