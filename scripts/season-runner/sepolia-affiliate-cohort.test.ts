import test from "node:test";
import assert from "node:assert/strict";
import { Contract, Interface, Wallet, ZeroAddress, keccak256, verifyTypedData } from "ethers";
import { parseAffiliateCohort } from "./sepolia-scenarios.ts";
import { assertCohortOutcome, cohortReferralId, enrollCohort } from "./sepolia-affiliate-cohort.ts";
import { ENROLLMENT_V6_TYPES } from "../../apps/web/lib/affiliates/policy.ts";
const wallets=Array.from({length:50},()=>new Wallet(Wallet.createRandom().privateKey));
const source=`0x${"a1".repeat(20)}`,target=`0x${"a2".repeat(20)}`,registry=`0x${"a3".repeat(20)}`;
const cohort={sourceCollection:source,sourceCodeHash:keccak256("0x1234"),slots:[wallets[0],...wallets.slice(2,11)].map((wallet,index)=>({id:index+1,wallet:wallet.address,sourceTokenId:String(index+1)})),successfulIds:[1,2,3,4,5]};

test("half-success cohort accepts exactly ten distinct NFT holders and five successful slots",()=>{
 assert.deepEqual(parseAffiliateCohort(cohort,wallets[0].address,wallets[1].address),cohort);
 for(const patch of [{slots:cohort.slots.slice(0,9)},{successfulIds:[1,2,3,4]},{successfulIds:[1,1,2,3,4]},{successfulIds:[6,7,8,9,10]},
  {slots:cohort.slots.map(s=>s.id===2?{...s,wallet:wallets[1].address}:s)},{slots:cohort.slots.map(s=>s.id===2?{...s,sourceTokenId:"1"}:s)},{privateKey:"forbidden"}])
  assert.throws(()=>parseAffiliateCohort({...cohort,...patch},wallets[0].address,wallets[1].address));
});
test("all 960 bot mints plus one manual referral reach exactly five beneficiaries without self referrals",()=>{
 const counts=Array<bigint>(10).fill(0n);counts[0]=1n;
 for(let index=2;index<50;index++){
  const id=cohortReferralId(cohort,wallets[index].address,index);assert.notEqual(cohort.slots[id-1].wallet,wallets[index].address);counts[id-1]+=20n;
 }
 assert.equal(counts.reduce((a,b)=>a+b),961n);assert.equal(counts.filter(c=>c>0n).length,5);
 assertCohortOutcome(cohort,counts,5n,counts.map(c=>c>0n?400n:0n),400n);
 assert.throws(()=>assertCohortOutcome(cohort,counts.map((c,i)=>i===9?1n:c),6n,counts,400n));
 assert.throws(()=>assertCohortOutcome(cohort,counts,5n,counts.map(()=>0n),400n));
});

function fixture(){
 const signer=new Wallet(Wallet.createRandom().privateKey),iface=new Interface(["function ownerOf(uint256) view returns(address)","function eligibilityStatus(address,address,address,uint256) view returns(uint8)","function enrollAffiliate(address,uint256,uint256,address,uint256,bytes32,uint256,bytes)"]);
 const control={manual:true,all:false,expired:false,wrongOwner:false,ineligible:false,wrongHash:false,wrongSlot:false,unexpectedReferral:false,canonical:true};
 const calls:any[]=[];
 const provider:any={call:async(request:any)=>{const call=iface.parseTransaction(request)!;return iface.encodeFunctionResult(call.name,[call.name==="ownerOf"?(control.wrongOwner?wallets[3].address:wallets[2].address):control.ineligible?3n:0n]);},getCode:async()=>control.wrongHash?"0x5678":"0x1234"};
 const round={target,maxAffiliateSlots:async()=>10n,affiliateMinimumReferrals:async()=>1n,affiliatePoolBps:async()=>2000n,saleStartAt:async()=>1000n,
  affiliateWallet:async(id:number)=>control.wrongSlot?wallets[49].address:(control.all||id===1&&control.manual)?cohort.slots[id-1].wallet:ZeroAddress,
  affiliateReferredMints:async(id:number)=>control.unexpectedReferral&&id===6?1n:0n,affiliateCount:async()=>10n,enrollmentSigner:async()=>signer.address,affiliateEligibility:async()=>registry,
  enrollAffiliate:{populateTransaction:async(...args:any[])=>({to:target,data:iface.encodeFunctionData("enrollAffiliate",args)})}} as unknown as Contract;
 const options={chainId:11155111,cohort,round,provider,block:{number:100,timestamp:100},affiliate:wallets[0].address,wallets,admissionSigner:signer,
  canonical:async()=>{if(!control.canonical)throw Error("reorg");},fund:async()=>false,send:async(wallet:Wallet,action:string,request:any)=>{calls.push({wallet:wallet.address,action,request});}};
 return{options,control,calls,iface,signer};
}
test("cohort enrollment waits for the human and signs one genuine NFT-bound bot permit with a stable intent",async()=>{
 const f=fixture();f.control.manual=false;
 assert.equal((await enrollCohort(f.options))?.action,"manual-checkpoint");assert.equal(f.calls.length,0);
 f.control.manual=true;
 assert.equal((await enrollCohort(f.options))?.action,"enroll-cohort");assert.equal(f.calls.length,1);
 const call=f.iface.parseTransaction(f.calls[0].request)!;
 const [applicant,affiliateId,poolBps,sourceCollection,sourceTokenId,nonce,deadline,signature]=call.args;
 assert.equal(f.calls[0].wallet,wallets[2].address);assert.equal(affiliateId,2n);assert.equal(sourceTokenId,2n);assert.equal(deadline,999n);
 assert.equal(verifyTypedData({name:"ManekinekoAffiliateEnrollment",version:"4",chainId:11155111,verifyingContract:target},ENROLLMENT_V6_TYPES,{applicant,affiliateId,poolBps,sourceCollection,sourceTokenId,nonce,deadline},signature),f.signer.address);
 await enrollCohort(f.options);assert.deepEqual(f.calls[1],f.calls[0]);
 f.control.all=true;assert.equal(await enrollCohort(f.options),null);
});
test("cohort rejects changed ownership, eligibility, runtime, slots, referrals, reorg and Mainnet before sending",async()=>{
 for(const field of ["wrongOwner","ineligible","wrongHash","wrongSlot","unexpectedReferral","canonical"] as const){
  const f=fixture();if(field==="unexpectedReferral")f.control.all=true;f.control[field]=field!=="canonical";
  await assert.rejects(enrollCohort(f.options));assert.equal(f.calls.length,0);
 }
 const f=fixture();await assert.rejects(enrollCohort({...f.options,chainId:1}),/sepolia_only/);
 await assert.rejects(enrollCohort({...f.options,block:{number:100,timestamp:1000}}),/window_expired/);
 assert.equal(f.calls.length,0);
});
