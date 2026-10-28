import {expect} from 'chai';
import {readFile} from 'node:fs/promises';
import {artifacts,network} from 'hardhat';
import {v16LocalBallotOptions} from '../config/v16-ballot.ts';

// EDR has no Amsterdam/Glamsterdam implementation yet. This isolated semantic
// model explicitly enforces EIP-7954 size bounds; it does NOT prove live gas costs.
const {ethers,networkHelpers}=await network.create('hardhatV16Model');
const {time,loadFixture}=networkHelpers;
// Run the established production semantic cases against V17 with rehearsal disabled.
const deployProduction=(args:any[])=>ethers.deployContract('ManekinekoV17',[...args,false]);
const price=ethers.parseEther('0.01'),season=ethers.id('V16 test season');
const id=(collection:number,serial:number|bigint)=>(BigInt(collection)<<17n)|BigInt(serial);
async function setup(){
 const [operator,alice,bob,carol,affiliate]=await ethers.getSigners();
 const vrf=await ethers.deployContract('VRFCoordinatorV2Mock');
 const settings={operator:operator.address,coordinator:await vrf.getAddress(),keyHash:ethers.id('mock'),confirmations:64,callbackGas:200000,votingDelay:60,votingDuration:3600,randomnessBudget:price,sponsorshipBudget:price};
 const options=v16LocalBallotOptions;
 const protocol=await deployProduction([settings,options]);
 await protocol.appendCollections([1,2,3].map(n=>({seasonId:n<3?season:ethers.id('V16 next season'),seasonName:n<3?'V16 test season':'V16 next season',name:`Collection ${n}`,color:'#330000',textColor:'#FFFFFF'})));
 return {operator,alice,bob,carol,affiliate,vrf,protocol,settings,options};
}
async function opened(){const c=await setup();await c.protocol.fundOperating({value:price*30n});await c.protocol.sealCatalog();return c;}
async function almostSoldGenesis(){
 const c=await opened();await c.protocol.connect(c.alice).mintGenesis();await c.protocol.connect(c.bob).mintGenesis();
 await c.protocol.connect(c.affiliate).mintGenesis();
 for(let n=0;n<498;n++){
  const address=ethers.getAddress(ethers.dataSlice(ethers.id(`V16 Genesis ${n}`),12));await networkHelpers.setBalance(address,price);
  const minter=await ethers.getImpersonatedSigner(address);
  await c.protocol.connect(minter).mintGenesis();await c.protocol.connect(minter).mintGenesis();
 }
 return c;
}
async function ballot(){const c=await almostSoldGenesis();await c.protocol.connect(c.carol).mintGenesis();return c;}
type Context=Awaited<ReturnType<typeof setup>>;
async function buy(c:Context,collection:number,quantity:number,recipient:string,referral=0){const t=await c.protocol.terms(collection);await c.protocol.mint(collection,recipient,quantity,referral,await c.protocol.termsHash(collection),{value:t.price*BigInt(quantity)});}
async function sold(){
 const c=await ballot();await c.protocol.connect(c.affiliate).enrollAffiliate(1,1,3);await time.increaseTo((await c.protocol.round(1)).saleStart);
 for(let n=0;n<50;n++)await buy(c,1,20,n===0?c.alice.address:ethers.getAddress(ethers.dataSlice(ethers.id(`V16 buyer ${n}`),12)),1);
 return c;
}
async function reveal(c:Context){const r=await c.protocol.round(1);await c.vrf.fulfillRequest(r.requestId,0);expect(await c.vrf.lastCallbackSucceeded()).eq(true);await c.protocol.connect(c.bob).finalizeDraw(1,8);}
async function revealed(){const c=await sold();await reveal(c);return c;}
async function ownerSigner(c:Context,token:bigint){const address=await c.protocol.ownerOf(token);await networkHelpers.setBalance(address,ethers.parseEther('1'));return ethers.getImpersonatedSigner(address);}
async function balanceMatches(c:Context){expect(await ethers.provider.getBalance(await c.protocol.getAddress())).eq(await c.protocol.accountedBalance());}

describe('V17 production-profile regression against the V16 semantic cases',function(){
 this.timeout(180000);
 it('requires 3–8 distinct packages and rejects undersized, oversized and duplicate menus',async()=>{
  const c=await loadFixture(setup);
  for(const count of [0,1,2])await expect(deployProduction([c.settings,c.options.slice(0,count)])).revertedWithCustomError(c.protocol,'InvalidConfiguration');
  const eight=Array.from({length:8},(_,i)=>({...c.options[0],duration:BigInt(i+1)*3600n}));
  const maximum=await deployProduction([c.settings,eight]);expect(await maximum.optionCount()).eq(8);
  await expect(deployProduction([c.settings,[...eight,{...c.options[0],duration:32400n}]])).revertedWithCustomError(c.protocol,'InvalidConfiguration');
  await expect(deployProduction([c.settings,[c.options[0],c.options[1],c.options[0]]])).revertedWithCustomError(c.protocol,'InvalidConfiguration');
  expect(await c.protocol.optionCount()).eq(3);
  for(let i=0;i<3;i++)expect(Array.from(await c.protocol.option(i))).deep.eq(Object.values(c.options[i]));
 });
 it('uses option 1 without votes, resolves ties by option order and freezes a third-option win at close',async()=>{
  const c=await loadFixture(ballot);
  expect(await c.protocol.winningOption(1)).eq(0);
  await c.protocol.connect(c.alice).castGenesisVote(2,[1]);expect(await c.protocol.winningOption(1)).eq(2);
  await c.protocol.connect(c.bob).castGenesisVote(1,[2]);expect(await c.protocol.winningOption(1)).eq(1);
  await c.protocol.connect(c.carol).castGenesisVote(2,[1000]);expect(await c.protocol.winningOption(1)).eq(2);
  await time.increaseTo((await c.protocol.round(1)).saleStart);
  expect(Array.from(await c.protocol.terms(1))).deep.eq(Object.values(c.options[2]));
  const hash=await c.protocol.termsHash(1);
  await expect(c.protocol.connect(c.affiliate).castGenesisVote(0,[3])).revertedWithCustomError(c.protocol,'InvalidState');
  expect(await c.protocol.termsHash(1)).eq(hash);
  expect(await c.protocol.mintDeadline(1)).eq((await c.protocol.round(1)).saleStart+c.options[2].duration);
 });
 it('has one runtime, no linked contracts, and stays within the Sepolia EIP-7954 envelope',async()=>{
  const a=await artifacts.readArtifact('ManekinekoV17');expect(Object.keys(a.linkReferences)).length(0);expect(Object.keys(a.deployedLinkReferences)).length(0);
  expect((a.deployedBytecode.length-2)/2).lessThanOrEqual(65536);expect((a.bytecode.length-2)/2).lessThanOrEqual(131072);
  const c=await loadFixture(opened);expect((await ethers.provider.getCode(await c.protocol.getAddress())).length).eq(a.deployedBytecode.length);
  const receivers=await c.vrf.nextSubscriptionId();expect(receivers).eq(2); // Sealing prepared the first subscription, but no child NFT contract.
  expect(await c.protocol.name()).eq('Tincta Rewards');expect(await c.protocol.catalogCount()).eq(3);
 });
 it('keeps Genesis open indefinitely, preserves artwork and enforces two cumulative primary mints despite transfers',async()=>{
  const c=await loadFixture(opened);expect(await c.protocol.GENESIS_MAX_MINTS_PER_WALLET()).eq(2);
  await c.protocol.connect(c.alice).mintGenesis();await c.protocol.connect(c.alice).transferFrom(c.alice.address,c.bob.address,1);
  await c.protocol.connect(c.alice).mintGenesis();await c.protocol.connect(c.alice).transferFrom(c.alice.address,c.bob.address,2);
  await expect(c.protocol.connect(c.alice).mintGenesis()).revertedWithCustomError(c.protocol,'AlreadyUsed');
  await time.increase(10*365*86400);await c.protocol.connect(c.bob).mintGenesis();await c.protocol.connect(c.bob).mintGenesis();
  await expect(c.protocol.connect(c.bob).mintGenesis()).revertedWithCustomError(c.protocol,'AlreadyUsed');
  expect(await c.protocol.balanceOf(c.bob.address)).eq(4);expect((await c.protocol.round(0)).revenue).eq(0);
  expect(await c.protocol.primaryMints(0,c.alice.address)).eq(2);expect(await c.protocol.primaryMints(0,c.bob.address)).eq(2);
  const metadata=JSON.parse(Buffer.from((await c.protocol.tokenURI(1)).split(',')[1],'base64').toString());
  const approved=JSON.parse(await readFile(new URL('../../../packages/ui/src/genesis-artwork.json',import.meta.url),'utf8'));
  expect(metadata.image).eq(approved.image);expect(metadata.name).eq(approved.name);
  expect(metadata.description).includes('Minting has no deadline');expect(metadata.description).includes('throughout all collections and seasons');
  expect(await c.protocol.genesisSoldOutAt()).eq(0);await balanceMatches(c);
 });
 it('reserves first-ballot funding atomically before Genesis opens without scheduling any deadline',async()=>{
  const c=await loadFixture(setup);await expect(c.protocol.connect(c.alice).mintGenesis()).revertedWithCustomError(c.protocol,'InvalidState');
  await expect(c.protocol.sealCatalog()).revertedWithCustomError(c.protocol,'InsufficientFunds');
  expect(await c.protocol.catalogSealed()).eq(false);expect(await c.protocol.genesisStartsAt()).eq(0);expect(await c.protocol.prepared()).eq(0);expect(await c.vrf.nextSubscriptionId()).eq(1);
  const cost=await c.protocol.preparationCost();await c.protocol.fundOperating({value:cost});await c.protocol.sealCatalog();
  expect(await c.protocol.prepared()).eq(1);expect(await c.protocol.operatingReserve()).eq(0);
  expect((await c.protocol.round(1)).voteStart).eq(0);expect((await c.protocol.round(1)).saleStart).eq(0);
  expect(await c.protocol.mintDeadline(1)).eq(0);await balanceMatches(c);
 });
 it('cannot start, skip, refund or drain a waiting first collection even after ten years with no Genesis mints',async()=>{
  const c=await loadFixture(opened);await time.increase(10*365*86400);
  await expect(c.protocol.prepareNext()).revertedWithCustomError(c.protocol,'InvalidState');
  await expect(c.protocol.castGenesisVote(0,[1])).revertedWithCustomError(c.protocol,'InvalidState');
  await expect(c.protocol.castVote(1,0,[0])).revertedWithCustomError(c.protocol,'InvalidState');
  await expect(c.protocol.enrollAffiliate(1,1,0)).revertedWithCustomError(c.protocol,'InvalidState');
  await expect(buy(c,1,1,c.alice.address)).revertedWithCustomError(c.protocol,'InvalidAmount');
  await expect(c.protocol.withdrawBucket(1,2,price)).revertedWithCustomError(c.protocol,'InvalidState');
  await expect(c.protocol.withdrawBucket(1,3,price)).revertedWithCustomError(c.protocol,'InvalidState');
  await expect(c.protocol.recoverRandomness(1)).revertedWithCustomError(c.protocol,'InvalidState');
  await expect(c.protocol.requestRandomness(1)).revertedWithCustomError(c.protocol,'InvalidState');
  expect(await c.protocol.refundsAvailable(1)).eq(false);expect((await c.protocol.holderSummary(season)).unlocked).eq(false);
  expect(await c.protocol.prepared()).eq(1);expect((await c.protocol.round(1)).saleStart).eq(0);await balanceMatches(c);
 });
 it('keeps 999 mints waiting indefinitely, then opens a full first ballot in the final mint with no additional operator action',async()=>{
  const c=await loadFixture(almostSoldGenesis);await time.increase(10*365*86400);
  await c.protocol.withdrawOperating(await c.protocol.operatingReserve());
  expect((await c.protocol.round(0)).minted).eq(999);expect(await c.protocol.votingPower(1,c.alice.address,0)).eq(0);
  await expect(c.protocol.prepareNext()).revertedWithCustomError(c.protocol,'InvalidState');
  await expect(c.protocol.connect(c.alice).castGenesisVote(0,[1])).revertedWithCustomError(c.protocol,'InvalidState');
  const tx=await c.protocol.connect(c.carol).mintGenesis(),receipt=await tx.wait(),block=await ethers.provider.getBlock(receipt!.blockNumber);
  const first=await c.protocol.round(1);expect(first.voteStart).eq(block!.timestamp);expect(first.saleStart-first.voteStart).eq(c.settings.votingDuration);
  expect(await c.protocol.genesisSoldOutAt()).eq(first.voteStart);expect(await c.protocol.votingPower(1,c.carol.address,0)).eq(1);
  await c.protocol.connect(c.carol).castGenesisVote(1,[1000]);await c.protocol.connect(c.alice).castGenesisVote(0,[1]);
  expect(await c.protocol.winningOption(1)).eq(0);await expect(c.protocol.mintGenesis()).revertedWithCustomError(c.protocol,'InvalidState');
  expect((await c.protocol.round(0)).minted).eq(1000);expect(await c.vrf.nextSubscriptionId()).eq(2);await balanceMatches(c);
 });
 it('rolls back final sellout and ballot opening when the receiver rejects, and prevents callback voting',async()=>{
  const c=await loadFixture(almostSoldGenesis),target=await c.protocol.getAddress();
  const receiver=await ethers.deployContract('WinnerCreditReceiver'),address=await receiver.getAddress(),mint=c.protocol.interface.encodeFunctionData('mintGenesis');
  await receiver.configure(true,false,ethers.ZeroAddress,'0x',ethers.ZeroAddress);await expect(receiver.execute(target,mint)).revertedWith('NFT rejected');
  expect((await c.protocol.round(0)).minted).eq(999);expect(await c.protocol.genesisSoldOutAt()).eq(0);
  expect((await c.protocol.round(1)).voteStart).eq(0);expect((await c.protocol.round(1)).saleStart).eq(0);
  expect(await c.protocol.primaryMints(0,address)).eq(0);expect(await c.protocol.genesisUnusedVotes(address)).eq(0);
  await receiver.configure(false,false,target,c.protocol.interface.encodeFunctionData('castGenesisVote',[1,[1000]]),ethers.ZeroAddress);
  await receiver.execute(target,mint);expect(await receiver.attackSucceeded()).eq(false);expect(await c.protocol.genesisUnusedVotes(address)).eq(1);
  await receiver.execute(target,c.protocol.interface.encodeFunctionData('castGenesisVote',[1,[1000]]));expect(await c.protocol.votes(1,1)).eq(1);await balanceMatches(c);
 });
 it('carries unused Genesis votes with transfers, prevents reuse and duplicate IDs, and ends voting permanently at sale start',async()=>{
  const c=await loadFixture(ballot);await c.protocol.connect(c.alice).transferFrom(c.alice.address,c.carol.address,1);
  expect(await c.protocol.votingPower(1,c.alice.address,0)).eq(0);expect(await c.protocol.votingPower(1,c.carol.address,0)).eq(2);
  await expect(c.protocol.connect(c.alice).castGenesisVote(1,[1])).revertedWithCustomError(c.protocol,'NotEligible');
  await expect(c.protocol.connect(c.carol).castVote(1,1,[0])).revertedWithCustomError(c.protocol,'NotEligible');
  await expect(c.protocol.connect(c.carol).castGenesisVote(1,[1,1])).revertedWithCustomError(c.protocol,'NotEligible');expect(await c.protocol.votes(1,1)).eq(0);
  expect(await c.protocol.genesisVoted(1)).eq(false);expect(await c.protocol.genesisUnusedVotes(c.carol.address)).eq(2);
  await c.protocol.connect(c.carol).castGenesisVote(1,[1,1000]);await c.protocol.connect(c.carol).transferFrom(c.carol.address,c.alice.address,1);
  expect(await c.protocol.genesisUnusedVotes(c.alice.address)).eq(0);await expect(c.protocol.connect(c.alice).castGenesisVote(0,[1])).revertedWithCustomError(c.protocol,'NotEligible');
  await time.increaseTo((await c.protocol.round(1)).saleStart);expect(await c.protocol.votingPower(1,c.bob.address,0)).eq(0);
  await expect(c.protocol.connect(c.bob).castGenesisVote(0,[2])).revertedWithCustomError(c.protocol,'InvalidState');
 });
 it('requires a currently owned Genesis NFT in the first collection, with no empty-source exception or transfer reuse',async()=>{
  const c=await loadFixture(ballot);
  await expect(c.protocol.enrollAffiliate(1,1,0)).revertedWithCustomError(c.protocol,'NotEligible');
  await expect(c.protocol.enrollAffiliate(1,1,1)).revertedWithCustomError(c.protocol,'NotEligible');
  await c.protocol.connect(c.alice).castGenesisVote(0,[1]); // Voting does not consume affiliate utility.
  await c.protocol.connect(c.alice).enrollAffiliate(1,1,1);
  await expect(c.protocol.connect(c.alice).enrollAffiliate(1,2,1)).revertedWithCustomError(c.protocol,'InvalidState');
  await c.protocol.connect(c.alice).transferFrom(c.alice.address,c.carol.address,1);
  await expect(c.protocol.connect(c.carol).enrollAffiliate(1,2,1)).revertedWithCustomError(c.protocol,'NotEligible');
  await c.protocol.connect(c.carol).enrollAffiliate(1,2,1000);
  await c.protocol.connect(c.bob).transferFrom(c.bob.address,c.operator.address,2);
  await expect(c.protocol.connect(c.bob).enrollAffiliate(1,3,2)).revertedWithCustomError(c.protocol,'NotEligible');
  await c.protocol.enrollAffiliate(1,3,2);expect(await c.protocol.eligibilityUsed(1,2)).eq(true);
  await time.increaseTo((await c.protocol.round(1)).saleStart);
  await expect(c.protocol.connect(c.affiliate).enrollAffiliate(1,4,3)).revertedWithCustomError(c.protocol,'InvalidState');
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
 for(const choice of [1,2])it(`retains the approved paid artwork and pays option ${choice+1}'s exact prizes after its voted supply sells out`,async()=>{
  const c=await loadFixture(ballot);await c.protocol.connect(c.alice).castGenesisVote(choice,[1]);await time.increaseTo((await c.protocol.round(1)).saleStart);
  const selected=c.options[choice],revenue=selected.supply*selected.price;
  for(let n=0;n<Number(selected.supply)/20;n++)await buy(c,1,20,n===0?c.alice.address:ethers.getAddress(ethers.dataSlice(ethers.id(`V16 alternative ${n}`),12)));
  const metadata=JSON.parse(Buffer.from((await c.protocol.tokenURI(id(1,1))).split(',')[1],'base64').toString());
  const renderer=await ethers.deployContract('ManekinekoRendererV11');const combination=await c.protocol.combination(id(1,1));
  const original=JSON.parse(Buffer.from((await renderer.tokenURI({seasonId:season,seasonName:'V16 test season',collectionName:'Collection 1',collectionColor:'#330000',textColor:'#FFFFFF'},1,Array.from(combination.numbers) as [bigint,bigint,bigint,bigint],combination.code)).split(',')[1],'base64').toString());
  expect(metadata.image).eq(original.image);expect(metadata.contract_version).eq('tincta-v17');
  await reveal(c);const r=await c.protocol.round(1);expect(r.revenue).eq(revenue);
  const winners=r.winners.slice(0,Number(selected.winners));expect(new Set(winners.map(String)).size).eq(Number(selected.winners));
  const amount=revenue*6n/10n/selected.winners;
  for(const serial of winners){
   const prize=id(1,serial),holder=await ownerSigner(c,prize),before=await ethers.provider.getBalance(c.carol.address);
   await c.protocol.connect(holder).claimPrize(prize,c.carol.address);expect(await ethers.provider.getBalance(c.carol.address)-before).eq(amount);
  }
  expect((await c.protocol.seasons(season)).funded).eq(revenue/10n);await balanceMatches(c);
 });
 it('pays exact prizes and affiliate shares, with treasury and holder funds remaining separate',async()=>{
  const c=await loadFixture(revealed);const r=await c.protocol.round(1);expect(r.affiliateShare).eq(ethers.parseEther('2'));
  for(const serial of r.winners.slice(0,6)){const token=id(1,serial),owner=await ownerSigner(c,token);await c.protocol.connect(owner).claimPrize(token,c.carol.address);await expect(c.protocol.connect(owner).claimPrize(token,c.carol.address)).revertedWithCustomError(c.protocol,'NotEligible');}
  await c.protocol.connect(c.affiliate).claimAffiliate(1,c.carol.address);await expect(c.protocol.withdrawBucket(1,0,ethers.parseEther('1')+1n)).revertedWithCustomError(c.protocol,'InsufficientFunds');
  await c.protocol.withdrawBucket(1,0,ethers.parseEther('1'));expect((await c.protocol.seasons(season)).funded).eq(ethers.parseEther('1'));
  await c.protocol.connect(c.bob).claimExecution(1,c.carol.address);await balanceMatches(c);
 });
 for(const enrolled of [false,true])it(`adds the entire unearned affiliate pool to treasury after a successful draw (${enrolled?'enrolled, no referrals':'no enrollments'})`,async()=>{
  const c=await loadFixture(ballot);
  if(enrolled)await c.protocol.connect(c.affiliate).enrollAffiliate(1,1,3);
  await time.increaseTo((await c.protocol.round(1)).saleStart);
  for(let n=0;n<50;n++)await buy(c,1,20,n===0?c.alice.address:ethers.getAddress(ethers.dataSlice(ethers.id(`V16 no referrals ${n}`),12)));
  expect((await c.protocol.round(1)).qualified).eq(0);
  for(const kind of [0,1])await expect(c.protocol.withdrawBucket(1,kind,1)).revertedWithCustomError(c.protocol,'InvalidState');
  await reveal(c);const r=await c.protocol.round(1);expect(r.affiliateShare).eq(0);
  await expect(c.protocol.connect(c.alice).withdrawBucket(1,0,1)).revertedWithCustomError(c.protocol,'Unauthorized');
  await expect(c.protocol.withdrawBucket(1,0,price*300n+1n)).revertedWithCustomError(c.protocol,'InsufficientFunds');
  await expect(c.protocol.withdrawBucket(1,0,price*100n)).changeEtherBalances(ethers,[c.protocol,c.operator],[-price*100n,price*100n]);
  await expect(c.protocol.withdrawBucket(1,0,price*200n)).changeEtherBalances(ethers,[c.protocol,c.operator],[-price*200n,price*200n]);
  for(const kind of [0,1])await expect(c.protocol.withdrawBucket(1,kind,1)).revertedWithCustomError(c.protocol,'InsufficientFunds');
  expect((await c.protocol.round(1)).treasuryWithdrawn).eq(price*300n);expect((await c.protocol.round(1)).growthWithdrawn).eq(0);
  await expect(c.protocol.connect(c.affiliate).claimAffiliate(1,c.affiliate.address)).revertedWithCustomError(c.protocol,'NotEligible');
  expect((await c.protocol.seasons(season)).funded).eq(price*100n);
  const winner=id(1,r.winners[0]);await c.protocol.connect(await ownerSigner(c,winner)).claimPrize(winner,c.carol.address);
  await balanceMatches(c);
 });
 it('keeps qualified affiliate commissions separate from treasury and withdraws only actual division dust',async()=>{
  const c=await loadFixture(ballot);
  for(const [wallet,slot,proof] of [[c.affiliate,1,3],[c.bob,2,2],[c.carol,3,1000]] as const)await c.protocol.connect(wallet).enrollAffiliate(1,slot,proof);
  await time.increaseTo((await c.protocol.round(1)).saleStart);
  for(let n=0;n<50;n++)await buy(c,1,20,ethers.getAddress(ethers.dataSlice(ethers.id(`V16 dust buyer ${n}`),12)),n<3?n+1:0);
  await reveal(c);const share=price*200n/3n,dust=price*200n-share*3n;
  expect((await c.protocol.round(1)).qualified).eq(3);expect(dust).eq(2);
  await expect(c.protocol.withdrawBucket(1,0,price*100n+1n)).revertedWithCustomError(c.protocol,'InsufficientFunds');
  await c.protocol.withdrawBucket(1,0,price*100n);
  await expect(c.protocol.withdrawBucket(1,1,dust+1n)).revertedWithCustomError(c.protocol,'InsufficientFunds');
  await c.protocol.withdrawBucket(1,1,dust);
  await expect(c.protocol.withdrawBucket(1,1,1)).revertedWithCustomError(c.protocol,'InsufficientFunds');
  for(const wallet of [c.affiliate,c.bob,c.carol])await expect(c.protocol.connect(wallet).claimAffiliate(1,c.alice.address)).changeEtherBalances(ethers,[c.protocol,c.alice],[-share,share]);
  expect((await c.protocol.seasons(season)).funded).eq(price*100n);await balanceMatches(c);
 });
 for(const timeout of [false,true])it(`never allocates unqualified referral funds to the operator for ${timeout?'a randomness timeout':'an unsold collection'}`,async()=>{
  const c=await loadFixture(ballot);await c.protocol.connect(c.affiliate).enrollAffiliate(1,1,3);
  await time.increaseTo((await c.protocol.round(1)).saleStart);
  if(timeout)for(let n=0;n<50;n++)await buy(c,1,20,n===0?c.alice.address:ethers.getAddress(ethers.dataSlice(ethers.id(`V16 timeout buyer ${n}`),12)));
  else await buy(c,1,1,c.alice.address);
  await time.increaseTo(timeout?Number((await c.protocol.round(1)).soldOutAt)+3*86400:await c.protocol.mintDeadline(1));
  expect(await c.protocol.refundsAvailable(1)).eq(true);
  for(const kind of [0,1])await expect(c.protocol.withdrawBucket(1,kind,1)).revertedWithCustomError(c.protocol,'InvalidState');
  await expect(c.protocol.connect(c.alice).refund(id(1,1),c.carol.address)).changeEtherBalances(ethers,[c.protocol,c.carol],[-price,price]);
  expect((await c.protocol.seasons(season)).funded).eq(0);await balanceMatches(c);
 });
 it('unlocks season rewards only after the last outcome and pays the first 5 percent once per NFT',async()=>{
  const c=await loadFixture(revealed);await expect(c.protocol.connect(c.alice).claimHolder(id(1,1),c.alice.address)).revertedWithCustomError(c.protocol,'InvalidState');
  await c.protocol.prepareNext();await time.increaseTo(await c.protocol.mintDeadline(2));const summary=await c.protocol.holderSummary(season);
  expect(summary.unlocked).eq(true);expect(summary.limit).eq(50);expect(summary.reward).eq(price*2n);
  for(let serial=1;serial<=50;serial++){const token=id(1,serial);await c.protocol.connect(await ownerSigner(c,token)).claimHolder(token,c.carol.address);}
  await expect(c.protocol.connect(await ownerSigner(c,id(1,51))).claimHolder(id(1,51),c.carol.address)).revertedWithCustomError(c.protocol,'InvalidState');
  expect((await c.protocol.seasons(season)).paid).eq(price*100n);await balanceMatches(c);
 });
 it('retains paid snapshots and accepts both Genesis and revealed paid NFTs for later affiliate enrollment',async()=>{
  const c=await loadFixture(revealed);await c.protocol.prepareNext();await time.increaseTo((await c.protocol.round(2)).voteStart);
  expect(await c.protocol.votingPower(2,c.alice.address,1)).eq(20);await c.protocol.connect(c.alice).castVote(2,1,[1]);expect(await c.protocol.winningOption(2)).eq(1);
  await c.protocol.connect(c.alice).transferFrom(c.alice.address,c.carol.address,id(1,1));
  expect(await c.protocol.votingPower(2,c.carol.address,1)).eq(0);await expect(c.protocol.connect(c.alice).castVote(2,0,[1])).revertedWithCustomError(c.protocol,'NotEligible');
  await c.protocol.connect(c.bob).enrollAffiliate(2,2,2);expect(await c.protocol.affiliateId(2,c.bob.address)).eq(2);
  expect(await c.protocol.votingPower(2,c.bob.address,0)).eq(0);await expect(c.protocol.connect(c.bob).castVote(2,0,[0])).revertedWithCustomError(c.protocol,'NotEligible');
  await c.protocol.connect(c.alice).enrollAffiliate(2,1,id(1,2));expect(await c.protocol.affiliateId(2,c.alice.address)).eq(1);
 });
 it('renews Genesis affiliate eligibility in a new season while excluding refunded paid sources and later Genesis votes',async()=>{
  const c=await loadFixture(revealed);await c.protocol.prepareNext();await time.increaseTo((await c.protocol.round(2)).voteStart);
  await c.protocol.connect(c.alice).enrollAffiliate(2,1,1);
  await time.increaseTo((await c.protocol.round(2)).saleStart);await buy(c,2,1,c.bob.address);
  await time.increaseTo(await c.protocol.mintDeadline(2));await c.protocol.prepareNext();await time.increaseTo((await c.protocol.round(3)).voteStart);
  await expect(c.protocol.connect(c.bob).enrollAffiliate(3,1,id(2,1))).revertedWithCustomError(c.protocol,'NotEligible');
  await c.protocol.connect(c.alice).enrollAffiliate(3,1,1);await c.protocol.connect(c.bob).enrollAffiliate(3,2,2);
  await c.protocol.connect(c.alice).transferFrom(c.alice.address,c.carol.address,id(1,1));
  await c.protocol.connect(c.carol).enrollAffiliate(3,3,id(1,1));
  expect(await c.protocol.votingPower(3,c.bob.address,0)).eq(0);
  await expect(c.protocol.connect(c.bob).castVote(3,0,[0])).revertedWithCustomError(c.protocol,'NotEligible');
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
