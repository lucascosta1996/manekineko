import test from "node:test";
import assert from "node:assert/strict";
import { Interface, keccak256, ZeroAddress } from "ethers";
import { trustedAffiliateEligibility } from "../lib/affiliates/eligibility-chain.ts";
import { verifyEnrollmentNft } from "../lib/affiliates/eligibility-wallet.ts";
import { AFFILIATE_ELIGIBILITY_ABI } from "../lib/affiliates/eligibility-abi.ts";
import exportedGateAbi from "@manekineko/contract-abi/affiliate-eligibility" with {type:"json"};
import exportedRoundAbi from "@manekineko/contract-abi/round-v6" with {type:"json"};
import { ENROLLMENT_V6_TYPES } from "../lib/affiliates/policy.ts";
import type { ChainSnapshot } from "../lib/affiliates/chain.ts";
import type { WalletSession, ContractTarget } from "../lib/affiliates/wallet.ts";
import type { AffiliateEnrollmentEligibility } from "../lib/affiliates/types.ts";

const wallet="0x1111111111111111111111111111111111111111",source="0x2222222222222222222222222222222222222222",target="0x3333333333333333333333333333333333333333",gate="0x4444444444444444444444444444444444444444",factory="0x5555555555555555555555555555555555555555";
const code="0x60016000",hash=keccak256(code),factoryHash=keccak256("0x6002"),roundHash=keccak256("0x6003"),iface=new Interface(AFFILIATE_ELIGIBILITY_ABI),roundIface=new Interface(["function affiliateEligibility() view returns(address)"]);
const selection={sourceCollection:source,sourceTokenId:"17"};
const env={AFFILIATE_ELIGIBILITY_ADDRESS_11155111:gate,AFFILIATE_ELIGIBILITY_CODEHASH_11155111:hash,AFFILIATE_TRUSTED_FACTORY_CODEHASH_V6_11155111:factoryHash};
type Options={account?:string;chain?:string;code?:string;version?:string;configuredGate?:string;sequence?:bigint;sourceOnly?:boolean;status?:number;factory?:string;roundId?:bigint;roundHash?:string;factoryHash?:string;missingGetter?:boolean;revert?:boolean};
function info(o:Options){return[o.factory??factory,o.roundId??2n,o.sequence??2n,o.roundHash??roundHash,o.sourceOnly??false];}
function gateRead(name:string,args:readonly unknown[],o:Options):unknown[]{
 if(o.missingGetter||o.revert)throw new Error("Gate read unavailable");
 if(name==="ELIGIBILITY_VERSION")return[o.version??"affiliate-eligibility-v1"];
 if(name==="collections"){assert.equal(String(args[0]).toLowerCase(),target);return info(o);}
 if(name==="approvedFactoryCodeHash")return[o.factoryHash??factoryHash];
 if(name==="eligibilityStatus"){assert.equal(String(args[0]).toLowerCase(),target);assert.equal(String(args[1]).toLowerCase(),wallet);return[o.status??0];}
 throw new Error(`Unexpected ${name}`);
}
function snapshot(o:Options={}):ChainSnapshot{return {
 record:{contractVersion:"affiliate-v6",contractAddress:target,factoryAddress:factory,chainId:11155111,roundId:"2"},codeHash:roundHash,
 call:async(name:string)=>{assert.equal(name,"affiliateEligibility");return o.configuredGate??gate;},walletCode:async()=>o.code??code,
 readContract:async(address:string,_iface:Interface,name:string,args:unknown[]=[])=>{assert.equal(address,gate);return gateRead(name,args,o);},
} as unknown as ChainSnapshot;}
const contractTarget:ContractTarget={chainId:11155111,contractAddress:target,contractVersion:"affiliate-v6"};
const eligibility:AffiliateEnrollmentEligibility={policy:"nft_holder",gateAddress:gate,runtimeCodeHash:hash,sequence:"2",page:1,hasMore:false,tokens:[],reason:null};
function session(o:Options={}):WalletSession{return {
 address:wallet,chainId:11155111,injected:{request:async({method}:{method:string})=>method==="eth_chainId"?o.chain??"0xaa36a7":[o.account??wallet]},provider:{getCode:async()=>o.code??code},
 signer:{call:async(tx:{to:string;data:string})=>{
  if(tx.to.toLowerCase()===target)return roundIface.encodeFunctionResult("affiliateEligibility",[o.configuredGate??gate]);
  assert.equal(tx.to.toLowerCase(),gate);const parsed=iface.parseTransaction(tx)!;
  return iface.encodeFunctionResult(parsed.name,gateRead(parsed.name,Array.from(parsed.args),o));
 },sendTransaction:()=>{throw new Error("Eligibility checks must never transact");}},
} as unknown as WalletSession;}

test("canonical gate pins prove the exact target registration and permit bootstrap only for global sequence one",async()=>{
 const holder=await trustedAffiliateEligibility(snapshot(),env);
 assert.equal(holder.policy,"nft_holder");assert.equal(holder.sequence,"2");assert.equal(holder.reason,null);
 assert.deepEqual(await holder.check(wallet,selection),{eligible:true,reason:null});
 const bootstrap=await trustedAffiliateEligibility(snapshot({sequence:1n}),env);
 assert.equal(bootstrap.policy,"bootstrap");await bootstrap.assertEligible(wallet,{sourceCollection:ZeroAddress,sourceTokenId:"0"});
});
test("unregistered and imported source-only rounds cannot present open enrollment",async()=>{
 for(const o of [{sequence:0n},{sourceOnly:true}])assert.match((await trustedAffiliateEligibility(snapshot(o),env)).reason!,/not registered/);
});
test("unpinned, substituted and outdated eligibility gates fail closed",async()=>{
 for(const bad of [{},{...env,AFFILIATE_ELIGIBILITY_ADDRESS_11155111:ZeroAddress},{...env,AFFILIATE_ELIGIBILITY_CODEHASH_11155111:roundHash}])await assert.rejects(trustedAffiliateEligibility(snapshot(),bad));
 for(const o of [{code:"0x"},{code:"0x6002"},{configuredGate:source},{version:"affiliate-eligibility-v0"},{factory:source},{roundId:3n},{roundHash:hash},{factoryHash:roundHash},{missingGetter:true}])await assert.rejects(trustedAffiliateEligibility(snapshot(o),env));
});
test("current holdings, prior completion and destination-specific reuse are required by the canonical gate",async()=>{
 const reasons=[/not registered/,/earlier official/,/no longer owns/,/already qualified/,/closed/,/completed/];
 for(let status=1;status<=6;status++){
  const verifier=await trustedAffiliateEligibility(snapshot({status}),env);
  const result=await verifier.check(wallet,selection);assert.equal(result.eligible,false);assert.match(result.reason!,reasons[status-1]!);
  await assert.rejects(verifier.assertEligible(wallet,selection),reasons[status-1]);
 }
 await assert.rejects((await trustedAffiliateEligibility(snapshot({status:255}),env)).check(wallet,selection),/Unrecognized/);
});
test("wallet preflight independently verifies current ownership and the pinned collection gate without sending a transaction",async()=>{
 await verifyEnrollmentNft(session(),contractTarget,eligibility,selection);
 await verifyEnrollmentNft(session({sequence:1n}),contractTarget,{...eligibility,sequence:"1",policy:"bootstrap"},{sourceCollection:ZeroAddress,sourceTokenId:"0"});
});
test("fresh wallet preflight refuses transfer, consumed NFT, old ABI, substituted verifier or stale account",async()=>{
 for(const o of [{account:source},{chain:"0x1"},{code:"0x"},{code:"0x6002"},{configuredGate:source},{version:"affiliate-eligibility-v0"},{sequence:0n},{sequence:3n},{sourceOnly:true},{missingGetter:true},{revert:true},{status:2},{status:3},{status:4},{status:5},{status:6}]) await assert.rejects(verifyEnrollmentNft(session(o),contractTarget,eligibility,selection));
 await assert.rejects(verifyEnrollmentNft(session(),{...contractTarget,contractVersion:"affiliate-v5"},eligibility,selection));
 await assert.rejects(verifyEnrollmentNft(session(),contractTarget,undefined,selection));
});

test("web eligibility ABI and source-bound enrollment fields match the compiled contracts",()=>{
 const compiled=new Interface(exportedGateAbi),round=new Interface(exportedRoundAbi);
 for(const fragment of iface.fragments){
   if(fragment.type!=="function")continue;
   const local=iface.getFunction(fragment.format("sighash"))!,actual=compiled.getFunction(fragment.format("sighash"))!;
   assert.equal(actual.selector,local.selector);assert.deepEqual(actual.outputs.map(output=>output.type),local.outputs.map(output=>output.type));
 }
 const enrollment=round.getFunction("enrollAffiliate")!;
 assert.deepEqual(enrollment.inputs.map(input=>input.name),["applicant","affiliateId","poolBps","sourceCollection","sourceTokenId","nonce","deadline","signature"]);
 assert.deepEqual(ENROLLMENT_V6_TYPES.Enrollment.map(input=>input.name),enrollment.inputs.slice(0,-1).map(input=>input.name));
});

test("V8 enrollment requires independent V3 registry and V8 factory pins in API and wallet preflight",async()=>{
 const v8=snapshot({version:"affiliate-eligibility-v3"});v8.record={...v8.record,contractVersion:"affiliate-v8"};
 const v8env={AFFILIATE_ELIGIBILITY_V3_ADDRESS_11155111:gate,AFFILIATE_ELIGIBILITY_V3_CODEHASH_11155111:hash,AFFILIATE_TRUSTED_FACTORY_CODEHASH_V8_11155111:factoryHash};
 await assert.rejects(trustedAffiliateEligibility(v8,env));
 const verified=await trustedAffiliateEligibility(v8,v8env);assert.equal((await verified.check(wallet,selection)).eligible,true);
 const v8target={...contractTarget,contractVersion:"affiliate-v8" as const};
 await verifyEnrollmentNft(session({version:"affiliate-eligibility-v3"}),v8target,eligibility,selection);
 await assert.rejects(verifyEnrollmentNft(session({version:"affiliate-eligibility-v2"}),v8target,eligibility,selection));
});

test("V9 and V10 require their own exact registry version and independent factory pins",async()=>{
 for (const [contractVersion,registryVersion,gateSuffix,factorySuffix] of [["affiliate-v9","affiliate-eligibility-v4","V4","V9"],["affiliate-v10","affiliate-eligibility-v5","V5","V10"]] as const) {
  const current=snapshot({version:registryVersion});current.record={...current.record,contractVersion};
  const pins={ [`AFFILIATE_ELIGIBILITY_${gateSuffix}_ADDRESS_11155111`]:gate,[`AFFILIATE_ELIGIBILITY_${gateSuffix}_CODEHASH_11155111`]:hash,[`AFFILIATE_TRUSTED_FACTORY_CODEHASH_${factorySuffix}_11155111`]:factoryHash };
  await assert.rejects(trustedAffiliateEligibility(current,env));
  assert.equal((await (await trustedAffiliateEligibility(current,pins)).check(wallet,selection)).eligible,true);
  await verifyEnrollmentNft(session({version:registryVersion}),{...contractTarget,contractVersion},eligibility,selection);
  await assert.rejects(verifyEnrollmentNft(session({version:"affiliate-eligibility-v3"}),{...contractTarget,contractVersion},eligibility,selection));
 }
});
