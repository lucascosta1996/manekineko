import { expect } from "chai";
import { artifacts, network } from "hardhat";
const {ethers,networkHelpers}=await network.create();
const {time,loadFixture}=networkHelpers;
const PRICE=ethers.parseEther("0.01");
async function fixture(){
 const [owner,enrollmentSigner,buyer,other,affiliate]=await ethers.getSigners();
 const coordinator=await ethers.deployContract("VRFCoordinatorV2Mock");
 const eligibility=await ethers.deployContract("ManekinekoAffiliateEligibilityV4",[owner.address]);
 const factory=await ethers.deployContract("ManekinekoFactoryV9",[owner.address]);
 await eligibility.approveFactory(await factory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
 const config={name:"Six equal prizes",symbol:"NEKO8",seasonId:ethers.id("Season V9"),seasonName:"Season V9",collectionColor:"#330000",textColor:"#FFFFFF",roundId:1n,maxSupply:1000n,mintPrice:PRICE,mintDeadline:BigInt(await time.latest())+86400n,saleStartAt:BigInt(await time.latest())+3600n,initialOwner:owner.address,vrfCoordinator:await coordinator.getAddress(),keyHash:ethers.id("mock-key"),requestConfirmations:64,callbackGasLimit:200000,maxAffiliateSlots:10n,enrollmentSigner:enrollmentSigner.address,prizeBps:6000n,winnerCount:6n,affiliatePoolBps:2000n,minAffiliateReferrals:100n,affiliatePayoutCapBps:3000n,affiliateEligibility:await eligibility.getAddress()};
 await factory.createRound(config);const round=await ethers.getContractAt("ManekinekoRoundV9",await factory.rounds(1));await eligibility.registerCollection(await factory.getAddress(),1);await round.fundRandomness({value:await coordinator.MOCK_FEE()});
 return {owner,enrollmentSigner,buyer,other,affiliate,coordinator,eligibility,factory,config,round};
}
type C=Awaited<ReturnType<typeof fixture>>;
async function open(c:C){await time.increaseTo(c.config.saleStartAt);await c.round.activateSale();}

async function reveal(c:C){await c.round.requestRandomness();await c.coordinator.fulfillRequest(await c.round.requestId(),0);await c.round.finalizeDraw(8);}
async function winners(c:C){return Promise.all(Array.from({length:Number(c.config.winnerCount)},(_,i)=>c.round.winningTokenIds(i+1)));}
async function enroll(c:C){
 const nonce=ethers.id("v9-enroll"),deadline=c.config.saleStartAt-1n;
 const sig=await c.enrollmentSigner.signTypedData({name:"ManekinekoAffiliateEnrollment",version:"4",chainId:31337,verifyingContract:await c.round.getAddress()},{Enrollment:[{name:"applicant",type:"address"},{name:"affiliateId",type:"uint256"},{name:"poolBps",type:"uint256"},{name:"sourceCollection",type:"address"},{name:"sourceTokenId",type:"uint256"},{name:"nonce",type:"bytes32"},{name:"deadline",type:"uint256"}]},{applicant:c.affiliate.address,affiliateId:1,poolBps:c.config.affiliatePoolBps,sourceCollection:ethers.ZeroAddress,sourceTokenId:0,nonce,deadline});
 await c.round.connect(c.affiliate).enrollAffiliate(c.affiliate.address,1,c.config.affiliatePoolBps,ethers.ZeroAddress,0,nonce,deadline,sig);
}

describe('V9 cumulative 20-ticket wallet allowance', function () {
 this.timeout(180000);
 it('rejects ticket 21 across transactions and different payers, without affecting another wallet',async()=>{
  const c=await loadFixture(fixture);await open(c);
  expect(await c.round.MAX_MINTS_PER_WALLET()).eq(20n);
  await c.round.connect(c.buyer).mint(c.buyer.address,12,{value:PRICE*12n});
  await c.round.connect(c.other).mint(c.buyer.address,8,{value:PRICE*8n});
  expect(await c.round.mintedPerWallet(c.buyer.address)).eq(20n);expect(await c.round.remainingMints(c.buyer.address)).eq(0n);
  await expect(c.round.connect(c.buyer).mint(c.buyer.address,1,{value:PRICE})).revertedWithCustomError(c.round,'WalletMintLimitExceeded').withArgs(c.buyer.address,0);
  await expect(c.round.connect(c.other).mint(c.buyer.address,1,{value:PRICE})).revertedWithCustomError(c.round,'WalletMintLimitExceeded');
  await c.round.connect(c.other).mint(c.other.address,20,{value:PRICE*20n});expect(await c.round.totalMinted()).eq(40n);
 });
 it('shares the cap across direct and referral minting and rolls back the whole oversize batch',async()=>{
  const c=await loadFixture(fixture);await enroll(c);await open(c);
  await c.round.connect(c.buyer).mint(c.buyer.address,19,{value:PRICE*19n});
  await expect(c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address,2,1,{value:PRICE*2n})).revertedWithCustomError(c.round,'WalletMintLimitExceeded').withArgs(c.buyer.address,1);
  expect(await c.round.totalMinted()).eq(19n);expect(await c.round.totalReferredMints()).eq(0n);expect(await c.round.remainingMints(c.buyer.address)).eq(1n);
  await c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address,1,1,{value:PRICE});
  await expect(c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address,1,1,{value:PRICE})).revertedWithCustomError(c.round,'WalletMintLimitExceeded');
  expect(await c.round.totalReferredMints()).eq(1n);expect(await c.round.totalMintRevenue()).eq(PRICE*20n);
 });
 it('does not restore allowance after transfers or refund burns',async()=>{
  const c=await loadFixture(fixture);await open(c);await c.round.connect(c.buyer).mint(c.buyer.address,20,{value:PRICE*20n});
  for(let id=1;id<=20;id++)await c.round.connect(c.buyer).transferFrom(c.buyer.address,c.other.address,id);
  expect(await c.round.balanceOf(c.buyer.address)).eq(0n);expect(await c.round.remainingMints(c.buyer.address)).eq(0n);expect(await c.round.remainingMints(c.other.address)).eq(20n);
  await expect(c.round.connect(c.buyer).mint(c.buyer.address,1,{value:PRICE})).revertedWithCustomError(c.round,'WalletMintLimitExceeded');
  await time.increaseTo(c.config.mintDeadline);await c.round.connect(c.other).refund(1,c.other.address);
  expect(await c.round.mintedPerWallet(c.buyer.address)).eq(20n);
 });
 it('reserves the whole allowance before receiver callbacks and restores it on rejected receipt',async()=>{
  const c=await loadFixture(fixture),receiver=await ethers.deployContract('WinnerCreditReceiver'),to=await receiver.getAddress();await open(c);
  await receiver.configure(true,false,ethers.ZeroAddress,'0x',ethers.ZeroAddress);
  await expect(c.round.connect(c.buyer).mint(to,20,{value:PRICE*20n})).revertedWith('NFT rejected');expect(await c.round.remainingMints(to)).eq(20n);expect(await c.round.totalMinted()).eq(0n);
  await receiver.configure(false,false,await c.round.getAddress(),c.round.interface.encodeFunctionData('mint',[to,1]),ethers.ZeroAddress);
  await c.round.connect(c.buyer).mint(to,20,{value:PRICE*20n});expect(await receiver.attackCount()).eq(20n);expect(await receiver.attackSucceeded()).eq(false);expect(await c.round.remainingMints(to)).eq(0n);expect(await c.round.totalMinted()).eq(20n);
 });
 it('sells 1000 tickets to 50 wallets, settles six one-ETH prizes and preserves the affiliate pool',async()=>{
  const c=await loadFixture(fixture);await enroll(c);
  const credits=await ethers.deployContract('ManekinekoWinnerCreditsV5',[c.owner.address,ethers.ZeroHash,ethers.ZeroAddress]);
  await credits.approveFactory(await c.factory.getAddress(),ethers.keccak256(await ethers.provider.getCode(await c.factory.getAddress())));await credits.registerCollection(await c.factory.getAddress(),1);
  await open(c);const buyers=[];
  for(let i=0;i<50;i++){
   const buyer=ethers.Wallet.createRandom().connect(ethers.provider);await networkHelpers.setBalance(buyer.address,ethers.parseEther('1'));buyers.push(buyer);
   await c.round.connect(buyer).mintWithAffiliate(buyer.address,20,1,{value:PRICE*20n});expect(await c.round.remainingMints(buyer.address)).eq(0n);
  }
  await reveal(c);expect(await c.round.totalMinted()).eq(1000n);expect(await c.round.totalMintRevenue()).eq(ethers.parseEther('10'));
  const ids=await winners(c);expect(new Set(ids.map(String)).size).eq(6);const owners=await Promise.all(ids.map(id=>c.round.ownerOf(id)));
  for(let rank=1;rank<=6;rank++){
   const holder=await c.round.ownerOf(ids[rank-1]),buyer=buyers.find(b=>b.address===holder)!;
   expect(await c.round.prizeAmountForRank(rank)).eq(ethers.parseEther('1'));
   await expect(c.round.claimPrizeForRank(rank,c.owner.address)).revertedWithCustomError(c.round,'NotTokenHolder');
   await c.round.connect(buyer).claimPrizeForRank(rank,buyer.address);
  }
  expect(await c.round.prizePaidAmount()).eq(ethers.parseEther('6'));expect(await c.round.affiliateClaimable(1)).eq(ethers.parseEther('2'));
  await c.round.connect(c.affiliate).claimAffiliateCommission(c.affiliate.address);expect(await c.round.totalAffiliateClaimed()).eq(ethers.parseEther('2'));
  const start=BigInt(await time.latest())+3600n;
  await c.factory.createRound({...c.config,roundId:2n,saleStartAt:start,mintDeadline:start+86400n});await c.eligibility.registerCollection(await c.factory.getAddress(),2);await credits.registerCollection(await c.factory.getAddress(),2);
  const next=await ethers.getContractAt('ManekinekoRoundV9',await c.factory.rounds(2));await next.fundRandomness({value:await c.coordinator.MOCK_FEE()});await credits.fundCollection(await next.getAddress(),{value:PRICE*6n});
  await time.increaseTo(start);await next.activateSale();
  const winner=buyers.find(b=>b.address===owners[0])!;
  await next.connect(winner).mint(winner.address,20,{value:PRICE*20n});
  const budget=await credits.sponsorBalance(await next.getAddress());
  await expect(credits.connect(winner).claimAndRedeemAward(await c.round.getAddress(),1,await next.getAddress())).revertedWithCustomError(next,'WalletMintLimitExceeded');
  expect(await credits.lifetimeRewardUsed(winner.address)).eq(false);expect(await credits.sponsorBalance(await next.getAddress())).eq(budget);
  const rank=owners.findIndex(address=>address!==winner.address)+1;expect(rank).gt(1);const second=buyers.find(b=>b.address===owners[rank-1])!;
  await next.connect(second).mint(second.address,19,{value:PRICE*19n});await credits.connect(second).claimAndRedeemAward(await c.round.getAddress(),rank,await next.getAddress());
  expect(await next.mintedPerWallet(second.address)).eq(20n);expect(await next.totalMintRevenue()).eq(PRICE*40n);expect(await credits.sponsorBalance(await next.getAddress())).eq(budget-PRICE);
  expect(await credits.lifetimeRewardUsed(second.address)).eq(true);
  await expect(next.connect(second).mint(second.address,1,{value:PRICE})).revertedWithCustomError(next,'WalletMintLimitExceeded');
  for(const component of ['RoundV9' ,'FactoryV9','RendererV9','RoundDeployerV9','AffiliateEligibilityV4','WinnerCreditsV5']){const a=await artifacts.readArtifact(`Manekineko${component}`);expect((a.deployedBytecode.length-2)/2,component).at.most(24576);expect((a.bytecode.length-2)/2,component).at.most(49152);}
 });
});
