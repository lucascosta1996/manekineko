import {expect} from 'chai';
import {network} from 'hardhat';
import {v16LocalBallotOptions} from '../config/v16-ballot.ts';

// This suite sends real local EVM transactions through the single production
// contract. The coordinator is a mock; it does not establish live VRF liveness.
const {ethers,networkHelpers}=await network.create('hardhatV16Model');
const {time}=networkHelpers;
const price=ethers.parseEther('0.01');
const token=(collection:number,serial:number|bigint)=>(BigInt(collection)<<17n)|BigInt(serial);

describe('V16 one-contract full-season rehearsal',function(){
 this.timeout(180000);
 it('runs 500 Genesis minters, 50 paid participants, eight sellouts, two refunds, 48 prizes and 400 holder claims without mixing reserves',async()=>{
  const [bank]=await ethers.getSigners();const vrf=await ethers.deployContract('VRFCoordinatorV2Mock');
  const protocol=await ethers.deployContract('ManekinekoV16',[{operator:bank.address,coordinator:await vrf.getAddress(),keyHash:ethers.id('mock'),confirmations:64,callbackGas:200000,votingDelay:60,votingDuration:3600,randomnessBudget:price,sponsorshipBudget:price},v16LocalBallotOptions]);
  const season=ethers.id('V16 50-wallet rehearsal');
  await protocol.appendCollections(Array.from({length:10},(_,i)=>({seasonId:season,seasonName:'V16 50-wallet rehearsal',name:`Rehearsal ${i+1}`,color:'#330000',textColor:'#FFFFFF'})));
  await protocol.fundOperating({value:price*100n});await protocol.sealCatalog();
  const buyers=[];
  for(let i=0;i<500;i++){
   const address=ethers.getAddress(ethers.dataSlice(ethers.id(`V16 rehearsal ${i}`),12));await networkHelpers.setBalance(address,ethers.parseEther('3'));
   const buyer=await ethers.getImpersonatedSigner(address);if(i<50)buyers.push(buyer);await protocol.connect(buyer).mintGenesis();await protocol.connect(buyer).mintGenesis();
  }
  expect((await protocol.round(0)).minted).eq(1000);
  let source=0,prizes=0,refunds=0,holderClaims=0;const successful:number[]=[],delayed:bigint[]=[];
  const conserved=async()=>{
   let expected=await protocol.operatingReserve();const pool=await protocol.seasons(season);expected+=pool.funded-pool.paid;
   for(let n=1;n<=Number(await protocol.prepared());n++){
    const r=await protocol.round(n);expected+=r.executionReserve+r.sponsorReserve;
    if(r.finalizedAt===0n)expected+=r.revenue-r.refunded*price;
    else{
     let unpaid=0n;for(let slot=1;slot<=10;slot++){const a=await protocol.affiliates(n,slot);if(a.referrals>0n&&!a.claimed)unpaid+=r.affiliateShare;}
     expected+=r.revenue*6n/10n-r.prizesClaimed*price*100n+unpaid;
     expected+=(r.qualified===0n?0n:r.revenue/5n-r.qualified*r.affiliateShare)-r.growthWithdrawn;
     expected+=r.revenue*(r.qualified===0n?3n:1n)/10n-r.treasuryWithdrawn;
    }
   }
   expect(await protocol.accountedBalance()).eq(expected);expect(await ethers.provider.getBalance(await protocol.getAddress())).eq(expected);
  };
  for(let n=1;n<=10;n++){
   if(n!==1)await protocol.prepareNext();const r=await protocol.round(n);if(n!==1)await time.increaseTo(r.voteStart);
   expect(await protocol.optionCount()).eq(3);
   for(let choice=0;choice<3;choice++)expect(Array.from(await protocol.option(choice))).deep.eq(Object.values(v16LocalBallotOptions[choice]));
   for(let i=0;i<buyers.length;i++){
    const choice=i<30?0:i<40?1:2;
    if(n===1)await protocol.connect(buyers[i]).castGenesisVote(choice,[i*2+1,i*2+2]);
    else await protocol.connect(buyers[i]).castVote(n,choice,[source]);
   }
   expect(await protocol.votes(n,0)).eq(n===1?60:600);
   expect(await protocol.votes(n,1)).eq(n===1?20:200);
   expect(await protocol.votes(n,2)).eq(n===1?20:200);
   expect(await protocol.winningOption(n)).eq(0);
   for(let i=0;i<10;i++)await protocol.connect(buyers[i]).enrollAffiliate(n,i+1,n===1||i%2===0?i*2+1:token(source,i*20+1));
   await time.increaseTo(r.saleStart);const hash=await protocol.termsHash(n),failed=n===3||n===7;
   if(failed){
    for(let i=0;i<3;i++)await protocol.connect(buyers[i]).mint(n,buyers[i].address,1,0,hash,{value:price});
    await time.increaseTo(await protocol.mintDeadline(n));
    for(let i=0;i<2;i++){await protocol.connect(buyers[i]).refund(token(n,i+1),bank.address);refunds++;}
    delayed.push(token(n,3));
   }else{
    // Collection 5 enrolls ten affiliates but no referral converts: its 20% joins the operator's 10%.
    for(let i=0;i<50;i++)await protocol.connect(buyers[i]).mint(n,buyers[i].address,20,n===5?0:(i+1)%10+1,hash,{value:price*20n});
    await vrf.fulfillRequest((await protocol.round(n)).requestId,n);expect(await vrf.lastCallbackSucceeded()).eq(true);await protocol.finalizeDraw(n,8);
    const settled=await protocol.round(n);
    for(const serial of settled.winners.slice(0,6)){const buyer=buyers[Number((serial-1n)/20n)];await protocol.connect(buyer).claimPrize(token(n,serial),bank.address);prizes++;}
    expect(settled.qualified).eq(n===5?0:10);await conserved();
    if(n!==5)for(let i=0;i<10;i++)await protocol.connect(buyers[i]).claimAffiliate(n,bank.address);
    await protocol.withdrawBucket(n,0,price*(n===5?300n:100n));
    await expect(protocol.withdrawBucket(n,1,1)).revertedWithCustomError(protocol,'InsufficientFunds');
    await protocol.claimExecution(n,bank.address);source=n;successful.push(n);
   }
   await protocol.withdrawBucket(n,2,price);if(failed)await protocol.withdrawBucket(n,3,price);
   await protocol.recoverRandomness(n);await conserved();
  }
  const summary=await protocol.holderSummary(season);expect(summary.unlocked).eq(true);expect(summary.limit).eq(400);expect(summary.reward).eq(price*2n);
  for(let serial=1;serial<=400;serial++){const buyer=buyers[Math.floor((serial-1)/20)];await protocol.connect(buyer).claimHolder(token(1,serial),bank.address);holderClaims++;}
  await time.increase(10*365*86400);
  for(const t of delayed){await protocol.connect(buyers[2]).refund(t,bank.address);refunds++;}
  await protocol.withdrawOperating(await protocol.operatingReserve());await conserved();
  expect(successful.length).eq(8);expect(prizes).eq(48);expect(refunds).eq(6);expect(holderClaims).eq(400);
  expect((await protocol.seasons(season)).paid).eq(ethers.parseEther('8'));expect(await protocol.accountedBalance()).eq(0);
  expect(await ethers.provider.getTransactionCount(await protocol.getAddress())).eq(1); // No child contract CREATEs across all ten collections.
  await expect(protocol.prepareNext()).revertedWithCustomError(protocol,'InvalidState');
 });
});
