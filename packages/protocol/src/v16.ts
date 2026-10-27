import {Contract, getAddress, keccak256, ZeroAddress, type Provider, type TransactionRequest} from 'ethers';
import abi from '@manekineko/contract-abi/protocol-v16' with {type:'json'};
import type {ProtocolConfig} from './config.ts';
import type {Snapshot, RoundState} from './chain.ts';
export {abi as v16Abi};
type RawRound = Record<'voteStart'|'saleStart'|'soldOutAt'|'entropyAt'|'finalizedAt'|'minted'|'refunded'|'revenue'|'subscription'|'requestId'|'word'|'counter'|'executionReserve'|'sponsorReserve'|'affiliateShare'|'qualified'|'growthWithdrawn'|'treasuryWithdrawn'|'prizesClaimed',bigint> & {requested:boolean;subscriptionClosed:boolean;executor:string;winners:bigint[]};

/** Public serials are scoped to a collection; ERC-721 calls always use global IDs. */
export function v16Token(collection: number | bigint, serial: bigint): bigint {
  const id=BigInt(collection);
  if(id<0n||id>256n||serial<1n||serial>(id===0n?1000n:65536n))throw new Error('Invalid collection or NFT number.');
  return(id<<17n)|serial;
}
export async function verifyV16(provider: Provider, config: ProtocolConfig, block?: number) {
  if(config.version!==16||config.chainId!==11155111||Number((await provider.getNetwork()).chainId)!==config.chainId)throw new Error('This deployment requires the verified Sepolia network.');
  const code=await provider.getCode(config.controller,block);
  if(code==='0x'||keccak256(code).toLowerCase()!==config.codeHash.toLowerCase())throw new Error('The deployment could not be verified. Signing is disabled.');
  const c=new Contract(config.controller,abi,provider),at=block===undefined?{}:{blockTag:block};
  const [version,algorithm,supply,limit,optionCount]=await Promise.all([c.CONTRACT_VERSION(at),c.ALGORITHM_VERSION(at),c.GENESIS_SUPPLY(at),c.GENESIS_MAX_MINTS_PER_WALLET(at),c.optionCount(at)]);
  if(version!=='tincta-v16'||algorithm!=='unique-rank-v6'||supply!==1000n||limit!==2n||optionCount<3n||optionCount>8n)throw new Error('Protocol policy verification failed.');
  return c;
}
export function v16Phase(r: {saleStart:bigint;soldOutAt:bigint;entropyAt:bigint;finalizedAt:bigint;requested:boolean;prizesClaimed:bigint}, timestamp: number, deadline: bigint, winners: bigint) {
  if(r.saleStart===0n)return null;
  if(r.finalizedAt>0n)return r.prizesClaimed>=winners?6:5;
  if(r.entropyAt>0n)return 4;
  if(r.soldOutAt>0n)return BigInt(timestamp)>=r.soldOutAt+259200n?7:r.requested?3:2;
  if(BigInt(timestamp)<r.saleStart)return 0;
  return BigInt(timestamp)>=deadline?7:1;
}
export async function readV16(provider: Provider, config: ProtocolConfig, selected=0, wallet?:string, sourcePage=0,now=Date.now()):Promise<Snapshot> {
  const block=await provider.getBlock('latest');
  if(!block||Math.abs(now/1000-block.timestamp)>180)throw new Error('The network data is out of date. Retry before signing.');
  const c=await verifyV16(provider,config,block.number),at={blockTag:block.number},address=getAddress(config.controller);
  const [settings,sealed,prepared,catalogCount,cost,operatingBalance,g,genesisStart,genesisSold,primary]=await Promise.all([c.settings(at),c.catalogSealed(at),c.prepared(at),c.catalogCount(at),c.preparationCost(at),c.operatingReserve(at),c.round(0,at),c.genesisStartsAt(at),c.genesisSoldOutAt(at),wallet?c.primaryMints(0,wallet,at):null]);
  const count=Number(prepared),total=Number(catalogCount);
  if(total>256||count>total||!Number.isInteger(selected)||selected<0||selected>count||g.minted>1000n||primary!==null&&primary>2n)throw new Error('Invalid contract state.');
  const genesis={version:16 as const,address,start:genesisStart,end:0n,minted:g.minted,supply:1000n,open:sealed&&g.minted<1000n,walletMinted:primary===null?null:primary>=2n,primaryMints:primary,maxMints:2n,soldOutAt:genesisSold};
  const latest=count?await c.round(count,at):null;
  const latestTerms=count?await c.terms(count,at):null;
  const latestPhase=latest?v16Phase(latest,block.timestamp,await c.mintDeadline(count,at),latestTerms.winners):null;
  const base={protocolVersion:16 as const,block:block.number,timestamp:block.timestamp,operator:getAddress(settings.operator),voting:address,credits:address,bootstrap:false,sealed,count,catalogCount:total,cost,operatingBalance,canPrepare:sealed&&count<total&&latestPhase!==null&&[5,6,7].includes(latestPhase),latestPhase,sourceCount:0,sources:[],legacy:[],genesis};
  const id=selected||count;
  if(!id||id===1&&genesisSold===0n)return{...base,round:null};
  const [rawRound,plan,t,hash,deadline,optionCount,used,affiliateId]=await Promise.all([c.round(id,at),c.collection(id,at),c.terms(id,at),c.termsHash(id,at),c.mintDeadline(id,at),c.optionCount(at),wallet?c.primaryMints(id,wallet,at):0n,wallet?c.affiliateId(id,wallet,at):0n]);
  const r=rawRound as RawRound;
  const phase=v16Phase(r,block.timestamp,deadline,t.winners);
  if(phase===null)throw new Error('This collection is waiting for Genesis sellout.');
  const options=await Promise.all(Array.from({length:Number(optionCount)},async(_,i)=>{
    const [o,votes]=await Promise.all([c.option(i,at),c.votes(id,i,at)]);
    return{supply:o.supply,price:o.price,winners:o.winners,duration:o.duration,votes};
  }));
  const slots=await Promise.all(Array.from({length:10},(_,i)=>c.affiliates(id,i+1,at)));
  const slot=affiliateId?slots[Number(affiliateId)-1]:null;
  const available=r.finalizedAt>0n?r.revenue/10000n*(r.qualified===0n?3000n:1000n)-r.treasuryWithdrawn:0n;
  const growth=r.finalizedAt>0n&&r.qualified>0n?r.revenue/10000n*2000n-r.qualified*r.affiliateShare-r.growthWithdrawn:0n;
  const awards:RoundState['awards']=r.finalizedAt>0n?await Promise.all(Array.from({length:Number(t.winners)},async(_,i)=>{
    const serial=r.winners[i],token=v16Token(id,serial);
    const [beneficiary,holder]=await Promise.all([c.awardBeneficiary(token,at),c.ownerOf(token,at)]);
    return{rank:i+1,tokenId:serial,amount:r.revenue/10000n*(6000n/t.winners),claimed:beneficiary!==ZeroAddress,holder:getAddress(holder)};
  })):[];
  const sourceCount=id===1?1:id-1;
  const sources=await Promise.all(Array.from({length:Math.min(16,Math.max(0,sourceCount-sourcePage*16))},async(_,i)=>{
    const collectionId=id===1?0:sourcePage*16+i+1;
    return{address,collectionId,power:wallet?await c.votingPower(id,wallet,collectionId,at):0n};
  }));
  const [season,summary]=await Promise.all([c.seasons(plan.seasonId,at),c.holderSummary(plan.seasonId,at)]);
  let settled=0n;
  for(let n=Number(season.first);n<=Number(season.last);n++){
    if(n>count)continue;
    const sr=await c.round(n,at);if(sr.finalizedAt>0n||await c.refundsAvailable(n,at))settled++;
  }
  const holders={address,seasonId:plan.seasonId,funded:season.funded,eligibleNfts:season.eligible,claimLimit:summary.limit,rewardPerNft:summary.reward,claims:season.claims,paid:season.paid,collections:BigInt(season.last)-BigInt(season.first)+1n,settledCollections:settled,unlocked:summary.unlocked};
  return{...base,sourceCount,sources,holders,round:{address,id,name:plan.name,season:plan.seasonName,color:plan.color,phase,supply:t.supply,price:t.price,winners:t.winners,minted:r.minted,start:r.saleStart,deadline,termsHash:hash,voteStart:r.voteStart,totalVotes:options.reduce((n,o)=>n+o.votes,0n),options,operatorAvailable:available,operatorRemaining:available,canFinalize:phase===4,soldOutAt:r.soldOutAt,randomnessDeadline:r.soldOutAt?r.soldOutAt+259200n:0n,executionReserve:r.executionReserve,executionRecipient:getAddress(r.executor),reserve:await c.accountedBalance(at),growth,affiliateId,affiliateAvailable:slot&&slot.referrals>0n&&!slot.claimed&&r.finalizedAt>0n?r.affiliateShare:0n,nextSlot:BigInt(slots.findIndex(s=>s.wallet===ZeroAddress)+1),remaining:20n-used,sponsorship:r.sponsorReserve,subscriptionClosed:r.subscriptionClosed,awards}};
}

/** Translate legacy UI action names only here; never call an old ABI at a V16 address. */
export async function v16RoundTransaction(state:Snapshot,method:string,args:unknown[],value=0n):Promise<TransactionRequest>{
  const r=state.round;if(!r||state.protocolVersion!==16)throw new Error('Select a V16 collection.');
  const c=new Contract(r.address,abi);
  switch(method){
    case'mintQuoted':return c.mint.populateTransaction(r.id,...args,{value});
    case'enrollAffiliate':return c.enrollAffiliate.populateTransaction(r.id,args[0],v16Token(BigInt(String(args[1])),BigInt(String(args[2]))));
    case'claimAffiliateCommission':return c.claimAffiliate.populateTransaction(r.id,args[0]);
    case'claimPrizeForRank':{const award=r.awards.find(a=>a.rank===Number(args[0]));if(!award)throw new Error('Winning NFT not found.');return c.claimPrize.populateTransaction(v16Token(r.id,award.tokenId),args[1]);}
    case'refund':return c.refund.populateTransaction(v16Token(r.id,BigInt(String(args[0]))),args[1]);
    case'requestRandomness':return c.requestRandomness.populateTransaction(r.id);
    case'finalizeDrawAndClaim':return c.finalizeDraw.populateTransaction(r.id,8);
    case'claimExecutionReward':return c.claimExecution.populateTransaction(r.id,args[0]);
    default:throw new Error('Unsupported V16 action.');
  }
}
