import { expect } from 'chai';
import { network } from 'hardhat';
import { readFile } from 'node:fs/promises';
import { v17FastBallotOptions, v17ProductionBallotOptions, v17FastTiming } from '../config/v17-ballot.ts';
import { genesisArtworkForSupply } from '../../../packages/ui/src/genesis-artwork-data.ts';

const { ethers, networkHelpers } = await network.create('hardhatV16Model');
const { time, loadFixture } = networkHelpers;
const token = (id: number, serial: bigint | number) => (BigInt(id) << 17n) | BigInt(serial);
async function setup() {
  const wallets = await ethers.getSigners(), vrf = await ethers.deployContract('VRFCoordinatorV2Mock');
  const settings = { operator: wallets[0].address, coordinator: await vrf.getAddress(), keyHash: ethers.id('mock'), callbackGas: 200000, randomnessBudget: ethers.parseEther('0.01'), sponsorshipBudget: ethers.parseEther('0.001'), ...v17FastTiming };
  const c = await ethers.deployContract('ManekinekoV17', [settings, v17FastBallotOptions, true]);
  const season = ethers.id('V17 fast first season');
  await c.appendCollections([1,2,3].map(n => ({ seasonId: season, seasonName: 'V17 fast first season', name: `Fast ${n}`, color: '#330000', textColor: '#FFFFFF' })));
  await c.fundOperating({ value: ethers.parseEther('0.1') }); await c.sealCatalog();
  return { c, vrf, wallets, settings, season };
}
async function ballot() {
  const x = await setup();
  for (const wallet of x.wallets.slice(0,10)) { await x.c.connect(wallet).mintGenesis(); await x.c.connect(wallet).mintGenesis(); }
  return x;
}
async function reveal(x: Awaited<ReturnType<typeof setup>>, id: number) {
  await x.vrf.fulfillRequest((await x.c.round(id)).requestId, id);
  for (let attempts=0; !(await x.c.round(id)).finalizedAt && attempts<10; attempts++) await x.c.finalizeDraw(id,8);
  expect((await x.c.round(id)).finalizedAt).gt(0);
}
describe('V17 immutable production and accelerated profiles', function() {
  this.timeout(180000);
  it('keeps the reviewed V16 financial/lifecycle implementation identical outside the explicit profile changes', async () => {
    const old = await readFile(new URL('../contracts/ManekinekoV16.sol',import.meta.url),'utf8');
    const next = await readFile(new URL('../contracts/ManekinekoV17.sol',import.meta.url),'utf8');
    expect(next.slice(next.indexOf('    function appendCollections'),next.indexOf('    function _genesisURI')).replace('public view returns (uint256) {\n        if (id > 256','public pure returns (uint256) {\n        if (id > 256').replace('(id == 0 ? GENESIS_SUPPLY : 65536)','(id == 0 ? 1000 : 65536)'))
      .eq(old.slice(old.indexOf('    function appendCollections'),old.indexOf('    function _genesisURI')));
    expect(next.slice(next.indexOf('    function _paidRound'))).eq(old.slice(old.indexOf('    function _paidRound')));
  });
  it('enforces production minimums and constants when accelerated mode is false', async () => {
    const x = await loadFixture(setup), production = { ...x.settings, votingDelay:60, votingDuration:3600, confirmations:64 };
    const c = await ethers.deployContract('ManekinekoV17',[production,v17ProductionBallotOptions,false]);
    expect(await c.REHEARSAL_MODE()).eq(false); expect(await c.GENESIS_SUPPLY()).eq(1000); expect(await c.RANDOMNESS_TIMEOUT()).eq(259200); expect(await c.EXECUTION_REWARD()).eq(ethers.parseEther('0.01'));
    for (const changed of [{votingDuration:3599},{votingDelay:59},{confirmations:63}]) await expect(ethers.deployContract('ManekinekoV17',[{...production,...changed},v17ProductionBallotOptions,false])).revertedWithCustomError(c,'InvalidConfiguration');
    await expect(ethers.deployContract('ManekinekoV17',[production,v17FastBallotOptions,false])).revertedWithCustomError(c,'InvalidConfiguration');
    await expect(ethers.deployContract('ManekinekoV17',[x.settings,v17ProductionBallotOptions,false])).revertedWithCustomError(c,'InvalidConfiguration');
  });
  it('rejects the accelerated profile on Mainnet even with valid production settings', async () => {
    const main = await network.create('hardhatV17Mainnet');
    const [operator] = await main.ethers.getSigners(), coordinator = '0xD7f86b4b8Cae7D942340FF628F82735b7a20893a';
    const mock = await main.ethers.deployContract('VRFCoordinatorV2Mock');
    await main.networkHelpers.setCode(coordinator,await main.ethers.provider.getCode(await mock.getAddress()));
    const settings = {operator:operator.address,coordinator,keyHash:'0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9',confirmations:64,callbackGas:200000,votingDelay:60,votingDuration:3600,randomnessBudget:1,sponsorshipBudget:1};
    await expect(main.ethers.deployContract('ManekinekoV17',[settings,v17ProductionBallotOptions,true])).revert(main.ethers);
    const normal = await main.ethers.deployContract('ManekinekoV17',[settings,v17ProductionBallotOptions,false]); expect(await normal.REHEARSAL_MODE()).eq(false);
  });
  it('uses actual profile supply in token bounds and permanent Genesis metadata, retaining the lifetime cap', async () => {
    const x=await loadFixture(setup); expect(await x.c.GENESIS_SUPPLY()).eq(20);expect(await x.c.RANDOMNESS_TIMEOUT()).eq(900);
    const a=x.wallets[1],b=x.wallets[2];await x.c.connect(a).mintGenesis();await x.c.connect(a).mintGenesis();await x.c.connect(a).transferFrom(a.address,b.address,1);
    await expect(x.c.connect(a).mintGenesis()).revertedWithCustomError(x.c,'AlreadyUsed');await expect(x.c.tokenId(0,21)).revertedWithCustomError(x.c,'InvalidAmount');
    const metadata=JSON.parse(Buffer.from((await x.c.tokenURI(1)).split(',')[1],'base64').toString());
    expect(metadata.description).includes('all 20 are minted');expect(metadata.image).eq(genesisArtworkForSupply(20n));expect(Buffer.from(metadata.image.split(',')[1],'base64').toString()).includes('/ 20');
    expect((await x.c.round(1)).saleStart).eq(0);expect(await x.c.refundsAvailable(1)).eq(false);
  });
  for(let choice=0;choice<3;choice++) it(`settles accelerated option ${choice+1} with exact prizes, referrals, reserves and no duplicate claims`,async()=>{
    const x=await loadFixture(ballot),{c,wallets}=x,t=v17FastBallotOptions[choice];
    await c.connect(wallets[1]).enrollAffiliate(1,1,3);await c.connect(wallets[0]).castGenesisVote(choice,[1,2]);await time.increaseTo((await c.round(1)).saleStart);
    const hash=await c.termsHash(1);for(let n=0;n<Number(t.supply)/20;n++)await c.connect(wallets[2+n]).mint(1,wallets[2+n].address,20,1,hash,{value:t.price*20n});
    await reveal(x,1);const revenue=t.supply*t.price,r=await c.round(1);expect(r.affiliateShare).eq(revenue/5n);
    for(let rank=0;rank<Number(t.winners);rank++){const id=token(1,r.winners[rank]),owner=await c.ownerOf(id),wallet=wallets.find(w=>w.address===owner)!;await expect(c.connect(wallet).claimPrize(id,owner)).changeEtherBalance(ethers,wallet,revenue*6n/10n/t.winners);await expect(c.connect(wallet).claimPrize(id,owner)).revertedWithCustomError(c,'NotEligible');}
    await expect(c.connect(wallets[1]).claimAffiliate(1,wallets[1].address)).changeEtherBalance(ethers,wallets[1],revenue/5n);
    await c.withdrawBucket(1,0,revenue/10n);await expect(c.withdrawBucket(1,0,1)).revertedWithCustomError(c,'InsufficientFunds');
    expect((await c.seasons(x.season)).funded).eq(revenue/10n);expect(await ethers.provider.getBalance(await c.getAddress())).eq(await c.accountedBalance());
  });
  it('honors unsold and VRF-timeout boundaries, burns refunded NFTs and protects the full principal',async()=>{
    const x=await loadFixture(ballot),{c,wallets}=x;await time.increaseTo((await c.round(1)).saleStart);const t=await c.terms(1);
    await c.connect(wallets[1]).mint(1,wallets[1].address,1,0,await c.termsHash(1),{value:t.price});
    await time.increaseTo((await c.mintDeadline(1))-1n);expect(await c.refundsAvailable(1)).eq(false);await time.increaseTo(await c.mintDeadline(1));expect(await c.refundsAvailable(1)).eq(true);
    await expect(c.withdrawBucket(1,0,t.price)).revertedWithCustomError(c,'InvalidState');await expect(c.connect(wallets[1]).refund(token(1,1),wallets[1].address)).changeEtherBalance(ethers,wallets[1],t.price);
    await expect(c.ownerOf(token(1,1))).revertedWithCustomError(c,'ERC721NonexistentToken');await c.prepareNext();await time.increaseTo((await c.round(2)).saleStart);await c.connect(wallets[1]).mint(2,wallets[1].address,20,0,await c.termsHash(2),{value:t.price*20n});
    const r=await c.round(2),cutoff=r.soldOutAt+await c.RANDOMNESS_TIMEOUT();await time.increaseTo(cutoff-1n);expect(await c.refundsAvailable(2)).eq(false);await time.increaseTo(cutoff);expect(await c.refundsAvailable(2)).eq(true);
    await x.vrf.fulfillRequest(r.requestId,10);expect((await c.round(2)).entropyAt).eq(0);await expect(c.finalizeDraw(2,8)).revertedWithCustomError(c,'InvalidState');
    await c.connect(wallets[1]).refund(token(2,1),wallets[1].address);expect(await ethers.provider.getBalance(await c.getAddress())).eq(await c.accountedBalance());
  });
});
