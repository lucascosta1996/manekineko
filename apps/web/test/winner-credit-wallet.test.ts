import test from "node:test";
import assert from "node:assert/strict";
import { Interface, keccak256, ZeroAddress } from "ethers";
import { prepareCreditRedemption, prepareCreditSourceRegistration } from "../lib/winner-credits/wallet.ts";
import { WINNER_CREDIT_ABI } from "../lib/winner-credits/abi.ts";
import { invalidateWallet, type WalletSession } from "../lib/affiliates/wallet.ts";
import type { WinnerCredit, WinnerCreditResponse } from "../lib/winner-credits/model.ts";

const wallet="0x1111111111111111111111111111111111111111",source="0x2222222222222222222222222222222222222222",target="0x3333333333333333333333333333333333333333",registry="0x4444444444444444444444444444444444444444";
const code="0x60016000",hash=keccak256(code),iface=new Interface(WINNER_CREDIT_ABI);
const credit:WinnerCredit={collectionId:"3342c115-3d41-4cb4-be45-fa103178f0ff",name:"Source",chainId:11155111,roundId:"1",contractAddress:source,factoryAddress:target,contractVersion:"affiliate-v6",winningHolder:wallet,tokenId:"3",available:true,used:false,reason:null,proof:[],legacy:false,legacyWin:null,claimed:false,redeemedIn:null,redeemedTokenId:null};
const data:WinnerCreditResponse={wallet,page:1,pageSize:10,total:1,hasMore:false,availableOnPage:1,networks:[{chainId:11155111,configured:true,registryAddress:registry,runtimeCodeHash:hash,verifiedBlock:"123",lifetimeRedemption:null}],credits:[credit],target:{collectionId:"8fa5f8c0-6ef4-47f6-9af3-60b8101c9321",contractAddress:target,chainId:11155111,name:"Target",mintPriceWei:"10000",ready:true,reason:null,remaining:20,sponsorBalanceWei:"10000"}};
function session(options:{account?:string;chain?:string;code?:string;revert?:boolean;redeemedSource?:string;version?:string;missingLifetimeGetter?:boolean;lifetimeUsed?:boolean}={}){
 const calls:string[]=[];
 const selected={address:wallet,chainId:11155111,injected:{request:async({method}:{method:string})=>method==="eth_chainId"?options.chain??"0xaa36a7":[options.account??wallet]},provider:{getCode:async()=>options.code??code},signer:{call:async(tx:{to:string;data:string})=>{
  assert.equal(tx.to.toLowerCase(),registry);const parsed=iface.parseTransaction(tx)!;calls.push(parsed.name);
  if(parsed.name==="WINNER_CREDITS_VERSION")return iface.encodeFunctionResult(parsed.name,[options.version??"winner-credits-v2"]);
  if(parsed.name==="lifetimeRewardUsed")return iface.encodeFunctionResult(parsed.name,[options.lifetimeUsed??false]);
  if(parsed.name==="redeemedSource"){if(options.missingLifetimeGetter)throw new Error("Unknown getter");return iface.encodeFunctionResult(parsed.name,[options.redeemedSource??ZeroAddress]);}
  if(options.revert)throw new Error("InsufficientSponsorship");
  if(parsed.name==="registerCollection")return iface.encodeFunctionResult(parsed.name,[source]);
  return iface.encodeFunctionResult(parsed.name,[1n]);
 },sendTransaction:()=>{throw new Error("Preparation must never send a transaction");}}} as unknown as WalletSession;
 return {session:selected,calls};
}
test("credit redemption independently simulates then prepares exactly one gas-only registry call",async()=>{
 const s=session();const result=await prepareCreditRedemption(s.session,data,credit);
 assert.equal(result.target.contractAddress,registry);assert.equal(result.request.value,0n);
 const parsed=iface.parseTransaction({data:String(result.request.data)})!;assert.equal(parsed.name,"claimAndRedeem");assert.equal(parsed.args[0].toLowerCase(),source);assert.equal(parsed.args[1].toLowerCase(),target);
 assert.deepEqual(s.calls,["WINNER_CREDITS_VERSION","redeemedSource","claimAndRedeem"]);
});
test("already issued and legacy credits use their exact source-specific entrypoints",async()=>{
 const issued={...credit,claimed:true};let prepared=await prepareCreditRedemption(session().session,{...data,credits:[issued]},issued);
 assert.equal(iface.parseTransaction({data:String(prepared.request.data)})!.name,"redeem");
 const legacy={...credit,legacy:true,contractVersion:"affiliate-v5" as const,legacyWin:{sourceRound:source,holder:wallet,tokenId:"3",paidAt:"12345",transactionHash:`0x${"a".repeat(64)}`}};
 prepared=await prepareCreditRedemption(session().session,{...data,credits:[legacy]},legacy);
 assert.equal(iface.parseTransaction({data:String(prepared.request.data)})!.name,"redeemLegacy");assert.equal(prepared.request.value,0n);
});
test("changed wallets, wrong network, bytecode mismatch, used credits and source-holder mismatch block preparation",async()=>{
 for(const options of [{account:target},{chain:"0x1"},{code:"0x6002"}]) await assert.rejects(prepareCreditRedemption(session(options).session,data,credit));
 const stale=session();invalidateWallet(stale.session);await assert.rejects(prepareCreditRedemption(stale.session,data,credit),/wallet changed/);
 for(const invalid of [{...credit,used:true},{...credit,available:false},{...credit,winningHolder:target},{...credit,chainId:1}])await assert.rejects(prepareCreditRedemption(session().session,{...data,credits:[invalid]},invalid));
 await assert.rejects(prepareCreditRedemption(session({revert:true}).session,data,credit),/InsufficientSponsorship/);
});

test("late source registration is a gas-only exact-factory call and requires verified eligibility",async()=>{
 const late={...credit,available:false,canRegisterSource:true};
 const result=await prepareCreditSourceRegistration(session().session,{...data,credits:[late]},late);
 const parsed=iface.parseTransaction({data:String(result.request.data)})!;
 assert.equal(parsed.name,"registerCollection");assert.equal(parsed.args[0].toLowerCase(),credit.factoryAddress);assert.equal(parsed.args[1],1n);assert.equal(result.request.value,0n);
 await assert.rejects(prepareCreditSourceRegistration(session().session,data,credit),/cannot be registered/);
 await assert.rejects(prepareCreditSourceRegistration(session().session,{...data,credits:[late]},{...late,winningHolder:target}),/cannot be registered/);
});

test("fresh wallet lifetime status blocks a stale eligible API response and unnecessary source registration",async()=>{
 const stale=session({redeemedSource:target});
 await assert.rejects(prepareCreditRedemption(stale.session,data,credit),/already used its lifetime/);
 assert.deepEqual(stale.calls,["WINNER_CREDITS_VERSION","redeemedSource"]);
 const late={...credit,available:false,canRegisterSource:true};
 await assert.rejects(prepareCreditSourceRegistration(session({redeemedSource:target}).session,{...data,credits:[late]},late),/already used its lifetime/);
 const alreadyUsed={...data,networks:data.networks.map(network=>({...network,lifetimeRedemption:{sourceRound:target,targetRound:source,tokenId:"5"}}))};
 await assert.rejects(prepareCreditRedemption(session().session,alreadyUsed,credit),/Refresh/);
});
test("old registries and missing lifetime getters fail closed before wallet spending",async()=>{
 await assert.rejects(prepareCreditRedemption(session({version:"winner-credits-v1"}).session,data,credit),/Unsupported/);
 await assert.rejects(prepareCreditRedemption(session({missingLifetimeGetter:true}).session,data,credit),/Unknown getter/);
});


test("V3 rank-two redemption selects the exact award and rechecks lifetime status",async()=>{
 const second={...credit,contractVersion:"affiliate-v7" as const,awardRank:2,tokenId:"9"};
 const current={...data,networks:data.networks.map(network=>({...network,registryVersion:"winner-credits-v3" as const})),credits:[{...second,awardRank:1,tokenId:"3"},second]};
 const selected=session({version:"winner-credits-v3"});
 const prepared=await prepareCreditRedemption(selected.session,current,second);
 const parsed=iface.parseTransaction({data:String(prepared.request.data)})!;
 assert.equal(parsed.name,"claimAndRedeemAward");assert.equal(parsed.args[1],2n);assert.equal(prepared.request.value,0n);
 assert.deepEqual(selected.calls,["WINNER_CREDITS_VERSION","lifetimeRewardUsed","claimAndRedeemAward"]);
 const issued={...second,claimed:true};const spent=await prepareCreditRedemption(session({version:"winner-credits-v3"}).session,{...current,credits:[issued]},issued);
 assert.equal(iface.parseTransaction({data:String(spent.request.data)})!.name,"redeemAward");
 await assert.rejects(prepareCreditRedemption(session({version:"winner-credits-v3",lifetimeUsed:true}).session,current,second),/already used its lifetime/);
 await assert.rejects(prepareCreditRedemption(session({version:"winner-credits-v2"}).session,current,second),/Unsupported/);
 await assert.rejects(prepareCreditRedemption(session({version:"winner-credits-v3"}).session,{...current,credits:[{...second,awardRank:1}]},second),/Refresh/);
});

test("V3 rank-two source registration is gas-only and cannot reuse stale lifetime eligibility",async()=>{
 const late={...credit,contractVersion:"affiliate-v7" as const,awardRank:2,tokenId:"9",available:false,canRegisterSource:true};
 const current={...data,networks:data.networks.map(network=>({...network,registryVersion:"winner-credits-v3" as const})),credits:[late]};
 const prepared=await prepareCreditSourceRegistration(session({version:"winner-credits-v3"}).session,current,late);
 assert.equal(iface.parseTransaction({data:String(prepared.request.data)})!.name,"registerCollection");
 assert.equal(prepared.request.value,0n);assert.equal(prepared.target.runtimeCodeHash,hash);
 await assert.rejects(prepareCreditSourceRegistration(session({version:"winner-credits-v3",lifetimeUsed:true}).session,current,late),/already used/);
});


test("V4 prepares a gas-only sixth-award redemption and enforces the lifetime limit",async()=>{
 const sixth={...credit,contractVersion:"affiliate-v8" as const,awardRank:6,tokenId:"8"};
 const current={...data,networks:data.networks.map(network=>({...network,registryVersion:"winner-credits-v4" as const})),credits:[sixth]};
 const selected=session({version:"winner-credits-v4"});
 const prepared=await prepareCreditRedemption(selected.session,current,sixth);
 const parsed=iface.parseTransaction({data:String(prepared.request.data)})!;
 assert.equal(parsed.name,"claimAndRedeemAward");assert.equal(parsed.args[1],6n);assert.equal(prepared.request.value,0n);
 assert.deepEqual(selected.calls,["WINNER_CREDITS_VERSION","lifetimeRewardUsed","claimAndRedeemAward"]);
 await assert.rejects(prepareCreditRedemption(session({version:"winner-credits-v4",lifetimeUsed:true}).session,current,sixth),/already used/);
 await assert.rejects(prepareCreditRedemption(session({version:"winner-credits-v3"}).session,current,sixth),/Unsupported/);
 const invalid={...sixth,awardRank:11};
 await assert.rejects(prepareCreditRedemption(session({version:"winner-credits-v4"}).session,{...current,credits:[invalid]},invalid),/rank/);
 const late={...sixth,available:false,canRegisterSource:true};
 const registration=await prepareCreditSourceRegistration(session({version:"winner-credits-v4"}).session,{...current,credits:[late]},late);
 assert.equal(iface.parseTransaction({data:String(registration.request.data)})!.name,"registerCollection");assert.equal(registration.request.value,0n);
});
