import assert from "node:assert/strict";
import test from "node:test";
import { Wallet, verifyTypedData, ZeroAddress } from "ethers";
import { completeEnrollment, type EnrollmentChallengeRecord, type EnrollmentDependencies } from "../lib/affiliates/enrollment.ts";
import { AffiliateError, authenticationData, ENROLLMENT_TYPES, ENROLLMENT_V4_TYPES, ENROLLMENT_V5_TYPES, ENROLLMENT_V6_TYPES, enrollmentNftSelection } from "../lib/affiliates/policy.ts";

async function fixture() {
  const now=Date.now(),wallet=Wallet.createRandom(),signer=Wallet.createRandom();
  const challenge:EnrollmentChallengeRecord={id:"test",collectionId:"8fa5f8c0-6ef4-47f6-9af3-60b8101c9321",wallet:wallet.address.toLowerCase(),chainId:1,contractAddress:"0x1111111111111111111111111111111111111111",origin:"https://nft.example.com",nonce:"0x"+"ab".repeat(32),ipDigest:"a".repeat(64),expiresAt:new Date(now+300_000),consumedAt:null};
  const expected={collectionId:challenge.collectionId,chainId:challenge.chainId,contractAddress:challenge.contractAddress,origin:challenge.origin,ipDigest:challenge.ipDigest,mintDeadline:BigInt(Math.floor(now/1000)+3600)};
  const data=authenticationData(challenge.wallet,challenge.collectionId,challenge.origin,challenge.nonce,String(Math.floor(challenge.expiresAt.getTime()/1000)),challenge.chainId,challenge.contractAddress);
  const signature=await wallet.signTypedData(data.domain,data.types,data.message);
  const calls:string[]=[];
  const dependencies:EnrollmentDependencies={now:()=>now,verifyContractSignature:async()=>{calls.push("1271");return false;},verifyBot:async()=>{calls.push("bot");},admitAuthenticatedWallet:async()=>{calls.push("admit");},assertCanonical:async()=>{calls.push("canonical");},sign:async(domain,types,message)=>{calls.push("sign");return signer.signTypedData(domain,types,message);},consume:async()=>{calls.push("consume");}};
  return {wallet,signer,challenge,expected,signature,calls,dependencies};
}
test("authenticated enrollment signs only the fixed collection-bound permit after bot and canonical checks",async()=>{
  const f=await fixture();const permit=await completeEnrollment(f.challenge,f.expected,f.signature,f.dependencies);
  assert.deepEqual(f.calls,["bot","admit","canonical","sign","consume"]);
  const domain={name:"ManekinekoAffiliateEnrollment",version:"1",chainId:1,verifyingContract:f.challenge.contractAddress};
  const message={applicant:permit.applicant,nonce:permit.nonce,deadline:permit.deadline};
  assert.equal(verifyTypedData(domain,ENROLLMENT_TYPES,message,permit.signature),f.signer.address);
  assert.notEqual(verifyTypedData({...domain,chainId:11155111},ENROLLMENT_TYPES,message,permit.signature),f.signer.address);
  assert.equal(permit.nonce,f.challenge.nonce);
  assert.ok(BigInt(permit.deadline)<=BigInt(Math.floor(f.dependencies.now()/1000)+120));
});
test("stale, used, cross-origin, cross-collection and network-substituted challenges never reach signing",async()=>{
  const f=await fixture();
  for(const change of [{consumedAt:new Date()},{expiresAt:new Date(0)},{collectionId:"another"},{chainId:11155111},{origin:"https://attacker.example"},{ipDigest:"b".repeat(64)},{contractAddress:"0x2222222222222222222222222222222222222222"}]) {
    await assert.rejects(()=>completeEnrollment({...f.challenge,...change},f.expected,f.signature,f.dependencies),/challenge/);
    assert.deepEqual(f.calls,[]);
  }
});
test("wrong wallet signatures and failed bot validation cannot authorize a position",async()=>{
  const f=await fixture();
  await assert.rejects(()=>completeEnrollment(f.challenge,f.expected,"0x00",f.dependencies),/signature/);
  assert.deepEqual(f.calls,["1271"]); f.calls.length=0;
  await assert.rejects(()=>completeEnrollment(f.challenge,f.expected,f.signature,{...f.dependencies,verifyBot:async()=>{throw new Error("bot rejected");}}),/bot rejected/);
  assert.deepEqual(f.calls,[]);
  await assert.rejects(()=>completeEnrollment(f.challenge,f.expected,f.signature,{...f.dependencies,assertCanonical:async()=>{throw new Error("reorg");}}),/reorg/);
  assert.deepEqual(f.calls,["bot","admit"]);
});
test("ERC1271 wallet authentication and delegated EOA signatures use their appropriate verification path",async()=>{
  const f=await fixture();
  await completeEnrollment(f.challenge,f.expected,"0x00",{...f.dependencies,verifyContractSignature:async(wallet,digest,signature)=>{assert.equal(wallet,f.challenge.wallet);assert.match(digest,/^0x[0-9a-f]{64}$/);assert.equal(signature,"0x00");return true;}});
  assert.deepEqual(f.calls,["bot","admit","canonical","sign","consume"]);
  f.calls.length=0;
  await completeEnrollment(f.challenge,f.expected,f.signature,{...f.dependencies,verifyContractSignature:async()=>{throw new Error("EOA must not require ERC1271");}});
  assert.deepEqual(f.calls,["bot","admit","canonical","sign","consume"]);
});
test("concurrent requests return at most one permit when durable nonce consumption loses a race",async()=>{
  const f=await fixture();let consumed=false;
  const dependencies={...f.dependencies,consume:async()=>{if(consumed)throw new AffiliateError("challenge_consumed","Already used.",409);consumed=true;}};
  const results=await Promise.allSettled(Array.from({length:12},()=>completeEnrollment(f.challenge,f.expected,f.signature,dependencies)));
  assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(results.filter(result=>result.status==="rejected").length,11);
});
test("wallet authentication can expire during bot verification; no late permit is signed",async()=>{
  const f=await fixture();let now=f.dependencies.now();
  await assert.rejects(()=>completeEnrollment(f.challenge,f.expected,f.signature,{...f.dependencies,now:()=>now,verifyBot:async()=>{now=f.challenge.expiresAt.getTime()+1;}}),/expire/);
  assert.deepEqual(f.calls,["admit","canonical"]);
});
test("an attacker cannot consume a victim's global wallet quota without both wallet and bot proofs",async()=>{
  const f=await fixture();let admissions=0;
  const dependencies={...f.dependencies,admitAuthenticatedWallet:async()=>{admissions++;}};
  for(let i=0;i<10;i++) await assert.rejects(()=>completeEnrollment(f.challenge,f.expected,"0x00",dependencies),/signature/);
  assert.equal(admissions,0);
  await assert.rejects(()=>completeEnrollment(f.challenge,f.expected,f.signature,{...dependencies,verifyBot:async()=>{throw new Error("invalid bot");}}),/invalid bot/);
  assert.equal(admissions,0);
  await completeEnrollment(f.challenge,f.expected,f.signature,dependencies);
  assert.equal(admissions,1);
});
test("V4 authenticates and issues the exact offered slot and rate in version-2 typed data",async()=>{
  const f=await fixture(),offer={affiliateId:10,commissionBps:200};
  const challenge={...f.challenge,contractVersion:"affiliate-v4" as const,...offer};
  const expected={...f.expected,contractVersion:"affiliate-v4" as const,...offer};
  const data=authenticationData(challenge.wallet,challenge.collectionId,challenge.origin,challenge.nonce,String(Math.floor(challenge.expiresAt.getTime()/1000)),challenge.chainId,challenge.contractAddress,offer);
  assert.equal(data.domain.version,"2");
  const signature=await f.wallet.signTypedData(data.domain,data.types,data.message);
  const permit=await completeEnrollment(challenge,expected,signature,f.dependencies);
  assert.equal(permit.affiliateId,10);assert.equal(permit.commissionBps,200);assert.equal(permit.contractVersion,"affiliate-v4");
  const domain={name:"ManekinekoAffiliateEnrollment",version:"2",chainId:1,verifyingContract:challenge.contractAddress};
  const message={applicant:permit.applicant,affiliateId:permit.affiliateId,commissionBps:permit.commissionBps,nonce:permit.nonce,deadline:permit.deadline};
  assert.equal(verifyTypedData(domain,ENROLLMENT_V4_TYPES,message,permit.signature),f.signer.address);
  assert.notEqual(verifyTypedData(domain,ENROLLMENT_V4_TYPES,{...message,commissionBps:100},permit.signature),f.signer.address);
  assert.notEqual(verifyTypedData({...domain,version:"1"},ENROLLMENT_V4_TYPES,message,permit.signature),f.signer.address);
  for(const change of [{affiliateId:9},{commissionBps:100},{contractVersion:"affiliate-v3" as const}]) await assert.rejects(()=>completeEnrollment(challenge,{...expected,...change},signature,f.dependencies),/offer/);
  for(const change of [{affiliateId:9},{commissionBps:100}]) await assert.rejects(()=>completeEnrollment({...challenge,...change},{...expected,...change},signature,f.dependencies),/signature/);
  await assert.rejects(()=>completeEnrollment(challenge,expected,f.signature,f.dependencies),/signature/);
});
test("a valid zero-commission offer remains explicit and cannot be promoted to a paid offer",async()=>{
  const f=await fixture(),offer={affiliateId:6,commissionBps:0};
  const challenge={...f.challenge,contractVersion:"affiliate-v4" as const,...offer};
  const expected={...f.expected,contractVersion:"affiliate-v4" as const,...offer};
  const data=authenticationData(challenge.wallet,challenge.collectionId,challenge.origin,challenge.nonce,String(Math.floor(challenge.expiresAt.getTime()/1000)),challenge.chainId,challenge.contractAddress,offer);
  const signature=await f.wallet.signTypedData(data.domain,data.types,data.message);
  assert.equal((await completeEnrollment(challenge,expected,signature,f.dependencies)).commissionBps,0);
  await assert.rejects(()=>completeEnrollment(challenge,{...expected,commissionBps:100},signature,f.dependencies),/offer/);
});


for (const version of ["affiliate-v5"] as const) test(`${version} authentication and admission sign the exact pool in the version-3 domain`,async()=>{
  const f=await fixture(),offer={affiliateId:20,commissionBps:1000};
  const challenge={...f.challenge,contractVersion:version,...offer};
  const expected={...f.expected,contractVersion:version,...offer};
  const data=authenticationData(challenge.wallet,challenge.collectionId,challenge.origin,challenge.nonce,String(Math.floor(challenge.expiresAt.getTime()/1000)),challenge.chainId,challenge.contractAddress,offer,true);
  assert.equal(data.domain.version,"3"); assert.equal(data.message.poolBps,1000); assert.equal(data.message.commissionBps,undefined);
  const signature=await f.wallet.signTypedData(data.domain,data.types,data.message);
  const permit=await completeEnrollment(challenge,expected,signature,f.dependencies);
  const domain={name:"ManekinekoAffiliateEnrollment",version:"3",chainId:1,verifyingContract:challenge.contractAddress};
  const message={applicant:permit.applicant,affiliateId:permit.affiliateId,poolBps:permit.commissionBps,nonce:permit.nonce,deadline:permit.deadline};
  assert.equal(permit.contractVersion, version);
  assert.equal(verifyTypedData(domain,ENROLLMENT_V5_TYPES,message,permit.signature),f.signer.address);
  assert.notEqual(verifyTypedData({...domain,verifyingContract:"0x3333333333333333333333333333333333333333"},ENROLLMENT_V5_TYPES,message,permit.signature),f.signer.address);
  assert.notEqual(verifyTypedData({...domain,version:"2"},ENROLLMENT_V5_TYPES,message,permit.signature),f.signer.address);
  for(const change of [{commissionBps:2000},{affiliateId:19},{contractVersion:"affiliate-v4" as const}]) await assert.rejects(()=>completeEnrollment(challenge,{...expected,...change},signature,f.dependencies),/offer/);
});

async function holderFixture(bootstrap=false) {
  const f=await fixture(),offer={affiliateId:2,commissionBps:1000};
  const selection={sourceCollection:bootstrap?ZeroAddress:"0x3333333333333333333333333333333333333333",sourceTokenId:bootstrap?"0":"17"};
  const challenge={...f.challenge,contractVersion:"affiliate-v6" as const,...offer,eligibilitySourceAddress:selection.sourceCollection,eligibilityTokenId:selection.sourceTokenId};
  const expected={...f.expected,contractVersion:"affiliate-v6" as const,...offer,...selection};
  const data=authenticationData(challenge.wallet,challenge.collectionId,challenge.origin,challenge.nonce,String(Math.floor(challenge.expiresAt.getTime()/1000)),challenge.chainId,challenge.contractAddress,offer,true,selection);
  const signature=await f.wallet.signTypedData(data.domain,data.types,data.message);
  const dependencies={...f.dependencies,verifyEligibility:async()=>{f.calls.push("eligibility");}};
  return {...f,challenge,expected,selection,data,signature,dependencies};
}
for(const bootstrap of [false,true])test(`V6 ${bootstrap?"bootstrap":"holder"} enrollment binds the exact NFT proof in version-4 authentication and permit`,async()=>{
  const f=await holderFixture(bootstrap);
  assert.equal(f.data.domain.version,"4");
  const permit=await completeEnrollment(f.challenge,f.expected,f.signature,f.dependencies);
  assert.deepEqual(f.calls,["bot","admit","eligibility","canonical","sign","consume"]);
  assert.equal(permit.sourceCollection,f.selection.sourceCollection);assert.equal(permit.sourceTokenId,f.selection.sourceTokenId);
  const domain={name:"ManekinekoAffiliateEnrollment",version:"4",chainId:1,verifyingContract:f.challenge.contractAddress};
  const message={applicant:permit.applicant,affiliateId:permit.affiliateId,poolBps:permit.commissionBps,sourceCollection:permit.sourceCollection,sourceTokenId:permit.sourceTokenId,nonce:permit.nonce,deadline:permit.deadline};
  assert.equal(verifyTypedData(domain,ENROLLMENT_V6_TYPES,message,permit.signature),f.signer.address);
  for(const changed of [{...message,sourceTokenId:"99"},{...message,sourceCollection:"0x4444444444444444444444444444444444444444"}]) assert.notEqual(verifyTypedData(domain,ENROLLMENT_V6_TYPES,changed,permit.signature),f.signer.address);
  assert.notEqual(verifyTypedData({...domain,version:"3"},ENROLLMENT_V6_TYPES,message,permit.signature),f.signer.address);
});
test("V6 rejects legacy proof-less challenges and substituted NFT proofs before signing",async()=>{
 const f=await holderFixture();
 for(const bad of [{eligibilitySourceAddress:null,eligibilityTokenId:null},{eligibilitySourceAddress:ZeroAddress,eligibilityTokenId:"17"},{eligibilityTokenId:"0"}]) await assert.rejects(completeEnrollment({...f.challenge,...bad},f.expected,f.signature,f.dependencies));
 for(const changed of [{sourceCollection:"0x4444444444444444444444444444444444444444"},{sourceTokenId:"18"}])await assert.rejects(completeEnrollment(f.challenge,{...f.expected,...changed},f.signature,f.dependencies),/qualifying NFT/);
 await assert.rejects(completeEnrollment(f.challenge,f.expected,f.signature,{...f.dependencies,verifyEligibility:undefined}),/qualifying NFT/);
 assert.deepEqual(f.calls,[]);
 const changed={...f.challenge,eligibilityTokenId:"18"};
 await assert.rejects(completeEnrollment(changed,{...f.expected,sourceTokenId:"18"},f.signature,f.dependencies),/signature/);
 assert.deepEqual(f.calls,["1271"]);
});
test("transferred, consumed, unfinished or current-collection NFT proofs cannot receive an issuer permit",async()=>{
 for(const reason of ["not holder","token already used","source not completed","source is current collection","gate read unavailable"]){
   const f=await holderFixture();
   await assert.rejects(completeEnrollment(f.challenge,f.expected,f.signature,{...f.dependencies,verifyEligibility:async()=>{throw new Error(reason);}}),new RegExp(reason));
   assert.deepEqual(f.calls,["bot","admit"]);
 }
});
test("NFT selections accept only a valid paired bootstrap or positive bounded token ID",()=>{
 assert.deepEqual(enrollmentNftSelection(ZeroAddress,"0"),{sourceCollection:ZeroAddress,sourceTokenId:"0"});
 for(const [address,id] of [[ZeroAddress,"1"],["0x3333333333333333333333333333333333333333","0"],["bad","17"],["0x3333333333333333333333333333333333333333","01"],["0x3333333333333333333333333333333333333333","65537"]])assert.throws(()=>enrollmentNftSelection(address,id));
});
