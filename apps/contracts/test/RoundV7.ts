import { expect } from "chai";
import { artifacts, network } from "hardhat";
const { ethers, networkHelpers } = await network.create();
const {time,loadFixture}=networkHelpers;
const PRICE=ethers.parseEther("0.01");
async function fixture(){
 const [owner,enrollmentSigner,buyer,buyer2,...affiliates]=await ethers.getSigners();
 const coordinator=await ethers.deployContract("VRFCoordinatorV2Mock");
 const eligibility=await ethers.deployContract("ManekinekoAffiliateEligibilityV2",[owner.address]);
 const factory=await ethers.deployContract("ManekinekoFactoryV7",[owner.address]);
 await eligibility.approveFactory(await factory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
 const config={name:"#330000",symbol:"NEKO7",seasonId:ethers.id("Season V7"),seasonName:"Season V7",collectionColor:"#330000",textColor:"#FFFFFF",roundId:1n,maxSupply:1000n,mintPrice:PRICE,mintDeadline:BigInt(await time.latest())+86400n,saleStartAt:BigInt(await time.latest())+3600n,initialOwner:owner.address,vrfCoordinator:await coordinator.getAddress(),keyHash:ethers.id("mock-key"),requestConfirmations:64,callbackGasLimit:200000,maxAffiliateSlots:10n,enrollmentSigner:enrollmentSigner.address,prizeBps:6000n,secondPrizeBps:2000n,affiliatePoolBps:2000n,minAffiliateReferrals:100n,affiliatePayoutCapBps:3000n,affiliateEligibility:await eligibility.getAddress()};
 await factory.createRound(config);
 const round=await ethers.getContractAt("ManekinekoRoundV7",await factory.rounds(1));
 await eligibility.registerCollection(await factory.getAddress(),1);
 await round.fundRandomness({value:await coordinator.MOCK_FEE()});
 return {owner,enrollmentSigner,buyer,buyer2,affiliates,coordinator,eligibility,factory,config,round};
}
type C=Awaited<ReturnType<typeof fixture>>;
async function enroll(c:C,id:number){
 const wallet=c.affiliates[id-1], nonce=ethers.id(`v7-affiliate-${id}`),deadline=c.config.saleStartAt-1n;
 const fields={applicant:wallet.address,affiliateId:id,poolBps:c.config.affiliatePoolBps,sourceCollection:ethers.ZeroAddress,sourceTokenId:0,nonce,deadline};
 const sig=await c.enrollmentSigner.signTypedData({name:"ManekinekoAffiliateEnrollment",version:"4",chainId:31337,verifyingContract:await c.round.getAddress()},{Enrollment:[{name:"applicant",type:"address"},{name:"affiliateId",type:"uint256"},{name:"poolBps",type:"uint256"},{name:"sourceCollection",type:"address"},{name:"sourceTokenId",type:"uint256"},{name:"nonce",type:"bytes32"},{name:"deadline",type:"uint256"}]},fields);
 await c.round.connect(wallet).enrollAffiliate(wallet.address,id,c.config.affiliatePoolBps,ethers.ZeroAddress,0,nonce,deadline,sig);
}
async function open(c:C){await time.increaseTo(c.config.saleStartAt);await c.round.activateSale();}
async function mint(c:C,quantity:number,affiliate=0){
 for(let left=quantity;left>0;left-=20){const q=Math.min(left,20);if(affiliate)await c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address,q,affiliate,{value:PRICE*BigInt(q)});else await c.round.connect(c.buyer).mint(c.buyer.address,q,{value:PRICE*BigInt(q)});}
}
async function reveal(c:C){await c.round.requestRandomness();await c.coordinator.fulfillRequest(await c.round.requestId(),0);await c.round.finalizeDraw(8);}

describe("V7 two holder prizes, qualified equal affiliate pool and scheduled sales",function(){
 this.timeout(180000);
 it("deploys pinned code templates within actual EVM limits",async()=>{
  const c=await loadFixture(fixture);
  for(const name of ["ManekinekoRoundV7","ManekinekoFactoryV7","ManekinekoRoundDeployerV7","ManekinekoRendererV7","ManekinekoAffiliateEligibilityV2","ManekinekoWinnerCreditsV3"]){const artifact=await artifacts.readArtifact(name);expect((artifact.deployedBytecode.length-2)/2,`${name} runtime`).at.most(24576);expect((artifact.bytecode.length-2)/2,`${name} init`).at.most(49152);}
  const deployer=await ethers.getContractAt("ManekinekoRoundDeployerV7",await c.factory.deployer());
  await expect(deployer.deploy(c.config,await c.factory.renderer())).revertedWithCustomError(deployer,"OnlyFactory");
  expect(await c.round.CONTRACT_VERSION()).eq("affiliate-v7");expect(await c.round.ALGORITHM_VERSION()).eq("unique-rank-v4");
 });
 it("closes enrollment at the scheduled time and never permits early activation/mints",async()=>{
  const c=await loadFixture(fixture);await enroll(c,1);
  await expect(c.round.activateSale()).revertedWithCustomError(c.round,"InvalidPhase");
  await expect(c.round.connect(c.buyer).mint(c.buyer.address,1,{value:PRICE})).revertedWithCustomError(c.round,"MintClosed");
  await time.increaseTo(c.config.saleStartAt);
  await expect(enroll(c,2)).revertedWithCustomError(c.round,"EnrollmentClosed");
  await c.round.activateSale();await mint(c,1);
 });
 it("draws two distinct top ranks over 1000 unique scores; protects both awards and restricts claims to NFT holders",async()=>{
  const c=await loadFixture(fixture);await open(c);await mint(c,1000);
  expect(await c.round.soldOutAt()).gt(0);expect(await c.round.unallocatedAffiliatePool()).eq(ethers.parseEther("2"));
  await expect(c.round.rawFulfillRandomWords(1,[0])).revertedWithCustomError(c.round,"OnlyCoordinator");
  await reveal(c);
  const first=await c.round.winningTokenIds(1),second=await c.round.winningTokenIds(2);
  expect(first).not.eq(second);expect(await c.round.prizeAmountForRank(1)).eq(ethers.parseEther("4"));expect(await c.round.prizeAmountForRank(2)).eq(ethers.parseEther("2"));
  const harness=await ethers.deployContract("AwardRankHarness"),ranks=await harness.ranks(1000,first,second);
  expect(new Set(ranks.map(String)).size).eq(1000);expect(ranks[Number(first-1n)]).eq(1000n);expect(ranks[Number(second-1n)]).eq(999n);
  for(const token of [first,second,1n,500n,1000n]){const [numbers,,score]=await c.round.combination(token);expect(await c.round.scoreCombination([...numbers])).eq(score);}
  expect(await c.round.readyForNextRound()).eq(true);
  expect(await c.round.withdrawableBalance()).eq(ethers.parseEther("2"));
  await c.round.withdraw(c.owner.address,ethers.parseEther("2"));
  await expect(c.round.withdraw(c.owner.address,1)).revertedWithCustomError(c.round,"InsufficientWithdrawableBalance");
  await expect(c.round.claimPrizeForRank(1,c.owner.address)).revertedWithCustomError(c.round,"NotTokenHolder");
  await expect(c.round.connect(c.buyer2).claimPrizeForRank(2,c.buyer2.address)).revertedWithCustomError(c.round,"NotTokenHolder");
  await expect(c.round.connect(c.buyer).transferFrom(c.buyer.address,c.buyer2.address,second)).revertedWithCustomError(c.round,"TransfersLocked");
  await expect(c.round.connect(c.buyer).claimPrizeForRank(2,c.buyer2.address)).changeEtherBalance(ethers,c.buyer2,ethers.parseEther("2"));
  expect(await c.round.prizePaid()).eq(false);expect(await c.round.prizeClaimed(2)).eq(true);
  await c.round.connect(c.buyer).transferFrom(c.buyer.address,c.buyer2.address,second);
  await expect(c.round.connect(c.buyer2).claimPrizeForRank(2,c.buyer2.address)).revertedWithCustomError(c.round,"InvalidPhase");
  await expect(c.round.connect(c.buyer).claimPrize(c.buyer2.address)).changeEtherBalance(ethers,c.buyer2,ethers.parseEther("4"));
  expect(await c.round.prizePaid()).eq(true);expect(await c.round.awardHolder(2)).eq(c.buyer.address);expect(await c.round.awardHolder(1)).eq(c.buyer.address);
  await c.round.withdrawGrowthReserve(c.owner.address,ethers.parseEther("2"));expect(await ethers.provider.getBalance(await c.round.getAddress())).eq(0n);
  expect(await c.round.readyForNextRound()).eq(true);
  await expect(c.round.finalizeDraw(1)).revertedWithCustomError(c.round,"InvalidPhase");
 });
 it("pays four qualifying affiliates equally, caps at 30% of the lowest qualifying referral revenue and excludes unused positions",async()=>{
  const c=await loadFixture(fixture);for(let id=1;id<=5;id++)await enroll(c,id);await open(c);
  for(let id=1;id<=4;id++)await mint(c,100,id);await mint(c,99,5);await mint(c,501);
  expect(await c.round.affiliateQualifiedCount()).eq(4n);expect(await c.round.affiliateEqualShare()).eq(ethers.parseEther("0.3"));
  expect(await c.round.totalAffiliateAccrued()).eq(ethers.parseEther("1.2"));expect(await c.round.unallocatedAffiliatePool()).eq(ethers.parseEther("0.8"));
  expect(await c.round.affiliateClaimable(5)).eq(0n);expect(await c.round.affiliateClaimable(6)).eq(0n);
  await expect(c.round.connect(c.affiliates[4]).claimAffiliateCommission(c.affiliates[4].address)).revertedWithCustomError(c.round,"AffiliateClaimUnavailable");
  await expect(c.round.connect(c.affiliates[0]).claimAffiliateCommission(c.buyer2.address)).changeEtherBalance(ethers,c.buyer2,ethers.parseEther("0.3"));
  await reveal(c);await c.round.withdraw(c.owner.address,ethers.parseEther("2"));await c.round.withdrawGrowthReserve(c.owner.address,ethers.parseEther("0.8"));
  expect(await ethers.provider.getBalance(await c.round.getAddress())).eq(ethers.parseEther("6.9"));
  await expect(c.round.withdrawGrowthReserve(c.owner.address,1)).revertedWithCustomError(c.round,"InsufficientWithdrawableBalance");
 });
 it("pays the full two ETH pool equally to ten qualifiers and rejects direct self referrals",async()=>{
  const c=await loadFixture(fixture);for(let id=1;id<=10;id++)await enroll(c,id);await open(c);
  await expect(c.round.connect(c.affiliates[0]).mintWithAffiliate(c.buyer.address,1,1,{value:PRICE})).revertedWithCustomError(c.round,"SelfReferral");
  for(let id=1;id<=10;id++)await mint(c,100,id);
  expect(await c.round.affiliateQualifiedCount()).eq(10n);expect(await c.round.affiliateEqualShare()).eq(ethers.parseEther("0.2"));expect(await c.round.unallocatedAffiliatePool()).eq(0n);
 });
 it("returns all unsold receipts to current holders and creates no affiliate or prize liability",async()=>{
  const c=await loadFixture(fixture);await enroll(c,1);await open(c);await mint(c,100,1);
  await c.round.connect(c.buyer).transferFrom(c.buyer.address,c.buyer2.address,1);
  await time.increaseTo(c.config.mintDeadline);
  await expect(c.round.requestRandomness()).revertedWithCustomError(c.round,"InvalidPhase");
  await expect(c.round.connect(c.buyer2).refund(1,c.buyer2.address)).changeEtherBalance(ethers,c.buyer2,PRICE);
  expect(await c.round.affiliateClaimable(1)).eq(0n);expect(await c.round.withdrawableBalance()).eq(0n);expect(await c.round.readyForNextRound()).eq(false);
 });
 it("registers and prepares the next collection after reveal without waiting for either holder to claim",async()=>{
  const c=await loadFixture(fixture);await open(c);await mint(c,1000);await reveal(c);
  const config={...c.config,roundId:2n,saleStartAt:BigInt(await time.latest())+3600n,mintDeadline:BigInt(await time.latest())+86400n};
  await c.factory.createRound(config);await c.eligibility.registerCollection(await c.factory.getAddress(),2);
  expect(await c.round.prizePaid()).eq(false);expect(await c.factory.seasonCollectionCount(c.config.seasonId)).eq(2n);
  const next=await c.factory.rounds(2);expect(await c.eligibility.eligibilityStatus(next,c.buyer.address,await c.round.getAddress(),1)).eq(0n);
 });
});

describe("AwardRank unbiased sample space",()=>{
 it("enumerates every ordered pair exactly once and preserves score bijection including N=2",async()=>{
  const h=await ethers.deployContract("AwardRankHarness");
  for(const n of [2n,3n,10n]){
   const space=n*(n-1n),threshold=(1n<<256n)%space;const pairs=new Set<string>();
   if(threshold)expect((await h.tryWinners(ethers.toBeHex(threshold-1n,32),n,2))[0]).eq(false);
   for(let word=threshold;word<threshold+space;word++){
    const [accepted,a,b]=await h.tryWinners(ethers.toBeHex(word,32),n,2);expect(accepted).eq(true);expect(a).not.eq(b);pairs.add(`${a}:${b}`);
    const ranks=await h.ranks(n,a,b);expect(new Set(ranks.map(String)).size).eq(Number(n));expect(ranks[Number(a-1n)]).eq(n);expect(ranks[Number(b-1n)]).eq(n-1n);
   }expect(pairs.size).eq(Number(space));
  }
 });
});

describe("V3 winner credits across two V7 awards",function(){
 this.timeout(180000);
 it("lets either prize holder redeem once for life even if the next collection was prepared before prize claim",async()=>{
  const c=await loadFixture(fixture);
  const registry=await ethers.deployContract("ManekinekoWinnerCreditsV3",[c.owner.address,ethers.ZeroHash,ethers.ZeroAddress]);
  await registry.approveFactory(await c.factory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await c.factory.getAddress())));
  await registry.registerCollection(await c.factory.getAddress(),1);
  await open(c);await mint(c,1000);await reveal(c);
  const config={...c.config,roundId:2n,saleStartAt:BigInt(await time.latest())+3600n,mintDeadline:BigInt(await time.latest())+86400n};
  await c.factory.createRound(config);await c.eligibility.registerCollection(await c.factory.getAddress(),2);await registry.registerCollection(await c.factory.getAddress(),2);
  const next=await ethers.getContractAt("ManekinekoRoundV7",await c.factory.rounds(2));
  await next.fundRandomness({value:await c.coordinator.MOCK_FEE()});await registry.fundCollection(await next.getAddress(),{value:PRICE*2n});
  await expect(registry.claimAwardCredit(await c.round.getAddress(),2)).revertedWithCustomError(registry,"CreditUnavailable");
  await c.round.connect(c.buyer).claimPrizeForRank(2,c.buyer2.address);await registry.claimAwardCredit(await c.round.getAddress(),2);
  const credit=await registry.creditsForAward(await c.round.getAddress(),2);expect(credit.beneficiary).eq(c.buyer.address);expect(credit.earnedAt).eq(await c.round.finalizedAt());
  await expect(registry.connect(c.buyer2).redeemAward(await c.round.getAddress(),2,await next.getAddress())).revertedWithCustomError(registry,"NotBeneficiary");
  await time.increaseTo(config.saleStartAt);await next.activateSale();
  await registry.connect(c.buyer).redeemAward(await c.round.getAddress(),2,await next.getAddress());
  expect(await next.ownerOf(1)).eq(c.buyer.address);expect(await next.totalMintRevenue()).eq(PRICE);expect(await registry.lifetimeRewardUsed(c.buyer.address)).eq(true);
  await c.round.connect(c.buyer).claimPrizeForRank(1,c.buyer.address);
  await expect(registry.claimCredit(await c.round.getAddress())).revertedWithCustomError(registry,"LifetimeRewardAlreadyUsed");
 });
 it("carries forward prior spent credits and rejects migration while the old registry remains funded",async()=>{
  const c=await loadFixture(fixture);const prior=await ethers.deployContract("PriorWinnerCreditRegistryMock");
  await prior.setSponsorBalance(1);
  await expect(ethers.deployContract("ManekinekoWinnerCreditsV3",[c.owner.address,ethers.ZeroHash,await prior.getAddress()])).revert(ethers);
  await prior.setSponsorBalance(0);await prior.markRedeemed(c.buyer.address,await c.round.getAddress());
  const registry=await ethers.deployContract("ManekinekoWinnerCreditsV3",[c.owner.address,ethers.ZeroHash,await prior.getAddress()]);
  expect(await registry.lifetimeRewardUsed(c.buyer.address)).eq(true);expect(await registry.lifetimeRewardUsed(c.buyer2.address)).eq(false);
  await registry.approveFactory(await c.factory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await c.factory.getAddress())));await registry.registerCollection(await c.factory.getAddress(),1);
  await open(c);await mint(c,1000);await reveal(c);await c.round.connect(c.buyer).claimPrizeForRank(2,c.buyer.address);
  await expect(registry.claimAwardCredit(await c.round.getAddress(),2)).revertedWithCustomError(registry,"LifetimeRewardAlreadyUsed");
 });
});

describe("V7 award and qualified-pool boundaries",function(){
 this.timeout(180000);
 it("uses the full equal pool for four affiliates at 167 referrals each",async()=>{
  const c=await loadFixture(fixture);for(let id=1;id<=4;id++)await enroll(c,id);await open(c);
  for(let id=1;id<=4;id++)await mint(c,167,id);await mint(c,332);
  expect(await c.round.affiliateEqualShare()).eq(ethers.parseEther("0.5"));expect(await c.round.unallocatedAffiliatePool()).eq(0n);
 });
 it("rejects single-prize configurations so V7 always has exactly two award slots",async()=>{
  const c=await loadFixture(fixture);
  const factory=await ethers.deployContract("ManekinekoFactoryV7",[c.owner.address]);
  const deployer=await ethers.getContractAt("ManekinekoRoundDeployerV7",await factory.deployer());
  await expect(factory.createRound({...c.config,secondPrizeBps:0n})).revertedWithCustomError(deployer,"DeploymentFailed");
  await expect(factory.createRound({...c.config,maxSupply:1n,minAffiliateReferrals:1n})).revertedWithCustomError(deployer,"DeploymentFailed");
 });
 it("credits two different holders independently, including the second holder before primary settlement",async()=>{
  const c=await loadFixture(fixture);const registry=await ethers.deployContract("ManekinekoWinnerCreditsV3",[c.owner.address,ethers.ZeroHash,ethers.ZeroAddress]);
  await registry.approveFactory(await c.factory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await c.factory.getAddress())));await registry.registerCollection(await c.factory.getAddress(),1);
  await open(c);await mint(c,500);for(let i=0;i<25;i++)await c.round.connect(c.buyer2).mint(c.buyer2.address,20,{value:PRICE*20n});
  const h=await ethers.deployContract("AwardRankHarness");let word=0n,first=0n,second=0n;
  for(;;word++){
   const candidate=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32","uint256","uint256","address","uint256","uint256","uint256"],[ethers.id("MANEKINEKO_AWARD_RANK_V4"),word,31337,await c.round.getAddress(),1,1000,0]));
   const [accepted,a,b]=await h.tryWinners(candidate,1000,2);if(accepted&&(a<=500n)!==(b<=500n)){first=a;second=b;break;}
  }
  await c.round.requestRandomness();await c.coordinator.fulfillRequest(await c.round.requestId(),word);await c.round.finalizeDraw(8);
  const firstHolder=first<=500n?c.buyer:c.buyer2,secondHolder=second<=500n?c.buyer:c.buyer2;
  await c.round.connect(secondHolder).claimPrizeForRank(2,firstHolder.address);await registry.claimAwardCredit(await c.round.getAddress(),2);
  expect((await registry.creditsForAward(await c.round.getAddress(),2)).beneficiary).eq(secondHolder.address);
  await c.round.connect(firstHolder).claimPrize(firstHolder.address);await registry.claimCredit(await c.round.getAddress());expect((await registry.credits(await c.round.getAddress())).beneficiary).eq(firstHolder.address);
  expect(await registry.lifetimeRewardUsed(firstHolder.address)).eq(false);expect(await registry.lifetimeRewardUsed(secondHolder.address)).eq(false);
  const metadata=JSON.parse(Buffer.from((await c.round.tokenURI(first)).split(",")[1],"base64").toString());expect(metadata.award_rank).eq(1);expect(metadata.prize_amount_wei).eq(ethers.parseEther("4").toString());expect(metadata.season_name).eq(c.config.seasonName);
 });
});

describe("V2 eligibility migration preserves completed V6 NFT utility",()=>{
 it("imports a completed round from the prior V1 gate as source-only and prevents another bootstrap",async()=>{
  const c=await loadFixture(fixture);
  const oldGate=await ethers.deployContract("ManekinekoAffiliateEligibility",[c.owner.address]);
  const oldFactory=await ethers.deployContract("ManekinekoFactoryV6",[c.owner.address]);
  await oldGate.approveFactory(await oldFactory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await oldFactory.getAddress())));
  await oldFactory.createRound({...c.config,maxSupply:2n,affiliateEligibility:await oldGate.getAddress()});
  const oldRound=await ethers.getContractAt("ManekinekoRoundV6",await oldFactory.rounds(1));await oldGate.registerCollection(await oldFactory.getAddress(),1);
  await oldRound.fundRandomness({value:await c.coordinator.MOCK_FEE()});await oldRound.activateSale();await oldRound.connect(c.buyer).mint(c.buyer.address,2,{value:PRICE*2n});await oldRound.requestRandomness();await c.coordinator.fulfillRequest(await oldRound.requestId(),11);await oldRound.finalizeDraw(8);await oldRound.distributePrize();
  const migrated=await ethers.deployContract("ManekinekoAffiliateEligibilityV2",[c.owner.address]);
  await migrated.approveFactory(await oldFactory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await oldFactory.getAddress())));await migrated.registerCollection(await oldFactory.getAddress(),1);
  expect((await migrated.collections(await oldRound.getAddress())).sourceOnly).eq(true);
  const nextFactory=await ethers.deployContract("ManekinekoFactoryV7",[c.owner.address]);await migrated.approveFactory(await nextFactory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await nextFactory.getAddress())));await nextFactory.createRound({...c.config,affiliateEligibility:await migrated.getAddress()});await migrated.registerCollection(await nextFactory.getAddress(),1);
  const next=await nextFactory.rounds(1);
  expect(await migrated.eligibilityStatus(next,c.buyer.address,ethers.ZeroAddress,0)).eq(2n);
  expect(await migrated.eligibilityStatus(next,c.buyer.address,await oldRound.getAddress(),1)).eq(0n);
 });
});
