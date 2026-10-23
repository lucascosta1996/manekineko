import { Contract, ContractFactory, Transaction, Wallet, ZeroAddress, ZeroHash, getAddress, keccak256, parseEther, parseUnits, zeroPadValue, id, type Provider, type TransactionRequest } from 'ethers';
import { createTransactionPipeline, ChainPendingError, transactionSpend, type ChainJournal } from '../../season-runner/chain-transactions.ts';
import { verifyDeployment, verifyRuntime, type Compiled, type DeploymentExpectation } from '../verify-deployment.mts';
import { assertSepolia, canonicalHash, PROFILE, type Plan } from './plan.mts';

export type RoundRecord = { address: string; createdBlock: number; outcome?: 'sellout' | 'unsold-refund'; complete?: boolean; sponsorship?: string; evidence?: Record<string, string> };
export type State = {
  version: 1; profile: string; bundleHash: string; planHash: string; approvalHash: string; operator: string; wallets: string[];
  deployments: Record<string, string>; journals: Record<string, ChainJournal>; rounds: Record<string, RoundRecord>;
  setupVerified?: boolean; completed?: boolean; updatedAt?: string; progress?: Record<string, unknown>;
};
export function approvalFor(state: Pick<State, 'bundleHash' | 'planHash' | 'operator' | 'wallets'>) {
  return canonicalHash({ chainId: 11155111, bundleHash: state.bundleHash, planHash: state.planHash, operator: state.operator, wallets: state.wallets });
}
export function makeEngine(provider: Provider, plan: Plan, artifacts: Record<string, Compiled>, state: State, operator: Wallet, wallets: Wallet[], persist: () => Promise<void>, now = () => Date.now() / 1000) {
  assertSepolia(plan.chainId);
  if (plan.profile !== PROFILE || state.profile !== PROFILE || state.planHash !== canonicalHash(plan) || state.approvalHash !== approvalFor(state) ||
    state.operator !== operator.address || wallets.length !== 100 || JSON.stringify(state.wallets) !== JSON.stringify(wallets.map(w => w.address))) throw new Error('Rehearsal plan, operator or vault binding changed.');
  const limit = parseEther(plan.maxGrossSpendEth), fee = parseUnits(plan.maxFeeGwei, 'gwei');
  const signers = new Map([operator, ...wallets].map(w => [w.address, w]));
  let saveQueue: Promise<void> = Promise.resolve();
  const save = () => {
    saveQueue = saveQueue.then(async () => {
      if (spent() > limit) throw new Error('Aggregate rehearsal spending cap reached.');
      state.updatedAt = new Date().toISOString(); await persist();
    });
    return saveQueue;
  };
  const spent = () => Object.values(state.journals).reduce((sum, j) => sum + j.transactions.reduce((s, e) => s + transactionSpend(e), 0n), 0n);
  const pipeline = (wallet: Wallet) => {
    const journal = state.journals[wallet.address] ??= { version: 1, chainId: 11155111, from: wallet.address, maxFeePerGasWei: String(fee), maxTotalSpendWei: String(limit), transactions: [], collections: {} };
    if (journal.chainId !== 11155111 || journal.from !== wallet.address || journal.maxFeePerGasWei !== String(fee) || journal.maxTotalSpendWei !== String(limit)) throw new Error('Journal spending policy changed.');
    return createTransactionPipeline({ provider, signer: wallet, execute: true, journal, save, confirmations: plan.confirmations });
  };
  const send = (wallet: Wallet, action: string, request: TransactionRequest, deadline?: number) => pipeline(wallet).send(action, request, { broadcastDeadline: deadline });
  const contract = (name: string, address: string) => new Contract(address, artifacts[name].abi, provider);
  const call = (wallet: Wallet, action: string, c: Contract, fn: string, args: unknown[] = [], value = 0n, deadline?: number) =>
    send(wallet, action, { to: String(c.target), data: c.interface.encodeFunctionData(fn, args), value }, deadline);
  async function parallel(jobs: (() => Promise<unknown>)[]) {
    const results = await Promise.allSettled(jobs.map(job => job()));
    const fatal = results.find(r => r.status === 'rejected' && !(r.reason instanceof ChainPendingError));
    if (fatal?.status === 'rejected') throw fatal.reason;
    return results.every(r => r.status === 'fulfilled');
  }
  async function reconcile() {
    const jobs = Object.values(state.journals).flatMap(j => {
      const pending = j.transactions.find(e => e.state !== 'confirmed'); if (!pending) return [];
      const signer = signers.get(getAddress(j.from)); if (!signer) throw new Error('Unknown journal signer.');
      const tx = Transaction.from(pending.rawTransaction);
      return [() => send(signer, pending.action, { to: tx.to, data: tx.data, value: tx.value }, pending.broadcastDeadline)];
    });
    return parallel(jobs);
  }
  async function auditJournals() {
    for (const j of Object.values(state.journals)) {
      const signer = signers.get(getAddress(j.from)); if (!signer) throw new Error('Unknown journal signer.');
      await pipeline(signer).confirmAll();
    }
  }
  const settings = () => ({ operator: operator.address, coordinator: plan.coordinator, credits: state.deployments.credits, keyHash: plan.keyHash,
    confirmations: plan.vrfConfirmations, callbackGas: plan.callbackGas, votingDuration: plan.votingDuration, votingDelay: plan.votingDelay,
    randomnessBudget: plan.randomnessBudget, sponsorshipBudget: plan.sponsorshipBudget, bootstrapAllowed: true });
  async function expectation(): Promise<DeploymentExpectation> {
    const tx = state.journals[operator.address].transactions.find(t => t.action === 'deploy:credits');
    if (!tx || !state.deployments.controller) throw new Error('Deployment is incomplete.');
    return { chainId: 11155111, controller: state.deployments.controller, controllerCodeHash: keccak256(await provider.getCode(state.deployments.controller)),
      operator: operator.address, credits: state.deployments.credits, previousRegistry: ZeroAddress, legacyMerkleRoot: ZeroHash,
      creditsDeploymentTx: tx.hash, settings: settings(), options: plan.options,
      catalog: plan.collections.map(({ seasonId, seasonName, name, symbol, color, textColor }) => ({ seasonId, seasonName, name, symbol, color, textColor })) };
  }
  async function deploy(key: string, name: string, args: unknown[] = []) {
    const request = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode).getDeployTransaction(...args);
    const receipt = await send(operator, `deploy:${key}`, request);
    if (!receipt.contractAddress) throw new Error('Deployment receipt has no contract address.');
    state.deployments[key] = getAddress(receipt.contractAddress); await save();
  }
  async function setup() {
    const d = state.deployments;
    if (!d.credits) { await deploy('credits', 'ManekinekoWinnerCreditsV8', [operator.address, ZeroHash, ZeroAddress]); return false; }
    if (!d.controller) { await deploy('controller', 'ManekinekoSeasonControllerV12', [settings(), plan.options]); return false; }
    if (!d.deployer) { await deploy('deployer', 'ManekinekoRoundDeployerV12', [d.controller]); return false; }
    if (!d.funder) { await deploy('funder', 'V12RehearsalFunding'); return false; }
    verifyRuntime(await provider.getCode(d.funder), artifacts.V12RehearsalFunding, {});
    const c = contract('ManekinekoSeasonControllerV12', d.controller), credits = contract('ManekinekoWinnerCreditsV8', d.credits);
    if (await c.REHEARSAL_PROFILE() !== PROFILE) throw new Error('Not the explicitly accelerated Sepolia controller.');
    if (await c.deployer() === ZeroAddress) { await call(operator, 'bind-deployer', c, 'bindDeployer', [d.deployer]); return false; }
    if (await credits.approvedFactoryCodeHash(d.controller) === ZeroHash) { await call(operator, 'approve-controller', credits, 'approveFactory', [d.controller, keccak256(await provider.getCode(d.controller))]); return false; }
    if (!await credits.factoriesSealed()) { await call(operator, 'seal-factories', credits, 'sealFactories'); return false; }
    const count = Number(await c.catalogCount());
    if (count < plan.collections.length) {
      const batch = plan.collections.slice(count, count + 10).map(({ seasonId, seasonName, name, symbol, color, textColor }) => ({ seasonId, seasonName, name, symbol, color, textColor }));
      await call(operator, `catalog:${count}`, c, 'appendCollections', [batch]); return false;
    }
    if (!await c.catalogSealed()) { await call(operator, 'seal-catalog', c, 'sealCatalog'); return false; }
    return true;
  }
  async function fundWallets(label: string) {
    const target = 20n * plan.options.reduce((max, o) => BigInt(o.price) > max ? BigInt(o.price) : max, 0n) + parseEther(plan.walletGasReserveEth);
    const balances: bigint[] = [];
    for (let i = 0; i < wallets.length; i += 10) balances.push(...await Promise.all(wallets.slice(i, i + 10).map(w => provider.getBalance(w.address))));
    const recipients: string[] = [], amounts: bigint[] = [];
    balances.forEach((balance, i) => { if (balance < target) { recipients.push(wallets[i].address); amounts.push(target - balance); } });
    if (!recipients.length) return true;
    const previous = state.journals[operator.address]?.transactions.filter(t => t.action.startsWith(`fund:${label}:`)).length ?? 0;
    await call(operator, `fund:${label}:${previous}`, contract('V12RehearsalFunding', state.deployments.funder), 'fund', [recipients, amounts], amounts.reduce((a, b) => a + b, 0n));
    return false;
  }
  async function sourceFor(wallet: Wallet, source: RoundRecord) {
    const logs = await provider.getLogs({ address: source.address, fromBlock: source.createdBlock, toBlock: 'latest', topics: [id('Transfer(address,address,uint256)'), zeroPadValue(ZeroAddress, 32), zeroPadValue(wallet.address, 32)] });
    const token = logs[0]?.topics[3]; if (!token) throw new Error('Managed affiliate has no eligible source NFT.');
    const r = contract('ManekinekoRoundV12', source.address);
    if (getAddress(await r.ownerOf(BigInt(token))) !== wallet.address) throw new Error('Affiliate source NFT moved outside the rehearsal.');
    return BigInt(token);
  }
  function sourceBefore(round: number) {
    return Object.entries(state.rounds).filter(([key, r]) => Number(key) < round && r.outcome === 'sellout').sort(([a], [b]) => Number(b) - Number(a))[0]?.[1];
  }
  async function enrollAndVote(number: number, round: Contract, end: number) {
    const source = sourceBefore(number), voting = contract('ManekinekoVotingV12', await round.voting());
    const jobs: (() => Promise<unknown>)[] = [];
    for (let i = 0; i < 3; i++) {
      const wallet = wallets[i], affiliate = await round.affiliateIdOf(wallet.address);
      if (affiliate === 0n) {
        if (!source && number !== 1) throw new Error('No successful source for expected affiliate enrollment.');
        const token = source ? await sourceFor(wallet, source) : 0n;
        jobs.push(() => call(wallet, `enroll:${number}`, round, 'enrollAffiliate', [i + 1, source?.address ?? ZeroAddress, token], 0n, end - 1));
      } else if (affiliate !== BigInt(i + 1)) throw new Error('An expected affiliate position is occupied by a different enrollment.');
      else if (source && !await voting.sourceVoted(String(round.target), wallet.address, source.address))
        jobs.push(() => call(wallet, `vote:${number}`, voting, 'castVote', [round.target, plan.collections[number - 1].choice, [source.address]], 0n, end - 1));
    }
    await parallel(jobs); return jobs.length === 0;
  }
  async function sponsor(number: number, round: Contract, record: RoundRecord, deadline: number) {
    if (record.sponsorship !== undefined || plan.collections[number - 1].scenario !== 'sellout') return true;
    const source = sourceBefore(number), credits = contract('ManekinekoWinnerCreditsV8', state.deployments.credits);
    if (source) {
      const previous = contract('ManekinekoRoundV12', source.address);
      for (let rank = 1; rank <= Number(await previous.winnerCount()); rank++) {
        const owner = getAddress(await previous.ownerOf(await previous.winningTokenIds(rank))), wallet = signers.get(owner);
        if (!wallet) throw new Error('An external holder owns a rehearsal winner.');
        if (wallets.findIndex(w => w.address === owner) >= Number(await round.maxSupply()) / 20) continue;
        if (!await credits.lifetimeRewardUsed(owner)) {
          await call(wallet, `sponsor:${number}`, credits, 'claimAndRedeemAward', [source.address, rank, round.target], 0n, deadline - 1);
          record.sponsorship = owner; await save(); return true;
        }
        // Resume after a mined redemption even if the state write was interrupted.
        const credit = await credits.creditsForAward(source.address, rank);
        if (getAddress(credit.redeemedIn) === getAddress(String(round.target))) { record.sponsorship = owner; await save(); return true; }
      }
    }
    record.sponsorship = 'none-available'; await save(); return true;
  }
  async function mint(number: number, round: Contract, record: RoundRecord, deadline: number) {
    const scenario = plan.collections[number - 1], minted = await round.totalMinted(), supply = await round.maxSupply();
    const expectedOption = number === 1 ? plan.options[0] : plan.options[scenario.choice];
    if (supply !== BigInt(expectedOption.supply) || await round.mintPrice() !== BigInt(expectedOption.price) || await round.winnerCount() !== BigInt(expectedOption.winners)) throw new Error('Voting outcome differs from the planned exercise.');
    if (Number(await round.affiliateCount()) !== 3) throw new Error('The three rehearsal affiliates did not enroll before the deadline.');
    if (scenario.scenario === 'unsold-refund' && minted > 3n) throw new Error('Unexpected mints changed the refund scenario.');
    await sponsor(number, round, record, deadline);
    // Every managed recipient has a deterministic quota; parallel batches cannot overfill the supply.
    const jobs: (() => Promise<unknown>)[] = [], price = await round.mintPrice(), terms = await round.termsHash();
    for (let i = 0; i < wallets.length && jobs.length < 10; i++) {
      const wallet = wallets[i], quota = scenario.scenario === 'unsold-refund' ? (i < 3 ? 1n : 0n) : (BigInt(i) * 20n < supply ? 20n : 0n);
      const held = await round.mintedPerWallet(wallet.address);
      if (held > quota) throw new Error('Unexpected managed-wallet mint count.');
      if (held < quota) {
        const affiliate = i % 3 + 1 === i + 1 ? (i + 1) % 3 + 1 : i % 3 + 1;
        const quantity = quota - held;
        // Reserve the final recipient for a fresh estimate that includes sellout accounting + VRF.
        // Concurrent estimates before sellout cannot see those extra writes.
        if (scenario.scenario === 'sellout' && BigInt(i + 1) * 20n === supply && supply - minted > quantity) continue;
        jobs.push(() => call(wallet, `mint:${number}:${held}`, round, 'mintQuoted', [wallet.address, quantity, affiliate, terms], price * quantity, deadline - 1));
      }
    }
    await parallel(jobs);
  }
  async function settleClaims(number: number, round: Contract, record: RoundRecord) {
    const scenario = plan.collections[number - 1];
    if (await round.refundsAvailable()) {
      if (scenario.scenario !== 'unsold-refund' || await round.soldOut()) throw new Error('A planned sellout failed. Preserve evidence; do not label the run passed.');
      if (await round.totalMinted() !== 3n || await round.totalMintRevenue() !== 3n * await round.mintPrice()) throw new Error('Refund test mint receipts differ from the expected three tickets.');
      if (await round.totalRefunded() < await round.totalMintRevenue()) {
        const jobs: (() => Promise<unknown>)[] = [];
        for (let token = 1; token <= 3; token++) {
          try {
            const owner = getAddress(await round.ownerOf(token)), wallet = signers.get(owner); if (!wallet) throw new Error('External refund holder requires manual action.');
            jobs.push(() => call(wallet, `refund:${number}:${token}`, round, 'refund', [token, operator.address]));
          } catch (error: any) {
            const refunded = Object.values(state.journals).some(j => j.transactions.some(t => t.action === `refund:${number}:${token}` && t.state === 'confirmed'));
            if (!refunded) throw error;
          }
        }
        await parallel(jobs); return false;
      }
      record.outcome = 'unsold-refund';
    } else {
      if (scenario.scenario !== 'sellout' || !await round.revealed()) throw new Error('Collection did not reach its expected outcome.');
      const price = BigInt(await round.mintPrice()), supply = BigInt(await round.maxSupply()), revenue = price * supply;
      if (await round.totalMintRevenue() !== revenue || await round.affiliateQualifiedCount() !== 3n || await round.affiliateEqualShare() !== revenue / 5n / 3n) throw new Error('Affiliate or mint accounting mismatch.');
      for (let rank = 1; rank <= Number(await round.winnerCount()); rank++) if (!await round.prizeClaimed(rank)) {
        const owner = getAddress(await round.ownerOf(await round.winningTokenIds(rank))), wallet = signers.get(owner);
        if (!wallet) throw new Error('External prize holder requires manual action.');
        await call(wallet, `prize:${number}:${rank}`, round, 'claimPrizeForRank', [rank, operator.address]); return false;
      }
      for (let i = 0; i < 3; i++) if (await round.affiliateClaimable(i + 1) > 0n) {
        await call(wallets[i], `affiliate:${number}:${i + 1}`, round, 'claimAffiliateCommission', [operator.address]); return false;
      }
      if (await round.totalAffiliateClaimed() !== await round.totalAffiliateAccrued()) throw new Error('Affiliate claims incomplete.');
      record.outcome = 'sellout';
    }
    record.evidence = { totalMinted: String(await round.totalMinted()), revenue: String(await round.totalMintRevenue()), refunds: String(await round.totalRefunded()),
      ordinaryOperatorProceeds: String(await round.operatorWithdrawable()), protectedBalance: String(await round.protectedBalance()) };
    await save(); return true;
  }
  async function recover(number: number, round: Contract) {
    const credits = contract('ManekinekoWinnerCreditsV8', state.deployments.credits), sponsored = await credits.sponsorBalance(round.target);
    if (sponsored > 0n) { await call(operator, `recover-sponsor:${number}`, credits, 'withdrawSponsorship', [round.target, operator.address, sponsored]); return false; }
    if (await round.refundsAvailable() && await round.executionReserve() > 0n) { await call(operator, `recover-execution:${number}`, round, 'recoverExecutionFunding'); return false; }
    const growth = await round.growthReserveBalance();
    if (await round.revealed() && growth > 0n) { await call(operator, `recover-growth:${number}`, round, 'withdrawGrowthReserve', [operator.address, growth]); return false; }
    if (!await round.subscriptionClosed()) { await call(operator, `recover-vrf:${number}`, round, 'withdrawRandomnessFunding', [operator.address]); return false; }
    return true;
  }
  async function sweepWallets() {
    if (await provider.getCode(operator.address) !== '0x') throw new Error('Test-fund recovery requires the original EOA operator.');
    const jobs: (() => Promise<unknown>)[] = [];
    // Keep the maximum fee for a 21,000-gas transfer plus the pipeline's 20% margin.
    const reserve = 25200n * fee;
    for (let i = 0; i < wallets.length && jobs.length < 10; i++) {
      const wallet = wallets[i], action = `sweep:${i}`;
      if (state.journals[wallet.address]?.transactions.some(t => t.action === action && t.state === 'confirmed')) continue;
      const balance = await provider.getBalance(wallet.address);
      if (balance > reserve) jobs.push(() => send(wallet, action, { to: operator.address, value: balance - reserve }));
    }
    await parallel(jobs); return jobs.length === 0;
  }
  let audited = false;
  async function step() {
    assertSepolia((await provider.getNetwork()).chainId);
    const head = await provider.getBlock('latest');
    if (!head || Math.abs(now() - head.timestamp) > 180) throw new Error('Rehearsal RPC head is stale.');
    if (!await reconcile()) return 'confirming';
    if (!audited) { await auditJournals(); audited = true; }
    // Settlement may advance roundCount before a crash lets us persist the completion marker.
    for (const tx of state.journals[operator.address]?.transactions ?? []) {
      if (tx.state === 'confirmed' && /^settle:\d+$/.test(tx.action)) {
        const previous = state.rounds[tx.action.split(':')[1]];
        if (!previous?.outcome) throw new Error('Settlement lacks its preceding claims evidence.');
        if (!previous.complete) { previous.complete = true; await save(); }
      }
    }
    if (!await setup()) return 'setting-up';
    const c = contract('ManekinekoSeasonControllerV12', state.deployments.controller), count = Number(await c.roundCount());
    if (!state.setupVerified) return 'needs-deployment-verification';
    if (count === 0) {
      if (!await fundWallets('initial')) return 'funding-wallets';
      const cost = await c.preparationCost(), balance = await provider.getBalance(c.target as string);
      await call(operator, 'prepare:first', c, 'prepareNext', [], cost > balance ? cost - balance : 0n); return 'preparing';
    }
    const address = getAddress(await c.rounds(count)), round = contract('ManekinekoRoundV12', address);
    let record = state.rounds[count];
    if (!record) {
      const logs = await provider.getLogs({ address: c.target as string, fromBlock: state.journals[operator.address].transactions.find(t => t.action === 'deploy:controller')!.blockNumber!, toBlock: 'latest', topics: [c.interface.getEvent('CollectionPrepared')!.topicHash, zeroPadValue('0x' + count.toString(16).padStart(2, '0'), 32)] });
      if (logs.length !== 1) throw new Error('Collection preparation evidence missing or duplicated.');
      record = state.rounds[count] = { address, createdBlock: logs[0].blockNumber }; await save();
    }
    if (record.address !== address || await round.CONTRACT_VERSION() !== 'affiliate-v12' || getAddress(await round.voting()) !== getAddress(await c.voting())) throw new Error('Prepared round binding changed.');
    const phase = Number(await round.phase()), ballot = await contract('ManekinekoVotingV12', await c.voting()).ballots(address);
    state.progress = { season: plan.collections[count - 1].season, collection: count, totalCollections: 20, name: plan.collections[count - 1].name,
      phase, block: head.number, chainTimestamp: head.timestamp, voteEnd: String(ballot.endsAt), mintDeadline: String(await round.mintDeadline()), randomnessDeadline: String(await round.randomnessDeadline()),
      minted: String(await round.totalMinted()), supply: String(await round.maxSupply()), grossSpentWei: String(spent()) }; await save();
    if (phase === 0) {
      if (head.timestamp >= Number(ballot.startsAt)) await enrollAndVote(count, round, Number(ballot.endsAt));
      return 'voting';
    }
    if (phase === 1) { await mint(count, round, record, Number(await round.mintDeadline())); return plan.collections[count - 1].scenario === 'unsold-refund' ? 'waiting-for-refunds' : 'minting'; }
    if (phase === 2) { await call(wallets[99], `request:${count}`, round, 'requestRandomness'); return 'requesting-randomness'; }
    if (phase === 3) return 'waiting-for-vrf';
    if (phase === 4) { await call(wallets[99], `finalize:${count}:${await round.drawCounter()}`, round, 'finalizeDrawAndClaim', [operator.address]); return 'finalizing'; }
    if (!await settleClaims(count, round, record)) return 'claiming';
    if (!await recover(count, round)) return 'recovering-operating-funds';
    if (!record.complete) {
      if (count < plan.collections.length && !await fundWallets(`before:${count + 1}`)) return 'funding-wallets';
      const proceeds = await round.operatorWithdrawable(), expected = record.outcome === 'sellout' ? await round.totalMintRevenue() / 5n : 0n;
      if (proceeds !== expected) throw new Error('Expected operator 20% changed outside this run.');
      const cost = count < plan.collections.length ? await c.preparationCost() : 0n, balance = await provider.getBalance(c.target as string);
      await call(operator, `settle:${count}`, c, 'settleAndPrepare', [count, proceeds], cost > balance ? cost - balance : 0n);
      record.complete = true; await save(); return 'settled';
    }
    if (count === plan.collections.length) {
      if (Object.values(state.rounds).length !== 20 || Object.values(state.rounds).some(r => !r.complete)) throw new Error('Not all collection outcomes were reconciled.');
      if (!await sweepWallets()) return 'recovering-wallet-balances';
      state.completed = true; await save(); return 'complete';
    }
    return 'continuing';
  }
  async function verifySetup(secondary: Provider) {
    assertSepolia((await secondary.getNetwork()).chainId);
    const expected = await expectation(), heads = await Promise.all([provider.getBlock('finalized'), secondary.getBlock('finalized')]);
    if (heads.some(h => !h)) throw new Error('Finalized deployment state unavailable.');
    const block = Math.min(...heads.map(h => h!.number));
    const seal = state.journals[operator.address].transactions.find(t => t.action === 'seal-catalog');
    if (!seal?.blockNumber || block < seal.blockNumber) return false;
    const reports = await Promise.all([provider, secondary].map(p => verifyDeployment(p, expected, block, async name => artifacts[name])));
    if (canonicalHash(reports[0]) !== canonicalHash(reports[1])) throw new Error('Independent deployment verifications disagree.');
    state.setupVerified = true; await save(); return true;
  }
  return { step, verifySetup, expectation, spent, auditJournals, save };
}
