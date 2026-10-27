import {Contract,Transaction,type JsonRpcProvider} from 'ethers';
import abi from '../../../packages/contracts/src/ManekinekoV16.json' with {type:'json'};
import type {Plan} from './plan.mts';
import type {RunState} from './engine.mts';
/** No keys, RPC URLs, raw signed bytes or explorer credentials enter the report. */
export async function report(plan:Plan,state:RunState,provider:JsonRpcProvider){
 const c=new Contract(plan.address,abi,provider),block=await provider.getBlock('latest');if(!block)throw new Error('Report anchor unavailable.');const at={blockTag:block.number};
 const prepared=Number(await c.prepared(at)),collections=[];
 for(let id=1;id<=prepared;id++){
  const r=await c.round(id,at),t=await c.terms(id,at),scenario=plan.scenarios[id-1];
  const awards=[];if(r.finalizedAt>0n)for(let rank=0;rank<Number(t.winners);rank++){const global=(BigInt(id)<<17n)|r.winners[rank];awards.push({rank:rank+1,serial:String(r.winners[rank]),globalToken:String(global),owner:await c.ownerOf(global,at),beneficiary:await c.awardBeneficiary(global,at)});}
  collections.push({id,name:scenario.name,expected:scenario.outcome,minted:String(r.minted),refunded:String(r.refunded),revenueWei:String(r.revenue),saleStart:String(r.saleStart),mintDeadline:String(await c.mintDeadline(id,at)),soldOutAt:String(r.soldOutAt),entropyAt:String(r.entropyAt),finalizedAt:String(r.finalizedAt),prizesClaimed:String(r.prizesClaimed),awards});
 }
 const seasons=[];for(const seasonId of [...new Set(plan.scenarios.map(s=>s.seasonId))]){const s=await c.seasons(seasonId,at),h=await c.holderSummary(seasonId,at);seasons.push({seasonId,first:String(s.first),last:String(s.last),fundedWei:String(s.funded),paidWei:String(s.paid),eligibleNfts:String(s.eligible),claimLimit:String(h.limit),claims:String(s.claims),unlocked:h.unlocked});}
 const manual=[];for(const[address,custody]of Object.entries(state.custody))manual.push({address,...custody,balanceWei:String(await provider.getBalance(address,block.number))});
 const transactions=Object.entries(state.journals).flatMap(([actor,j])=>j.transactions.map(e=>{const t=Transaction.from(e.rawTransaction);return{actor:Number(actor),action:e.action,hash:e.hash,status:e.state,block:e.blockNumber,from:j.from,to:t.to,valueWei:String(t.value),gasUsed:e.gasUsed,gasPriceWei:e.gasPrice};}));
 return{version:16,network:'Sepolia',chainId:11155111,contract:plan.address,codeHash:plan.codeHash,planHash:state.planHash,at:new Date().toISOString(),block:block.number,blockHash:block.hash,started:state.started,complete:state.complete,sealed:await c.catalogSealed(at),genesisMints:String((await c.round(0,at)).minted),catalogCollections:216,preparedCollections:prepared,bank:state.addresses[plan.bankIndex],bankBalanceWei:String(await provider.getBalance(state.addresses[plan.bankIndex],block.number)),externalFundingWei:String(state.funding.reduce((n,p)=>n+BigInt(p.value),0n)),gasWei:state.gasWei,knownVrfFeesWei:state.vrfFeesWei,contractAccountedWei:String(await c.accountedBalance(at)),operatorProtectedBaselineWei:state.operatorBaseline,manualWallets:manual,currentCheckpoint:state.gate,manualTests:state.approvals,errors:state.errors,incidentOverrides:state.overrides??{},costReviews:state.costReviews??[],coverageLimits:plan.coverageLimits,collections,seasons,transactions};
}
