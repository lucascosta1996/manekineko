import { expect } from 'chai';
import { network } from 'hardhat';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { tinctaBallotOptions } from '../config/tincta-rewards.ts';

const { ethers, networkHelpers }=await network.create('tinctaMainnetModel');
const { time }=networkHelpers;
const global=(id:number,serial:bigint|number)=>(BigInt(id)<<17n)|BigInt(serial);

describe('Tincta Rewards complete production catalog model',function(){
  this.timeout(300000);
  it('settles the ordered 216 collections and 22 seasons with exact payouts, refunds, sponsorship and holder liabilities',async()=>{
    const source=JSON.parse(await readFile(new URL('../../launch/catalog/mainnet.json',import.meta.url),'utf8'));
    const catalog=source.seasons.flatMap((s:any)=>s.collections.map((c:any)=>({seasonId:s.seasonId,seasonName:s.name,name:c.name,color:c.color,textColor:c.textColor})));
    expect(catalog).length(216);expect(source.seasons).length(22);
    const wallets=await ethers.getSigners(),buyer=wallets[0],affiliate=wallets[1];
    const coordinator='0xD7f86b4b8Cae7D942340FF628F82735b7a20893a',mock=await ethers.deployContract('VRFCoordinatorV2Mock');
    await networkHelpers.setCode(coordinator,await ethers.provider.getCode(await mock.getAddress()));
    await networkHelpers.setStorageAt(coordinator,0,1);await networkHelpers.setStorageAt(coordinator,1,1);
    const vrf=await ethers.getContractAt('VRFCoordinatorV2Mock',coordinator);
    const c=await ethers.deployContract('TinctaRewards',[buyer.address,ethers.parseEther('0.25'),ethers.parseEther('0.2')]);
    const recipient=(n:number)=>n===0?buyer.address:ethers.getAddress(ethers.dataSlice(ethers.id(`Tincta catalog buyer ${n}`),12));
    async function owner(token:bigint){const address=await c.ownerOf(token);await networkHelpers.setBalance(address,ethers.parseEther('10000'));return ethers.getImpersonatedSigner(address);}
    for(let offset=0;offset<catalog.length;offset+=10)await c.appendCollections(catalog.slice(offset,offset+10));
    for(let i=0;i<catalog.length;i++)expect(Array.from(await c.collection(i+1))).deep.eq(Object.values(catalog[i]));
    const preparation=await c.preparationCost();await c.fundOperating({value:preparation*216n});await c.sealCatalog();
    for(const wallet of [buyer,affiliate]){await c.connect(wallet).mintGenesis();await c.connect(wallet).mintGenesis();}
    for(let n=2;n<500;n++){const address=recipient(n);await networkHelpers.setBalance(address,ethers.parseEther('1'));const wallet=await ethers.getImpersonatedSigner(address);await c.connect(wallet).mintGenesis();await c.connect(wallet).mintGenesis();}
    let previousSuccessful=0,firstWinner=0n,prizes=0,refunds=0,affiliateClaims=0,holderClaims=0,sponsored=0,lockedHolder=0n;
    const outcomes:any[]=[],seasonReports:any[]=[],seasonSuccessful=new Map<string,number[]>();
    for(let i=0;i<catalog.length;i++){
      console.log(`    Settling catalog collection ${i+1}`);
      const id=i+1,p=catalog[i],position=i-catalog.findIndex((q:any)=>q.seasonId===p.seasonId),refund=[2,5].includes(position),noVotes=position===3;
      const choice=i===2?1:([0,4,7,9].includes(position)?2:0);
      if(id>1){await c.prepareNext();await time.increaseTo((await c.round(id)).voteStart);}
      expect((await c.holderSummary(p.seasonId)).unlocked).eq(false);
      if(position!==3){await c.connect(affiliate).enrollAffiliate(id,1,3);}
      if(!noVotes){if(id===1)await c.castGenesisVote(choice,[1,2]);else await c.castVote(id,choice,[previousSuccessful]);}
      await time.increaseTo((await c.round(id)).saleStart);const terms=await c.terms(id),hash=await c.termsHash(id),target=refund?3n:terms.supply;
      expect(terms.price).eq(tinctaBallotOptions[choice].price);
      let minted=0n,buyerIndex=0;const sponsoredAddress=id===2?await c.ownerOf(firstWinner):ethers.ZeroAddress;
      if(id===2){const winner=await owner(firstWinner);await c.connect(winner).redeemSponsored(firstWinner,id);minted=1n;sponsored++;expect(await c.lifetimeRewardUsed(winner.address)).eq(true);await expect(c.connect(winner).redeemSponsored(firstWinner,id)).revertedWithCustomError(c,'NotEligible');}
      while(minted<target){const address=recipient(buyerIndex++),available=address===sponsoredAddress?19n:20n,quantity=target-minted>available?available:target-minted;await c.mint(id,address,quantity,position===3?0:1,hash,{value:terms.price*quantity});minted+=quantity;}
      let prizeWei=0n,affiliateWei=0n,refundWei=0n,treasuryWei=0n;
      if(refund){
        expect(await c.refundsAvailable(id)).eq(false);await time.increaseTo(await c.mintDeadline(id));expect(await c.refundsAvailable(id)).eq(true);
        for(let serial=1n;serial<=target;serial++){await c.refund(global(id,serial),buyer.address);refunds++;refundWei+=terms.price;}
        await expect(c.refund(global(id,1),buyer.address)).revertedWithCustomError(c,'ERC721NonexistentToken');
        await c.withdrawBucket(id,3,(await c.round(id)).executionReserve);
      }else{
        if(!(await c.round(id)).requested)await c.requestRandomness(id);const pending=await c.round(id);await vrf.fulfillRequest(pending.requestId,id);
        for(let attempts=0;!(await c.round(id)).finalizedAt&&attempts<10;attempts++)await c.finalizeDraw(id,8);
        const r=await c.round(id);expect(r.finalizedAt).gt(0);expect(new Set(r.winners.slice(0,Number(terms.winners)).map(String)).size).eq(Number(terms.winners));
        for(let rank=0;rank<Number(terms.winners);rank++){const nft=global(id,r.winners[rank]);const holder=await owner(nft);await c.connect(holder).claimPrize(nft,holder.address);prizes++;prizeWei+=r.revenue/10000n*(6000n/terms.winners);}
        if(id===1)firstWinner=global(1,r.winners[0]);
        if(r.qualified){await c.connect(affiliate).claimAffiliate(id,affiliate.address);affiliateClaims++;affiliateWei=r.affiliateShare;}
        treasuryWei=r.revenue/10000n*(r.qualified===0n?3000n:1000n);await c.withdrawBucket(id,0,treasuryWei);await c.claimExecution(id,buyer.address);
        const pool=r.revenue/10n;lockedHolder+=pool;expect(prizeWei+affiliateWei+treasuryWei+pool).eq(r.revenue);
        previousSuccessful=id;const successful=seasonSuccessful.get(p.seasonId)??[];successful.push(id);seasonSuccessful.set(p.seasonId,successful);
      }
      const reserve=(await c.round(id)).sponsorReserve;if(reserve)await c.withdrawBucket(id,2,reserve);await c.recoverRandomness(id);
      const seasonLast=!catalog[i+1]||catalog[i+1].seasonId!==p.seasonId;
      if(seasonLast){
        const h=await c.holderSummary(p.seasonId),s=await c.seasons(p.seasonId);expect(h.unlocked).eq(true);expect(h.limit).eq(s.eligible/20n);expect(h.reward).eq(s.funded/h.limit);
        let claims=0n;for(const collection of seasonSuccessful.get(p.seasonId)??[]){const r=await c.round(collection);for(let serial=1n;serial<=r.minted&&claims<h.limit;serial++){const nft=global(collection,serial),holder=await owner(nft);await c.connect(holder).claimHolder(nft,holder.address);claims++;holderClaims++;lockedHolder-=h.reward;}}
        expect(claims).eq(h.limit);expect((await c.seasons(p.seasonId)).paid).eq(h.reward*h.limit);
        await expect(c.claimHolder(global(seasonSuccessful.get(p.seasonId)![0],1),buyer.address)).revertedWithCustomError(c,'NotEligible');
        seasonReports.push({seasonId:p.seasonId,name:p.seasonName,eligible:String(s.eligible),claimLimit:String(h.limit),claims:String(claims),fundedWei:String(s.funded),paidWei:String(h.reward*claims),roundingDustWei:String(s.funded-h.reward*claims)});
      }
      // Independent residual liability after every settled collection: only
      // unallocated operating funds and unpaid season-holder allocations remain.
      const expected=await c.operatingReserve()+lockedHolder;expect(await c.accountedBalance()).eq(expected);expect(await ethers.provider.getBalance(await c.getAddress())).eq(expected);
      outcomes.push({id,seasonId:p.seasonId,name:p.name,choice:choice+1,outcome:refund?'refund':'sellout',minted:String(target),priceWei:String(terms.price),prizeWei:String(prizeWei),affiliateWei:String(affiliateWei),treasuryWei:String(treasuryWei),refundWei:String(refundWei),accounting:'exact'});
    }
    expect(outcomes.filter(x=>x.outcome==='sellout')).length(172);expect(outcomes.filter(x=>x.outcome==='refund')).length(44);expect(seasonReports).length(22);expect(sponsored).eq(1);
    const remaining=await c.operatingReserve();if(remaining)await c.withdrawOperating(remaining);expect(await c.accountedBalance()).eq(lockedHolder);expect(await ethers.provider.getBalance(await c.getAddress())).eq(lockedHolder);
    const directory=new URL('../../../output/tincta-mainnet-model/',import.meta.url);await mkdir(directory,{recursive:true});
    await writeFile(new URL('local-catalog.json',directory),JSON.stringify({contract:'TinctaRewards',evidence:'local strict Mainnet EVM; mocked Chainlink; controlled time; production supplies, prices and deadlines',passed:true,liveMainnet:false,collections:216,seasons:22,sellouts:172,refundCollections:44,prizes,refunds,affiliateClaims,holderClaims,sponsored,remainingHolderDustWei:String(lockedHolder),outcomes,seasonReports},null,2)+'\n');
  });
});
