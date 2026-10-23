/** V12 content only. The existing renderer supplies the approved Ligature/Open visual identity. */
import { assertSocialText } from '../../packages/contracts/src/season-social.ts';
import type { SeasonSocialMessage, SeasonSocialIdentity, SeasonSocialCollection } from '../../packages/contracts/src/season-social.ts';
export const SOCIAL_TEMPLATE_VERSION = 'v12-ligature-open-2';
export const STAGES = ['prepared', 'voting', 'opening', 'soldout', 'draw-ready', 'draw-refunds', 'refunds', 'revealed', 'paid'] as const;
export type Stage = typeof STAGES[number];
export type LifecycleInput = {
  prefix: string; name: string; id: number; link: string; now: bigint; voteStart: bigint; saleStart: bigint;
  deadline: bigint; sold: boolean; revealed: boolean; paid: boolean; randomnessDeadline: bigint; randomnessReceived: boolean;
};
const copy: Record<Stage, { text: string; header: string; headline: string[]; detail: string }> = {
  prepared: { text: 'Prepared onchain with fixed voting and affiliate enrollment dates.', header: 'COLLECTION PREPARED', headline: ['Collection', 'prepared.'], detail: 'Voting and enrollment follow the onchain schedule.' },
  voting: { text: 'NFT-holder voting opened. Voting ends when minting opens; the winning terms then become immutable.', header: 'VOTING OPENED', headline: ['Voting', 'opened.'], detail: 'One vote per eligible NFT held at the snapshot.' },
  opening: { text: 'Minting opened under the final onchain terms. No operator activation was required.', header: 'MINTING OPENED', headline: ['Minting', 'opened.'], detail: '60% winning tickets · 20% qualified affiliates · 20% operator.' },
  soldout: { text: 'Sold out. This records the sellout milestone; check the current draw or refund status below.', header: 'COLLECTION SOLD OUT', headline: ['Collection', 'sold out.'], detail: 'The randomness cutoff was fixed at sellout: 72 hours.' },
  'draw-ready': { text: 'Randomness was recorded. Finalization is permissionless; known results never expire into refunds.', header: 'RANDOMNESS RECORDED', headline: ['Randomness', 'recorded.'], detail: 'A separate execution reward funds permissionless finalization.' },
  'draw-refunds': { text: 'No randomness was recorded within 72 hours of sellout. Full mint-price refunds are available to NFT holders.', header: 'RANDOMNESS TIMEOUT', headline: ['Refunds', 'available.'], detail: 'No prize, affiliate or operator payout. Mint funds back refunds.' },
  refunds: { text: 'The mint deadline passed without sellout. Full mint-price refunds are available to NFT holders.', header: 'MINT DEADLINE REACHED', headline: ['Refunds', 'available.'], detail: 'The collection did not sell out before its immutable deadline.' },
  revealed: { text: 'Results finalized. Winning NFT holders and qualified affiliates can claim their allocated rewards.', header: 'RESULTS FINALIZED', headline: ['Results', 'finalized.'], detail: 'Winning NFTs share 60% equally; qualified affiliates share 20% equally.' },
  paid: { text: 'All winning ticket prizes have been claimed. Affiliate claims have their own status.', header: 'PRIZES CLAIMED', headline: ['Prizes', 'claimed.'], detail: 'All winning ticket prizes were claimed onchain.' },
};
export function lifecycleMessages(input: LifecycleInput) {
  const { prefix, name, id, link, now, voteStart, saleStart, deadline, sold, revealed, paid, randomnessDeadline, randomnessReceived } = input;
  const ready: Record<Stage, boolean> = {
    prepared: true, voting: now >= voteStart, opening: now >= saleStart, soldout: sold,
    'draw-ready': randomnessReceived,
    'draw-refunds': sold && !randomnessReceived && randomnessDeadline > 0n && now >= randomnessDeadline,
    refunds: !sold && now >= deadline, revealed, paid,
  };
  return STAGES.filter(stage => ready[stage]).map(stage => ({
    key: `${id}:${stage}`, stage,
    text: assertSocialText(`Tincta Rewards${prefix ? ' · Sepolia testnet' : ''}\n${name}\n${copy[stage].text}\nCurrent status: ${link}?collection=${id}`),
  }));
}
export function socialImage(input: {
  chainId: 1 | 11155111; stage: Stage; season: SeasonSocialIdentity; collection: SeasonSocialCollection; timestamp: number; text: string;
}): SeasonSocialMessage {
  const content = copy[input.stage];
  return {
    // This selects the existing collection layout; lifecycle content is V12-specific above.
    event: 'collection-live', chainId: input.chainId, season: input.season, collection: input.collection,
    generatedAt: new Date(input.timestamp * 1000).toISOString(), validUntil: null,
    post: input.text, replies: [], replyKeys: [], metrics: [],
    header: content.header, headline: content.headline, detail: content.detail,
    footer: 'View current status on Tincta Rewards.',
    alt: `${input.chainId === 11155111 ? 'Sepolia testnet, test ETH. ' : ''}Tincta Rewards. ${input.season.name}. ${input.collection.name}. ${content.header}. ${content.text}`,
  };
}
