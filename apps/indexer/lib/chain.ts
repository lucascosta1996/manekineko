import roundV10Abi from '@manekineko/contract-abi/round-v10' with { type: 'json' };
import factoryV10Abi from '@manekineko/contract-abi/factory-v10' with { type: 'json' };
import { decodePermanentCombination, derivePermanentCombinationKey } from '@manekineko/contract-abi/permanent-combinations';
import roundV9Abi from '@manekineko/contract-abi/round-v9' with { type: 'json' };
import factoryV9Abi from '@manekineko/contract-abi/factory-v9' with { type: 'json' };
import { FetchRequest, Interface, JsonRpcProvider, ZeroAddress, getAddress, keccak256, type Log } from 'ethers';
import roundAbi from '@manekineko/contract-abi/round-v5' with { type: 'json' };
import factoryAbi from '@manekineko/contract-abi/factory-v5' with { type: 'json' };
import roundV6Abi from '@manekineko/contract-abi/round-v6' with { type: 'json' };
import factoryV6Abi from '@manekineko/contract-abi/factory-v6' with { type: 'json' };
import { decodeScrambledCombination } from '@manekineko/contract-abi/scrambled-rank';
import { normalizeSeasonAppearance } from '@manekineko/contract-abi/season-appearance';
import { ensure, type ChainBlock, type ChainEvent, type ChainReader, type CollectionSnapshot, type IndexerConfig, type RegisteredCollection } from './types.ts';

import { awardCount, awardBps } from './awards.ts';
import roundV8Abi from '@manekineko/contract-abi/round-v8' with { type: 'json' };
import factoryV8Abi from '@manekineko/contract-abi/factory-v8' with { type: 'json' };
const roundV10Interface = new Interface(roundV10Abi);
const factoryV10Interface = new Interface(factoryV10Abi);
const roundV9Interface = new Interface(roundV9Abi);
const factoryV9Interface = new Interface(factoryV9Abi);
const roundV8Interface = new Interface(roundV8Abi);
const factoryV8Interface = new Interface(factoryV8Abi);
import roundV7Abi from '@manekineko/contract-abi/round-v7' with { type: 'json' };
import factoryV7Abi from '@manekineko/contract-abi/factory-v7' with { type: 'json' };
const roundV7Interface = new Interface(roundV7Abi);
const factoryV7Interface = new Interface(factoryV7Abi);

const roundInterface = new Interface(roundAbi);
const factoryInterface = new Interface(factoryAbi);
const roundV6Interface = new Interface(roundV6Abi);
const factoryV6Interface = new Interface(factoryV6Abi);
const roundFor = (c: RegisteredCollection) => c.contractVersion === "affiliate-v10" ? roundV10Interface : c.contractVersion === "affiliate-v9" ? roundV9Interface : c.contractVersion === "affiliate-v8" ? roundV8Interface : c.contractVersion === 'affiliate-v7' ? roundV7Interface : c.contractVersion === 'affiliate-v6' ? roundV6Interface : roundInterface;
const factoryFor = (c: RegisteredCollection) => c.contractVersion === "affiliate-v10" ? factoryV10Interface : c.contractVersion === "affiliate-v9" ? factoryV9Interface : c.contractVersion === "affiliate-v8" ? factoryV8Interface : c.contractVersion === 'affiliate-v7' ? factoryV7Interface : c.contractVersion === 'affiliate-v6' ? factoryV6Interface : factoryInterface;
const phases = ['pending_activation', 'minting', 'awaiting_request', 'awaiting_randomness', 'awaiting_finalization', 'awaiting_prize', 'complete', 'refundable'];
const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
const lower = (address: string) => getAddress(address).toLowerCase();

export function createRpcProvider(config: IndexerConfig): JsonRpcProvider {
  const request = new FetchRequest(config.rpcUrl);
  request.timeout = 10000;
  return new JsonRpcProvider(request, config.chainId, { staticNetwork: true, cacheTimeout: -1, batchMaxCount: 10, batchStallTime: 10 });
}

export function snapshotFromValues(values: Record<string, any>, collection: RegisteredCollection): CollectionSnapshot {
  assertCollectionVersion(collection);
  const phase = phases[Number(values.phase)];
  const max = BigInt(collection.maxSupply), price = BigInt(collection.mintPrice);
  ensure(phase && values.totalMinted <= max && values.totalMintRevenue === values.totalMinted * price, 'mint_accounting_mismatch');
  ensure(values.totalRefunded === values.refundedCount * price, 'refund_accounting_mismatch');
  ensure(!values.revealed || (values.winningTokenId > 0n && values.winningTokenId <= max && values.highestScore === max), 'winner_accounting_mismatch');
  ensure(!values.prizePaid || (values.revealed && values.prizePaidAmount === values.totalMintRevenue * BigInt(collection.prizeBps) / 10000n), 'prize_accounting_mismatch');
  return {
    phase, totalMinted: Number(values.totalMinted), totalMintRevenueWei: String(values.totalMintRevenue),
    settledCount: values.revealed ? collection.maxSupply : 0, refundedCount: Number(values.refundedCount), totalRefundedWei: String(values.totalRefunded),
    winningTokenId: values.revealed ? Number(values.winningTokenId) : null, highestScore: values.revealed ? String(values.highestScore) : null,
    randomnessState: values.randomnessReceived ? 'fulfilled' : values.randomnessRequested ? 'pending' : 'not_requested',
    randomnessRequestId: values.randomnessRequested ? String(values.requestId) : null,
    randomnessWord: values.randomnessReceived ? String(values.randomWord) : null,
    prizePaid: values.prizePaid, prizeRecipient: values.prizePaid && !['affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10'].includes(collection.contractVersion) ? lower(values.prizeRecipient) : null,
    prizePaidWei: String(values.prizePaidAmount), winningCombination: null,
  };
}

export function assertCollectionVersion(collection: RegisteredCollection): void {
  ensure(collection.contractVersion === 'affiliate-v5' && collection.algorithmVersion === 'unique-rank-v2'
    || collection.contractVersion === 'affiliate-v6' && collection.algorithmVersion === 'unique-rank-v3'
    || collection.contractVersion === 'affiliate-v7' && collection.algorithmVersion === 'unique-rank-v4'
    || collection.contractVersion === 'affiliate-v10' && collection.algorithmVersion === 'unique-rank-v6'
    || (collection.contractVersion === "affiliate-v8" || collection.contractVersion === "affiliate-v9") && collection.algorithmVersion === 'unique-rank-v5', 'collection_trust_mismatch');
}

export function decodeEvent(log: Log, block: ChainBlock, version: RegisteredCollection['contractVersion'] = 'affiliate-v5'): ChainEvent {
  ensure(!log.removed && log.blockHash === block.hash && log.blockNumber === block.number, 'canonical_block_changed');
  const parsed = (version === "affiliate-v10" ? roundV10Interface : version === "affiliate-v9" ? roundV9Interface : version === "affiliate-v8" ? roundV8Interface : version === 'affiliate-v7' ? roundV7Interface : version === 'affiliate-v6' ? roundV6Interface : roundInterface).parseLog(log);
  const args: Record<string, string | boolean> = {};
  parsed?.fragment.inputs.forEach((input, i) => { args[input.name || String(i)] = typeof parsed.args[i] === 'boolean' ? parsed.args[i] : String(parsed.args[i]); });
  return {
    blockNumber: log.blockNumber, blockHash: log.blockHash.toLowerCase(), transactionHash: log.transactionHash.toLowerCase(),
    transactionIndex: log.transactionIndex, logIndex: log.index, name: parsed?.name ?? 'Unknown', args,
    topics: Array.from(log.topics, x => x.toLowerCase()), data: log.data.toLowerCase(), timestamp: block.timestamp,
  };
}

function rangeLimit(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown; info?: { error?: { message?: unknown } } };
  const message = `${String(e.message ?? '')} ${String(e.info?.error?.message ?? '')}`;
  // Never fan out a quota, authorization or generic connectivity failure.
  return !/rate limit|quota|unauthorized|forbidden|401|403|429/i.test(message)
    && /block range|too many results|query returned more|response size|log response size|limit.*blocks/i.test(message);
}

export class RpcChainReader implements ChainReader {
  private provider: JsonRpcProvider;
  private config: IndexerConfig;
  private deadline: number;
  constructor(provider: JsonRpcProvider, config: IndexerConfig) { this.provider = provider; this.config = config; this.deadline = Date.now() + config.timeBudgetMs; }
  private withinBudget() { ensure(Date.now() < this.deadline, 'time_budget_exhausted'); }
  private async read(address: string, abi: Interface, name: string, args: unknown[], block: ChainBlock): Promise<any> {
    this.withinBudget();
    // EIP-1898 binds every eth_call to the identical canonical hash, rather than
    // a height that can resolve differently while an RPC fleet changes forks.
    const raw = await this.provider.send('eth_call', [{ to: address, data: abi.encodeFunctionData(name, args) }, { blockHash: block.hash, requireCanonical: true }]);
    const decoded = abi.decodeFunctionResult(name, raw);
    return decoded.length === 1 ? decoded[0] : decoded;
  }
  async block(number: number): Promise<ChainBlock | null> {
    this.withinBudget();
    const block = await this.provider.getBlock(number);
    return block?.hash ? { number: block.number, hash: block.hash.toLowerCase(), timestamp: block.timestamp } : null;
  }
  async head(): Promise<ChainBlock> {
    this.withinBudget();
    ensure(BigInt(await this.provider.send('eth_chainId', [])) === BigInt(this.config.chainId), 'rpc_chain_mismatch');
    const block = await this.provider.getBlock('latest');
    ensure(block?.hash && Date.now() / 1000 - block.timestamp < 300, 'rpc_head_stale');
    return { number: block.number, hash: block.hash.toLowerCase(), timestamp: block.timestamp };
  }
  async verifyFactory(block: ChainBlock): Promise<void> {
    this.withinBudget();
    const code = await this.provider.send('eth_getCode', [this.config.factory, { blockHash: block.hash, requireCanonical: true }]);
    ensure(code !== '0x' && keccak256(code).toLowerCase() === this.config.factoryCodeHash, 'factory_trust_mismatch');
  }
  async verifyCollection(c: RegisteredCollection, block: ChainBlock): Promise<void> {
    this.withinBudget();
    assertCollectionVersion(c);
    ensure(c.factory === this.config.factory && c.chainId === this.config.chainId && c.contractVersion === this.config.contractVersion, 'collection_trust_mismatch');
    const roundInterface = roundFor(c), factoryInterface = factoryFor(c);
    const names = ['roundId', 'name', 'symbol', 'maxSupply', 'mintPrice', 'mintDeadline', 'prizeBps', 'affiliatePoolBps', 'maxAffiliateSlots', 'enrollmentSigner', 'CONTRACT_VERSION', 'ALGORITHM_VERSION'];
    const expected = [c.roundId, c.name, c.symbol, c.maxSupply, c.mintPrice, c.mintDeadline, c.prizeBps, c.affiliatePoolBps, c.maxAffiliateSlots, c.enrollmentSigner, c.contractVersion, c.algorithmVersion];
    if (c.contractVersion === 'affiliate-v6' || c.contractVersion === 'affiliate-v7' || (c.contractVersion === "affiliate-v8" || c.contractVersion === "affiliate-v9" || c.contractVersion === "affiliate-v10")) {
      const appearance = normalizeSeasonAppearance(c);
      names.push('seasonId', 'seasonName', 'collectionColor', 'textColor');
      expected.push(appearance.seasonId, appearance.seasonName, appearance.collectionColor, appearance.textColor);
    }
    if (['affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10'].includes(c.contractVersion)) {
      names.push((c.contractVersion === "affiliate-v8" || c.contractVersion === "affiliate-v9" || c.contractVersion === "affiliate-v10") ? 'winnerCount' : 'secondPrizeBps', 'minAffiliateReferrals', 'affiliatePayoutCapBps', 'saleStartAt');
      expected.push((c.contractVersion === "affiliate-v8" || c.contractVersion === "affiliate-v9" || c.contractVersion === "affiliate-v10") ? c.winnerCount! : c.secondPrizeBps!, c.minAffiliateReferrals!, c.affiliatePayoutCapBps!, c.saleStartAt!);
    }
    if(c.contractVersion === "affiliate-v9" || c.contractVersion === "affiliate-v10") { names.push("MAX_MINTS_PER_WALLET"); expected.push("20"); }
    if (c.contractVersion === 'affiliate-v10') {
      names.push('combinationKey');
      expected.push(derivePermanentCombinationKey({ chainId: c.chainId, collectionAddress: c.address, roundId: c.roundId, seasonId: c.seasonId!, maxSupply: c.maxSupply }));
    }
    const [mapped, renderer, roundRenderer, receipt, ...values] = await Promise.all([
      this.read(c.factory, factoryInterface, 'rounds', [c.roundId], block), this.read(c.factory, factoryInterface, 'renderer', [], block),
      this.read(c.address, roundInterface, 'renderer', [], block), this.provider.getTransactionReceipt(c.deploymentTransaction),
      ...names.map(name => this.read(c.address, roundInterface, name, [], block)),
    ]);
    ensure(same(mapped, c.address) && same(renderer, roundRenderer) && !same(renderer, ZeroAddress), 'collection_trust_mismatch');
    ensure(values.every((value, i) => ['name', 'symbol', 'seasonName'].includes(names[i]) ? value === expected[i] : same(value, expected[i])), 'immutable_terms_mismatch');
    ensure(receipt?.status === 1 && receipt.blockNumber === c.deploymentBlock && receipt.blockNumber <= block.number && same(receipt.to, c.factory), 'deployment_provenance_mismatch');
    const deploymentBlock = await this.block(c.deploymentBlock);
    ensure(deploymentBlock?.hash === receipt.blockHash, 'deployment_provenance_mismatch');
    const events = receipt.logs.filter(log => same(log.address, c.factory)).flatMap(log => {
      try { const parsed = factoryInterface.parseLog(log); return parsed?.name === 'RoundCreated' ? [parsed] : []; } catch { return []; }
    });
    ensure(events.length === 1 && same(events[0].args.round, c.address) && same(events[0].args.roundId, c.roundId), 'deployment_provenance_mismatch');
  }
  async logs(c: RegisteredCollection, from: number, to: number): Promise<ChainEvent[]> {
    let requests = 0;
    const read = async (start: number, end: number): Promise<Log[]> => {
      this.withinBudget();
      ensure(++requests <= 64, 'provider_range_limit');
      try { return await this.provider.getLogs({ address: c.address, fromBlock: start, toBlock: end }); }
      catch (error) {
        if (start === end || !rangeLimit(error)) throw error;
        const middle = Math.floor((start + end) / 2);
        return [...await read(start, middle), ...await read(middle + 1, end)];
      }
    };
    const logs = await read(from, to);
    ensure(logs.length <= 20000, 'event_batch_too_large');
    const blocks = new Map<number, ChainBlock>();
    const numbers = [...new Set(logs.map(log => log.blockNumber))];
    for (let i = 0; i < numbers.length; i += 10) {
      await Promise.all(numbers.slice(i, i + 10).map(async number => {
        const block = await this.block(number); ensure(block, 'canonical_block_changed'); blocks.set(number, block);
      }));
    }
    const identities = new Set<string>();
    return logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index).map(log => {
      ensure(same(log.address, c.address) && log.blockNumber >= from && log.blockNumber <= to, 'invalid_event_range');
      const identity = `${log.transactionHash}:${log.index}`;
      ensure(!identities.has(identity), 'duplicate_rpc_event'); identities.add(identity);
      return decodeEvent(log, blocks.get(log.blockNumber)!, c.contractVersion);
    });
  }
  async snapshot(c: RegisteredCollection, block: ChainBlock): Promise<CollectionSnapshot> {
    this.withinBudget();
    assertCollectionVersion(c);
    const roundInterface = roundFor(c);
    const fields = ['phase', 'totalMinted', 'totalMintRevenue', 'refundedCount', 'totalRefunded', 'randomnessRequested', 'randomnessReceived', 'requestId', 'randomWord', 'revealed', 'winningTokenId', 'highestScore', 'prizePaid', 'prizeRecipient', 'prizePaidAmount'];
    const values = Object.fromEntries(await Promise.all(fields.map(async field => [field, await this.read(c.address, roundInterface, field, [], block)])));
    const state = snapshotFromValues(values, c);
    if (['affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10'].includes(c.contractVersion)) {
      const soldOutAt = BigInt(await this.read(c.address, roundInterface, 'soldOutAt', [], block));
      state.soldOutAt = soldOutAt === 0n ? null : Number(soldOutAt);
      ensure(!state.soldOutAt || state.totalMinted === c.maxSupply && state.soldOutAt <= block.timestamp, 'sellout_accounting_mismatch');
      state.awards = [];
      if (values.revealed) {
        ensure(Number(await this.read(c.address, roundInterface, 'awardCount', [], block)) === awardCount(c), 'winner_accounting_mismatch');
        const key = String(await this.read(c.address, roundInterface, 'combinationKey', [], block)).toLowerCase();
        for (const rank of Array.from({length:awardCount(c)},(_,i)=>i+1)) {
          const tokenId = Number(await this.read(c.address, roundInterface, 'winningTokenIds', [rank], block));
          const [combination, amount, claimed, holder, winningHolder, paidAt] = await Promise.all([
            this.read(c.address, roundInterface, 'combination', [tokenId], block),
            this.read(c.address, roundInterface, 'prizeAmountForRank', [rank], block),
            this.read(c.address, roundInterface, 'prizeClaimed', [rank], block),
            this.read(c.address, roundInterface, 'ownerOf', [tokenId], block),
            this.read(c.address, roundInterface, 'awardHolder', [rank], block),
            this.read(c.address, roundInterface, 'awardPaidAt', [rank], block),
          ]);
          const numbers = Array.from(combination[0], Number);
          const decoded = c.contractVersion === 'affiliate-v10'
            ? { ...decodePermanentCombination(numbers, key), score: String(combination[2]) }
            : decodeScrambledCombination(numbers, key);
          ensure(c.contractVersion !== 'affiliate-v10' || 'tokenId' in decoded && Number(decoded.tokenId) === tokenId, 'winner_accounting_mismatch');
          ensure(tokenId >= 1 && tokenId <= c.maxSupply && decoded.score === String(c.maxSupply - rank + 1)
            && decoded.combinationCode === String(combination[1]) && decoded.score === String(combination[2])
            && amount === BigInt(state.totalMintRevenueWei) * BigInt(awardBps(c,rank)) / 10000n
            && (claimed ? paidAt > 0n && paidAt <= BigInt(block.timestamp) && !same(winningHolder, ZeroAddress) : paidAt === 0n && same(winningHolder, ZeroAddress)), 'winner_accounting_mismatch');
          state.awards.push({ rank, tokenId, numbers, code: decoded.combinationCode, key, score: decoded.score,
            amountWei: String(amount), claimed, holder: lower(holder), winningHolder: claimed ? lower(winningHolder) : null, paidAt: claimed ? Number(paidAt) : null });
        }
        ensure(new Set(state.awards.map(a=>a.tokenId)).size === awardCount(c) && state.awards[0].tokenId === state.winningTokenId
          && state.prizePaid === state.awards.every(a => a.claimed)
          && state.prizePaidWei === String(state.awards.reduce((sum, a) => sum + (a.claimed ? BigInt(a.amountWei) : 0n), 0n)), 'prize_accounting_mismatch');
      }
    } else if (state.prizePaid) {
      const combination = await this.read(c.address, roundInterface, 'combination', [state.winningTokenId], block);
      state.winningCombination = { numbers: Array.from(combination[0], Number), code: String(combination[1]), score: String(combination[2]) };
      if (c.contractVersion === 'affiliate-v6') {
        const key = String(await this.read(c.address, roundInterface, 'combinationKey', [], block)).toLowerCase();
        const decoded = decodeScrambledCombination(state.winningCombination.numbers, key);
        ensure(String(decoded.combinationCode) === state.winningCombination.code && String(decoded.score) === state.winningCombination.score && state.winningCombination.score === state.highestScore, 'winner_accounting_mismatch');
        state.winningCombination.key = key;
      }
    }
    return state;
  }
}
