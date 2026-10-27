import {expect} from 'chai';
import {network} from 'hardhat';
import {v16LocalBallotOptions} from '../config/v16-ballot.ts';
import {readV16,v16Token,v16RoundTransaction} from '../../../packages/protocol/src/v16.ts';
import {genesisMintTransaction} from '../../../packages/protocol/src/genesis.ts';
import {holderClaimTransaction} from '../../../packages/protocol/src/holder-rewards.ts';
import {readCatalog} from '../../../packages/protocol/src/progress.ts';
import {operatorActions} from '../../../packages/protocol/src/operator-actions.ts';
import {V16MirrorChain} from '../../indexer/lib/nft-mirror/v16-chain.ts';
const {ethers,networkHelpers}=await network.create('hardhatV16Adapters');
const price=ethers.parseEther('0.01');
describe('V16 application adapters against real local contract state',function(){
 this.timeout(120000);
 it('keeps deployment stopped, maps collection IDs and signs real Genesis, affiliate, mint, prize, refund and holder actions',async()=>{
  const [operator,affiliate,buyer]=await ethers.getSigners();
  const mock=await ethers.deployContract('VRFCoordinatorV2Mock');
  const coordinator='0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B';
  await networkHelpers.setCode(coordinator,await ethers.provider.getCode(await mock.getAddress()));
  const vrf=await ethers.getContractAt('VRFCoordinatorV2Mock',coordinator);
  // The mock's constructor storage is initialized at its canonical test address.
  await networkHelpers.setStorageAt(coordinator,0,ethers.zeroPadValue('0x01',32));
  const c=await ethers.deployContract('ManekinekoV16',[{operator:operator.address,coordinator,keyHash:'0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae',confirmations:64,callbackGas:200000,votingDelay:60,votingDuration:3600,randomnessBudget:price,sponsorshipBudget:price},v16LocalBallotOptions]);
  const address=await c.getAddress(),deployment=await c.deploymentTransaction()!.wait();
  await c.appendCollections([1,2].map(i=>({seasonId:ethers.id('adapter season'),seasonName:'Adapter season',name:`Adapter ${i}`,color:'#330000',textColor:'#FFFFFF'})));
  const config={version:16 as const,chainId:11155111,controller:address,codeHash:ethers.keccak256(await ethers.provider.getCode(address)),rpcUrl:'https://example.invalid'};
  const read=async(id=0,wallet=buyer.address)=>readV16(ethers.provider,config,id,wallet,0,Number((await ethers.provider.getBlock('latest'))!.timestamp)*1000);
  let s=await read();expect(s.sealed).eq(false);expect(s.count).eq(0);expect(s.round).eq(null);expect(s.genesis!.open).eq(false);expect(operatorActions(s,config)).length(0);
  const catalog=await readCatalog(ethers.provider,config,s);expect(catalog.seasons[0].collections.map(x=>x.name)).deep.eq(['Adapter 1','Adapter 2']);
  await c.fundOperating({value:price*10n});await c.sealCatalog();s=await read();expect(s.count).eq(1);expect(s.round).eq(null);expect(s.genesis!.open).eq(true);
  await buyer.sendTransaction(await genesisMintTransaction(s));s=await read();expect(s.genesis!.primaryMints).eq(1n);await buyer.sendTransaction(await genesisMintTransaction(s));
  expect((await read()).genesis!.walletMinted).eq(true);await c.connect(affiliate).mintGenesis();
  for(let n=0;n<498;n++){const a=ethers.getAddress(ethers.dataSlice(ethers.id(`V16 adapter genesis ${n}`),12));await networkHelpers.setBalance(a,price);const w=await ethers.getImpersonatedSigner(a);await c.connect(w).mintGenesis();await c.connect(w).mintGenesis();}
  await c.connect(affiliate).mintGenesis();s=await read();expect(s.round!.options).length(3);expect(s.round!.phase).eq(0);expect(s.sources[0].collectionId).eq(0);expect(s.sources[0].power).eq(2n);
  await c.connect(buyer).castGenesisVote(2,[1,2]);s=await read();expect(s.sources[0].power).eq(0n);
  await affiliate.sendTransaction(await v16RoundTransaction(await read(1,affiliate.address),'enrollAffiliate',[1,0,3]));
  expect((await read(1,affiliate.address)).round!.affiliateId).eq(1n);
  await networkHelpers.time.increaseTo((await c.round(1)).saleStart);s=await read();expect(s.round!.winners).eq(10n);
  const receipt=await(await buyer.sendTransaction(await v16RoundTransaction(s,'mintQuoted',[buyer.address,20,1,s.round!.termsHash],price*20n))).wait();
  for(let n=1;n<50;n++){const a=ethers.getAddress(ethers.dataSlice(ethers.id(`V16 adapter buyer ${n}`),12));await c.mint(1,a,20,1,await c.termsHash(1),{value:price*20n});}
  await vrf.fulfillRequest((await c.round(1)).requestId,0);await operator.sendTransaction(await v16RoundTransaction(await read(),'finalizeDrawAndClaim',[operator.address]));
  s=await read();expect(s.round!.awards).length(10);expect(s.round!.phase).eq(5);expect(s.holders!.unlocked).eq(false);expect(s.round!.operatorAvailable).eq(price*100n);
  const award=s.round!.awards[0];await networkHelpers.setBalance(award.holder,price);const winner=await ethers.getImpersonatedSigner(award.holder);
  await winner.sendTransaction(await v16RoundTransaction(s,'claimPrizeForRank',[award.rank,award.holder]));expect(await c.awardBeneficiary(v16Token(1,award.tokenId))).eq(award.holder);
  await affiliate.sendTransaction(await v16RoundTransaction(await read(1,affiliate.address),'claimAffiliateCommission',[affiliate.address]));expect((await read(1,affiliate.address)).round!.affiliateAvailable).eq(0n);
  await c.prepareNext();await networkHelpers.time.increaseTo((await c.round(2)).saleStart);s=await read(2);expect(s.round!.id).eq(2);expect(s.round!.address).eq(address);
  await buyer.sendTransaction(await v16RoundTransaction(s,'mintQuoted',[buyer.address,1,0,s.round!.termsHash],price));
  await networkHelpers.time.increaseTo(await c.mintDeadline(2));s=await read(2);expect(s.round!.phase).eq(7);expect(s.holders!.unlocked).eq(true);
  await buyer.sendTransaction(await v16RoundTransaction(s,'refund',[1,buyer.address]));
  s=await read(1);await buyer.sendTransaction(await holderClaimTransaction(ethers.provider,config,s,1n,buyer.address,s.holders!.rewardPerNft));expect(await c.holderClaimed(v16Token(1,1n))).eq(true);
  const mirrorConfig={...config,controller:address.toLowerCase(),fromBlock:deployment!.blockNumber,confirmations:2,blockRange:2000};
  const mirror=new V16MirrorChain(ethers.provider as any,mirrorConfig),head=await mirror.block((await ethers.provider.getBlock('latest'))!.number);
  await mirror.verify(head);const collections=await mirror.discover(deployment!.blockNumber,head);expect(collections.map(x=>x.roundId)).deep.eq([0,1,2]);
  const first=collections.find(x=>x.roundId===1)!;expect((await mirror.events(first,receipt!.blockNumber,head)).length).eq(1000);
  expect((await mirror.artwork(first,1,head,receipt!.blockNumber)).metadata.name).eq('Adapter 1 #1');
  const second=collections.find(x=>x.roundId===2)!,events=await mirror.events(second,second.deploymentBlock,head);expect(events.map(e=>e.burned)).deep.eq([false,true]);
  expect((await mirror.artwork(second,1,head,events[0].block)).metadata.name).eq('Adapter 2 #1');
 });
});
