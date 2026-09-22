import { expect } from "chai";
import { artifacts, network } from "hardhat";
const {ethers,networkHelpers}=await network.create();
const {time,loadFixture}=networkHelpers;
const PRICE=ethers.parseEther("0.01");
async function fixture(){
 const [owner,enrollmentSigner,buyer,other,affiliate]=await ethers.getSigners();
 const coordinator=await ethers.deployContract("VRFCoordinatorV2Mock");
 const eligibility=await ethers.deployContract("ManekinekoAffiliateEligibilityV3",[owner.address]);
 const factory=await ethers.deployContract("ManekinekoFactoryV8",[owner.address]);
 await eligibility.approveFactory(await factory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
 const config={name:"Six equal prizes",symbol:"NEKO8",seasonId:ethers.id("Season V8"),seasonName:"Season V8",collectionColor:"#330000",textColor:"#FFFFFF",roundId:1n,maxSupply:1000n,mintPrice:PRICE,mintDeadline:BigInt(await time.latest())+86400n,saleStartAt:BigInt(await time.latest())+3600n,initialOwner:owner.address,vrfCoordinator:await coordinator.getAddress(),keyHash:ethers.id("mock-key"),requestConfirmations:64,callbackGasLimit:200000,maxAffiliateSlots:10n,enrollmentSigner:enrollmentSigner.address,prizeBps:6000n,winnerCount:6n,affiliatePoolBps:2000n,minAffiliateReferrals:100n,affiliatePayoutCapBps:3000n,affiliateEligibility:await eligibility.getAddress()};
 await factory.createRound(config);const round=await ethers.getContractAt("ManekinekoRoundV8",await factory.rounds(1));await eligibility.registerCollection(await factory.getAddress(),1);await round.fundRandomness({value:await coordinator.MOCK_FEE()});
 return {owner,enrollmentSigner,buyer,other,affiliate,coordinator,eligibility,factory,config,round};
}
type C=Awaited<ReturnType<typeof fixture>>;
async function open(c:C){await time.increaseTo(c.config.saleStartAt);await c.round.activateSale();}
async function mint(c:C,quantity=1000,to=c.buyer.address,affiliate=0){for(let left=quantity;left>0;left-=20){const n=Math.min(left,20);if(affiliate)await c.round.connect(c.buyer).mintWithAffiliate(to,n,affiliate,{value:PRICE*BigInt(n)});else await c.round.connect(c.buyer).mint(to,n,{value:PRICE*BigInt(n)});}}
async function reveal(c:C){await c.round.requestRandomness();await c.coordinator.fulfillRequest(await c.round.requestId(),0);await c.round.finalizeDraw(8);}
async function winners(c:C){return Promise.all(Array.from({length:Number(c.config.winnerCount)},(_,i)=>c.round.winningTokenIds(i+1)));}
async function enroll(c:C){
 const nonce=ethers.id("v8-enroll"),deadline=c.config.saleStartAt-1n;
 const sig=await c.enrollmentSigner.signTypedData({name:"ManekinekoAffiliateEnrollment",version:"4",chainId:31337,verifyingContract:await c.round.getAddress()},{Enrollment:[{name:"applicant",type:"address"},{name:"affiliateId",type:"uint256"},{name:"poolBps",type:"uint256"},{name:"sourceCollection",type:"address"},{name:"sourceTokenId",type:"uint256"},{name:"nonce",type:"bytes32"},{name:"deadline",type:"uint256"}]},{applicant:c.affiliate.address,affiliateId:1,poolBps:c.config.affiliatePoolBps,sourceCollection:ethers.ZeroAddress,sourceTokenId:0,nonce,deadline});
 await c.round.connect(c.affiliate).enrollAffiliate(c.affiliate.address,1,c.config.affiliatePoolBps,ethers.ZeroAddress,0,nonce,deadline,sig);
}

describe("V8 six equal independent NFT awards",function(){
 this.timeout(180000);
 it("keeps every immutable component below real Ethereum deployment limits",async()=>{
  await loadFixture(fixture);
  for(const component of ["RoundV8","FactoryV8","RendererV8","RoundDeployerV8","AffiliateEligibilityV3","WinnerCreditsV4"]){const a=await artifacts.readArtifact(`Manekineko${component}`);expect((a.deployedBytecode.length-2)/2,component).at.most(24576);expect((a.bytecode.length-2)/2,component).at.most(49152);}
 });
 it("produces six distinct winners and 1000 unique scores with exactly one ETH owed per winning NFT",async()=>{
  const c=await loadFixture(fixture);await open(c);await mint(c);await reveal(c);
  expect(await c.round.awardCount()).eq(6n);expect(await c.round.winnerCount()).eq(6n);const ids=await winners(c);expect(new Set(ids.map(String)).size).eq(6);
  const h=await ethers.deployContract("MultiAwardRankHarness"),padded=[...ids,0n,0n,0n,0n],ranks=await h.ranks(1000,padded,6);
  expect(new Set(ranks.map(String)).size).eq(1000);expect([...ranks].sort((a,b)=>Number(a-b))).deep.eq(Array.from({length:1000},(_,i)=>BigInt(i+1)));
  for(let rank=1;rank<=6;rank++){
   expect(ranks[Number(ids[rank-1]-1n)]).eq(BigInt(1001-rank));expect(await c.round.prizeAmountForRank(rank)).eq(ethers.parseEther("1"));
   const [numbers,,score]=await c.round.combination(ids[rank-1]);expect(score).eq(BigInt(1001-rank));expect(await c.round.scoreCombination([...numbers])).eq(score);
   const metadata=JSON.parse(Buffer.from((await c.round.tokenURI(ids[rank-1])).split(',')[1],'base64').toString());expect(metadata.award_rank).eq(rank);expect(metadata.prize_amount_wei).eq(ethers.parseEther('1').toString());expect(metadata.algorithm_version).eq('unique-rank-v5');
  }
  expect(await c.round.prizeAmount()).eq(ethers.parseEther('6'));expect(await c.round.readyForNextRound()).eq(true);
 });
 it("protects every unclaimed prize and allows only its own holder to claim, regardless of owner or approved operator",async()=>{
  const c=await loadFixture(fixture);await open(c);await mint(c);await reveal(c);const ids=await winners(c);
  await c.round.connect(c.buyer).setApprovalForAll(c.other.address,true);
  await expect(c.round.claimPrizeForRank(6,c.owner.address)).revertedWithCustomError(c.round,'NotTokenHolder');
  await expect(c.round.connect(c.other).claimPrizeForRank(6,c.other.address)).revertedWithCustomError(c.round,'NotTokenHolder');
  await c.round.withdraw(c.owner.address,ethers.parseEther('2'));await c.round.withdrawGrowthReserve(c.owner.address,ethers.parseEther('2'));
  expect(await ethers.provider.getBalance(await c.round.getAddress())).eq(ethers.parseEther('6'));
  for(const rank of [6,3,1,5,2,4]){
   await expect(c.round.withdraw(c.owner.address,1)).revertedWithCustomError(c.round,'InsufficientWithdrawableBalance');
   await expect(c.round.connect(c.buyer).transferFrom(c.buyer.address,c.other.address,ids[rank-1])).revertedWithCustomError(c.round,'TransfersLocked');
   await expect(c.round.connect(c.buyer).claimPrizeForRank(rank,c.other.address)).changeEtherBalance(ethers,c.other,ethers.parseEther('1'));
   await c.round.connect(c.buyer).transferFrom(c.buyer.address,c.other.address,ids[rank-1]);
   await expect(c.round.connect(c.other).claimPrizeForRank(rank,c.other.address)).revertedWithCustomError(c.round,'InvalidPhase');
  }
  expect(await c.round.claimedAwardCount()).eq(6n);expect(await c.round.prizePaid()).eq(true);expect(await c.round.prizePaidAmount()).eq(ethers.parseEther('6'));expect(await ethers.provider.getBalance(await c.round.getAddress())).eq(0n);
 });
 it("rolls back rejected ETH and blocks a winning contract from reentering another award claim",async()=>{
  const c=await loadFixture(fixture),receiver=await ethers.deployContract('WinnerCreditReceiver');await open(c);await mint(c,1000,await receiver.getAddress());await reveal(c);
  await receiver.configure(false,true,ethers.ZeroAddress,'0x',ethers.ZeroAddress);
  const claim=c.round.interface.encodeFunctionData('claimPrizeForRank',[6,await receiver.getAddress()]);
  await expect(receiver.execute(await c.round.getAddress(),claim)).revertedWithCustomError(c.round,'TransferFailed');expect(await c.round.prizeClaimed(6)).eq(false);expect(await c.round.prizePaidAmount()).eq(0n);
  await receiver.configure(false,false,await c.round.getAddress(),c.round.interface.encodeFunctionData('claimPrizeForRank',[5,await receiver.getAddress()]),ethers.ZeroAddress);
  await receiver.execute(await c.round.getAddress(),claim);expect(await receiver.attackSucceeded()).eq(false);expect(await c.round.prizeClaimed(6)).eq(true);expect(await c.round.prizeClaimed(5)).eq(false);expect(await c.round.prizePaidAmount()).eq(ethers.parseEther('1'));
 });
 it("keeps qualifying affiliate earnings isolated from all six prizes and treasury withdrawals",async()=>{
  const c=await loadFixture(fixture);await enroll(c);await open(c);await mint(c,100,c.buyer.address,1);await mint(c,900);await reveal(c);
  expect(await c.round.affiliateClaimable(1)).eq(ethers.parseEther('0.3'));expect(await c.round.growthReserveBalance()).eq(ethers.parseEther('1.7'));
  await c.round.withdraw(c.owner.address,ethers.parseEther('2'));await c.round.withdrawGrowthReserve(c.owner.address,ethers.parseEther('1.7'));
  for(let rank=1;rank<=6;rank++)await c.round.connect(c.buyer).claimPrizeForRank(rank,c.buyer.address);
  expect(await ethers.provider.getBalance(await c.round.getAddress())).eq(ethers.parseEther('0.3'));
  await expect(c.round.withdraw(c.owner.address,1)).revertedWithCustomError(c.round,'InsufficientWithdrawableBalance');
  await expect(c.round.connect(c.affiliate).claimAffiliateCommission(c.affiliate.address)).changeEtherBalance(ethers,c.affiliate,ethers.parseEther('0.3'));
 });
 it("preserves refunds on unsold expiry and never accepts early sale activation or rerolls",async()=>{
  const c=await loadFixture(fixture);await expect(c.round.activateSale()).revertedWithCustomError(c.round,'InvalidPhase');await open(c);await mint(c,1);
  await c.round.connect(c.buyer).transferFrom(c.buyer.address,c.other.address,1);await time.increaseTo(c.config.mintDeadline);
  await expect(c.round.connect(c.other).refund(1,c.other.address)).changeEtherBalance(ethers,c.other,PRICE);expect(await c.round.readyForNextRound()).eq(false);await expect(c.round.requestRandomness()).revertedWithCustomError(c.round,'InvalidPhase');
 });
 it("rejects forged or repeated entropy and allows next-round preparation before all six claims",async()=>{
  const c=await loadFixture(fixture);await open(c);await mint(c);await expect(c.round.rawFulfillRandomWords(1,[0])).revertedWithCustomError(c.round,'OnlyCoordinator');await reveal(c);
  await expect(c.round.requestRandomness()).revertedWithCustomError(c.round,'InvalidPhase');await expect(c.round.finalizeDraw(1)).revertedWithCustomError(c.round,'InvalidPhase');
  await c.factory.createRound({...c.config,roundId:2n,saleStartAt:BigInt(await time.latest())+3600n,mintDeadline:BigInt(await time.latest())+86400n});await c.eligibility.registerCollection(await c.factory.getAddress(),2);expect(await c.round.prizePaid()).eq(false);expect(await c.factory.roundCount()).eq(2n);
 });
});

describe('MultiAwardRank uniform ordered sample and bijective score assignment',function(){
 this.timeout(180000);
 it('enumerates every ordered triple exactly once and rejects the incomplete residue interval',async()=>{
  const h=await ethers.deployContract('MultiAwardRankHarness'),space=await h.sampleSpace(6,3),threshold=(1n<<256n)%space;expect(space).eq(120n);if(threshold)expect((await h.tryWinners(ethers.toBeHex(threshold-1n,32),6,3))[0]).eq(false);
  const tuples=new Set<string>();
  for(let i=threshold;i<threshold+space;i++){const [accepted,ids]=await h.tryWinners(ethers.toBeHex(i,32),6,3);expect(accepted).eq(true);const chosen=ids.slice(0,3);expect(new Set(chosen.map(String)).size).eq(3);tuples.add(chosen.join(':'));const ranks=await h.ranks(6,[...ids],3);expect(new Set(ranks.map(String)).size).eq(6);for(let r=0;r<3;r++)expect(ranks[Number(chosen[r]-1n)]).eq(BigInt(6-r));}
  expect(tuples.size).eq(120);
 });
 it('supports K=1 through 10 including a full winning supply and the maximum sample-space bound',async()=>{
  const h=await ethers.deployContract('MultiAwardRankHarness');
  for(const [supply,count]of [[1,1],[6,6],[10,10],[65536,10]]){const space=await h.sampleSpace(supply,count);expect(space).lte(1n<<160n);const [ok,ids]=await h.tryWinners(ethers.toBeHex((1n<<256n)-1n,32),supply,count);expect(ok).eq(true);expect(new Set(ids.slice(0,count).map(String)).size).eq(count);for(const id of ids.slice(0,count)){expect(id).gte(1n);expect(id).lte(BigInt(supply));}}
  for(const [supply,count]of [[0,1],[2,3],[65537,1],[10,0],[11,11]])await expect(h.sampleSpace(supply,count)).revertedWithCustomError(h,'InvalidSupply');
 });
});

describe('V8 configurable award bounds and V4 lifetime credits',function(){
 this.timeout(180000);
 it('enforces equal terms in the constructor and settles both one-winner and ten-winner bounds',async()=>{
  const c=await loadFixture(fixture),factory=await ethers.deployContract('ManekinekoFactoryV8',[c.owner.address]),gate=await ethers.deployContract('ManekinekoAffiliateEligibilityV3',[c.owner.address]);await gate.approveFactory(await factory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));const deployer=await ethers.getContractAt('ManekinekoRoundDeployerV8',await factory.deployer());
  for(const override of [{winnerCount:0n},{winnerCount:11n},{winnerCount:7n},{maxSupply:5n,minAffiliateReferrals:1n}])await expect(factory.createRound({...c.config,...override,affiliateEligibility:await gate.getAddress()})).revertedWithCustomError(deployer,'DeploymentFailed');
  let roundId=1n;
  for(const count of [1n,10n]){
   const start=BigInt(await time.latest())+100n;await factory.createRound({...c.config,roundId,maxSupply:count,winnerCount:count,minAffiliateReferrals:1n,saleStartAt:start,mintDeadline:start+3600n,affiliateEligibility:await gate.getAddress()});await gate.registerCollection(await factory.getAddress(),roundId);const round=await ethers.getContractAt('ManekinekoRoundV8',await factory.rounds(roundId));await round.fundRandomness({value:await c.coordinator.MOCK_FEE()});await time.increaseTo(start);await round.activateSale();await round.connect(c.buyer).mint(c.buyer.address,count,{value:PRICE*count});await round.requestRandomness();await c.coordinator.fulfillRequest(await round.requestId(),1234);const receipt=await(await round.finalizeDraw(8)).wait();expect(receipt!.gasUsed).lt(1000000n);
   const ids=await Promise.all(Array.from({length:Number(count)},(_,i)=>round.winningTokenIds(i+1)));expect(new Set(ids.map(String)).size).eq(Number(count));
   for(let rank=1;rank<=Number(count);rank++){expect(await round.prizeAmountForRank(rank)).eq(ethers.parseEther('0.006'));await round.connect(c.buyer).claimPrizeForRank(rank,c.buyer.address);}expect(await round.prizePaid()).eq(true);roundId++;
  }
 });
 it('redeems rank six once for the winning wallet without multiplying its lifetime reward',async()=>{
  const c=await loadFixture(fixture),credits=await ethers.deployContract('ManekinekoWinnerCreditsV4',[c.owner.address,ethers.ZeroHash,ethers.ZeroAddress]);await credits.approveFactory(await c.factory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await c.factory.getAddress())));await credits.registerCollection(await c.factory.getAddress(),1);await open(c);await mint(c);await reveal(c);
  const start=BigInt(await time.latest())+3600n;await c.factory.createRound({...c.config,roundId:2n,saleStartAt:start,mintDeadline:start+86400n});await c.eligibility.registerCollection(await c.factory.getAddress(),2);await credits.registerCollection(await c.factory.getAddress(),2);const next=await ethers.getContractAt('ManekinekoRoundV8',await c.factory.rounds(2));await next.fundRandomness({value:await c.coordinator.MOCK_FEE()});await credits.fundCollection(await next.getAddress(),{value:PRICE*6n});
  await expect(credits.claimAwardCredit(await c.round.getAddress(),7)).revertedWithCustomError(credits,'CreditUnavailable');await c.round.connect(c.buyer).claimPrizeForRank(6,c.other.address);await credits.claimAwardCredit(await c.round.getAddress(),6);const credit=await credits.creditsForAward(await c.round.getAddress(),6);expect(credit.beneficiary).eq(c.buyer.address);expect(credit.earnedAt).eq(await c.round.finalizedAt());
  await time.increaseTo(start);await next.activateSale();await credits.connect(c.buyer).redeemAward(await c.round.getAddress(),6,await next.getAddress());expect(await credits.redeemedAwardRank(c.buyer.address)).eq(6n);expect(await next.ownerOf(1)).eq(c.buyer.address);expect(await next.totalMintRevenue()).eq(PRICE);
  await c.round.connect(c.buyer).claimPrizeForRank(5,c.buyer.address);await expect(credits.claimAwardCredit(await c.round.getAddress(),5)).revertedWithCustomError(credits,'LifetimeRewardAlreadyUsed');
 });
 it('preserves redeemed lifetime credit from a V3 registry and its V2 ancestor',async()=>{
  const c=await loadFixture(fixture),priorV2=await ethers.deployContract('PriorWinnerCreditRegistryMock');await priorV2.markRedeemed(c.buyer.address,await c.round.getAddress());const priorV3=await ethers.deployContract('ManekinekoWinnerCreditsV3',[c.owner.address,ethers.ZeroHash,await priorV2.getAddress()]);const current=await ethers.deployContract('ManekinekoWinnerCreditsV4',[c.owner.address,ethers.ZeroHash,await priorV3.getAddress()]);
  expect(await priorV3.redeemedSource(c.buyer.address)).eq(ethers.ZeroAddress);expect(await current.lifetimeRewardUsed(c.buyer.address)).eq(true);expect(await current.lifetimeRewardUsed(c.other.address)).eq(false);
  await current.approveFactory(await c.factory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await c.factory.getAddress())));await current.registerCollection(await c.factory.getAddress(),1);await open(c);await mint(c);await reveal(c);await c.round.connect(c.buyer).claimPrizeForRank(6,c.buyer.address);await expect(current.claimAwardCredit(await c.round.getAddress(),6)).revertedWithCustomError(current,'LifetimeRewardAlreadyUsed');
 });
});
