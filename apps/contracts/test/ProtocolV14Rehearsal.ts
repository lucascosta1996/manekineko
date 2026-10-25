import { expect } from 'chai';
import assert from 'node:assert/strict';
import { network } from 'hardhat';
import { readFile } from 'node:fs/promises';
import { makeEngine, approvalFor, type State } from '../../../scripts/protocol-v14/rehearsal/engine.mjs';
import { makePlan, canonicalHash, RECOVERY, assertSepolia } from '../../../scripts/protocol-v14/rehearsal/plan.mjs';
import { compiled } from '../../../scripts/protocol-v14/verify-deployment.mjs';
import { ChainPendingError } from '../../../scripts/season-runner/chain-transactions.js';

describe('V14 Genesis-first Sepolia buyer and recovery runner', function () {
  this.timeout(1_800_000);
  it('rejects Mainnet before any buyer operation', () => {
    expect(() => assertSepolia(1)).throws('Sepolia only');
    expect(() => assertSepolia(31337)).throws('Sepolia only');
  });
  it('executes eight sellouts, two real refunds, 500 wallet votes, 400 holder claims and returns the funds after restarts', async function () {
    const connection = await network.create('hardhatV12Rehearsal');
    const { ethers, networkHelpers: helpers } = connection;
    try {
      const publicExpected = JSON.parse(await readFile(new URL('../../../docs/deployments/sepolia-v13-2026-10-25.json', import.meta.url), 'utf8')).expected;
      const mock = await ethers.deployContract('VRFCoordinatorV2Mock');
      await helpers.setCode(publicExpected.settings.coordinator, await ethers.provider.getCode(await mock.getAddress()));
      await helpers.setStorageAt(publicExpected.settings.coordinator, 0, ethers.toBeHex(1, 32));
      await helpers.setStorageAt(publicExpected.settings.coordinator, 1, ethers.toBeHex(1, 32));
      const vrf = await ethers.getContractAt('VRFCoordinatorV2Mock', publicExpected.settings.coordinator);
      const operator = new ethers.Wallet(ethers.Wallet.createRandom().privateKey), bank = new ethers.Wallet(ethers.Wallet.createRandom().privateKey), buyers = Array.from({ length: 50 }, () => new ethers.Wallet(ethers.Wallet.createRandom().privateKey));
      await helpers.setBalance(operator.address, ethers.parseEther('100'));
      await helpers.setBalance(bank.address, ethers.parseEther('20'));
      const sender = operator.connect(ethers.provider);
      const credits = await ethers.deployContract('ManekinekoWinnerCreditsV9', [operator.address, ethers.ZeroHash, ethers.ZeroAddress], sender);
      const controller = await ethers.deployContract('ManekinekoSeasonControllerV14', [{ ...publicExpected.settings, operator: operator.address, credits: await credits.getAddress() }, publicExpected.options], sender);
      const genesis = await ethers.deployContract('ManekinekoGenesisV14', [await controller.getAddress(), await controller.voting()], sender);
      await controller.bindGenesis(await genesis.getAddress());
      const pool = await ethers.deployContract('ManekinekoHolderRewardsV13', [await controller.getAddress()], sender);
      const deployer = await ethers.deployContract('ManekinekoRoundDeployerV13', [await controller.getAddress()], sender);
      await controller.bindDeployer(await deployer.getAddress()); await controller.bindHolderRewards(await pool.getAddress());
      const catalog = publicExpected.catalog.slice(0, 11);
      await controller.appendCollections(catalog.slice(0, 10)); await controller.appendCollections(catalog.slice(10));
      await credits.approveFactory(await controller.getAddress(), ethers.keccak256(await ethers.provider.getCode(await controller.getAddress()))); await credits.sealFactories(); await controller.sealCatalog();

      const expected = { ...publicExpected, operator: operator.address, controller: await controller.getAddress(), controllerCodeHash: ethers.keccak256(await ethers.provider.getCode(await controller.getAddress())),
        genesis: await genesis.getAddress(), genesisCodeHash: ethers.keccak256(await ethers.provider.getCode(await genesis.getAddress())),
        credits: await credits.getAddress(), creditsDeploymentTx: credits.deploymentTransaction()!.hash, holderRewards: await pool.getAddress(), holderRewardsCodeHash: ethers.keccak256(await ethers.provider.getCode(await pool.getAddress())), catalog };
      await helpers.setCode(RECOVERY, '0x600060005500'); // payable runtime with a storage write
      const plan = makePlan(expected), artifacts = Object.fromEntries(await Promise.all(['ManekinekoSeasonControllerV14', 'ManekinekoRoundV13', 'ManekinekoHolderRewardsV13', 'ManekinekoRoundDeployerV13', 'ManekinekoVotingV14', 'ManekinekoGenesisV14', 'ManekinekoRendererV11', 'ManekinekoWinnerCreditsV9'].map(async name => [name, await compiled(name)])));
      artifacts.V12RehearsalFunding = { ...JSON.parse(await readFile(new URL('../artifacts/contracts/test/V12RehearsalFunding.sol/V12RehearsalFunding.json', import.meta.url), 'utf8')), immutableNames: {} };
      let state: State = { version: 1, bundleHash: 'test-frozen-runtime', planHash: canonicalHash(plan), approvalHash: '', operator: operator.address, bank: bank.address, wallets: buyers.map(w => w.address),
        operatorBaseline: String(await ethers.provider.getBalance(operator.address)), recoveryCode: await ethers.provider.getCode(RECOVERY), startBlock: await ethers.provider.getBlockNumber(), prepaidOperatingWei: '0',
        journals: {}, rounds: {}, funding: { hash: ethers.ZeroHash, amount: String(ethers.parseEther('20')), block: 1 } };
      state.approvalHash = approvalFor(state);
      let saved = JSON.stringify(state), now = (await ethers.provider.getBlock('latest'))!.timestamp;
      let sourceWaits = 0;
      const sourceGate = async (_count: number, funder?: string) => { if (funder && sourceWaits++ === 0) { expect(Object.values(state.journals).flatMap(j=>j.transactions).some(t=>t.action.startsWith('fund:buyers:'))).eq(false); return false; } return true; };
      const create = () => makeEngine(ethers.provider, plan, artifacts, state, operator, bank, buyers, async () => { saved = JSON.stringify(state); }, () => now, sourceGate);
      let engine = create(), logged = 0, restarts = 0, crashAfterClaims = false, crashAfterReturn = false, recoveryTested = false;
      const changedPlan = { ...plan, recovery: operator.address };
      expect(() => makeEngine(ethers.provider, changedPlan, artifacts, state, operator, bank, buyers, async () => {})).throws('policy differs');
      await helpers.mine(70);
      await engine.verifySetup(ethers.provider);
      for (let step = 0; step < 4500 && !state.completed; step++) {
        await helpers.mine(2); now = (await ethers.provider.getBlock('latest'))!.timestamp;
        let status: string;
        try { status = await engine.step(); } catch (error) {
          if (!(error instanceof ChainPendingError)) throw new Error(`Step ${step}, ${JSON.stringify(state.progress)}`, { cause: error });
          status = 'confirming';
        }
        if (!recoveryTested && state.rounds[1]?.complete) {
          const snapshot = await helpers.takeSnapshot(), original = JSON.stringify(state);
          let recovered = '';
          for (let recoveryStep = 0; recoveryStep < 300 && recovered !== 'recovered-available-funds'; recoveryStep++) {
            await helpers.mine(2); now = (await ethers.provider.getBlock('latest'))!.timestamp;
            try { recovered = await engine.step(true); } catch (error) { if (!(error instanceof ChainPendingError)) throw error; }
            if (recovered === 'awaiting-finality') await helpers.mine(70);
          }
          expect(recovered).eq('recovered-available-funds');
          expect(state.completed).eq(false); expect(state.recovering).eq(true);
          expect(state.accounting!.lockedHolderWei).eq(String(ethers.parseEther('1')));
          expect(await controller.roundCount()).eq(1);
          await assert.rejects(engine.step(), /Recovery mode is irreversible/);
          await snapshot.restore(); state = JSON.parse(original); saved = original; engine = create(); recoveryTested = true;
        }
        if (step === 25 || step === 180 || (!crashAfterClaims && state.rounds[2]?.complete) || (!crashAfterReturn && Object.values(state.journals).some(j => j.transactions.some(t => t.action === 'return:bank' && t.state === 'confirmed')))) {
          if (state.rounds[2]?.complete) crashAfterClaims = true;
          if (Object.values(state.journals).some(j => j.transactions.some(t => t.action === 'return:bank' && t.state === 'confirmed'))) crashAfterReturn = true;
          state = JSON.parse(saved); engine = create(); restarts++;
        }
        if (status === 'waiting-for-genesis-window') {
          expect(await controller.roundCount()).eq(0); expect(await genesis.totalMinted()).eq(50);
          await helpers.time.increaseTo(await genesis.endsAt());
        }
        const n = state.progress?.collection as number | undefined;
        if (!n || !state.rounds[n]) continue;
        if (n !== logged) { console.log(`      V14 collection ${n}/10`); logged = n; }
        const r = new ethers.Contract(state.rounds[n].address, artifacts.ManekinekoRoundV13.abi, ethers.provider);
        if (status === 'voting') {
          const v = new ethers.Contract(await controller.voting(), artifacts.ManekinekoVotingV14.abi, ethers.provider), b = await v.ballots(r.target);
          if (now < Number(b.startsAt)) await helpers.time.increaseTo(b.startsAt);
          const pending = Object.values(state.journals).some(j => j.transactions.some(t => t.state !== 'confirmed'));
          if (!pending && await r.affiliateCount() === 3n && (b.totalVotes === (n === 1 ? 50n : 1000n))) await helpers.time.increaseTo(b.endsAt);
        }
        if (status === 'waiting-for-refunds' && await r.totalMinted() === 3n) await helpers.time.increaseTo(await r.mintDeadline());
        if (status === 'waiting-for-real-chainlink') await vrf.fulfillRequest(await r.requestId(), n * 1234);
        if (status === 'awaiting-finality') await helpers.mine(70);
      }
      expect(state.completed, JSON.stringify(state.progress)).eq(true);
      expect(restarts).gte(4); expect(recoveryTested).eq(true);
      expect(await controller.roundCount()).eq(10); // Never prepare the next season.
      expect(await ethers.provider.getBalance(controller.target as string)).eq(0);
      expect(Object.values(state.rounds).filter(r => r.outcome === 'sellout')).length(8);
      expect(Object.values(state.rounds).filter(r => r.outcome === 'unsold-refund')).length(2);
      const txs = Object.values(state.journals).flatMap(j => j.transactions);
      expect(txs.filter(t => t.action.startsWith('genesis:mint:'))).length(50);
      expect(txs.filter(t => t.action.startsWith('vote:'))).length(500);
      expect(txs.filter(t => t.action.startsWith('mint:'))).length(406);
      expect(txs.filter(t => t.action.startsWith('refund:'))).length(6);
      expect(txs.filter(t => t.action.startsWith('holder:'))).length(400);
      expect(txs.filter(t => t.action.startsWith('prize:'))).length(48);
      for (const r of Object.values(state.rounds)) {
        expect(r.complete).eq(true); expect(r.evidence?.protectedBalance).eq('0');
        expect(await ethers.provider.getBalance(r.address)).eq(0);
        expect(await credits.sponsorBalance(r.address)).eq(0);
      }
      const summary = await pool.summary(plan.collections[0].seasonId);
      expect(summary.claims).eq(400); expect(summary.funded).eq(ethers.parseEther('8')); expect(summary.paid).eq(summary.funded);
      expect(await ethers.provider.getBalance(pool.target as string)).eq(0);
      expect(await ethers.provider.getBalance(operator.address)).gte(BigInt(state.operatorBaseline));
      const a = state.accounting!;
      expect(BigInt(a.chainlinkWei)).eq(ethers.parseEther('0.008'));
      expect(BigInt(a.fundingWei)).eq(BigInt(a.returnedWei) + BigInt(a.gasWei) + BigInt(a.chainlinkWei) + BigInt(a.walletDustWei));
      expect(await ethers.provider.getBalance(RECOVERY)).eq(BigInt(a.returnedWei));
      expect(BigInt(a.returnedWei)).gt(ethers.parseEther('18'));
      await engine.auditJournals();
      console.log(`      Reconciled: ${JSON.stringify(a)}`);
    } finally { await connection.close(); }
  });
});
