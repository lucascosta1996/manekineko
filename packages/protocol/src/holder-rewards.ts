import { Contract, getAddress, keccak256, type Provider } from 'ethers';
import controllerAbi from '@manekineko/contract-abi/season-controller-v13' with { type: 'json' };
import holderAbi from '@manekineko/contract-abi/holder-rewards-v13' with { type: 'json' };
import roundAbi from '@manekineko/contract-abi/round-v13' with { type: 'json' };
import type { ProtocolConfig } from './config.ts';
import type { Snapshot } from './chain.ts';
export { holderAbi };
export type HolderSeason = {
  address: string; seasonId: string; funded: bigint; eligibleNfts: bigint;
  claimLimit: bigint; rewardPerNft: bigint; claims: bigint; paid: bigint;
  collections: bigint; settledCollections: bigint; unlocked: boolean;
};

export async function verifyHolderPool(provider: Provider, config: ProtocolConfig, blockTag?: number) {
  if (config.version !== 13 || !config.holderRewardsCodeHash) throw new Error('This deployment has no season holder pool.');
  const at = blockTag === undefined ? {} : { blockTag };
  const controller = new Contract(config.controller, controllerAbi, provider);
  const address = getAddress(await controller.holderRewards(at));
  const code = await provider.getCode(address, blockTag);
  if (code === '0x' || keccak256(code).toLowerCase() !== config.holderRewardsCodeHash.toLowerCase()) throw new Error('The holder rewards contract could not be verified. Signing is disabled.');
  const pool = new Contract(address, holderAbi, provider);
  const [bound, version, coverage, allocation] = await Promise.all([pool.controller(at), pool.CONTRACT_VERSION(at), pool.COVERAGE_BPS(at), pool.HOLDER_BPS(at)]);
  if (getAddress(bound) !== getAddress(config.controller) || version !== 'holder-rewards-v13' || coverage !== 500n || allocation !== 800n) throw new Error('Holder rewards policy verification failed.');
  return pool;
}

export async function readHolderSeason(provider: Provider, config: ProtocolConfig, collection: string, block: number): Promise<HolderSeason> {
  const at = { blockTag: block }, pool = await verifyHolderPool(provider, config, block);
  const seasonId = await new Contract(collection, roundAbi, provider).seasonId(at);
  const result = await pool.summary(seasonId, at);
  const { funded, eligibleNfts, claimLimit, rewardPerNft, claims, paid, collections, settledCollections, unlocked } = result;
  if (claims > claimLimit || paid > funded || settledCollections > collections || collections > 10n || claimLimit !== eligibleNfts / 20n || rewardPerNft !== (claimLimit ? funded / claimLimit : 0n)) throw new Error('Invalid holder pool state.');
  return { address: getAddress(await pool.getAddress()), seasonId, funded, eligibleNfts, claimLimit, rewardPerNft, claims, paid, collections, settledCollections, unlocked };
}

/** Built again after review. Contract execution, not a browser quote, reserves a slot. */
export async function holderClaimTransaction(provider: Provider, config: ProtocolConfig, state: Snapshot, tokenId: bigint, wallet: string, expectedReward: bigint) {
  const h = state.holders, r = state.round;
  if (!h || !r || config.version !== 13) throw new Error('Select a collection with season holder rewards.');
  if (!h.unlocked) throw new Error('This season is still locked.');
  if (h.claims >= h.claimLimit || h.rewardPerNft === 0n) throw new Error('All holder reward claims have been taken.');
  if (h.rewardPerNft !== expectedReward) throw new Error('The reward changed. Refresh and review it again.');
  const at = { blockTag: state.block }, pool = await verifyHolderPool(provider, config, state.block);
  if (getAddress(await pool.getAddress()) !== h.address) throw new Error('The holder rewards contract changed.');
  const round = new Contract(r.address, roundAbi, provider);
  const [funded, claimed, owner] = await Promise.all([pool.fundedCollection(r.address, at), pool.claimed(r.address, tokenId, at), round.ownerOf(tokenId, at)]);
  if (!funded) throw new Error('Only NFTs from successfully drawn collections qualify.');
  if (claimed) throw new Error('This NFT has already claimed its holder reward.');
  if (getAddress(owner) !== getAddress(wallet)) throw new Error('Connect the current owner of this NFT.');
  return pool.claim.populateTransaction(r.address, tokenId, wallet);
}
