import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { affiliateStatus, authenticationData, authenticationDigest, boundedJson, configuredOrigin, ipDigest, normalizedWallet, requireSameOrigin, trustedIp, validTurnstileResult, validateAffiliateRates, verifyEoaAuthentication } from "../lib/affiliates/policy.ts";

const origin="https://nft.example.com";
const trusted={VERCEL:"1",AFFILIATE_TRUSTED_PROXY:"vercel",AFFILIATE_PUBLIC_ORIGIN:origin,AFFILIATE_IP_HASH_SECRET:"example-only-test-secret-with-32-characters"};
const contract="0x1111111111111111111111111111111111111111";
const collection="8fa5f8c0-6ef4-47f6-9af3-60b8101c9321";

test("trusted client IP requires Vercel context and ignores generic forwarded/body headers",()=>{
  const request=new Request(origin,{headers:{"x-vercel-forwarded-for":"203.0.113.5","x-forwarded-for":"1.2.3.4","x-real-ip":"8.8.8.8"}});
  assert.equal(trustedIp(request,trusted),"203.0.113.5");
  for(const env of [{}, {...trusted,VERCEL:"0"},{...trusted,AFFILIATE_TRUSTED_PROXY:"nginx"}]) assert.throws(()=>trustedIp(request,env),/gateway/);
  for(const value of ["", "203.0.113.5, 1.2.3.4", "localhost", "203.0.113.5:4000"]) assert.throws(()=>trustedIp(new Request(origin,{headers:{"x-vercel-forwarded-for":value}}),trusted),/verified/);
  assert.throws(()=>trustedIp(new Request(origin,{headers:{"x-forwarded-for":"203.0.113.5"}}),trusted),/verified/);
});
test("equivalent IPv6 spellings share a privacy-preserving collection-scoped rate key",()=>{
  const a=trustedIp(new Request(origin,{headers:{"x-vercel-forwarded-for":"2001:db8::1"}}),trusted);
  const b=trustedIp(new Request(origin,{headers:{"x-vercel-forwarded-for":"2001:0DB8:0:0:0:0:0:1"}}),trusted);
  assert.equal(a,b); assert.equal(ipDigest(a,collection,trusted),ipDigest(b,collection,trusted));
  assert.equal(ipDigest(a,collection,trusted),ipDigest(a,collection.toUpperCase(),trusted),"URL UUID casing cannot bypass network quotas");
  assert.notEqual(ipDigest(a,collection,trusted),ipDigest(a,"another-collection",trusted));
  assert.throws(()=>ipDigest(a,collection,{}),/configured/);
});
test("enrollment requires exact configured HTTPS origin and JSON content type",()=>{
  const request=new Request(origin+"/api/enroll",{method:"POST",headers:{origin,"content-type":"application/json; charset=utf-8"}});
  assert.equal(requireSameOrigin(request,trusted),origin);
  for(const value of [undefined,"null","https://attacker.example"]) assert.throws(()=>requireSameOrigin(new Request(origin,{method:"POST",headers:{...(value?{origin:value}:{}),"content-type":"application/json"}}),trusted),/official/);
  assert.throws(()=>requireSameOrigin(new Request("https://other.example",{method:"POST",headers:{origin,"content-type":"application/json"}}),trusted),/official/);
  assert.throws(()=>requireSameOrigin(new Request(origin,{method:"POST",headers:{origin,"content-type":"text/plain"}}),trusted),/JSON/);
  for(const value of ["http://nft.example.com","https://nft.example.com/path","https://user:pass@nft.example.com"]) assert.throws(()=>configuredOrigin({...trusted,AFFILIATE_PUBLIC_ORIGIN:value}),/configured/);
});
test("signed wallet challenge binds applicant, collection, origin, nonce, expiry, chain and contract",async()=>{
  const wallet=Wallet.createRandom(),other=Wallet.createRandom();
  const data=authenticationData(wallet.address,collection,origin,"0x"+"ab".repeat(32),"1800000000",1,contract);
  const signature=await wallet.signTypedData(data.domain,data.types,data.message);
  assert.equal(verifyEoaAuthentication(wallet.address,data,signature),true);
  assert.equal(verifyEoaAuthentication(other.address,data,signature),false);
  for(const field of ["applicant","collectionId","origin","nonce","deadline"] as const){
    const replacement={applicant:other.address,collectionId:"different",origin:"https://other.example",nonce:"0x"+"cd".repeat(32),deadline:"1800000001"}[field];
    const changed={...data,message:{...data.message,[field]:replacement}};
    assert.equal(verifyEoaAuthentication(wallet.address,changed,signature),false,field);
    assert.notEqual(authenticationDigest(changed),authenticationDigest(data));
  }
  assert.equal(verifyEoaAuthentication(wallet.address,{...data,domain:{...data.domain,chainId:11155111}},signature),false);
  assert.equal(verifyEoaAuthentication(wallet.address,{...data,domain:{...data.domain,verifyingContract:other.address}},signature),false);
  assert.equal(verifyEoaAuthentication(wallet.address,data,"0x00"),false);
});
test("Turnstile proof is bound to the fresh challenge and expected hostname/action",()=>{
  const now=Date.now(),result={success:true,hostname:"nft.example.com",action:"affiliate_enrollment",cdata:collection,challenge_ts:new Date(now-10_000).toISOString()};
  assert.equal(validTurnstileResult(result,origin,collection,now),true);
  for(const change of [{success:false},{hostname:"attacker.example"},{action:"login"},{cdata:"different"},{challenge_ts:new Date(now-300_001).toISOString()},{challenge_ts:new Date(now+30_001).toISOString()},{challenge_ts:"invalid"}]) assert.equal(validTurnstileResult({...result,...change},origin,collection,now),false);
});
test("account states distinguish unused links, unvested earnings, available claims and full refunds",()=>{
  assert.equal(affiliateStatus(0n,0n,false,false),"no_referrals");
  assert.equal(affiliateStatus(100n,0n,false,false),"pending_sellout");
  assert.equal(affiliateStatus(100n,0n,true,false),"claimable");
  assert.equal(affiliateStatus(100n,50n,true,false),"claimable");
  assert.equal(affiliateStatus(100n,100n,true,false),"paid");
  assert.equal(affiliateStatus(100n,0n,false,true),"refunded");
  assert.equal(affiliateStatus(0n,0n,true,false),"no_referrals");
  assert.equal(affiliateStatus(0n,0n,false,false,12),"no_commission");
  assert.equal(affiliateStatus(0n,0n,true,false,12),"no_commission");
  assert.equal(affiliateStatus(0n,0n,false,true,12),"refunded");
});
test("configurable rates apply to each affiliate's own referrals, not the sum of every occupied position",()=>{
  for(const rates of [Array(10).fill(100),Array(10).fill(200),[0,100,200,150,3500],Array(10).fill(5000)]) {
    const prize=rates.length===5?6500:5000;
    assert.doesNotThrow(()=>validateAffiliateRates(prize,rates,rates.length));
  }
  assert.doesNotThrow(()=>validateAffiliateRates(10000,[0,0],2));
  assert.doesNotThrow(()=>validateAffiliateRates(0,[10000],1));
  for(const [prize,rates,slots] of [[6500,[3501],1],[5000,[10001],1],[5000,[-1],1],[5000,[0.5],1],[5000,[100],2],[-1,[100],1],[10001,[0],1],[5000,[],0]] as [number,number[],number][]) assert.throws(()=>validateAffiliateRates(prize,rates,slots),/operator/);
});
test("bounded JSON parser rejects oversize streamed bodies without trusting content-length",async()=>{
  assert.deepEqual(await boundedJson(new Request(origin,{method:"POST",body:JSON.stringify({wallet:contract})})),{wallet:contract});
  for(const body of ["[]","null","broken",JSON.stringify({value:"x".repeat(13_000)})]) await assert.rejects(()=>boundedJson(new Request(origin,{method:"POST",body})));
  assert.throws(()=>normalizedWallet("0x"+"0".repeat(40)),/valid Ethereum/);
});
