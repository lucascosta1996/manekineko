import { expect } from 'chai';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publicationSpecs } from '../../../scripts/protocol-v14/publication-specs.mts';
import { exactSourceJob } from '../../../scripts/protocol-v14/source-publication.mts';
import { network } from 'hardhat';
import { readProtocol } from '../../../packages/protocol/src/chain.js';
import { genesisMintTransaction } from '../../../packages/protocol/src/genesis.js';
import { operatorActions } from '../../../packages/protocol/src/operator-actions.js';
import { workerRuntime, verifyWorkerRound } from '../../../scripts/protocol-v12/runtime.js';
import { executeOnce } from '../../../scripts/protocol-v12/executor.mjs';
import { verifyDeployment } from '../../../scripts/protocol-v14/verify-deployment.mjs';
const { ethers, networkHelpers } = await network.create();
const { time, loadFixture } = networkHelpers;
const price = ethers.parseEther('0.01');
const season = ethers.id('V14 fictional season');
async function fixture() {
  const [operator, alice, bob, carol] = await ethers.getSigners();
  const vrf = await ethers.deployContract('VRFCoordinatorV2Mock');
  const credits = await ethers.deployContract('ManekinekoWinnerCreditsV9', [operator.address, ethers.ZeroHash, ethers.ZeroAddress]);
  const settings = { operator: operator.address, coordinator: await vrf.getAddress(), credits: await credits.getAddress(), keyHash: ethers.id('mock'), confirmations: 64, callbackGas: 200000, votingDuration: 3600, votingDelay: 60, randomnessBudget: price, sponsorshipBudget: price, bootstrapAllowed: true };
  const options = [{ supply: 1000, price, winners: 6, duration: 3600 }, { supply: 1000, price: 2n * price, winners: 4, duration: 3600 }];
  const controller = await ethers.deployContract('ManekinekoSeasonControllerV14', [settings, options]);
  const voting = await ethers.getContractAt('ManekinekoVotingV14', await controller.voting());
  const genesis = await ethers.deployContract('ManekinekoGenesisV14', [await controller.getAddress(), await voting.getAddress()]);
  const pool = await ethers.deployContract('ManekinekoHolderRewardsV13', [await controller.getAddress()]);
  const deployer = await ethers.deployContract('ManekinekoRoundDeployerV13', [await controller.getAddress()]);
  await controller.bindDeployer(await deployer.getAddress());
  await controller.bindHolderRewards(await pool.getAddress());
  const catalog = [1, 2, 3].map(i => ({ seasonId: i <= 2 ? season : ethers.id('Second V14 season'), seasonName: i <= 2 ? 'V14 fictional season' : 'Second V14 season', name: `Fictional ${i}`, symbol: `FREE${i}`, color: '#330000', textColor: '#FFFFFF' }));
  await controller.appendCollections(catalog);
  await credits.approveFactory(await controller.getAddress(), ethers.keccak256(await ethers.provider.getCode(await controller.getAddress())));
  await credits.sealFactories();
  return { operator, alice, bob, carol, vrf, credits, controller, voting, genesis, pool, settings, options, catalog };
}
async function opened() {
  const c = await fixture();
  await c.controller.bindGenesis(await c.genesis.getAddress());
  await c.controller.sealCatalog();
  await c.operator.sendTransaction({ to: await c.controller.getAddress(), value: ethers.parseEther('1') });
  return c;
}
async function firstBallot() {
  const c = await opened();
  await c.genesis.connect(c.alice).mint();
  await c.genesis.connect(c.bob).mint();
  await time.increaseTo(await c.genesis.endsAt());
  await c.controller.prepareNext();
  const round = await ethers.getContractAt('ManekinekoRoundV13', await c.controller.rounds(1));
  await time.increaseTo((await round.saleStartAt()) - 3600n);
  return { ...c, round };
}
async function config(c: Awaited<ReturnType<typeof fixture>>) {
  return { version: 14 as const, chainId: 31337, rpcUrl: '', controller: await c.controller.getAddress(), codeHash: ethers.keccak256(await ethers.provider.getCode(await c.controller.getAddress())), holderRewardsCodeHash: ethers.keccak256(await ethers.provider.getCode(await c.pool.getAddress())), genesisCodeHash: ethers.keccak256(await ethers.provider.getCode(await c.genesis.getAddress())) };
}
async function withClock<T>(run: () => Promise<T>) {
  const now = Date.now;
  Date.now = () => 0; // EDR block timestamps move forward during the local rehearsal.
  try { return await run(); } finally { Date.now = now; }
}
describe('V14 free mint before paid seasons', function () {
  this.timeout(180000);
  it('requires correct one-time binding, opens only on sealing, and waits the entire 24 hours', async () => {
    const c = await loadFixture(fixture);
    await expect(c.genesis.mint()).revertedWithCustomError(c.genesis, 'MintClosed');
    await expect(c.genesis.open()).revertedWithCustomError(c.genesis, 'Unauthorized');
    await expect(c.controller.sealCatalog()).revertedWithCustomError(c.controller, 'InvalidConfiguration');
    await expect(c.controller.connect(c.alice).bindGenesis(await c.genesis.getAddress())).revertedWithCustomError(c.controller, 'Unauthorized');
    await c.controller.bindGenesis(await c.genesis.getAddress());
    await expect(c.controller.bindGenesis(await c.genesis.getAddress())).revertedWithCustomError(c.controller, 'InvalidConfiguration');
    await expect(c.voting.bindGenesis(await c.genesis.getAddress())).revertedWithCustomError(c.voting, 'Unauthorized');
    await c.controller.sealCatalog();
    expect(await c.genesis.endsAt() - await c.genesis.startsAt()).eq(86400n);
    await expect(c.controller.prepareNext({ value: price * 3n })).revertedWithCustomError(c.controller, 'GenesisStillOpen');
    await time.setNextBlockTimestamp((await c.genesis.endsAt()) - 1n);
    await c.genesis.connect(c.alice).mint();
    await expect(c.genesis.connect(c.bob).mint()).revertedWithCustomError(c.genesis, 'MintClosed');
    await c.controller.prepareNext({ value: price * 3n });
    expect(await c.controller.roundCount()).eq(1);
    expect(await c.credits.collectionCount()).eq(1);
    expect(await c.controller.seasonFirstRound(season)).eq(1);
  });
  it('charges zero ETH, enforces lifetime one-mint limit after transfer, and keeps honest permanent metadata', async () => {
    const c = await loadFixture(opened);
    await expect(c.alice.sendTransaction({ to: await c.genesis.getAddress(), data: c.genesis.interface.encodeFunctionData('mint'), value: 1n })).revert(ethers);
    await c.genesis.connect(c.alice).mint();
    await c.genesis.connect(c.alice).transferFrom(c.alice.address, c.bob.address, 1);
    await expect(c.genesis.connect(c.alice).mint()).revertedWithCustomError(c.genesis, 'AlreadyMinted');
    await c.genesis.connect(c.bob).mint(); // Received NFTs do not consume the recipient's primary mint.
    expect(await c.genesis.balanceOf(c.bob.address)).eq(2);
    expect(await ethers.provider.getBalance(await c.genesis.getAddress())).eq(0);
    expect(await c.controller.roundCount()).eq(0);
    expect(await c.credits.collectionCount()).eq(0);
    const metadata = JSON.parse(Buffer.from((await c.genesis.tokenURI(1)).split(',')[1], 'base64').toString());
    expect(metadata.description).contains('only for the first paid collection');
    expect(metadata.description).contains('No prize');
    expect(metadata.image).matches(/^data:image\/svg\+xml;base64,/);
    const preview = JSON.parse(await readFile(new URL('../../../packages/ui/src/genesis-artwork.json', import.meta.url), 'utf8'));
    expect(metadata).deep.eq(preview);
    expect(await readFile(new URL('../../../docs/design/genesis-nft-preview.svg', import.meta.url), 'utf8')).eq(Buffer.from(metadata.image.split(',')[1], 'base64').toString());
    await expect(c.genesis.tokenURI(3)).revert(ethers);
  });
  it('caps supply at 1,000 and does not open the first ballot early after sellout', async () => {
    const c = await loadFixture(opened);
    for (let i = 0; i < 1000; i++) {
      const address = ethers.getAddress(ethers.dataSlice(ethers.id(`Genesis buyer ${i}`), 12));
      await networkHelpers.setBalance(address, price);
      const signer = await ethers.getImpersonatedSigner(address);
      await c.genesis.connect(signer).mint();
    }
    expect(await c.genesis.totalMinted()).eq(1000);
    expect(await c.genesis.mintOpen()).eq(false);
    await expect(c.genesis.connect(c.alice).mint()).revertedWithCustomError(c.genesis, 'MintClosed');
    await expect(c.controller.prepareNext()).revertedWithCustomError(c.controller, 'GenesisStillOpen');
  });
  it('uses the first snapshot, prevents duplicate transfer votes, and selects the voted paid terms', async () => {
    const c = await loadFixture(firstBallot), g = await c.genesis.getAddress(), r = await c.round.getAddress();
    await c.genesis.connect(c.alice).transferFrom(c.alice.address, c.carol.address, 1);
    expect(await c.voting.votingPower(r, c.alice.address, g)).eq(1);
    expect(await c.voting.votingPower(r, c.carol.address, g)).eq(0);
    await expect(c.voting.connect(c.carol).castVote(r, 1, [g])).revertedWithCustomError(c.voting, 'NotEligible');
    await expect(c.voting.connect(c.alice).castVote(r, 1, [g, g])).revertedWithCustomError(c.voting, 'AlreadyVoted');
    expect(await c.voting.votes(r, 1)).eq(0);
    await c.voting.connect(c.alice).castVote(r, 1, [g]);
    await c.voting.connect(c.bob).castVote(r, 1, [g]);
    await expect(c.voting.connect(c.alice).castVote(r, 0, [g])).revertedWithCustomError(c.voting, 'AlreadyVoted');
    expect(await c.voting.votes(r, 1)).eq(2);
    await time.increaseTo(await c.round.saleStartAt());
    expect(await c.round.mintPrice()).eq(price * 2n);
    expect(await c.round.winnerCount()).eq(4);
    await expect(c.voting.connect(c.carol).castVote(r, 0, [g])).revertedWithCustomError(c.voting, 'InvalidBallot');
  });
  it('counts pre-snapshot transfers for the new owner and forbids free NFT affiliate eligibility', async () => {
    const c = await loadFixture(opened);
    await c.genesis.connect(c.alice).mint();
    await c.genesis.connect(c.alice).transferFrom(c.alice.address, c.bob.address, 1);
    await time.increaseTo(await c.genesis.endsAt());
    await c.controller.prepareNext();
    const r = await ethers.getContractAt('ManekinekoRoundV13', await c.controller.rounds(1));
    await time.increaseTo((await r.saleStartAt()) - 3600n);
    expect(await c.voting.votingPower(await r.getAddress(), c.alice.address, await c.genesis.getAddress())).eq(0);
    expect(await c.voting.votingPower(await r.getAddress(), c.bob.address, await c.genesis.getAddress())).eq(1);
    await expect(r.connect(c.bob).enrollAffiliate(1, await c.genesis.getAddress(), 1)).revertedWithCustomError(c.voting, 'NotEligible');
    await r.connect(c.bob).enrollAffiliate(1, ethers.ZeroAddress, 0); // Existing explicit first-ballot bootstrap policy.
    expect(await c.voting.eligibleSource(await c.genesis.getAddress(), await time.latest())).eq(false);
    await expect(c.credits.connect(c.bob).claimAndRedeemAward(await c.genesis.getAddress(), 1, await r.getAddress())).revert(ethers);
  });
  it('rehearses a sold-out draw, a refund, paid-holder voting and season rewards; Genesis never qualifies again', async () => {
    const c = await loadFixture(firstBallot), g = await c.genesis.getAddress();
    await c.voting.connect(c.alice).castVote(await c.round.getAddress(), 0, [g]);
    await time.increaseTo(await c.round.saleStartAt());
    await c.round.connect(c.alice).mint(c.alice.address, 20, { value: price * 20n });
    for (let i = 20; i < 1000; i += 20) await c.round.mint(ethers.getAddress(ethers.dataSlice(ethers.id(`Paid buyer ${i}`), 12)), 20, { value: price * 20n });
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    await c.round.finalizeDraw(8);
    expect(await c.round.revealed()).eq(true);
    expect(await c.round.prizeBps()).eq(6000);
    expect(await c.round.affiliatePoolBps()).eq(2000);
    expect(await c.round.holderPoolBps()).eq(1000);
    expect(await c.round.operatorBps()).eq(1000);
    expect(await c.pool.fundedCollection(g)).eq(false);
    await c.controller.prepareNext();
    const r2 = await ethers.getContractAt('ManekinekoRoundV13', await c.controller.rounds(2));
    await time.increaseTo((await r2.saleStartAt()) - 3600n);
    expect(await c.voting.votingPower(await r2.getAddress(), c.bob.address, g)).eq(0); // unused free vote also expires
    await expect(c.voting.connect(c.bob).castVote(await r2.getAddress(), 0, [g])).revertedWithCustomError(c.voting, 'NotEligible');
    expect(await c.voting.votingPower(await r2.getAddress(), c.alice.address, await c.round.getAddress())).eq(20);
    await c.voting.connect(c.alice).castVote(await r2.getAddress(), 0, [await c.round.getAddress()]);
    await time.increaseTo(await r2.saleStartAt());
    await r2.connect(c.bob).mint(c.bob.address, 1, { value: price });
    await time.increaseTo(await r2.mintDeadline());
    await r2.connect(c.bob).refund(1, c.bob.address);
    const poolState = await c.pool.summary(season);
    expect(poolState.unlocked).eq(true);
    expect(poolState.funded).eq(ethers.parseEther('1'));
    expect(poolState.eligibleNfts).eq(1000);
    expect(poolState.claimLimit).eq(50);
    await expect(c.pool.connect(c.bob).claim(g, 2, c.bob.address)).revert(ethers);
    await expect(c.pool.connect(c.bob).claim(await r2.getAddress(), 1, c.bob.address)).revert(ethers);
    await c.pool.connect(c.alice).claim(await c.round.getAddress(), 1, c.alice.address);
    await c.controller.prepareNext();
    const r3 = await ethers.getContractAt('ManekinekoRoundV13', await c.controller.rounds(3));
    await time.increaseTo((await r3.saleStartAt()) - 3600n);
    expect(await c.voting.votingPower(await r3.getAddress(), c.bob.address, g)).eq(0); // first collection of second season
    await expect(c.voting.connect(c.bob).castVote(await r3.getAddress(), 0, [g])).revertedWithCustomError(c.voting, 'NotEligible');
  });
  it('allows the fallback after an empty free mint and never makes a vote or reward promise', async () => {
    const c = await loadFixture(opened);
    await time.increaseTo(await c.genesis.endsAt());
    await c.controller.prepareNext();
    const r = await ethers.getContractAt('ManekinekoRoundV13', await c.controller.rounds(1));
    await time.increaseTo(await r.saleStartAt());
    expect(await r.mintPrice()).eq(price);
    expect(await c.voting.winningOption(await r.getAddress())).eq(0);
  });
  it('reads and builds safe free mints, suppresses premature operator actions, rejects bad pins and discovers first votes', async () => {
    const c = await loadFixture(opened), cfg = await config(c);
    await withClock(async () => {
      const s = await readProtocol(ethers.provider, cfg, 0, c.alice.address);
      expect(s.genesis!.open).eq(true);
      expect(s.genesis!.walletMinted).eq(false);
      expect(s.canPrepare).eq(false);
      const runtime = await workerRuntime(ethers.provider, cfg, s.block);
      expect(runtime.version).eq(14);
      expect((await executeOnce(ethers.provider, { ...cfg, maxFeePerGas: 1000000000n }, null, '/unused-local-journal')).status).eq('idle');
      await assert.rejects(workerRuntime(ethers.provider, { ...cfg, genesisCodeHash: ethers.ZeroHash }, s.block), /free mint contract could not be verified/);
      expect(operatorActions(s, cfg)).length(0);
      const tx = await genesisMintTransaction(s);
      expect(tx.value).eq(0);
      expect(tx.to).eq(await c.genesis.getAddress());
      await c.alice.sendTransaction(tx);
      await assert.rejects(genesisMintTransaction(await readProtocol(ethers.provider, cfg, 0, c.alice.address)), /already minted/);
      await assert.rejects(genesisMintTransaction(await readProtocol(ethers.provider, cfg)), /Connect a wallet/);
      await assert.rejects(readProtocol(ethers.provider, { ...cfg, genesisCodeHash: ethers.ZeroHash }), /free mint contract could not be verified/);
      await time.increaseTo(await c.genesis.endsAt());
      const ended = await readProtocol(ethers.provider, cfg, 0, c.alice.address);
      expect(ended.canPrepare).eq(true);
      expect(operatorActions(ended, cfg).map(x => x.id)).deep.eq(['prepare']);
      await assert.rejects(genesisMintTransaction(ended), /closed/);
      await c.controller.prepareNext();
      const r = await ethers.getContractAt('ManekinekoRoundV13', await c.controller.rounds(1));
      await time.increaseTo((await r.saleStartAt()) - 3600n);
      const ballot = await readProtocol(ethers.provider, cfg, 0, c.alice.address);
      expect(ballot.sources[0]).deep.eq({ address: await c.genesis.getAddress(), power: 1n });
      expect(ballot.holders?.address).eq(await c.pool.getAddress());
      await verifyWorkerRound(new ethers.Contract(await r.getAddress(), r.interface, ethers.provider), await workerRuntime(ethers.provider, cfg, ballot.block), ballot.block);
    });
  });
  it('verifies the complete V14 graph without relabeling paid V13 components', async () => {
    const c = await loadFixture(opened), cfg = await config(c);
    const expected = { chainId: 31337, controller: cfg.controller, controllerCodeHash: cfg.codeHash, operator: c.operator.address, genesis: await c.genesis.getAddress(), genesisCodeHash: cfg.genesisCodeHash, holderRewards: await c.pool.getAddress(), holderRewardsCodeHash: cfg.holderRewardsCodeHash, credits: await c.credits.getAddress(), previousRegistry: ethers.ZeroAddress, legacyMerkleRoot: ethers.ZeroHash, settings: { ...c.settings, randomnessBudget: String(price), sponsorshipBudget: String(price) }, catalog: c.catalog, options: c.options.map(o => ({ supply: String(o.supply), price: String(o.price), winners: String(o.winners), duration: String(o.duration) })), creditsDeploymentTx: c.credits.deploymentTransaction()!.hash };
    await withClock(async () => {
      const report = await verifyDeployment(ethers.provider, expected);
      expect(report.contracts.some(x => x.name === 'ManekinekoGenesisV14')).eq(true);
      expect(report.preparedCollections).eq(0);
      await assert.rejects(verifyDeployment(ethers.provider, { ...expected, genesisCodeHash: ethers.ZeroHash }), /Genesis pin mismatch/);
      await assert.rejects(verifyDeployment(ethers.provider, { ...expected, genesis: await c.pool.getAddress() }), /Genesis binding mismatch/);
      await time.increaseTo(await c.genesis.endsAt());
      await c.controller.prepareNext();
      const later = await verifyDeployment(ethers.provider, expected);
      expect(later.contracts.some(x => x.name === 'ManekinekoRoundV13')).eq(true);
      expect(later.preparedCollections).eq(1);
      const specs = await publicationSpecs(ethers.provider, expected, later);
      expect(specs).length(8); // Seven graph components plus the prepared paid collection.
      expect(specs.filter(s => s.name === 'ManekinekoRoundV13')).length(1);
      for (const spec of specs) {
        const job = await exactSourceJob(11155111, spec);
        expect(job.sourceCode).contains('pragma solidity');
        expect(job.contractName).contains(spec.name);
      }
    });
  });
});
