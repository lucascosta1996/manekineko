import { expect } from 'chai';
import { network, artifacts as hardhatArtifacts } from 'hardhat';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildRehearsal } from '../../../scripts/protocol-v12/rehearsal/build.mjs';
import { loadBundle } from '../../../scripts/protocol-v12/rehearsal/sepolia.mjs';
import { makeEngine, approvalFor, type State } from '../../../scripts/protocol-v12/rehearsal/engine.mjs';
import { canonicalHash, PROFILE } from '../../../scripts/protocol-v12/rehearsal/plan.mjs';
import { ChainPendingError } from '../../../scripts/season-runner/chain-transactions.js';

describe('V12 frozen two-season Sepolia rehearsal', function () {
  this.timeout(900000);
  let bundle: Awaited<ReturnType<typeof loadBundle>>, directory: string | undefined;
  before(async () => {
    if (process.env.V12_FAST_RUNTIME) bundle = await loadBundle(process.env.V12_FAST_RUNTIME);
    else {
      const parent = await mkdtemp(join(tmpdir(), 'tincta-fast-contracts-')); directory = parent;
      await buildRehearsal(join(parent, 'runtime')); bundle = await loadBundle(join(parent, 'runtime'));
    }
  });
  after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
  it('refuses accelerated deployment on Mainnet and leaves production timing unchanged', async () => {
    const connection = await network.create({ network: 'hardhatMainnet', override: { chainId: 1 } });
    const { ethers } = connection;
    const [sender] = await ethers.getSigners();
    const a = bundle.artifacts.ManekinekoSeasonControllerV12;
    const credits = await ethers.deployContract('ManekinekoWinnerCreditsV8', [sender.address, ethers.ZeroHash, ethers.ZeroAddress]);
    const coordinator = await ethers.deployContract('VRFCoordinatorV2Mock');
    const settings = { operator: sender.address, coordinator: await coordinator.getAddress(), credits: await credits.getAddress(), keyHash: bundle.plan.keyHash, confirmations: 64, callbackGas: 200000, votingDuration: 900, votingDelay: 60, randomnessBudget: 1, sponsorshipBudget: 1, bootstrapAllowed: true };
    const factory = new ethers.ContractFactory(a.abi, a.bytecode, sender);
    await expect(factory.deploy(settings, bundle.plan.options)).revertedWithCustomError(factory, 'InvalidConfiguration');
    const funder = bundle.artifacts.V12RehearsalFunding;
    await expect(new ethers.ContractFactory(funder.abi, funder.bytecode, sender).deploy()).revertedWith('Sepolia only');
    expect(await readFile(new URL('../contracts/ManekinekoVotingV12.sol', import.meta.url), 'utf8')).includes('t.duration < 1 hours');
    expect(await readFile(new URL('../contracts/ManekinekoSeasonControllerV12.sol', import.meta.url), 'utf8')).includes('config.votingDuration < 1 hours');
    expect(await readFile(new URL('../contracts/ManekinekoV12Policy.sol', import.meta.url), 'utf8')).includes('RANDOMNESS_TIMEOUT = 3 days');
    await connection.close();
  });
  it('runs all twenty collections, varied votes, sponsored mints, equal affiliates, claims, refunds and restart recovery', async () => {
    const connection = await network.create('hardhatV12Rehearsal');
    const { ethers, networkHelpers: helpers } = connection;
    const mock = await ethers.deployContract('VRFCoordinatorV2Mock');
    await helpers.setCode(bundle.plan.coordinator, await ethers.provider.getCode(await mock.getAddress()));
    await helpers.setStorageAt(bundle.plan.coordinator, 0, ethers.toBeHex(1, 32));
    await helpers.setStorageAt(bundle.plan.coordinator, 1, ethers.toBeHex(1, 32));
    const vrf = await ethers.getContractAt('VRFCoordinatorV2Mock', bundle.plan.coordinator);
    const operator = new ethers.Wallet(ethers.Wallet.createRandom().privateKey), wallets = Array.from({ length: 100 }, () => new ethers.Wallet(ethers.Wallet.createRandom().privateKey));
    await helpers.setBalance(operator.address, ethers.parseEther('100'));
    let state: State = { version: 1, profile: PROFILE, bundleHash: bundle.bundleHash, planHash: canonicalHash(bundle.plan), approvalHash: '', operator: operator.address, wallets: wallets.map(w => w.address), deployments: {}, journals: {}, rounds: {} };
    state.approvalHash = approvalFor(state);
    let saved = JSON.stringify(state), now = (await ethers.provider.getBlock('latest'))!.timestamp, restarts = 0, settlementCrash = false;
    const create = () => makeEngine(ethers.provider, bundle.plan, bundle.artifacts, state, operator, wallets, async () => { saved = JSON.stringify(state); }, () => now);
    let engine = create(), loggedRound = 0;
    for (let step = 0; step < 1800 && !state.completed; step++) {
      await helpers.mine(2); now = (await ethers.provider.getBlock('latest'))!.timestamp;
      let status: string;
      try { status = await engine.step(); } catch (e) {
        if (!(e instanceof ChainPendingError)) {
          const pending = Object.values(state.journals).flatMap(j => j.transactions.filter(t => t.state !== 'confirmed').map(t => ({ action: t.action, gas: String(ethers.Transaction.from(t.rawTransaction).gasLimit) })));
          throw new Error(`Rehearsal step ${step}, progress ${JSON.stringify(state.progress)}, pending ${JSON.stringify(pending)}`, { cause: e });
        }
        status = 'confirming';
      }
      if (status === 'needs-deployment-verification') expect(await engine.verifySetup(ethers.provider)).eq(true);
      if (step === 18 || step === 100) { state = JSON.parse(saved); engine = create(); restarts++; }
      if (!settlementCrash && state.rounds['1']?.complete) {
        state.rounds['1'].complete = false; saved = JSON.stringify(state); state = JSON.parse(saved); engine = create(); settlementCrash = true;
      }
      const current = state.progress?.collection as number | undefined;
      if (!current || !state.rounds[current]) continue;
      if (current !== loggedRound) { console.log(`      Exercising collection ${current}/20`); loggedRound = current; }
      const round = new ethers.Contract(state.rounds[current].address, bundle.artifacts.ManekinekoRoundV12.abi, ethers.provider);
      if (status === 'voting') {
        const voting = new ethers.Contract(await round.voting(), bundle.artifacts.ManekinekoVotingV12.abi, ethers.provider), ballot = await voting.ballots(round.target);
        if (now < Number(ballot.startsAt)) await helpers.time.increaseTo(ballot.startsAt);
        const pending = Object.values(state.journals).some(j => j.transactions.some(t => t.state !== 'confirmed'));
        if (!pending && await round.affiliateCount() === 3n && (current === 1 || ballot.totalVotes === 60n)) await helpers.time.increaseTo(ballot.endsAt);
      }
      if (status === 'waiting-for-refunds' && await round.totalMinted() === 3n) await helpers.time.increaseTo(await round.mintDeadline());
      if (status === 'waiting-for-vrf') await vrf.fulfillRequest(await round.requestId(), current * 1234);
    }
    expect(state.completed, JSON.stringify(state.progress)).eq(true);
    expect(restarts).eq(2); expect(settlementCrash).eq(true);
    expect(Object.values(state.rounds).filter(r => r.outcome === 'sellout').length).eq(18);
    expect(Object.values(state.rounds).filter(r => r.outcome === 'unsold-refund').length).eq(2);
    expect(Object.values(state.rounds).filter(r => r.sponsorship && r.sponsorship !== 'none-available').length).greaterThan(0);
    for (const record of Object.values(state.rounds)) {
      const round = new ethers.Contract(record.address, bundle.artifacts.ManekinekoRoundV12.abi, ethers.provider);
      expect(record.complete).eq(true);
      expect(await round.protectedBalance()).eq(0);
      expect(await ethers.provider.getBalance(record.address)).eq(0);
      expect(await round.operatorWithdrawn()).eq(record.outcome === 'sellout' ? await round.totalMintRevenue() / 5n : 0n);
      expect(await round.subscriptionClosed()).eq(true);
    }
    expect(engine.spent()).lessThan(ethers.parseEther(bundle.plan.maxGrossSpendEth));
    await engine.auditJournals();
    await connection.close();
  });
});
