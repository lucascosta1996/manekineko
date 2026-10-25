import { Contract, ContractFactory, Transaction, Wallet, ZeroAddress, getAddress, id, parseEther, parseUnits, zeroPadValue, type Provider, type TransactionRequest } from 'ethers';
import { ChainPendingError, createTransactionPipeline, type ChainJournal } from '../../season-runner/chain-transactions.ts';
import { assertSepolia, canonicalHash, validatePlan, type Plan } from './plan.mts';
import { verifyDeployment, verifyRuntime, type Compiled } from '../verify-deployment.mts';

export type RoundRecord = { address: string; createdBlock: number; outcome?: 'sellout' | 'unsold-refund'; complete?: boolean;
  tokens?: Record<string, string[]>; vrfUnspent?: string; evidence?: Record<string, string> };
export type State = {
  version: 1; bundleHash: string; planHash: string; approvalHash: string; operator: string; bank: string; wallets: string[];
  operatorBaseline: string; recoveryCode: string; startBlock: number; adoptedRound?: string; prepaidOperatingWei: string;
  journals: Record<string, ChainJournal>; rounds: Record<string, RoundRecord>;
  funder?: string; funding?: { hash: string; amount: string; block: number }; completed?: boolean; recovering?: boolean;
  progress?: Record<string, unknown>; accounting?: Record<string, string>; updatedAt?: string;
};
export function approvalFor(s: State) {
  return canonicalHash({ version: s.version, bundleHash: s.bundleHash, planHash: s.planHash, operator: s.operator, bank: s.bank,
    wallets: s.wallets, recoveryCode: s.recoveryCode, operatorBaseline: s.operatorBaseline, startBlock: s.startBlock, adoptedRound: s.adoptedRound,
    prepaidOperatingWei: s.prepaidOperatingWei });
}
export function makeEngine(provider: Provider, plan: Plan, artifacts: Record<string, Compiled>, state: State, operator: Wallet,
  bank: Wallet, buyers: Wallet[], persist: () => Promise<void>, now = () => Date.now() / 1000, sourcesPublished: (count: number, funder?: string) => Promise<boolean> = async () => true) {
  validatePlan(plan);
  if (state.version !== 1 || state.planHash !== canonicalHash(plan) || state.approvalHash !== approvalFor(state) ||
    state.operator !== operator.address || state.operator !== getAddress(plan.expected.operator) || state.bank !== bank.address ||
    buyers.length !== 50 || JSON.stringify(state.wallets) !== JSON.stringify(buyers.map(w => w.address)) ||
    new Set([operator.address, bank.address, plan.recovery, ...state.wallets]).size !== 53) throw new Error('Plan, recovery address, operator or encrypted vault binding changed.');
  const fee = parseUnits(plan.maxFeeGwei, 'gwei'), grossLimit = parseEther(plan.maxGrossSpendEth), gasLimit = parseEther(plan.maxGasEth);
  const signers = new Map([bank, operator, ...buyers].map(w => [w.address, w]));
  const entries = () => Object.values(state.journals).flatMap(j => j.transactions);
  const signedCache = new Map<string, Transaction>();
  const signed = (raw: string) => { let tx = signedCache.get(raw); if (!tx) { tx = Transaction.from(raw); signedCache.set(raw, tx); } return tx; };
  const cost = (t: ChainJournal['transactions'][number]) => t.state === 'confirmed' && t.gasUsed !== undefined && t.gasPrice !== undefined
    ? BigInt(t.gasUsed) * BigInt(t.gasPrice) : signed(t.rawTransaction).gasLimit * signed(t.rawTransaction).maxFeePerGas!;
  const gasSpent = () => entries().reduce((sum, t) => sum + cost(t), 0n);
  const grossSpent = () => entries().reduce((sum, t) => sum + cost(t) + signed(t.rawTransaction).value, 0n);
  let queue = Promise.resolve();
  const save = () => {
    queue = queue.then(async () => {
      if (gasSpent() > gasLimit + (state.recovering ? parseEther(plan.recoveryGasReserveEth) : 0n) || grossSpent() > grossLimit) throw new Error('Aggregate gas or gross transfer cap reached before broadcast.');
      state.updatedAt = new Date().toISOString(); await persist();
    }); return queue;
  };
  const pipeline = (w: Wallet) => {
    const j = state.journals[w.address] ??= { version: 1, chainId: 11155111, from: w.address, maxFeePerGasWei: String(fee), maxTotalSpendWei: String(grossLimit), transactions: [], collections: {} };
    if (j.chainId !== 11155111 || j.from !== w.address || j.maxFeePerGasWei !== String(fee) || j.maxTotalSpendWei !== String(grossLimit)) throw new Error('Signed journal spending policy changed.');
    return createTransactionPipeline({ provider, signer: w, execute: true, journal: j, save, confirmations: plan.confirmations });
  };
  const send = (w: Wallet, action: string, request: TransactionRequest, deadline?: number) => pipeline(w).send(action, request, { broadcastDeadline: deadline });
  const c = new Contract(plan.expected.controller, artifacts.ManekinekoSeasonControllerV14.abi, provider);
  const holder = new Contract(plan.expected.holderRewards, artifacts.ManekinekoHolderRewardsV13.abi, provider);
  const credits = new Contract(plan.expected.credits, artifacts.ManekinekoWinnerCreditsV9.abi, provider);
  const vrf = new Contract(plan.expected.settings.coordinator, ['function getSubscription(uint256) view returns (uint96 balance,uint96 nativeBalance,uint64 reqCount,address owner,address[] consumers)'], provider);
  const roundAt = (a: string) => new Contract(a, artifacts.ManekinekoRoundV13.abi, provider);
  const call = (w: Wallet, action: string, target: Contract, fn: string, args: unknown[] = [], value = 0n, deadline?: number) =>
    send(w, action, { to: target.target, data: target.interface.encodeFunctionData(fn, args), value }, deadline);
  const completed = (action: string) => entries().some(t => t.action === action && t.state === 'confirmed');
  async function parallel(jobs: (() => Promise<unknown>)[]) {
    const results = await Promise.allSettled(jobs.map(job => job()));
    const failure = results.find(r => r.status === 'rejected' && !(r.reason instanceof ChainPendingError));
    if (failure?.status === 'rejected') throw failure.reason;
    return results.every(r => r.status === 'fulfilled');
  }
  async function reconcile() {
    return parallel(Object.values(state.journals).flatMap(j => {
      const t = j.transactions.find(t => t.state !== 'confirmed'); if (!t) return [];
      const w = signers.get(getAddress(j.from)); if (!w) throw new Error('Unknown signer in journal.');
      const tx = Transaction.from(t.rawTransaction);
      return [() => send(w, t.action, { to: tx.to, data: tx.data, value: tx.value }, t.broadcastDeadline)];
    }));
  }
  async function auditJournals() {
    for (const j of Object.values(state.journals)) {
      const w = signers.get(getAddress(j.from)); if (!w) throw new Error('Unknown journal signer.');
      await pipeline(w).confirmAll();
    }
  }
  async function topUp(w: Wallet, target: bigint, label: string) {
    const balance = await provider.getBalance(w.address);
    if (balance >= target) return true;
    const index = entries().filter(t => t.action.startsWith(`fund:${label}:`)).length;
    await send(bank, `fund:${label}:${index}`, { to: w.address, value: target - balance }); return false;
  }
  async function operatorCall(action: string, target: Contract, fn: string, args: unknown[] = []) {
    if (!await topUp(operator, BigInt(state.operatorBaseline) + parseEther(plan.operatorGasReserveEth), 'operator')) return false;
    // An operator call may use only the rehearsal's added gas, not pre-existing funds.
    const available = await provider.getBalance(operator.address) - BigInt(state.operatorBaseline);
    const request = { to: target.target, data: target.interface.encodeFunctionData(fn, args), from: operator.address };
    const gas = ((await provider.estimateGas(request)) * 120n + 99n) / 100n;
    if (available < gas * fee) throw new Error('Operator gas reserve is insufficient; existing operator balance is protected.');
    await call(operator, action, target, fn, args); return false;
  }
  async function fundBuyers(number: number) {
    // Reuse the existing disposable Sepolia-only batch payer, with its actual
    // V12 name and unmodified bytecode. It has no protocol authority or reserve.
    if (!state.funder) {
      const artifact = artifacts.V12RehearsalFunding;
      const receipt = await send(bank, 'deploy:funder', await new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction());
      if (!receipt.contractAddress) throw new Error('Funding helper deployment receipt missing.');
      state.funder = getAddress(receipt.contractAddress); await save();
    }
    const deployment = entries().find(t => t.action === 'deploy:funder');
    if (!deployment || !completed('deploy:funder') || getAddress((await provider.getTransactionReceipt(deployment.hash))!.contractAddress!) !== state.funder)
      throw new Error('Funding helper differs from the signed deployment.');
    verifyRuntime(await provider.getCode(state.funder), artifacts.V12RehearsalFunding, {});
    if (!await sourcesPublished(0, state.funder)) return false;
    if (await provider.getBalance(state.funder) !== 0n) throw new Error('Unexpected funds in the disposable funding helper.');
    const quota = number === 0 ? 0n : plan.collections[number - 1].scenario === 'sellout' ? 20n : 1n;
    const balances: bigint[] = [];
    for (let i = 0; i < buyers.length; i += 10) balances.push(...await Promise.all(buyers.slice(i, i + 10).map(w => provider.getBalance(w.address))));
    const recipients: string[] = [], amounts: bigint[] = [];
    for (let i = 0; i < buyers.length; i++) {
      const target = (quota === 20n || i < 3 ? quota * BigInt(plan.expected.options[0].price) : 0n) + parseEther(plan.walletGasReserveEth);
      if (balances[i] < target) { recipients.push(buyers[i].address); amounts.push(target - balances[i]); }
    }
    if (!recipients.length) return true;
    const label = `fund:buyers:${number}:`, index = entries().filter(t => t.action.startsWith(label)).length;
    await call(bank, label + index, new Contract(state.funder, artifacts.V12RehearsalFunding.abi, provider), 'fund', [recipients, amounts], amounts.reduce((a, b) => a + b, 0n));
    return false;
  }
  async function tokens(record: RoundRecord) {
    if (record.tokens) return record.tokens;
    const logs = await provider.getLogs({ address: record.address, fromBlock: record.createdBlock, toBlock: 'latest', topics: [id('Transfer(address,address,uint256)'), zeroPadValue(ZeroAddress, 32)] });
    const owned: Record<string, string[]> = {};
    for (const log of logs) {
      const owner = getAddress('0x' + log.topics[2].slice(-40));
      if (!state.wallets.includes(owner)) throw new Error('External NFT holder detected. Preserve funds and review the public collection.');
      (owned[owner] ??= []).push(String(BigInt(log.topics[3])));
    }
    record.tokens = owned; await save(); return owned;
  }
  const sourceBefore = (n: number) => Object.entries(state.rounds).filter(([id, r]) => Number(id) < n && r.outcome === 'sellout').sort(([a], [b]) => Number(b) - Number(a))[0]?.[1];
  async function voteAndEnroll(n: number, r: Contract, end: number) {
    const source = sourceBefore(n), v = new Contract(await c.voting(), artifacts.ManekinekoVotingV14.abi, provider);
    const sourceTokens = source ? await tokens(source) : undefined;
    const voteSource = n === 1 ? plan.expected.genesis : source?.address;
    const jobs: (() => Promise<unknown>)[] = [];
    for (let i = 0; i < buyers.length && jobs.length < 10; i++) {
      const w = buyers[i], affiliate = i < 3 ? await r.affiliateIdOf(w.address) : 0n;
      if (i < 3 && affiliate === 0n) {
        if (!source && n !== 1) throw new Error('No eligible source collection for affiliate enrollment.');
        jobs.push(() => call(w, `enroll:${n}:${i}`, r, 'enrollAffiliate', [i + 1, source?.address ?? ZeroAddress, sourceTokens?.[w.address]?.[0] ?? 0], 0n, end - 1));
      } else if (i < 3 && affiliate !== BigInt(i + 1)) throw new Error('Affiliate enrollment differs from the rehearsal.');
      else if (voteSource && !await v.sourceVoted(r.target, w.address, voteSource))
        jobs.push(() => call(w, `vote:${n}:${i}`, v, 'castVote', [r.target, 0, [voteSource]], 0n, end - 1));
    }
    await parallel(jobs);
  }
  async function mint(n: number, r: Contract) {
    if (await r.maxSupply() !== 1000n || await r.mintPrice() !== parseEther('0.01') || await r.winnerCount() !== 6n || await r.affiliateCount() !== 3n)
      throw new Error('Effective terms or affiliate enrollment differ from the funded rehearsal.');
    const v = new Contract(await c.voting(), artifacts.ManekinekoVotingV14.abi, provider), ballot = await v.ballots(r.target);
    if (ballot.totalVotes !== (n === 1 ? 50n : 1000n)) throw new Error('All 50 wallets must vote: one Genesis vote each first, then 20 paid NFT votes each.');
    const refund = plan.collections[n - 1].scenario === 'unsold-refund', minted = await r.totalMinted();
    const held = await Promise.all(buyers.map(w => r.mintedPerWallet(w.address) as Promise<bigint>));
    if (held.reduce((a, b) => a + b, 0n) !== minted) throw new Error('External mints changed the public rehearsal.');
    const jobs: (() => Promise<unknown>)[] = [], terms = await r.termsHash(), deadline = Number(await r.mintDeadline());
    for (let i = 0; i < buyers.length && jobs.length < 10; i++) {
      const quota = refund ? (i < 3 ? 1n : 0n) : 20n;
      if (held[i] > quota) throw new Error('Managed-wallet quota changed.');
      if (held[i] === quota) continue;
      // The last mint must be estimated after every other recipient is confirmed:
      // it includes sellout allocation and the real Chainlink request.
      if (!refund && i === 49 && minted !== 980n) continue;
      const w = buyers[i], quantity = quota - held[i], affiliate = i < 3 ? (i + 1) % 3 + 1 : i % 3 + 1;
      jobs.push(() => call(w, `mint:${n}:${i}:${held[i]}`, r, 'mintQuoted', [w.address, quantity, affiliate, terms], quantity * parseEther('0.01'), deadline - 1));
    }
    await parallel(jobs);
  }
  async function claims(n: number, r: Contract, record: RoundRecord, recovery: boolean) {
    const expected = plan.collections[n - 1].scenario, refundable = await r.refundsAvailable();
    if (!refundable && !await r.revealed()) throw new Error('Claims require an actual terminal outcome.');
    const actual = refundable ? 'unsold-refund' : 'sellout';
    if (!recovery && actual !== expected) throw new Error('Planned scenario failed. Run recovery to reclaim available funds without reporting success.');
    if (refundable) {
      const ts = await tokens(record);
      for (const [owner, ids] of Object.entries(ts)) for (const token of ids) {
        if (completed(`refund:${n}:${token}`)) continue;
        if (getAddress(await r.ownerOf(token)) !== owner) throw new Error('Refund NFT owner changed.');
        await call(signers.get(owner)!, `refund:${n}:${token}`, r, 'refund', [token, bank.address]); return false;
      }
      if (await r.totalRefunded() !== await r.totalMintRevenue()) throw new Error('Refund principal remains unclaimed.');
      if (!recovery && await r.totalMinted() !== 3n) throw new Error('Refund scenario did not mint exactly three paid NFTs.');
    } else {
      await tokens(record);
      if (await r.totalMintRevenue() !== parseEther('10') || await r.affiliateQualifiedCount() !== 3n || await r.affiliateEqualShare() !== parseEther('2') / 3n)
        throw new Error('Sellout revenue or affiliate allocation mismatch.');
      for (let rank = 1; rank <= 6; rank++) if (!await r.prizeClaimed(rank)) {
        const owner = getAddress(await r.ownerOf(await r.winningTokenIds(rank))), w = signers.get(owner);
        if (!w || !state.wallets.includes(owner)) throw new Error('An external wallet owns a winning NFT.');
        await call(w, `prize:${n}:${rank}`, r, 'claimPrizeForRank', [rank, bank.address]); return false;
      }
      for (let i = 0; i < 3; i++) if (await r.affiliateClaimable(i + 1) > 0n) {
        await call(buyers[i], `affiliate:${n}:${i}`, r, 'claimAffiliateCommission', [bank.address]); return false;
      }
    }
    record.outcome = actual; await save(); return true;
  }
  async function recoverRound(n: number, r: Contract, record: RoundRecord) {
    const sponsor = await credits.sponsorBalance(r.target);
    if (sponsor > 0n) return operatorCall(`recover-sponsor:${n}`, credits, 'withdrawSponsorship', [r.target, bank.address, sponsor]);
    if (await r.executionReserve() > 0n) {
      if (await r.refundsAvailable()) return operatorCall(`recover-executor:${n}`, r, 'recoverExecutionFunding');
      const recipient = getAddress(await r.executionRecipient()), signer = signers.get(recipient);
      if (!signer) throw new Error('An external executor has an unclaimed reward.');
      await call(signer, `executor:${n}`, r, 'claimExecutionReward', [bank.address]); return false;
    }
    const growth = await r.growthReserveBalance();
    if (await r.revealed() && growth > 0n) return operatorCall(`recover-growth:${n}`, r, 'withdrawGrowthReserve', [bank.address, growth]);
    if (!await r.subscriptionClosed()) {
      const s = await vrf.getSubscription(await r.subscriptionId());
      record.vrfUnspent = String(s.nativeBalance); await save();
      return operatorCall(`recover-vrf:${n}`, r, 'withdrawRandomnessFunding', [bank.address]);
    }
    const treasury = await r.operatorWithdrawable();
    if (treasury > 0n) return operatorCall(`treasury:${n}`, r, 'withdrawOperator', [bank.address, treasury]);
    const balance = await provider.getBalance(r.target as string);
    if (await r.protectedBalance() !== 0n || balance !== 0n || record.vrfUnspent === undefined) throw new Error('Collection recovery is incomplete.');
    record.evidence = { minted: String(await r.totalMinted()), revenue: String(await r.totalMintRevenue()), refunded: String(await r.totalRefunded()),
      prizes: String(await r.prizePaidAmount()), affiliates: String(await r.totalAffiliateClaimed()), treasury: String(await r.operatorWithdrawn()), protectedBalance: '0', balance: '0' };
    record.complete = true; await save(); return true;
  }
  async function holderClaims() {
    const season = plan.collections[0].seasonId, s = await holder.summary(season);
    if (!s.unlocked) return false;
    const recorded = entries().filter(t => t.action.startsWith('holder:') && t.state === 'confirmed').length;
    if (s.claims !== BigInt(recorded)) throw new Error('External holder claim detected; reconcile the pool before continuing.');
    if (s.claims === s.claimLimit) {
      if (s.paid !== s.funded) throw new Error('Holder pool has a residual or unexpected external claim.');
      return true;
    }
    for (const record of Object.values(state.rounds).filter(r => r.outcome === 'sellout')) {
      const ts = await tokens(record);
      for (const w of buyers) {
        const token = ts[w.address]?.[0]; if (!token) throw new Error('Holder test wallet lacks its NFT.');
        if (await holder.claimed(record.address, token)) continue;
        if (getAddress(await roundAt(record.address).ownerOf(token)) !== w.address) throw new Error('Holder NFT changed ownership.');
        await call(w, `holder:${record.address}:${token}`, holder, 'claim', [record.address, token, bank.address]); return false;
      }
    }
    throw new Error('Holder claim coverage differs from the eight-sellout plan.');
  }
  async function sweep(w: Wallet, keep: bigint, label: string) {
    if (await provider.getCode(plan.recovery) !== state.recoveryCode) throw new Error('Recovery wallet delegation changed; inspect before returning funds.');
    const gas = ((await provider.estimateGas({ from: w.address, to: plan.recovery, value: 1n })) * 120n + 99n) / 100n;
    if (gas > 200000n) throw new Error('Recovery wallet transfer requires unexpected gas.');
    const reserve = gas * fee, balance = await provider.getBalance(w.address);
    // One bounded sweep leaves at most the estimated fee-cap reserve. It is reported as
    // wallet dust, never silently counted as returned funds.
    if (completed(label) || balance <= keep + reserve) return true;
    await send(w, label, { to: plan.recovery, value: balance - keep - reserve }); return false;
  }
  async function finish(recovery: boolean) {
    const s = await holder.summary(plan.collections[0].seasonId);
    if (s.unlocked && !await holderClaims()) return 'claiming-season-holders';
    if (!recovery && (!s.unlocked || s.funded !== parseEther('8') || s.eligibleNfts !== 8000n || s.claimLimit !== 400n || s.claims !== 400n || s.paid !== s.funded))
      throw new Error('Season holder accounting is incomplete.');
    for (let i = 0; i < buyers.length; i++) if (!await sweep(buyers[i], 0n, `return:buyer:${i}`)) return 'returning-buyers';
    if (!await sweep(operator, BigInt(state.operatorBaseline), 'return:operator')) return 'returning-operator-surplus';
    if (!await sweep(bank, 0n, 'return:bank')) return 'returning-bank';
    await auditJournals();
    if (state.funder && await provider.getBalance(state.funder) !== 0n) throw new Error('Funding helper has an unexplained balance.');
    const balances = await Promise.all([bank, ...buyers].map(w => provider.getBalance(w.address)));
    const operatorBalance = await provider.getBalance(operator.address);
    if (operatorBalance < BigInt(state.operatorBaseline)) throw new Error('Pre-existing operator funds were consumed.');
    const residual = balances.reduce((a, b) => a + b, 0n) + operatorBalance - BigInt(state.operatorBaseline);
    const returned = entries().filter(t => t.state === 'confirmed' && t.action.startsWith('return:')).reduce((sum, t) => sum + Transaction.from(t.rawTransaction).value, 0n);
    const vrfFees = Object.values(state.rounds).reduce((sum, r) => sum + BigInt(plan.expected.settings.randomnessBudget) - BigInt(r.vrfUnspent!), 0n);
    const locked = BigInt(s.funded) - BigInt(s.paid);
    const funding = BigInt(state.funding!.amount) + BigInt(state.prepaidOperatingWei);
    if (funding !== returned + residual + gasSpent() + vrfFees + locked) throw new Error('Funding reconciliation has an unexplained difference. No completion certificate will be issued.');
    state.accounting = { fundingWei: String(funding), returnedWei: String(returned), gasWei: String(gasSpent()), chainlinkWei: String(vrfFees), walletDustWei: String(residual), lockedHolderWei: String(locked), recovery: plan.recovery };
    const finalized = await provider.getBlock('finalized'), last = Math.max(...entries().map(t => t.blockNumber ?? 0));
    if (!finalized || finalized.number < last) { await save(); return 'awaiting-finality'; }
    state.completed = !recovery && locked === 0n; await save(); return recovery ? 'recovered-available-funds' : 'complete';
  }
  let audited = false;
  async function step(recovery = false): Promise<string> {
    assertSepolia((await provider.getNetwork()).chainId);
    const head = await provider.getBlock('latest');
    if (!head || Math.abs(now() - head.timestamp) > 180) throw new Error('Sepolia RPC head is stale.');
    if (!state.funding || BigInt(state.funding.amount) < parseEther(plan.initialFundingEth) || BigInt(state.funding.amount) > parseEther(plan.maximumFundingEth)) throw new Error('Confirmed, bounded user funding is required.');
    if (state.completed && recovery) return 'complete';
    if (state.recovering && !recovery) throw new Error('Recovery mode is irreversible for this run.');
    if (recovery) { state.recovering = true; await save(); }
    if (!await reconcile()) return 'confirming';
    if (!audited) { await auditJournals(); audited = true; }
    const count = Number(await c.roundCount());
    if (count > 10) throw new Error('An external action prepared beyond this first-season run.');
    // Follow the first unfinished collection, never skip claims after a restart.
    const next = Array.from({ length: count }, (_, i) => i + 1).find(n => !state.rounds[n]?.complete);
    if (next !== undefined) {
      const n = next, address = getAddress(await c.rounds(n)), r = roundAt(address);
      let record = state.rounds[n];
      if (!record) {
        const prepared = entries().find(t => t.action === `prepare:${n}` && t.state === 'confirmed');
        if (!prepared && !(n === 1 && state.adoptedRound === address)) throw new Error('Unrecognized external preparation.');
        record = state.rounds[n] = { address, createdBlock: prepared?.blockNumber ?? state.startBlock }; await save();
      }
      if (record.address !== address || await r.CONTRACT_VERSION() !== 'affiliate-v13' || getAddress(await r.holderRewards()) !== getAddress(plan.expected.holderRewards)) throw new Error('Round authority binding changed.');
      const phase = Number(await r.phase()), v = new Contract(await c.voting(), artifacts.ManekinekoVotingV14.abi, provider), ballot = await v.ballots(address);
      state.progress = { collection: n, name: plan.collections[n - 1].name, scenario: plan.collections[n - 1].scenario, phase, minted: String(await r.totalMinted()), voteEnd: String(ballot.endsAt), mintDeadline: String(await r.mintDeadline()), block: head.number, gasWei: String(gasSpent()), recovery };
      await save();
      if (!recovery && !await sourcesPublished(count)) return 'waiting-for-source-publication';
      if (phase === 0) {
        if (recovery) return 'recovery-waits-for-immutable-deadline';
        if (!await fundBuyers(n)) return 'funding-buyers';
        if (head.timestamp >= Number(ballot.startsAt)) await voteAndEnroll(n, r, Number(ballot.endsAt));
        return 'voting';
      }
      if (phase === 1) {
        if (recovery) return 'recovery-waits-for-immutable-deadline';
        await mint(n, r); return plan.collections[n - 1].scenario === 'sellout' ? 'minting' : 'waiting-for-refunds';
      }
      if (phase === 2) { await call(bank, `request:${n}`, r, 'requestRandomness'); return 'requesting-randomness'; }
      if (phase === 3) return 'waiting-for-real-chainlink';
      if (phase === 4) { await call(bank, `finalize:${n}:${await r.drawCounter()}`, r, 'finalizeDrawAndClaim', [bank.address]); return 'finalizing'; }
      if (!await claims(n, r, record, recovery)) return 'claiming-prizes-affiliates-or-refunds';
      if (!await recoverRound(n, r, record)) return 'recovering-contract-funds';
      return 'collection-complete';
    }
    if (recovery || count === 10) return finish(recovery);
    if (count === 0) {
      // Once all journaled free mints are confirmed, avoid re-reading 50 wallet
      // balances every few seconds during the 24-hour wait. Recheck at its end.
      if (state.progress?.phase === 'genesis' && state.progress.minted === 50 && head.timestamp < Number(state.progress.closesAt)) return 'waiting-for-genesis-window';
      const genesis = new Contract(plan.expected.genesis, artifacts.ManekinekoGenesisV14.abi, provider);
      const end = Number(await genesis.endsAt()), start = Number(await genesis.startsAt());
      if (!start || end - start !== plan.genesis.duration || await genesis.MAX_SUPPLY() !== 1000n) throw new Error('Genesis terms changed.');
      const minted = await Promise.all(buyers.map(w => genesis.hasMinted(w.address) as Promise<boolean>));
      for (let i = 0; i < buyers.length; i++) if (minted[i] && (!completed(`genesis:mint:${i}`) || await genesis.balanceOf(buyers[i].address) !== 1n)) throw new Error('Genesis wallet activity differs from the signed rehearsal.');
      state.progress = { phase: 'genesis', minted: minted.filter(Boolean).length, wallets: 50, closesAt: end, block: head.number, gasWei: String(gasSpent()) }; await save();
      if (!minted.every(Boolean)) {
        if (head.timestamp >= end) throw new Error('Genesis closed before all managed wallets minted. Use recovery; do not report a successful rehearsal.');
        if (!await fundBuyers(0)) return 'funding-genesis-wallets';
        const pending = buyers.map((w, i) => ({w, i})).filter(({i}) => !minted[i]).slice(0, 10);
        await parallel(pending.map(({w, i}) => () => call(w, `genesis:mint:${i}`, genesis, 'mint', [], 0n, end - 1)));
        return 'minting-genesis';
      }
      // Even a fully minted collection must keep its immutable 24-hour window.
      if (head.timestamp < end) return 'waiting-for-genesis-window';
    }
    if (!await fundBuyers(count + 1)) return 'funding-buyers';
    // Top up exactly one preparation. Controller surplus cannot be recovered
    // until all 216 catalog entries finish, so never send spare ETH here.
    if (await provider.getBalance(c.target as string) !== 0n) throw new Error('Unexpected controller surplus requires review.');
    await call(bank, `prepare:${count + 1}`, c, 'prepareNext', [], await c.preparationCost()); return 'preparing';
  }
  async function verifySetup(secondary: Provider) {
    assertSepolia((await secondary.getNetwork()).chainId);
    const heads = await Promise.all([provider, secondary].map(p => p.getBlock('finalized')));
    if (heads.some(h => !h)) throw new Error('Independent finality evidence unavailable.');
    const block = Math.min(...heads.map(h => h!.number));
    const reports = await Promise.all([provider, secondary].map(p => verifyDeployment(p, plan.expected, block, async name => artifacts[name])));
    if (canonicalHash(reports[0]) !== canonicalHash(reports[1])) throw new Error('Independent full-graph verifications disagree.');
    return reports[0];
  }
  return { step, verifySetup, auditJournals, save, gasSpent, grossSpent };
}
