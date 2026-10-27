import {expect} from 'chai';
import {readFile} from 'node:fs/promises';
import {artifacts,network} from 'hardhat';

// EDR has no Amsterdam/Glamsterdam implementation yet. This isolated semantic
// model explicitly enforces EIP-7954 size bounds; it does NOT prove live gas costs.
const {ethers,networkHelpers}=await network.create('hardhatV15Model');
const {time,loadFixture}=networkHelpers;
const price=ethers.parseEther('0.01'),season=ethers.id('V15 test season');
const id=(collection:number,serial:number|bigint)=>(BigInt(collection)<<17n)|BigInt(serial);
async function setup(){
 const [operator,alice,bob,carol,affiliate]=await ethers.getSigners();
 const vrf=await ethers.deployContract('VRFCoordinatorV2Mock');
 const settings={operator:operator.address,coordinator:await vrf.getAddress(),keyHash:ethers.id('mock'),confirmations:64,callbackGas:200000,votingDelay:60,votingDuration:3600,randomnessBudget:price,sponsorshipBudget:price};
 const options=[{supply:1000,price,winners:6,duration:3600},{supply:1000,price:price*2n,winners:4,duration:7200}];
 const protocol=await ethers.deployContract('ManekinekoV15',[settings,options]);
 await protocol.appendCollections([1,2,3].map(n=>({seasonId:n<3?season:ethers.id('V15 next season'),seasonName:n<3?'V15 test season':'V15 next season',name:`Collection ${n}`,color:'#330000',textColor:'#FFFFFF'})));
 return {operator,alice,bob,carol,affiliate,vrf,protocol,settings,options};
}
async function opened(){const c=await setup();await c.protocol.fundOperating({value:price*30n});await c.protocol.sealCatalog();return c;}
async function ballot(){const c=await opened();await c.protocol.connect(c.alice).mintGenesis();await c.protocol.connect(c.bob).mintGenesis();await time.increaseTo(await c.protocol.genesisVotingDeadline());return c;}
async function almostSoldGenesis(){
 const c=await opened();await c.protocol.connect(c.alice).mintGenesis();await c.protocol.connect(c.bob).mintGenesis();
 for(let n=3;n<=999;n++){
  const address=ethers.getAddress(ethers.dataSlice(ethers.id(`V15 Genesis ${n}`),12));await networkHelpers.setBalance(address,price);
  await c.protocol.connect(await ethers.getImpersonatedSigner(address)).mintGenesis();
 }
 return c;
}
type Context=Awaited<ReturnType<typeof setup>>;
async function buy(c:Context,collection:number,quantity:number,recipient:string,referral=0){const t=await c.protocol.terms(collection);await c.protocol.mint(collection,recipient,quantity,referral,await c.protocol.termsHash(collection),{value:t.price*BigInt(quantity)});}
async function sold(){
 const c=await ballot();await c.protocol.connect(c.affiliate).enrollAffiliate(1,1,0);await time.increaseTo((await c.protocol.round(1)).saleStart);
 for(let n=0;n<50;n++)await buy(c,1,20,n===0?c.alice.address:ethers.getAddress(ethers.dataSlice(ethers.id(`V15 buyer ${n}`),12)),1);
 return c;
}
async function reveal(c:Context){const r=await c.protocol.round(1);await c.vrf.fulfillRequest(r.requestId,0);expect(await c.vrf.lastCallbackSucceeded()).eq(true);await c.protocol.connect(c.bob).finalizeDraw(1,8);}
async function revealed(){const c=await sold();await reveal(c);return c;}
async function ownerSigner(c:Context,token:bigint){const address=await c.protocol.ownerOf(token);await networkHelpers.setBalance(address,ethers.parseEther('1'));return ethers.getImpersonatedSigner(address);}
async function balanceMatches(c:Context){expect(await ethers.provider.getBalance(await c.protocol.getAddress())).eq(await c.protocol.accountedBalance());}

describe('V15 single-address protocol semantic model',function(){
 this.timeout(180000);
 it('has one runtime, no linked contracts, and stays within the Sepolia EIP-7954 envelope',async()=>{
  const a=await artifacts.readArtifact('ManekinekoV15');expect(Object.keys(a.linkReferences)).length(0);expect(Object.keys(a.deployedLinkReferences)).length(0);
  expect((a.deployedBytecode.length-2)/2).lessThanOrEqual(65536);expect((a.bytecode.length-2)/2).lessThanOrEqual(131072);
  const c=await loadFixture(opened);expect((await ethers.provider.getCode(await c.protocol.getAddress())).length).eq(a.deployedBytecode.length);
  const receivers=await c.vrf.nextSubscriptionId();expect(receivers).eq(2); // Sealing prepared the first subscription, but no child NFT contract.
  expect(await c.protocol.name()).eq('Tincta Rewards');expect(await c.protocol.catalogCount()).eq(3);
 });
 it('preserves the Genesis artwork, zero price and wallet allowance, while keeping minting open past the voting deadline',async()=>{
  const c=await loadFixture(opened);expect(await c.protocol.genesisVotingDeadline()-await c.protocol.genesisStartsAt()).eq(86400);
  await c.protocol.connect(c.alice).mintGenesis();await c.protocol.connect(c.alice).transferFrom(c.alice.address,c.bob.address,1);
  await expect(c.protocol.connect(c.alice).mintGenesis()).revertedWithCustomError(c.protocol,'AlreadyUsed');await c.protocol.connect(c.bob).mintGenesis();
  expect(await c.protocol.balanceOf(c.bob.address)).eq(2);expect((await c.protocol.round(0)).revenue).eq(0);
  const metadata=JSON.parse(Buffer.from((await c.protocol.tokenURI(1)).split(',')[1],'base64').toString());
  const approved=JSON.parse(await readFile(new URL('../../../packages/ui/src/genesis-artwork.json',import.meta.url),'utf8'));
  expect(metadata.image).eq(approved.image);expect(metadata.name).eq(approved.name);expect(metadata.description).includes('including NFTs minted during voting');
  await expect(c.protocol.prepareNext()).revertedWithCustomError(c.protocol,'InvalidState');
  await time.setNextBlockTimestamp(await c.protocol.genesisVotingDeadline());await c.protocol.connect(c.carol).mintGenesis();
  expect(await c.protocol.votingPower(1,c.carol.address,0)).eq(1);await c.protocol.connect(c.carol).castGenesisVote(1,[3]);
  expect(await c.protocol.votes(1,1)).eq(1);expect(await c.protocol.prepared()).eq(1);await balanceMatches(c);
 });
 it('requires first-ballot funding before Genesis opens and rolls an unfunded opening back atomically',async()=>{
  const c=await loadFixture(setup);await expect(c.protocol.connect(c.alice).mintGenesis()).revertedWithCustomError(c.protocol,'InvalidState');
  await expect(c.protocol.sealCatalog()).revertedWithCustomError(c.protocol,'InsufficientFunds');
  expect(await c.protocol.catalogSealed()).eq(false);expect(await c.protocol.genesisStartsAt()).eq(0);expect(await c.protocol.prepared()).eq(0);expect(await c.vrf.nextSubscriptionId()).eq(1);
  const cost=await c.protocol.preparationCost();await c.protocol.fundOperating({value:cost});await c.protocol.sealCatalog();
  expect(await c.protocol.prepared()).eq(1);expect(await c.protocol.operatingReserve()).eq(0);await balanceMatches(c);
 });
 it('opens the first ballot at its deadline without any preparation transaction, even with no Genesis mints',async()=>{
  const c=await loadFixture(opened),deadline=await c.protocol.genesisVotingDeadline(),scheduled=await c.protocol.round(1);
  expect(scheduled.voteStart).eq(deadline);expect(scheduled.saleStart-deadline).eq(c.settings.votingDuration);
  await time.setNextBlockTimestamp(deadline-1n);await expect(c.protocol.castGenesisVote(0,[1])).revertedWithCustomError(c.protocol,'InvalidState');
  await time.setNextBlockTimestamp(deadline);await c.protocol.connect(c.alice).mintGenesis();
  await c.protocol.connect(c.alice).castGenesisVote(0,[1]);expect(await c.protocol.votes(1,0)).eq(1);
  expect((await c.protocol.round(1)).saleStart).eq(scheduled.saleStart);await expect(c.protocol.prepareNext()).revertedWithCustomError(c.protocol,'InvalidState');
 });
 it('opens immediately at early sellout, includes the final minter, and keeps a full voting duration',async()=>{
  const c=await loadFixture(almostSoldGenesis);expect(await c.protocol.votingPower(1,c.alice.address,0)).eq(0);
  await expect(c.protocol.connect(c.alice).castGenesisVote(0,[1])).revertedWithCustomError(c.protocol,'InvalidState');
  const tx=await c.protocol.connect(c.carol).mintGenesis(),receipt=await tx.wait(),block=await ethers.provider.getBlock(receipt!.blockNumber);
  const first=await c.protocol.round(1);expect(first.voteStart).eq(block!.timestamp);expect(first.saleStart-first.voteStart).eq(c.settings.votingDuration);
  expect(first.voteStart).lessThan(await c.protocol.genesisVotingDeadline());expect(await c.protocol.genesisSoldOutAt()).eq(first.voteStart);
  expect(await c.protocol.votingPower(1,c.carol.address,0)).eq(1);await c.protocol.connect(c.carol).castGenesisVote(1,[1000]);
  await c.protocol.connect(c.alice).castGenesisVote(0,[1]);expect(await c.protocol.winningOption(1)).eq(0);
  await expect(c.protocol.mintGenesis()).revertedWithCustomError(c.protocol,'InvalidState');
  expect((await c.protocol.round(0)).minted).eq(1000);await balanceMatches(c);
 });
 it('rolls back the last Genesis mint and accelerated ballot when an NFT receiver rejects it',async()=>{
  const c=await loadFixture(almostSoldGenesis),before=await c.protocol.round(1),target=await c.protocol.getAddress();
  const receiver=await ethers.deployContract('WinnerCreditReceiver'),address=await receiver.getAddress(),mint=c.protocol.interface.encodeFunctionData('mintGenesis');
  await receiver.configure(true,false,ethers.ZeroAddress,'0x',ethers.ZeroAddress);
  await expect(receiver.execute(target,mint)).revertedWith('NFT rejected');
  expect((await c.protocol.round(0)).minted).eq(999);expect(await c.protocol.genesisSoldOutAt()).eq(0);expect((await c.protocol.round(1)).voteStart).eq(before.voteStart);
  expect(await c.protocol.primaryMints(0,address)).eq(0);expect(await c.protocol.genesisUnusedVotes(address)).eq(0);
  await receiver.configure(false,false,target,c.protocol.interface.encodeFunctionData('castGenesisVote',[1,[1000]]),ethers.ZeroAddress);
  await receiver.execute(target,mint);expect(await receiver.attackSucceeded()).eq(false);expect(await c.protocol.genesisUnusedVotes(address)).eq(1);
  await receiver.execute(target,c.protocol.interface.encodeFunctionData('castGenesisVote',[1,[1000]]));expect(await c.protocol.votes(1,1)).eq(1);await balanceMatches(c);
 });
 it('does not move the voting deadline when Genesis sells out during the ballot',async()=>{
  const c=await loadFixture(almostSoldGenesis),scheduled=await c.protocol.round(1);
  await time.increaseTo(scheduled.voteStart);await c.protocol.connect(c.carol).mintGenesis();
  expect((await c.protocol.round(1)).voteStart).eq(scheduled.voteStart);expect((await c.protocol.round(1)).saleStart).eq(scheduled.saleStart);
  await c.protocol.connect(c.carol).castGenesisVote(1,[1000]);await time.increaseTo(scheduled.saleStart);
  await expect(c.protocol.connect(c.alice).castGenesisVote(0,[1])).revertedWithCustomError(c.protocol,'InvalidState');
 });
 it('keeps late Genesis collectible mints open after voting closes without reopening any voting rights',async()=>{
  const c=await loadFixture(almostSoldGenesis),scheduled=await c.protocol.round(1);
  await time.increaseTo(scheduled.saleStart);await c.protocol.connect(c.carol).mintGenesis();
  expect((await c.protocol.round(1)).voteStart).eq(scheduled.voteStart);expect((await c.protocol.round(1)).saleStart).eq(scheduled.saleStart);
  expect(await c.protocol.votingPower(1,c.carol.address,0)).eq(0);await expect(c.protocol.connect(c.carol).castGenesisVote(1,[1000])).revertedWithCustomError(c.protocol,'InvalidState');
  expect(await c.protocol.votes(1,1)).eq(0);expect(await c.protocol.winningOption(1)).eq(0);
  await time.increaseTo(await c.protocol.mintDeadline(1));await c.protocol.prepareNext();await time.increaseTo((await c.protocol.round(2)).voteStart);
  expect(await c.protocol.votingPower(2,c.carol.address,0)).eq(0);await expect(c.protocol.connect(c.carol).castVote(2,0,[0])).revertedWithCustomError(c.protocol,'NotEligible');
 });
 it('carries unused Genesis votes with transfers, prevents reuse, and rejects duplicate tokens atomically',async()=>{
  const c=await loadFixture(ballot);await c.protocol.connect(c.alice).transferFrom(c.alice.address,c.carol.address,1);
  expect(await c.protocol.votingPower(1,c.alice.address,0)).eq(0);expect(await c.protocol.votingPower(1,c.carol.address,0)).eq(1);
  await expect(c.protocol.connect(c.alice).castGenesisVote(1,[1])).revertedWithCustomError(c.protocol,'NotEligible');
  await expect(c.protocol.connect(c.carol).castVote(1,1,[0])).revertedWithCustomError(c.protocol,'NotEligible');
  await expect(c.protocol.connect(c.carol).castGenesisVote(1,[1,1])).revertedWithCustomError(c.protocol,'NotEligible');expect(await c.protocol.votes(1,1)).eq(0);
  expect(await c.protocol.genesisVoted(1)).eq(false);expect(await c.protocol.genesisUnusedVotes(c.carol.address)).eq(1);
  await c.protocol.connect(c.carol).castGenesisVote(1,[1]);await c.protocol.connect(c.carol).transferFrom(c.carol.address,c.alice.address,1);
  expect(await c.protocol.genesisUnusedVotes(c.alice.address)).eq(0);await expect(c.protocol.connect(c.alice).castGenesisVote(0,[1])).revertedWithCustomError(c.protocol,'NotEligible');
  await c.protocol.connect(c.carol).mintGenesis();await c.protocol.connect(c.carol).castGenesisVote(0,[3]);expect(await c.protocol.winningOption(1)).eq(0);
  await c.protocol.connect(c.bob).transferFrom(c.bob.address,c.carol.address,2);expect(await c.protocol.genesisUnusedVotes(c.carol.address)).eq(1);
  await c.protocol.connect(c.carol).castGenesisVote(0,[2]);expect(await c.protocol.votes(1,0)).eq(2);expect(await c.protocol.genesisUnusedVotes(c.carol.address)).eq(0);
 });
 it('uses distinct global IDs, exact quotes, and a cumulative 20-mint recipient cap',async()=>{
  const c=await loadFixture(ballot);await time.increaseTo((await c.protocol.round(1)).saleStart);
  await expect(c.protocol.mint(1,c.alice.address,1,0,ethers.ZeroHash,{value:price})).revertedWithCustomError(c.protocol,'InvalidState');
  await buy(c,1,20,c.alice.address);expect(await c.protocol.ownerOf(id(1,1))).eq(c.alice.address);expect(await c.protocol.ownerOf(1)).eq(c.alice.address);
  await c.protocol.connect(c.alice).transferFrom(c.alice.address,c.bob.address,id(1,1));await expect(buy(c,1,1,c.alice.address)).revertedWithCustomError(c.protocol,'InvalidAmount');
  const combos=await Promise.all([1,2,3].map(n=>c.protocol.combination(id(1,n))));expect(new Set(combos.map(x=>String(x.code))).size).eq(3);
  expect(await c.protocol.tokenForCombination(1,Array.from(combos[0].numbers) as [bigint,bigint,bigint,bigint])).eq(id(1,1));await balanceMatches(c);
 });
 it('reserves complete refunds across later collections, transfers and a ten-year delay',async()=>{
  const c=await loadFixture(ballot);await time.increaseTo((await c.protocol.round(1)).saleStart);await buy(c,1,3,c.alice.address);
  await expect(c.protocol.withdrawBucket(1,0,price)).revertedWithCustomError(c.protocol,'InvalidState');
  await time.increaseTo(await c.protocol.mintDeadline(1));await c.protocol.prepareNext();await time.increaseTo((await c.protocol.round(2)).saleStart);await buy(c,2,2,c.bob.address);
  await c.protocol.connect(c.alice).transferFrom(c.alice.address,c.carol.address,id(1,1));await time.increase(10*365*86400);
  const before=await ethers.provider.getBalance(c.bob.address);await c.protocol.connect(c.carol).refund(id(1,1),c.bob.address);expect(await ethers.provider.getBalance(c.bob.address)-before).eq(price);
  await expect(c.protocol.ownerOf(id(1,1))).revertedWithCustomError(c.protocol,'ERC721NonexistentToken');
  expect(await c.protocol.refundsAvailable(2)).eq(true);await c.protocol.connect(c.bob).refund(id(2,1),c.carol.address);await balanceMatches(c);
 });
 it('locks sold-out NFTs, authenticates entropy and preserves metadata across the draw',async()=>{
  const c=await loadFixture(sold),before=await c.protocol.tokenURI(id(1,1));const r=await c.protocol.round(1);
  await expect(c.protocol.rawFulfillRandomWords(r.requestId,[4])).revertedWithCustomError(c.protocol,'Unauthorized');
  await expect(c.protocol.connect(c.alice).transferFrom(c.alice.address,c.bob.address,id(1,1))).revertedWithCustomError(c.protocol,'TransfersLocked');
  await reveal(c);expect(await c.protocol.tokenURI(id(1,1))).eq(before);expect(await c.protocol.refundsAvailable(1)).eq(false);
  const winners=(await c.protocol.round(1)).winners.slice(0,6);expect(new Set(winners.map(String)).size).eq(6);
  for(let i=0;i<6;i++)expect(await c.protocol.score(id(1,winners[i]))).eq(1000-i);
  await time.increase(4*86400);expect(await c.protocol.refundsAvailable(1)).eq(false);await balanceMatches(c);
 });
 it('retains the approved paid artwork and enforces alternative voted prices and equal prizes',async()=>{
  const c=await loadFixture(ballot);await c.protocol.connect(c.alice).castGenesisVote(1,[1]);await time.increaseTo((await c.protocol.round(1)).saleStart);
  for(let n=0;n<50;n++)await buy(c,1,20,n===0?c.alice.address:ethers.getAddress(ethers.dataSlice(ethers.id(`V15 alternative ${n}`),12)));
  const metadata=JSON.parse(Buffer.from((await c.protocol.tokenURI(id(1,1))).split(',')[1],'base64').toString());
  const renderer=await ethers.deployContract('ManekinekoRendererV11');const combination=await c.protocol.combination(id(1,1));
  const original=JSON.parse(Buffer.from((await renderer.tokenURI({seasonId:season,seasonName:'V15 test season',collectionName:'Collection 1',collectionColor:'#330000',textColor:'#FFFFFF'},1,Array.from(combination.numbers) as [bigint,bigint,bigint,bigint],combination.code)).split(',')[1],'base64').toString());
  expect(metadata.image).eq(original.image);expect(metadata.contract_version).eq('tincta-v15');
  await reveal(c);const r=await c.protocol.round(1);expect(r.revenue).eq(ethers.parseEther('20'));
  const prize=id(1,r.winners[0]),holder=await ownerSigner(c,prize),before=await ethers.provider.getBalance(c.carol.address);
  await c.protocol.connect(holder).claimPrize(prize,c.carol.address);expect(await ethers.provider.getBalance(c.carol.address)-before).eq(ethers.parseEther('3'));
  expect((await c.protocol.seasons(season)).funded).eq(ethers.parseEther('2'));await balanceMatches(c);
 });
 it('pays exact prizes and affiliate shares, with treasury and holder funds remaining separate',async()=>{
  const c=await loadFixture(revealed);const r=await c.protocol.round(1);expect(r.affiliateShare).eq(ethers.parseEther('2'));
  for(const serial of r.winners.slice(0,6)){const token=id(1,serial),owner=await ownerSigner(c,token);await c.protocol.connect(owner).claimPrize(token,c.carol.address);await expect(c.protocol.connect(owner).claimPrize(token,c.carol.address)).revertedWithCustomError(c.protocol,'NotEligible');}
  await c.protocol.connect(c.affiliate).claimAffiliate(1,c.carol.address);await expect(c.protocol.withdrawBucket(1,0,ethers.parseEther('1')+1n)).revertedWithCustomError(c.protocol,'InsufficientFunds');
  await c.protocol.withdrawBucket(1,0,ethers.parseEther('1'));expect((await c.protocol.seasons(season)).funded).eq(ethers.parseEther('1'));
  await c.protocol.connect(c.bob).claimExecution(1,c.carol.address);await balanceMatches(c);
 });
 it('unlocks season rewards only after the last outcome and pays the first 5 percent once per NFT',async()=>{
  const c=await loadFixture(revealed);await expect(c.protocol.connect(c.alice).claimHolder(id(1,1),c.alice.address)).revertedWithCustomError(c.protocol,'InvalidState');
  await c.protocol.prepareNext();await time.increaseTo(await c.protocol.mintDeadline(2));const summary=await c.protocol.holderSummary(season);
  expect(summary.unlocked).eq(true);expect(summary.limit).eq(50);expect(summary.reward).eq(price*2n);
  for(let serial=1;serial<=50;serial++){const token=id(1,serial);await c.protocol.connect(await ownerSigner(c,token)).claimHolder(token,c.carol.address);}
  await expect(c.protocol.connect(await ownerSigner(c,id(1,51))).claimHolder(id(1,51),c.carol.address)).revertedWithCustomError(c.protocol,'InvalidState');
  expect((await c.protocol.seasons(season)).paid).eq(price*100n);await balanceMatches(c);
 });
 it('uses later paid-NFT snapshots and rejects Genesis and refundable collections for affiliate eligibility',async()=>{
  const c=await loadFixture(revealed);await c.protocol.prepareNext();await time.increaseTo((await c.protocol.round(2)).voteStart);
  expect(await c.protocol.votingPower(2,c.alice.address,1)).eq(20);await c.protocol.connect(c.alice).castVote(2,1,[1]);expect(await c.protocol.winningOption(2)).eq(1);
  await c.protocol.connect(c.alice).transferFrom(c.alice.address,c.carol.address,id(1,1));
  expect(await c.protocol.votingPower(2,c.carol.address,1)).eq(0);await expect(c.protocol.connect(c.alice).castVote(2,0,[1])).revertedWithCustomError(c.protocol,'NotEligible');
  await expect(c.protocol.connect(c.bob).enrollAffiliate(2,1,2)).revertedWithCustomError(c.protocol,'NotEligible');
  await c.protocol.connect(c.alice).enrollAffiliate(2,1,id(1,2));expect(await c.protocol.affiliateId(2,c.alice.address)).eq(1);
 });
 it('funds sponsored mints at full price and never restores a spent lifetime reward after a refund',async()=>{
  const c=await loadFixture(revealed),source=id(1,(await c.protocol.round(1)).winners[0]);const holder=await ownerSigner(c,source);
  await c.protocol.connect(holder).claimPrize(source,c.carol.address);await c.protocol.prepareNext();await time.increaseTo((await c.protocol.round(2)).saleStart);
  await c.protocol.connect(holder).redeemSponsored(source,2);expect((await c.protocol.round(2)).revenue).eq(price);expect((await c.protocol.round(2)).sponsorReserve).eq(0);
  await expect(c.protocol.connect(holder).redeemSponsored(source,2)).revertedWithCustomError(c.protocol,'NotEligible');
  await time.increaseTo(await c.protocol.mintDeadline(2));await c.protocol.connect(holder).refund(id(2,1),c.carol.address);expect(await c.protocol.lifetimeRewardUsed(holder.address)).eq(true);await balanceMatches(c);
 });
 it('cannot revive a sold-out collection after the randomness timeout, including ten years later',async()=>{
  const c=await loadFixture(sold),r=await c.protocol.round(1);await time.increaseTo(r.soldOutAt+3n*86400n);
  expect(await c.protocol.refundsAvailable(1)).eq(true);await c.vrf.fulfillRequest(r.requestId,123);expect((await c.protocol.round(1)).entropyAt).eq(0);
  await expect(c.protocol.finalizeDraw(1,8)).revertedWithCustomError(c.protocol,'InvalidState');await time.increase(10*365*86400);
  await c.protocol.connect(c.alice).refund(id(1,1),c.bob.address);await balanceMatches(c);
 });
 it('rejects mint reentrancy and rolls back payouts to rejecting recipients',async()=>{
  const c=await loadFixture(ballot);const receiver=await ethers.deployContract('V2RoundReceiver',[await c.protocol.getAddress()]);
  await time.increaseTo((await c.protocol.round(1)).saleStart);const data=c.protocol.interface.encodeFunctionData('mint',[1,await receiver.getAddress(),1,0,await c.protocol.termsHash(1)]);
  await receiver.configure(false,true,data,price);await c.operator.sendTransaction({to:await receiver.getAddress(),value:price});await receiver.execute(data,{value:price});
  expect(await receiver.callbackSucceeded()).eq(false);expect(await c.protocol.primaryMints(1,await receiver.getAddress())).eq(1);
  await time.increaseTo(await c.protocol.mintDeadline(1));await receiver.configure(true,false,'0x',0);
  const refund=c.protocol.interface.encodeFunctionData('refund',[id(1,1),await receiver.getAddress()]);
  await expect(receiver.execute(refund)).revertedWithCustomError(c.protocol,'TransferFailed');expect(await c.protocol.ownerOf(id(1,1))).eq(await receiver.getAddress());expect((await c.protocol.round(1)).refunded).eq(0);await balanceMatches(c);
 });
});
