import { Contract, getAddress, keccak256, type Provider } from 'ethers';
import controllerV14Abi from '@manekineko/contract-abi/season-controller-v14' with { type: 'json' };
import { readGenesis, type GenesisState } from './genesis.ts';
import controllerAbi from '@manekineko/contract-abi/season-controller-v12' with { type: 'json' };
import roundAbi from '@manekineko/contract-abi/round-v12' with { type: 'json' };
import votingAbi from '@manekineko/contract-abi/voting-v12' with { type: 'json' };
import creditsAbi from '@manekineko/contract-abi/winner-credits-v8' with { type: 'json' };
import type { ProtocolConfig } from './config.ts';
import { readHolderSeason, type HolderSeason } from './holder-rewards.ts';
export { controllerAbi, roundAbi, votingAbi, creditsAbi };
export type Option = { supply: bigint; price: bigint; winners: bigint; duration: bigint; votes: bigint };
export type RoundState = {
  address: string;
  id: number;
  name: string;
  season: string;
  color: string;
  phase: number;
  supply: bigint;
  price: bigint;
  winners: bigint;
  minted: bigint;
  start: bigint;
  deadline: bigint;
  termsHash: string;
  voteStart: bigint;
  totalVotes: bigint;
  options: Option[];
  operatorAvailable: bigint;
  operatorRemaining: bigint;
  canFinalize: boolean;
  soldOutAt: bigint;
  randomnessDeadline: bigint;
  executionReserve: bigint;
  executionRecipient: string;
  reserve: bigint;
  growth: bigint;
  affiliateId: bigint;
  affiliateAvailable: bigint;
  nextSlot: bigint;
  remaining: bigint;
  sponsorship: bigint;
  subscriptionClosed: boolean;
  awards: { rank: number; tokenId: bigint; amount: bigint; claimed: boolean; holder: string }[];
};
export type Snapshot = {
  holders?: HolderSeason;
  genesis?: GenesisState;
  block: number;
  timestamp: number;
  operator: string;
  voting: string;
  credits: string;
  bootstrap: boolean;
  sealed: boolean;
  count: number;
  catalogCount: number;
  cost: bigint;
  operatingBalance: bigint;
  canPrepare: boolean;
  latestPhase: number | null;
  sourceCount: number;
  sources: { address: string; power: bigint }[];
  legacy: string[];
  round: RoundState | null;
};
export async function verifyController(provider: Provider, config: ProtocolConfig, blockTag?: number) {
  if (Number((await provider.getNetwork()).chainId) !== config.chainId)
    throw new Error('The RPC network does not match this deployment.');
  const code = await provider.getCode(config.controller, blockTag);
  if (code === '0x' || keccak256(code).toLowerCase() !== config.codeHash.toLowerCase())
    throw new Error('The deployment could not be verified. Signing is disabled.');
  return new Contract(config.controller, config.version === 14 ? controllerV14Abi : controllerAbi, provider);
}
/** Every value belongs to one block. Failed reads never turn into zero balances. */
export async function readProtocol(
  provider: Provider,
  config: ProtocolConfig,
  selectedId = 0,
  wallet?: string,
  sourcePage = 0
): Promise<Snapshot> {
  const block = await provider.getBlock('latest');
  if (!block || Date.now() / 1000 - block.timestamp > 180)
    throw new Error('The network data is out of date. Retry before signing.');
  const c = await verifyController(provider, config, block.number),
    at = { blockTag: block.number };
  const [operator, voting, credits, sealed, countValue, catalogValue, cost, operatingBalance] =
    await Promise.all([
      c.operator(at),
      c.voting(at),
      c.credits(at),
      c.catalogSealed(at),
      c.roundCount(at),
      c.catalogCount(at),
      c.preparationCost(at),
      provider.getBalance(config.controller, block.number),
    ]);
  const count = Number(countValue),
    catalogCount = Number(catalogValue);
  if (count > 256 || catalogCount > 256 || count > catalogCount)
    throw new Error('Invalid collection catalog.');
  const v = new Contract(voting, votingAbi, provider);
  const [bootstrap, legacyCount] = await Promise.all([v.bootstrapAllowed(at), v.legacySourceCount(at)]);
  if (legacyCount > 256n) throw new Error('Invalid legacy source count.');
  const legacy: string[] = await Promise.all(
    Array.from({ length: Number(legacyCount) }, (_, i) => v.legacySources(i, at))
  );
  const id = selectedId || count;
  if (id < 0 || id > count) throw new Error('This collection has not been prepared.');
  let canPrepare = sealed && count < catalogCount;
  const genesis = config.version === 14 ? await readGenesis(provider, config, block.number, block.timestamp, voting, wallet) : undefined;
  if (genesis && count === 0) canPrepare &&= genesis.end > 0n && BigInt(block.timestamp) >= genesis.end;
  let latestPhase: number | null = null;
  if (count) {
    const last = new Contract(await c.rounds(count, at), roundAbi, provider);
    const [sold, refundable, phase] = await Promise.all([last.readyForNextRound(at), last.refundsAvailable(at), last.phase(at)]);
    latestPhase = Number(phase);
    canPrepare &&= sold || refundable;
  }
  const base = {
    block: block.number,
    timestamp: block.timestamp,
    operator,
    voting,
    credits,
    bootstrap,
    sealed,
    count,
    catalogCount,
    cost,
    operatingBalance,
    canPrepare,
    latestPhase,
    legacy,
    sourceCount: count + legacy.length + (genesis && id === 1 ? 1 : 0),
    ...(genesis ? { genesis } : {}),
  };
  if (!id) return { ...base, sources: [], round: null };
  const address = getAddress(await c.rounds(id, at)),
    r = new Contract(address, roundAbi, provider);
  const [version, boundVoting, ...data] = await Promise.all([
    r.CONTRACT_VERSION(at),
    r.voting(at),
    r.name(at),
    r.seasonName(at),
    r.collectionColor(at),
    r.phase(at),
    r.maxSupply(at),
    r.mintPrice(at),
    r.winnerCount(at),
    r.totalMinted(at),
    r.saleStartAt(at),
    r.mintDeadline(at),
    r.termsHash(at),
    v.ballots(address, at),
    v.optionCount(address, at),
    r.operatorWithdrawable(at),
    r.protectedBalance(at),
    r.growthReserveBalance(at),
    r.nextAvailableAffiliateId(at),
  ]);
  if (version !== `affiliate-v${config.version === 14 ? 13 : config.version ?? 12}` || getAddress(boundVoting) !== getAddress(voting))
    throw new Error('Collection verification failed.');
  const [
    name,
    season,
    color,
    phase,
    supply,
    price,
    winners,
    minted,
    start,
    deadline,
    termsHash,
    ballot,
    optionCount,
    operatorAvailable,
    reserve,
    growth,
    nextSlot,
  ] = data;
  const options: Option[] = await Promise.all(
    Array.from({ length: Number(optionCount) }, async (_, i) => {
      const [t, votes] = await Promise.all([v.option(address, i, at), v.votes(address, i, at)]);
      return { supply: t.supply, price: t.price, winners: t.winners, duration: t.duration, votes };
    })
  );
  const [affiliateId, remaining] = wallet
    ? await Promise.all([r.affiliateIdOf(wallet, at), r.remainingMints(wallet, at)])
    : [0n, 0n];
  const [sponsorship, subscriptionClosed, allocation, withdrawn, soldOutAt, canFinalize, randomnessDeadline, executionReserve, executionRecipient] = await Promise.all([
    new Contract(credits, creditsAbi, provider).sponsorBalance(address, at),
    r.subscriptionClosed(at),
    r.operatorAllocation(at),
    r.operatorWithdrawn(at),
    r.soldOutAt(at),
    Number(phase) === 4 ? r.canFinalizeDraw(at) : Promise.resolve(false),
    r.randomnessDeadline(at),
    r.executionReserve(at),
    r.executionRecipient(at),
  ]);
  const affiliateAvailable = wallet ? await r.affiliateClaimable(affiliateId, at) : 0n;
  const awards: RoundState['awards'] =
    Number(phase) === 5 || Number(phase) === 6
      ? await Promise.all(
          Array.from({ length: Number(winners) }, async (_, i) => {
            const rank = i + 1,
              tokenId = await r.winningTokenIds(rank, at);
            const [amount, claimed, holder] = await Promise.all([
              r.prizeAmountForRank(rank, at),
              r.prizeClaimed(rank, at),
              r.ownerOf(tokenId, at),
            ]);
            return { rank, tokenId, amount, claimed, holder };
          })
        )
      : [];
  const sourceIndices = Array.from(
    { length: Math.min(16, Math.max(0, base.sourceCount - sourcePage * 16)) },
    (_, i) => sourcePage * 16 + i
  );
  const sources = await Promise.all(
    sourceIndices.map(async (index) => {
      const paidIndex = index - (genesis && id === 1 ? 1 : 0);
      const source = paidIndex < 0 ? genesis!.address : paidIndex < count ? await c.rounds(paidIndex + 1, at) : legacy[paidIndex - count];
      const power =
        wallet && block.timestamp >= Number(ballot.startsAt)
          ? await v.votingPower(address, wallet, source, at)
          : 0n;
      return { address: source, power };
    })
  );
  return {
    ...base,
    ...((config.version === 13 || config.version === 14) ? { holders: await readHolderSeason(provider, config, address, block.number) } : {}),
    sources,
    round: {
      address,
      id,
      name,
      season,
      color,
      phase: Number(phase),
      supply,
      price,
      winners,
      minted,
      start,
      deadline,
      termsHash,
      voteStart: ballot.startsAt,
      totalVotes: ballot.totalVotes,
      options,
      operatorAvailable,
      operatorRemaining: BigInt(allocation) - BigInt(withdrawn),
      canFinalize,
      soldOutAt,
      randomnessDeadline,
      executionReserve,
      executionRecipient,
      reserve,
      growth,
      affiliateId,
      affiliateAvailable,
      nextSlot,
      remaining,
      sponsorship,
      subscriptionClosed,
      awards,
    },
  };
}
export function integerInput(value: string, min = 1n, max = (1n << 256n) - 1n): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('Enter a whole number.');
  const n = BigInt(value);
  if (n < min || n > max) throw new Error(`Enter a number between ${min} and ${max}.`);
  return n;
}
