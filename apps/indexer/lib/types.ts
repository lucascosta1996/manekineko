export type ChainBlock = { number: number; hash: string; timestamp: number };
export type IndexerConfig = {
  contractVersion: "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
  databaseUrl: string; rpcUrl: string; chainId: number; factory: string; factoryCodeHash: string;
  confirmations: number; blockRange: number; maxBatches: number; maxCollections: number;
  timeBudgetMs: number; reconcileSeconds: number; leaseSeconds: number;
};
export type RegisteredCollection = {
  contractVersion: "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";
  algorithmVersion: "unique-rank-v2" | "unique-rank-v3" | "unique-rank-v4" | "unique-rank-v5" | "unique-rank-v6";
  id: string; seriesId: string; chainId: number; roundId: string; name: string; symbol: string;
  seasonId?: string; seasonName?: string; collectionColor?: string; textColor?: string;
  winnerCount?: number; secondPrizeBps?: number; minAffiliateReferrals?: number; affiliatePayoutCapBps?: number; saleStartAt?: number;
  maxSupply: number; mintPrice: string; prizeBps: number; affiliatePoolBps: number;
  address: string; factory: string; deploymentTransaction: string; deploymentBlock: number;
  deployedAt: string; mintDeadline: number; maxAffiliateSlots: number; enrollmentSigner: string;
};
export type Checkpoint = {
  blockNumber: number | null; blockHash: string | null; trustFingerprint: string | null;
  lastReconciledAt: number | null; snapshotBlock: number | null; snapshotHash: string | null; phase: string | null;
};
export type ChainEvent = {
  blockNumber: number; blockHash: string; transactionHash: string; transactionIndex: number;
  logIndex: number; name: string; args: Record<string, string | boolean>; topics: string[];
  data: string; timestamp: number;
};
export type AwardSnapshot = {
  rank: number; tokenId: number; score: string; amountWei: string; claimed: boolean;
  holder: string; winningHolder: string | null; paidAt: number | null;
  numbers: number[]; code: string; key: string;
};
export type CollectionSnapshot = {
  awards?: AwardSnapshot[]; soldOutAt?: number | null;
  phase: string; totalMinted: number; totalMintRevenueWei: string; settledCount: number;
  refundedCount: number; totalRefundedWei: string; winningTokenId: number | null; highestScore: string | null;
  randomnessState: string; randomnessRequestId: string | null; randomnessWord: string | null;
  prizePaid: boolean; prizeRecipient: string | null; prizePaidWei: string;
  winningCombination: { numbers: number[]; code: string; score: string; key?: string | null } | null;
};
export type ChainReader = {
  head(): Promise<ChainBlock>;
  block(number: number): Promise<ChainBlock | null>;
  verifyFactory(block: ChainBlock): Promise<void>;
  verifyCollection(collection: RegisteredCollection, block: ChainBlock): Promise<void>;
  logs(collection: RegisteredCollection, from: number, to: number): Promise<ChainEvent[]>;
  snapshot(collection: RegisteredCollection, block: ChainBlock): Promise<CollectionSnapshot>;
};
export type CommitBatch = {
  collection: RegisteredCollection; owner: string; previous: Checkpoint; block: ChainBlock;
  events: ChainEvent[]; snapshot: CollectionSnapshot | null; reset: boolean; fingerprint: string;
  beforeCommit: () => Promise<void>;
};
export type IndexerStore = {
  collections(config: IndexerConfig): Promise<RegisteredCollection[]>;
  acquire(collection: RegisteredCollection, owner: string, leaseSeconds: number): Promise<Checkpoint | null>;
  commit(batch: CommitBatch): Promise<void>;
  release(collectionId: string, owner: string, error?: string): Promise<void>;
  quarantine(collectionId: string, owner: string): Promise<void>;
};
export type CollectionResult = {
  collectionId: string; status: 'updated' | 'caught_up' | 'leased' | 'behind' | 'failed';
  blockNumber?: number; events?: number; batches?: number; reorg?: boolean; error?: string;
};
export type CycleResult = { ok: boolean; chainId: number; confirmedBlock: number; results: CollectionResult[]; elapsedMs: number };

export class IndexerError extends Error {
  code: string;
  constructor(code: string) { super(code); this.name = 'IndexerError'; this.code = code; }
}
export function ensure(value: unknown, code: string): asserts value {
  if (!value) throw new IndexerError(code);
}
export function errorCode(error: unknown): string {
  return error instanceof IndexerError ? error.code : 'dependency_unavailable';
}
