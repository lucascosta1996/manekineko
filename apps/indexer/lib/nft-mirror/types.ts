import type { DecodedMetadata } from '@manekineko/contract-abi/onchain-metadata';
export interface Anchor { number: number; hash: string }
export interface MirrorSource { cursor: Anchor | null; anchor: Anchor | null; fingerprint: string }
export interface MirrorCollection {
  kind?: 'paid' | 'genesis'; chainId: number; address: string; controller: string; roundId: number;
  name: string; seasonName: string; seasonId: string; color: string; textColor: string;
  renderer: string; deploymentBlock: number; cursor: Anchor | null;
}
export interface MintEvent {
  tokenId: number; block: number; blockHash: string; transaction: string; burned: boolean;
}
export interface CachedNft { metadata: DecodedMetadata; numbers: number[]; code: number | null }
export interface MirrorChain {
  head(): Promise<Anchor>;
  block(number: number): Promise<Anchor>;
  verify(anchor: Anchor): Promise<void>;
  discover(from: number, to: Anchor): Promise<MirrorCollection[]>;
  events(collection: MirrorCollection, from: number, to: Anchor): Promise<MintEvent[]>;
  artwork(collection: MirrorCollection, tokenId: number, anchor: Anchor): Promise<CachedNft>;
}
