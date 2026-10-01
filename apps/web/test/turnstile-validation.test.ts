import test from "node:test";
import assert from "node:assert/strict";
import {validateTurnstile} from "../lib/affiliates/turnstile.ts";
const origin="https://app.tincta.xyz",id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const valid=()=>({success:true,hostname:"app.tincta.xyz",action:"affiliate_enrollment",cdata:id,challenge_ts:new Date().toISOString()});
test("verification binds host, action and challenge and never logs submitted secrets",async()=>{
 const logs:unknown[]=[];let result:unknown=valid();
 const dependencies={secret:"private-secret",warn:(v:unknown)=>logs.push(v),fetch:async(_url:unknown,request:any)=>{const body=JSON.parse(request.body);assert.equal(body.idempotency_key,id);return Response.json(result);}};
 await validateTurnstile("private-token","127.0.0.1",origin,id,dependencies as any);
 for(const change of [{hostname:"manekineko-staging-web.vercel.app"},{action:"other"},{cdata:"wrong"},{success:false,"error-codes":["timeout-or-duplicate","private-token"]}]){
  result={...valid(),...change};await assert.rejects(validateTurnstile("private-token","127.0.0.1",origin,id,dependencies as any),{code:"verification_failed"});
 }
 assert(!JSON.stringify(logs).includes("private"));assert.equal(logs.length,4);
 result={success:false,"error-codes":["invalid-input-secret"]};await assert.rejects(validateTurnstile("x","127.0.0.1",origin,id,dependencies as any),{code:"verification_unavailable"});
});
test("provider transport and malformed responses fail closed as retryable outages",async()=>{
 for(const fetch of [async()=>{throw Error("private URL");},async()=>Response.json(null),async()=>new Response("oops",{status:503})])await assert.rejects(validateTurnstile("x","127.0.0.1",origin,id,{secret:"private",warn:()=>{},fetch:fetch as any}),{code:"verification_unavailable"});
});
